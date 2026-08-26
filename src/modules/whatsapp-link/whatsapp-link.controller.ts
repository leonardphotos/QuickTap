import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { prisma } from '../../config/prisma';
import { whatsappLinkService } from './whatsapp-link.service';

/** Panel del negocio: opera SIEMPRE sobre la instancia del propio tenant (req.restaurantId). */
export const whatsappLinkController = {
  estado: asyncHandler(async (req: Request, res: Response) => {
    const estado = await whatsappLinkService.estado(req.restaurantId!);
    // planPermitido pinta el candado en la tarjeta: en planes bajos se ve el beneficio
    // bloqueado (con su invitación a subir de plan) en vez de no existir.
    const { PLANES_CON_WHATSAPP } = await import('./whatsapp-link.routes');
    const r = await prisma.restaurant.findUnique({ where: { id: req.restaurantId! }, select: { subscriptionPlan: true } });
    res.json({ data: { ...estado, planPermitido: !!r?.subscriptionPlan && PLANES_CON_WHATSAPP.has(r.subscriptionPlan) } });
  }),
  vincular: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.vincular(req.restaurantId!) });
  }),
  desvincular: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.desvincular(req.restaurantId!) });
  }),
  reanudar: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.reanudar(req.restaurantId!) });
  }),
};

const enviarSchema = z.object({ phone: z.string().min(7).max(30), message: z.string().min(1).max(4000) });

export const whatsappLinkSendController = {
  /** POST /whatsapp-link/send — los botones de WhatsApp del panel intentan esto primero; si
   * responde sent:false, el frontend abre el wa.me de siempre. */
  enviar: asyncHandler(async (req: Request, res: Response) => {
    const input = enviarSchema.parse(req.body);
    const sent = await whatsappLinkService.enviar(req.restaurantId!, input.phone, input.message);
    res.json({ data: { sent } });
  }),
};

/** Dashboard maestro: la instancia de la PLATAFORMA (restaurantId null) — cobranzas. */
export const masterWhatsappLinkController = {
  estado: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.estado(null) });
  }),
  vincular: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.vincular(null) });
  }),
  desvincular: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.desvincular(null) });
  }),
  reanudar: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.reanudar(null) });
  }),
};
