import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createEmployeeSchema, payEmployeeSchema, updateEmployeeSchema } from './payroll.dto';
import { payrollService } from './payroll.service';

export const payrollController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await payrollService.list(req.restaurantId!, req.query.includeInactive === 'true') });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createEmployeeSchema.parse(req.body);
    res.status(201).json({ data: await payrollService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateEmployeeSchema.parse(req.body);
    res.json({ data: await payrollService.update(req.restaurantId!, req.params.id, input) });
  }),
  deactivate: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await payrollService.deactivate(req.restaurantId!, req.params.id) });
  }),
  pay: asyncHandler(async (req: Request, res: Response) => {
    const input = payEmployeeSchema.parse(req.body);
    res.status(201).json({ data: await payrollService.pay(req.restaurantId!, req.params.id, req.auth?.userId, input) });
  }),
  payments: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await payrollService.payments(req.restaurantId!, req.params.id) });
  }),
};
