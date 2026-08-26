import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { whatsappLinkService } from './whatsapp-link.service';

/** Panel del negocio: opera SIEMPRE sobre la instancia del propio tenant (req.restaurantId). */
export const whatsappLinkController = {
  estado: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await whatsappLinkService.estado(req.restaurantId!) });
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
