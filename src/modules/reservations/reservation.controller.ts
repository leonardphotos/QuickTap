import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createReservationSchema } from './reservation.dto';
import { reservationService } from './reservation.service';

export const reservationController = {
  tableStatuses: asyncHandler(async (req: Request, res: Response) => {
    const statuses = await reservationService.getTableStatuses(req.params.slug);
    res.json({ data: statuses });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createReservationSchema.parse(req.body);
    const reservation = await reservationService.create(req.params.slug, input);
    res.status(201).json({ data: reservation });
  }),

  listUpcoming: asyncHandler(async (req: Request, res: Response) => {
    const reservations = await reservationService.listUpcoming(req.restaurantId!);
    res.json({ data: reservations });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const reservation = await reservationService.cancel(req.restaurantId!, req.params.id);
    res.json({ data: reservation });
  }),
};
