import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { masterSummaryService } from './master-summary.service';

export const masterSummaryController = {
  get: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterSummaryService.get() });
  }),
};
