import express from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { bearerFrom, verifyToken, type RelayAuth } from './auth.js';
import { createOfflineOrder, OrderError, toKitchenPayload } from './orders.js';
import { relayDb } from './db.js';
import { applySnapshot, type CatalogSnapshot } from './snapshot.js';
import { deductStockForOrder, listInventory } from './inventory.js';
import { pendingCount, syncPendingToCloud } from './sync.js';
import { localLogin } from './local-auth.js';

/**
 * Servidor local del relé: habla el MISMO dialecto que la nube (mismas rutas, mismos eventos,
 * mismos payloads), para que las tablets y la Estación de Impresión solo tengan que apuntar a
 * otra dirección — sin cambiar su lógica.
 *
 * Escucha en 0.0.0.0 porque el punto es justamente que otros equipos del local lo alcancen por
 * WiFi. La seguridad está en el JWT: sin un token válido del restaurante no se hace nada.
 */

/** Sala de cocina, mismo nombre que en `src/sockets/index.ts`. */
const kitchenRoom = (restaurantId: string) => `kitchen:${restaurantId}`;

export interface RelayServerOptions {
  port: number;
  /** El mismo JWT_SECRET de la nube: así los tokens ya emitidos siguen sirviendo. */
  jwtSecret: string;
  /** A dónde subir lo del corte cuando vuelva el internet. */
  cloudUrl?: string;
}

export interface StartedRelayServer {
  httpServer: HttpServer;
  io: IOServer;
  stop: () => Promise<void>;
}

