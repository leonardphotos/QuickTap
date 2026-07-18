import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createMovementSchema, movementQuerySchema } from './movement.dto';
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
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await movementService.remove(req.restaurantId!, req.params.id) });
  }),
  markCreditPaid: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await movementService.markCreditPaid(req.restaurantId!, req.params.id) });
  }),
};
