import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createTableSchema, mergeTablesSchema, saveFloorPlanSchema, updateTableSchema } from './table.dto';
import { tableService } from './table.service';

export const tableController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.list(req.restaurantId!) });
  }),
  floorPlan: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.floorPlan(req.restaurantId!) });
  }),
  /** PATCH /api/v1/tables/floor-plan — guarda la ubicación de las mesas en el plano del salón. */
  saveFloorPlan: asyncHandler(async (req: Request, res: Response) => {
    const input = saveFloorPlanSchema.parse(req.body);
    res.json({ data: await tableService.saveFloorPlan(req.restaurantId!, input) });
  }),

  merge: asyncHandler(async (req: Request, res: Response) => {
    const input = mergeTablesSchema.parse(req.body);
    res.json({ data: await tableService.merge(req.restaurantId!, input) });
  }),

  unmerge: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.unmerge(req.restaurantId!, req.params.id) });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTableSchema.parse(req.body);
    res.status(201).json({ data: await tableService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateTableSchema.parse(req.body);
    res.json({ data: await tableService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.remove(req.restaurantId!, req.params.id) });
  }),
  acknowledgeServiceRequest: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.acknowledgeServiceRequest(req.restaurantId!, req.params.id) });
  }),
};
