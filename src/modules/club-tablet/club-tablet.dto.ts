import { z } from 'zod';

/** El cliente manda qué y cuánto; el precio SIEMPRE lo pone el servidor. */
const tabletItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
});

export const createTabOrderSchema = z.object({
  accessToken: z.string().min(1).max(64),
  /**
   * De qué tienda es el pedido: 'CLUB' para la tienda propia del club, o el id
   * de una tienda vinculada. Una comanda es siempre de UNA sola tienda — es lo
   * que permite que cada una cobre lo suyo y reciba solo lo que prepara.
   * El servidor comprueba que esa tienda siga vinculada antes de leerle nada.
   */
  storeId: z.string().min(1).max(40),
  items: z.array(tabletItemSchema).min(1).max(40),
});

export type CreateTabOrderInput = z.infer<typeof createTabOrderSchema>;
