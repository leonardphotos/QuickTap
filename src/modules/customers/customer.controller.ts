import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from './customer.dto';
import { customerService } from './customer.service';

export const customerController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = customerQuerySchema.parse(req.query);
    res.json({ data: await customerService.list(req.restaurantId!, query) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createCustomerSchema.parse(req.body);
    res.status(201).json({ data: await customerService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCustomerSchema.parse(req.body);
    res.json({ data: await customerService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await customerService.remove(req.restaurantId!, req.params.id) });
  }),
};
