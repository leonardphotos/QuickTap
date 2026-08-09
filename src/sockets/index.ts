import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthPayload } from '../middlewares/auth.middleware';
import { prisma } from '../config/prisma';

/**
 * ============================================================================
 *  Gateway de WebSockets (Socket.IO)
 * ============================================================================
 *  Cada restaurante tiene su propia "room": `kitchen:<restaurantId>`.
 *  La cocina (panel del restaurante) se une a su room y recibe en tiempo real
 *  las comandas nuevas listas para imprimir en la ticketera térmica.
 *
 *  Además, cada mesa tiene su propia room pública `table:<tableId>`: el
 *  cliente que escaneó el QR se une ahí (sin JWT, solo con el qrToken) para
 *  recibir el aviso de "tu pedido está listo".
 */

let io: IOServer | null = null;

export function kitchenRoom(restaurantId: string): string {
  return `kitchen:${restaurantId}`;
}

export function tableRoom(tableId: string): string {
  return `table:${tableId}`;
}

/** Eventos que el servidor emite hacia los clientes. */
export const SocketEvents = {
  ORDER_NEW: 'order:new', // comanda nueva -> imprimir
  ORDER_UPDATED: 'order:updated', // cambio de estado
  ORDER_READY: 'order:ready', // aviso público para el cliente de la mesa
  ORDER_READY_STAFF: 'order:ready-staff', // aviso al staff (Caja/Numero) de que un pedido quedó listo
  TABLE_SERVICE_REQUEST: 'table:service-request', // comensal llama al mesero / pide la cuenta
  TABLE_SERVICE_ACK: 'table:service-ack', // el mesero atendió la solicitud
  PRINT_REQUEST: 'print:request', // impresión bajo demanda (reimprimir comanda, lista de insumos) -> estación de impresión
  RESERVATION_NEW: 'reservation:new', // reserva nueva desde el menú público -> pestaña Reservas (Cajero/Admin)
  RESERVATION_UPDATED: 'reservation:updated', // se aceptó o canceló una reserva
  INVENTORY_LOW_STOCK: 'inventory:low-stock', // cambió el stock de un insumo -> recalcular avisos de agotamiento
  WHATSAPP_BOT_QR: 'whatsapp-bot:qr', // nuevo código QR para vincular (Ajustes -> WhatsApp)
  WHATSAPP_BOT_STATUS: 'whatsapp-bot:status', // cambió el estado de la sesión (conectando/conectado/desconectado)
  PAYMENT_VERIFICATION_TIMEOUT: 'payment-verification:timeout', // el verificador de pagos no respondió a tiempo -> revisar el pedido a mano
  CLUB_BOOKING_NEW: 'club:booking-new', // reserva de cancha nueva -> refrescar el calendario de recepción
  CLUB_BOOKING_UPDATED: 'club:booking-updated', // check-in, cancelación o cambio de estado de una reserva
  CLUB_CALENDAR_CHANGED: 'club:calendar-changed', // bloqueo de mantenimiento creado/quitado -> recargar el calendario
  CLUB_TAB_ORDER_NEW: 'club:tab-order-new', // pedido desde la tablet de una cancha -> cola del restaurante vinculado y Caja del club
  CLUB_TAB_ORDER_UPDATED: 'club:tab-order-updated', // el restaurante lo aceptó/entregó/canceló
} as const;

export function initSockets(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: {
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      methods: ['GET', 'POST'],
    },
  });

  // Autenticación del socket: staff vía JWT, o cliente público vía qrToken
  // de su mesa (sin credenciales, solo puede unirse a la room de ESA mesa).
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const qrToken = socket.handshake.auth?.qrToken as string | undefined;

    if (token) {
      try {
        const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
        socket.data.auth = payload;
        return next();
      } catch {
        return next(new Error('Token inválido.'));
      }
    }

    if (qrToken) {
      socket.data.qrToken = qrToken;
      return next();
    }

    next(new Error('Falta token de autenticación.'));
  });

  io.on('connection', async (socket: Socket) => {
    const auth = socket.data.auth as AuthPayload | undefined;
    const qrToken = socket.data.qrToken as string | undefined;

    if (auth) {
      // Une el socket a la cocina de SU restaurante (aislamiento por tenant).
      socket.join(kitchenRoom(auth.restaurantId));
    } else if (qrToken) {
      // Cliente público: solo se une a la room de SU propia mesa.
      const table = await prisma.table.findUnique({ where: { qrToken }, select: { id: true } });
      if (table) socket.join(tableRoom(table.id));
    }

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

/** Emite un evento público al cliente que escaneó el QR de una mesa concreta. */
export function emitToTable(tableId: string, event: string, payload: unknown): void {
  getIO().to(tableRoom(tableId)).emit(event, payload);
}
