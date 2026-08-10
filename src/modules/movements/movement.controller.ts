import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { createMovementSchema, movementQuerySchema, updateMovementSchema } from './movement.dto';
import { movementService } from './movement.service';

export const movementController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = movementQuerySchema.parse(req.query);
    res.json({ data: await movementService.list(req.restaurantId!, query) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createMovementSchema.parse(req.body);
    res.status(201).json({ data: await movementService.create(req.restaurantId!, req.auth?.userId, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateMovementSchema.parse(req.body);
    res.json({ data: await movementService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await movementService.remove(req.restaurantId!, req.params.id) });
  }),
  markCreditPaid: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await movementService.markCreditPaid(req.restaurantId!, req.params.id) });
  }),
  /** POST /api/v1/movements/upload-receipt — foto del recibo del gasto. */
  uploadReceipt: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/expense-receipts/${req.file.filename}` } });
  }),
};
