import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { assignTablesSchema, createStaffSchema, setStaffPinSchema, updateStaffSchema } from './team.dto';
import { teamService } from './team.service';
import { tableService } from '../tables/table.service';

export const teamController = {
  listConsumptionUsers: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await teamService.listConsumptionUsers(req.restaurantId!) });
  }),
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await teamService.list(req.restaurantId!) });
  }),
  assignTables: asyncHandler(async (req: Request, res: Response) => {
    const input = assignTablesSchema.parse(req.body);
    const tables = await tableService.assignTablesToWaiter(req.restaurantId!, req.params.id, input.tableIds);
    res.json({ data: tables });
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
  setPin: asyncHandler(async (req: Request, res: Response) => {
    const input = setStaffPinSchema.parse(req.body);
    res.json({ data: await teamService.setPin(req.restaurantId!, req.params.id, input) });
  }),
};
