import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (usa YYYY-MM-DD).');
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (usa HH:mm).');

// Botón "Mesa" de la barra flotante del menú público: el cliente elige día,
// hora, cuántas personas y cuántas mesas, y deja sus datos de contacto.
export const createReservationSchema = z.object({
  date: dateString,
  time: timeString,
  partySize: z.coerce.number().int().min(1).max(100),
  tableIds: z.array(z.string().min(1)).min(1, 'Elige al menos una mesa.'),
  customerName: z.string().min(1, 'El nombre es obligatorio.').max(120),
  customerIdNumber: z.string().min(1, 'La cédula es obligatoria.').max(30),
  customerPhone: z.string().min(7, 'El teléfono es obligatorio.').max(30),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
