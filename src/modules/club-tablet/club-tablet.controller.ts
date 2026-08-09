import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createTabOrderSchema } from './club-tablet.dto';
import { clubTabletService } from './club-tablet.service';

export const clubTabletController = {
  session: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTabletService.getSession(req.restaurantId!, req.auth!.userId, req.params.accessToken) });
  }),
  catalog: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTabletService.getCatalog(req.restaurantId!) });
  }),
  createOrder: asyncHandler(async (req: Request, res: Response) => {
    const input = createTabOrderSchema.parse(req.body);
    res.status(201).json({ data: await clubTabletService.createOrder(req.restaurantId!, req.auth!.userId, input) });
  }),
};
