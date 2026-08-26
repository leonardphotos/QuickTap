import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/prisma';
import { tenantGuard, requireRole } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { HttpError } from '../../utils/http-error';
import { whatsappLinkController, whatsappLinkSendController } from './whatsapp-link.controller';

/**
 * Base: /api/v1/whatsapp-link — el WhatsApp vinculado del negocio (Evolution API).
 *
 * Beneficio de los planes altos: ELITE (restaurantes), ELITE_SHOP (locales) y CLUB (canchas),
 * más los legados con acceso total. PRO/SHOP básicos quedan fuera — es parte de lo que
 * diferencia al plan de arriba, igual que la contabilidad.
 */
export const PLANES_CON_WHATSAPP = new Set(['ELITE', 'PREMIUM', 'ELITE_SHOP', 'CLUB', 'SUCURSALES']);

const requiereplanConWhatsapp = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const r = await prisma.restaurant.findUnique({
    where: { id: req.restaurantId! },
    select: { subscriptionPlan: true },
  });
  if (!r?.subscriptionPlan || !PLANES_CON_WHATSAPP.has(r.subscriptionPlan)) {
    throw new HttpError(403, 'Vincular WhatsApp es un beneficio del plan Elite.', { code: 'PLAN_REQUIRED' });
  }
  next();
});

const router = Router();
router.use(tenantGuard);

// El status NO lleva el candado de plan: la tarjeta de Ajustes se muestra en TODOS los
// planes — bloqueada, con la invitación a subir de plan — y para pintarla necesita saber si
// este plan lo permite. Lo que sí muta o envía queda detrás del candado.
router.get('/status', whatsappLinkController.estado);
// Vincular/desvincular mueve el número del NEGOCIO: solo el dueño o un admin.
router.post('/link', requiereplanConWhatsapp, requireRole('OWNER', 'ADMIN'), whatsappLinkController.vincular);
router.post('/unlink', requiereplanConWhatsapp, requireRole('OWNER', 'ADMIN'), whatsappLinkController.desvincular);
router.post('/resume', requiereplanConWhatsapp, requireRole('OWNER', 'ADMIN'), whatsappLinkController.reanudar);
// Envío manual desde los botones del panel. Cualquier rol del staff: ese mismo mensaje ya lo
// mandan hoy a mano por wa.me — esto solo les ahorra el salto de app.
router.post('/send', requiereplanConWhatsapp, whatsappLinkSendController.enviar);

export default router;
