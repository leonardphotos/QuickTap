import express from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { bearerFrom, verifyToken, type RelayAuth } from './auth.js';
import { createOfflineOrder, OrderError, toKitchenPayload } from './orders.js';
import { relayDb } from './db.js';

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
  app.get('/api/v1/relay/health', (_req, res) => {
    res.json({ data: { relay: true, at: new Date().toISOString() } });
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
