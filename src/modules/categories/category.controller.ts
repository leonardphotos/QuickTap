import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createCategorySchema, updateCategorySchema } from './category.dto';
import { categoryService } from './category.service';

export const categoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await categoryService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createCategorySchema.parse(req.body);
    res.status(201).json({ data: await categoryService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCategorySchema.parse(req.body);
    res.json({ data: await categoryService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await categoryService.remove(req.restaurantId!, req.params.id) });
  }),
};