export function startRelayServer(opts: RelayServerOptions): StartedRelayServer {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  const httpServer = createServer(app);
  const io = new IOServer(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'] },
    // Mismos tiempos que la nube: el WiFi de un local es igual de inestable con o sin internet.
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // --- Autenticación de sockets: mismo criterio que la nube (JWT del staff) ---
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Falta token de autenticación.'));
    const auth = verifyToken(token, opts.jwtSecret);
    if (!auth) return next(new Error('Token inválido.'));
    socket.data.auth = auth;
    next();
  });

  io.on('connection', (socket) => {
    const auth = socket.data.auth as RelayAuth;
    socket.join(kitchenRoom(auth.restaurantId));
  });

  // --- Middleware de auth para las rutas REST ---
  const requireAuth: express.RequestHandler = (req, res, next) => {
    const token = bearerFrom(req.headers.authorization);
    const auth = token ? verifyToken(token, opts.jwtSecret) : null;
    if (!auth) {
      res.status(401).json({ error: 'No autorizado.' });
      return;
    }
    (req as express.Request & { auth: RelayAuth }).auth = auth;
    next();
  };

  /**
   * Latido del relé. Las tablets lo usan para saber si hay relé disponible antes de
   * cambiarse a él (Fase 3). A propósito NO pide token: es solo un "estoy vivo".
   */
  // `ok: true` al tope es lo que mira el sondeo de conectividad del panel: le sirve para
  // distinguir una respuesta real de un 200 cualquiera devuelto por otra cosa en la red.
  app.get('/api/v1/relay/health', (_req, res) => {
    res.json({ ok: true, data: { relay: true, at: new Date().toISOString() } });
  });

  /** Qué tan al día está el catálogo local — útil para avisar "los precios son de hace X". */
  app.get('/api/v1/relay/status', requireAuth, async (req, res) => {
    const { auth } = req as express.Request & { auth: RelayAuth };
    const db = relayDb();
    const [restaurant, pending] = await Promise.all([
      db.restaurant.findUnique({ where: { id: auth.restaurantId } }),
      db.order.count({ where: { restaurantId: auth.restaurantId, syncedToCloud: false } }),
    ]);
    res.json({
      data: {
        ready: !!restaurant,
        syncedAt: restaurant?.syncedAt ?? null,
        pendingOrders: pending,
      },
    });
  });

  /** Misma ruta que la nube: la app de mesero no distingue contra quién habla. */
  app.post('/api/v1/orders/manual', requireAuth, async (req, res) => {
    const { auth } = req as express.Request & { auth: RelayAuth };
    try {
      const order = await createOfflineOrder(auth.restaurantId, {
        ...req.body,
        placedByUserId: auth.userId,
      });
      const payload = toKitchenPayload(order);
      // Misma sala y mismo evento que la nube -> la Estación de Impresión imprime igual.
      io.to(kitchenRoom(auth.restaurantId)).emit('order:new', payload);
      res.status(201).json({ data: payload });
    } catch (e) {
      if (e instanceof OrderError) {
        res.status(400).json({ error: e.message });
        return;
      }
      // Un fallo inesperado no puede tumbar el relé: el salón depende de él.
      // eslint-disable-next-line no-console
      console.error('[relé] error creando pedido:', e);
      res.status(500).json({ error: 'No se pudo crear el pedido en el relé.' });
    }
  });

  /**
   * Recibe el snapshot de catálogo que baja la app de escritorio mientras hay internet.
   * Es lo que deja al relé listo para el día que se caiga la conexión.
   */
  app.post('/api/v1/relay/snapshot', requireAuth, async (req, res) => {
    const { auth } = req as express.Request & { auth: RelayAuth };
    const snap = req.body as CatalogSnapshot;
    if (snap?.restaurant?.id !== auth.restaurantId) {
      res.status(400).json({ error: 'El snapshot no corresponde a este restaurante.' });
      return;
    }
    try {
      const { appliedAt } = await applySnapshot(snap);
      res.json({ data: { appliedAt } });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[relé] error aplicando snapshot:', e);
      res.status(500).json({ error: 'No se pudo aplicar el snapshot.' });
    }
  });

  /** Stock local, para que el salón vea qué se está acabando durante el corte. */
  app.get('/api/v1/relay/inventory', requireAuth, async (req, res) => {
    const { auth } = req as express.Request & { auth: RelayAuth };
    res.json({ data: await listInventory(auth.restaurantId) });
  });

  /**
   * Marcar servido. Además de cambiar el estado, descuenta el stock local — es lo que hace que
   * el inventario siga bajando con normalidad aunque no haya internet.
   */
  app.patch('/api/v1/orders/:id/status', requireAuth, async (req, res) => {
    const { auth } = req as express.Request & { auth: RelayAuth };
    const status = req.body?.status as string | undefined;
    if (status !== 'SERVED') {
      res.status(400).json({ error: 'El relé solo admite marcar SERVED mientras no hay conexión.' });
      return;
    }
    const db = relayDb();
    const order = await db.order.findFirst({ where: { id: req.params.id, restaurantId: auth.restaurantId } });
    if (!order) {
      res.status(404).json({ error: 'Pedido no encontrado.' });
      return;
    }
    try {
      await db.order.update({ where: { id: order.id }, data: { status: 'SERVED' } });
      const stock = await deductStockForOrder(order.id);
      io.to(kitchenRoom(auth.restaurantId)).emit('order:updated', {
        orderId: order.id,
        status: 'SERVED',
        offline: true,
      });
      res.json({ data: { id: order.id, status: 'SERVED', stock } });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[relé] error marcando servido:', e);
      res.status(500).json({ error: 'No se pudo marcar el pedido como servido.' });
    }
  });

  /**
   * Sube a la nube lo que quedó del corte. Lo dispara la app de escritorio al detectar que
   * volvió el internet; también se puede llamar a mano desde el panel.
   */
  app.post('/api/v1/relay/sync', requireAuth, async (req, res) => {
    const token = bearerFrom(req.headers.authorization)!;
    const cloudUrl = (req.body?.cloudUrl as string | undefined) ?? opts.cloudUrl;
    if (!cloudUrl) {
      res.status(400).json({ error: 'Falta la dirección de la nube.' });
      return;
    }
    try {
      const result = await syncPendingToCloud(cloudUrl.replace(/\/+$/, ''), token);
      res.json({ data: { ...result, pending: await pendingCount() } });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[relé] error sincronizando:', e);
      res.status(502).json({ error: e instanceof Error ? e.message : 'No se pudo sincronizar.' });
    }
  });

  /**
   * Entrar sin internet. Misma ruta que la nube, así que la pantalla de login funciona igual
   * sin cambios: si el corte duró más que la sesión, el mesero vuelve a escribir su contraseña
   * y sigue trabajando.
   */
  app.post('/api/v1/auth/login', async (req, res) => {
    const email = String(req.body?.email ?? '');
    const password = String(req.body?.password ?? '');
    if (!email || !password) {
      res.status(400).json({ error: 'Escribe tu correo y contraseña.' });
      return;
    }
    try {
      const result = await localLogin(email, password, opts.jwtSecret);
      if (!result) {
        res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
        return;
      }
      res.json({ data: result });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[relé] error en login local:', e);
      res.status(500).json({ error: 'No se pudo iniciar sesión en el servidor del local.' });
    }
  });

  httpServer.listen(opts.port, '0.0.0.0');

  return {
    httpServer,
    io,
    stop: () =>
      new Promise<void>((resolve) => {
        io.close(() => httpServer.close(() => resolve()));
      }),
  };
}
