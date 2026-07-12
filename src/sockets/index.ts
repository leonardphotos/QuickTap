import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../middlewares/auth.middleware';

/**
 * ============================================================================
 *  Gateway de WebSockets (Socket.IO)
 * ============================================================================
 *  Cada restaurante tiene su propia "room": `kitchen:<restaurantId>`.
 *  La cocina (panel del restaurante) se une a su room y recibe en tiempo real
 *  las comandas nuevas listas para imprimir en la ticketera térmica.
 */

let io: IOServer | null = null;

export function kitchenRoom(restaurantId: string): string {
  return `kitchen:${restaurantId}`;
}

/** Eventos que el servidor emite hacia los clientes. */
export const SocketEvents = {
  ORDER_NEW: 'order:new', // comanda nueva -> imprimir
  ORDER_UPDATED: 'order:updated', // cambio de estado
} as const;

export function initSockets(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: {
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // Autenticación del socket vía JWT (mismo token que la API REST).
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Falta token de autenticación.'));
    try {
      const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
      socket.data.auth = payload;
      next();
    } catch {
      next(new Error('Token inválido.'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const auth = socket.data.auth as AuthPayload;
    // Une el socket a la cocina de SU restaurante (aislamiento por tenant).
    socket.join(kitchenRoom(auth.restaurantId));

    socket.on('disconnect', () => {
      // Socket.IO limpia las rooms automáticamente.
    });
  });

  return io;
}

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.IO no inicializado. Llama a initSockets() primero.');
  return io;
}

/** Emite un evento a la cocina de un restaurante concreto. */
export function emitToKitchen(restaurantId: string, event: string, payload: unknown): void {
  getIO().to(kitchenRoom(restaurantId)).emit(event, payload);
}
