import { Router } from 'express';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../middlewares/error.middleware';
import { notFound } from '../../utils/http-error';
import { uploadShopPaymentProof, optimizeImage } from '../../middlewares/upload.middleware';
import { shopStorefrontController } from './shop-storefront.controller';

/** Corta la subida si el slug no corresponde a un Local Comercial activo. */
const soloTiendaReal = asyncHandler(async (req, _res, next) => {
  const tienda = await prisma.restaurant.findUnique({
    where: { slug: req.params.slug },
    select: { isActive: true, businessType: true },
  });
  if (!tienda || !tienda.isActive || tienda.businessType !== 'SHOP') throw notFound('Tienda no encontrada.');
  next();
});

/**
 * Base: /api/v1/public/shop — catálogo público de la tienda virtual de un Local Comercial.
 * Sin auth: el inquilino se resuelve por `slug`, nunca por un id que mande el cliente.
 */
const router = Router();

router.get('/:slug', shopStorefrontController.getStorefront);
// Mismo límite que las reservas y el checkout del menú: evita que alguien inunde de pedidos
// falsos la pantalla del local desde un solo equipo.
router.post('/:slug/checkout', publicBookingRateLimit, shopStorefrontController.checkout);
// Comprobante de pago del comprador. El guard va PRIMERO: si el slug no es una tienda válida
// se corta antes de que multer escriba nada en disco.
router.post(
  '/:slug/proof',
  publicBookingRateLimit,
  soloTiendaReal,
  uploadShopPaymentProof,
  optimizeImage(1200, 1200),
  shopStorefrontController.subirComprobante,
);

export default router;
