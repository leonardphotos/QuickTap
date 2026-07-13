import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createZoneSchema, updateZoneSchema } from './zone.dto';
import { zoneService } from './zone.service';

export const zoneController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await zoneService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createZoneSchema.parse(req.body);
    res.status(201).json({ data: await zoneService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateZoneSchema.parse(req.body);
    res.json({ data: await zoneService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await zoneService.remove(req.restaurantId!, req.params.id) });
  }),
};
