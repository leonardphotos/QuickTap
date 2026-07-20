import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { unauthorized } from '../../utils/http-error';
import { ramblayWebhookService, verifyRamblaySignature } from './ramblay.webhook.service';

export const ramblayWebhookController = {
  /** POST /api/v1/public/ramblay/webhook — Ramblay notifica que un pago fue aprobado/rechazado. */
  handle: asyncHandler(async (req: Request, res: Response) => {
    const signature = req.header('x-webhook-signature-256');
    if (!verifyRamblaySignature(req.rawBody, signature)) {
      throw unauthorized('Firma de webhook inválida.');
    }

    await ramblayWebhookService.handle(req.body);
    res.json({ received: true });
  }),
};
