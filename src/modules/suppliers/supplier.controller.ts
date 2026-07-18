import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createSupplierSchema, updateSupplierSchema } from './supplier.dto';
import { supplierService } from './supplier.service';

export const supplierController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await supplierService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createSupplierSchema.parse(req.body);
    res.status(201).json({ data: await supplierService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateSupplierSchema.parse(req.body);
    res.json({ data: await supplierService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await supplierService.remove(req.restaurantId!, req.params.id) });
  }),
};
