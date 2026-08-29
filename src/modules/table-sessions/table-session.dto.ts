import { z } from 'zod';

export const moveTableSessionSchema = z.object({
  tableId: z.string().min(1, 'Falta la mesa destino.'),
});

export type MoveTableSessionInput = z.infer<typeof moveTableSessionSchema>;

export const setTableSessionPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'La clave debe ser de 4 dígitos.'),
  // Clave actual, obligatoria SOLO si la cuenta ya tenía una (ver setPinByQrToken): el qrToken
  // está impreso en la mesa, así que sin esto cualquiera que lo escanee puede reescribirle la
  // clave a una cuenta ajena y pedir a su nombre — justo lo que la clave existe para impedir.
  currentPin: z.string().regex(/^\d{4}$/).optional(),
});

export type SetTableSessionPinInput = z.infer<typeof setTableSessionPinSchema>;

// Al cerrar la mesa, el mesero puede indicar cómo se pagó (queda en los
// pedidos de esa cuenta, para poder filtrar ingresos por método de pago).
export const closeTableSessionSchema = z.object({
  paymentMethod: z.enum(['MOBILE_PAYMENT', 'ZELLE', 'CASH', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER']).optional(),
});

export type CloseTableSessionInput = z.infer<typeof closeTableSessionSchema>;
