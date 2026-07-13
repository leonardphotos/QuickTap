import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createStaffSchema, updateStaffSchema } from './team.dto';
import { teamService } from './team.service';

export const teamController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await teamService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createStaffSchema.parse(req.body);
    res.status(201).json({ data: await teamService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateStaffSchema.parse(req.body);
    res.json({ data: await teamService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await teamService.remove(req.restaurantId!, req.params.id) });
  }),
};
