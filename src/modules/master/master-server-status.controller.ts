import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { masterServerStatusService } from './master-server-status.service';

export const masterServerStatusController = {
  get: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterServerStatusService.get() });
  }),
  refreshCache: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterServerStatusService.refreshCache() });
  }),
};
