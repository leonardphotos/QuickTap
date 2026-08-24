import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { prisma } from '../../config/prisma';
import { masterLiveService, marcarPresencia } from './master-live.service';

const presenciaSchema = z.object({
  slug: z.string().min(1).max(120),
  /** Identificador anónimo del navegador: solo sirve para no contar dos veces la misma pestaña. */
  visitorId: z.string().min(6).max(64),
});

export const masterLiveController = {
  snapshot: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterLiveService.snapshot() });
  }),
};

export const presenciaController = {
  /**
   * POST /public/presence — latido de una página pública. Sin autenticación: lo llama el menú
   * del comensal, la tienda y la página del club, que no tienen sesión.
   *
   * No guarda nada de la persona: solo un id aleatorio que genera su propio navegador, para
   * que dos pestañas de la misma visita no cuenten como dos personas.
   */
  latido: asyncHandler(async (req: Request, res: Response) => {
    const { slug, visitorId } = presenciaSchema.parse(req.body);
    const negocio = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (negocio) marcarPresencia(negocio.id, visitorId);
    // Siempre 204: un slug que no existe no es un error del visitante ni algo que deba revelar
    // si ese negocio existe o no.
    res.status(204).end();
  }),
};
