import { Router, Request, Response } from 'express';
import { env } from '../../config/env';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { masterWhatsappLinkController } from './whatsapp-link.controller';
import { whatsappLinkService } from './whatsapp-link.service';

/** Base: /api/v1/master/whatsapp-link — la instancia de la PLATAFORMA (cobranzas). */
export const masterWhatsappLinkRouter = Router();
masterWhatsappLinkRouter.use(platformAuthGuard);
masterWhatsappLinkRouter.get('/status', masterWhatsappLinkController.estado);
masterWhatsappLinkRouter.post('/link', masterWhatsappLinkController.vincular);
masterWhatsappLinkRouter.post('/unlink', masterWhatsappLinkController.desvincular);
masterWhatsappLinkRouter.post('/resume', masterWhatsappLinkController.reanudar);

/**
 * Base: /api/v1/public/wa-webhook/:secret — eventos de Evolution (corre en este mismo VPS y
 * llama por localhost). El secreto en la URL es lo único que autentica: sin él, cualquiera
 * podría inventar ACKs y des-pausar un número restringido.
 */
export const waWebhookRouter = Router();
waWebhookRouter.post(
  '/:secret',
  asyncHandler(async (req: Request, res: Response) => {
    if (!env.evolution.webhookSecret || req.params.secret !== env.evolution.webhookSecret) {
      res.status(404).end();
      return;
    }
    // Siempre 200 rápido: Evolution reintenta ante errores y no queremos tormenta de reintentos
    // por un evento que no procesamos.
    whatsappLinkService.procesarEvento(req.body ?? {}).catch(() => undefined);
    res.json({ ok: true });
  }),
);
