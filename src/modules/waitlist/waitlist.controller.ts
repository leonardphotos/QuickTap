import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  createWaitlistEntrySchema,
  seatWaitlistEntrySchema,
  updateWaitlistEntrySchema,
} from './waitlist.dto';
import { waitlistService } from './waitlist.service';

export const waitlistController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await waitlistService.list(req.restaurantId!) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createWaitlistEntrySchema.parse(req.body);
    res.status(201).json({ data: await waitlistService.create(req.restaurantId!, input) });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateWaitlistEntrySchema.parse(req.body);
    res.json({ data: await waitlistService.update(req.restaurantId!, req.params.id, input) });
  }),

  notify: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await waitlistService.notify(req.restaurantId!, req.params.id) });
  }),

  seat: asyncHandler(async (req: Request, res: Response) => {
    const input = seatWaitlistEntrySchema.parse(req.body);
    res.json({ data: await waitlistService.seat(req.restaurantId!, req.params.id, input) });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await waitlistService.cancel(req.restaurantId!, req.params.id) });
  }),

  noShow: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await waitlistService.noShow(req.restaurantId!, req.params.id) });
  }),
};
