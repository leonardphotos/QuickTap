import crypto from 'crypto';
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

/** ¿La conexión viene de esta misma máquina? Se mira el peer TCP real (`socket.remoteAddress`)
 * y no `req.ip`, que puede venir de una cabecera X-Forwarded-For que cualquiera falsifica. */
function vieneDeLocalhost(req: Request): boolean {
  const ip = req.socket.remoteAddress ?? '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Comparación en tiempo constante: con `!==` el tiempo de respuesta filtra cuántos caracteres
 * del secreto acertó quien prueba, y se puede reconstruir a fuerza de intentos. */
function secretoValido(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

waWebhookRouter.post(
  '/:secret',
  asyncHandler(async (req: Request, res: Response) => {
    // Evolution corre en este mismo VPS y llama por 127.0.0.1 (ver webhookUrl() en el servicio),
    // así que nada legítimo entra por acá desde afuera. Con esto, aunque el secreto se filtre,
    // un tercero no puede forjar un "Aprobado" del número verificador y aprobarse un pago.
    if (!vieneDeLocalhost(req)) {
      res.status(404).end();
      return;
    }
    if (!env.evolution.webhookSecret || !secretoValido(req.params.secret, env.evolution.webhookSecret)) {
      res.status(404).end();
      return;
    }
    // Siempre 200 rápido: Evolution reintenta ante errores y no queremos tormenta de reintentos
    // por un evento que no procesamos.
    whatsappLinkService.procesarEvento(req.body ?? {}).catch(() => undefined);
    res.json({ ok: true });
  }),
);
