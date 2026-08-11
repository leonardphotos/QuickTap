import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { shopCheckoutSchema } from './shop-storefront.dto';
import { shopStorefrontService } from './shop-storefront.service';
import { shopOrdersService } from './shop-orders.service';

/** Catálogo público de la tienda virtual — sin auth, resuelto por slug. */
export const shopStorefrontController = {
  getStorefront: asyncHandler(async (req: Request, res: Response) => {
    const data = await shopStorefrontService.getStorefrontBySlug(req.params.slug);
    // Mismo caché corto que el menú público: alivia el pico de una promoción sin que el
    // catálogo se quede viejo cuando el local cambia un precio.
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ data });
  }),

  checkout: asyncHandler(async (req: Request, res: Response) => {
    const input = shopCheckoutSchema.parse(req.body);
    const order = await shopStorefrontService.checkout(req.params.slug, input);
    emitToKitchen(order.restaurantId, SocketEvents.SHOP_ORDER_NEW, order);
    res.status(201).json({ data: order });
  }),
};

/** Pedidos de la tienda virtual — lado panel del local (detrás de tenantGuard). */
export const shopOrdersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json({ data: await shopOrdersService.list(req.restaurantId!, { status }) });
  }),

  confirm: asyncHandler(async (req: Request, res: Response) => {
    const paymentMethod = typeof req.body?.paymentMethod === 'string' ? req.body.paymentMethod : undefined;
    const order = await shopOrdersService.confirm(req.restaurantId!, req.params.id, paymentMethod);
    emitToKitchen(req.restaurantId!, SocketEvents.SHOP_ORDER_UPDATED, order);
    res.json({ data: order });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const order = await shopOrdersService.cancel(req.restaurantId!, req.params.id);
    emitToKitchen(req.restaurantId!, SocketEvents.SHOP_ORDER_UPDATED, order);
    res.json({ data: order });
  }),
};
