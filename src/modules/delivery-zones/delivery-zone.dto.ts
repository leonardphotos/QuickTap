import { z } from 'zod';

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createDeliveryZoneSchema = z.object({
  name: z.string().min(1, 'Ponle un nombre a la zona.').max(120),
  price: z.coerce.number().nonnegative('El precio no puede ser negativo.'),
  polygon: z.array(pointSchema).min(3, 'Dibuja al menos 3 puntos para formar la zona.'),
});

export const updateDeliveryZoneSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  price: z.coerce.number().nonnegative().optional(),
  polygon: z.array(pointSchema).min(3).optional(),
});

// Carga masiva desde una lista escrita (Ajustes → Delivery → "Importar lista").
// Va en su propio endpoint en vez de repetir POST /delivery-zones N veces para
// que 20 zonas entren en una sola transacción: o se guardan todas o ninguna.
export const bulkCreateDeliveryZonesSchema = z.object({
  zones: z.array(createDeliveryZoneSchema).min(1, 'No hay zonas para importar.').max(100),
});

export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;
export type BulkCreateDeliveryZonesInput = z.infer<typeof bulkCreateDeliveryZonesSchema>;
