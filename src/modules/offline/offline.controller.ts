import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { offlineService } from './offline.service';

export const offlineController = {
  catalogSnapshot: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await offlineService.catalogSnapshot(req.restaurantId!) });
  }),
};
