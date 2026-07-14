import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createPlatformAdminSchema, updatePlatformAdminSchema } from './master-admins.dto';
import { masterAdminsService } from './master-admins.service';

export const masterAdminsController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterAdminsService.list() });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPlatformAdminSchema.parse(req.body);
    res.status(201).json({ data: await masterAdminsService.create(input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePlatformAdminSchema.parse(req.body);
    res.json({ data: await masterAdminsService.update(req.params.id, input) });
  }),
};
