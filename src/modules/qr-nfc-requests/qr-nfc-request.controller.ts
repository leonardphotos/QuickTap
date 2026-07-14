import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createQrNfcRequestSchema } from './qr-nfc-request.dto';
import { qrNfcRequestService } from './qr-nfc-request.service';

export const qrNfcRequestController = {
  /** POST /api/v1/qr-nfc-requests — el restaurante autenticado cotiza QR NFC. */
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createQrNfcRequestSchema.parse(req.body);
    const request = await qrNfcRequestService.create(req.restaurantId!, input.quantity);
    res.status(201).json({ data: request });
  }),

  /** GET /api/v1/master/qr-nfc-requests?status=PENDING|APPROVED */
  list: asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status === 'APPROVED' ? 'APPROVED' : req.query.status === 'PENDING' ? 'PENDING' : undefined;
    res.json({ data: await qrNfcRequestService.list(status) });
  }),

  /** POST /api/v1/master/qr-nfc-requests/:id/approve — "Marcar atendida". */
  approve: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await qrNfcRequestService.approve(req.params.id) });
  }),
};
