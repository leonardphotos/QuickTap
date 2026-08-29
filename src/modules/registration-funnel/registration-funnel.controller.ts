import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { funnelQuerySchema, trackRegistrationSchema } from './registration-funnel.dto';
import { registrationFunnelService } from './registration-funnel.service';

export const registrationFunnelController = {
  /**
   * POST /public/registration-funnel — público (quien lo llama todavía no tiene cuenta).
   *
   * Responde 204 pase lo que pase: es telemetría de un formulario en curso, y un error acá
   * jamás debe verse en la pantalla de alguien que se está registrando.
   */
  track: asyncHandler(async (req: Request, res: Response) => {
    const parsed = trackRegistrationSchema.safeParse(req.body);
    if (parsed.success) {
      await registrationFunnelService.track(parsed.data).catch(() => undefined);
    }
    res.status(204).end();
  }),

  /** GET /master/registration-funnel — resumen del embudo + lista de contactables. */
  overview: asyncHandler(async (req: Request, res: Response) => {
    const { range } = funnelQuerySchema.parse(req.query);
    res.json({ data: await registrationFunnelService.overview(range) });
  }),

  /** PATCH /master/registration-funnel/:id/contacted — "ya lo llamé" (o deshacerlo). */
  setContacted: asyncHandler(async (req: Request, res: Response) => {
    const { contactado } = z.object({ contactado: z.boolean() }).parse(req.body);
    res.json({ data: await registrationFunnelService.setContacted(req.params.id, contactado) });
  }),
};
