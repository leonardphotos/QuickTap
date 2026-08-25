import { z } from 'zod';

/**
 * Checkout del catálogo público de la tienda virtual (ver shop-storefront.service.ts).
 *
 * El carrito solo dice QUÉ y CUÁNTO: el precio lo resuelve el servidor contra el catálogo. Si
 * el cliente pudiera mandar el precio, cualquiera pediría con `price: 0` desde la consola.
 */
const cartItemSchema = z.object({
  productId: z.string().min(1),
  v1: z.string().max(60).default(''),
  v2: z.string().max(60).default(''),
  // Decimal a propósito: hay productos que se venden por peso (ShopProductVariant.soldByWeight).
  qty: z.coerce.number().positive('La cantidad debe ser mayor a 0.').max(9999),
});

export const shopCheckoutSchema = z.object({
  // El comprador eligió financiar (entradas de eventos con financiamiento habilitado). Se
  // valida contra el evento al confirmar, nunca se toma tal cual: el precio y las cuotas los
  // pone el servidor.
  financed: z.boolean().optional(),
  mode: z.enum(['PICKUP', 'DELIVERY']).default('PICKUP'),
  items: z.array(cartItemSchema).min(1, 'El carrito está vacío.').max(100),
  customer: z.object({
    name: z.string().min(1, 'Escribe tu nombre.').max(120),
    phone: z.string().min(7, 'Escribe un teléfono válido.').max(30),
    // Obligatoria solo cuando la compra va a existir en el Wallet — eso lo decide el
    // servicio, que es quien sabe si el carrito lleva entradas o si la compra es financiada.
    idNumber: z.string().max(30).optional(),
    address: z.string().max(300).optional(),
    locationUrl: z.string().url().max(300).optional(),
    // Solo informativo: es lo que el cliente dice que va a usar. El cobro se cierra por
    // WhatsApp, así que no hay nada que validar contra una pasarela.
    paymentMethod: z
      .enum(['CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'ZELLE', 'BINANCE', 'PAYPAL', 'TRANSFER', 'CARD'])
      .optional(),
    note: z.string().max(300).optional(),
  }),
});

export type ShopCheckoutInput = z.infer<typeof shopCheckoutSchema>;
