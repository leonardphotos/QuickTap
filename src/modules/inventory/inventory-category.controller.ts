import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { bulkAssignCategorySchema, createInventoryCategorySchema, updateInventoryCategorySchema } from './inventory-category.dto';
import { inventoryCategoryService } from './inventory-category.service';

export const inventoryCategoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryCategoryService.list(req.restaurantId!, req.auth?.parentRestaurantId) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createInventoryCategorySchema.parse(req.body);
    res.status(201).json({ data: await inventoryCategoryService.create(req.restaurantId!, req.auth?.parentRestaurantId, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateInventoryCategorySchema.parse(req.body);
    res.json({
      data: await inventoryCategoryService.update(req.restaurantId!, req.auth?.parentRestaurantId, req.params.id, input),
    });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryCategoryService.remove(req.restaurantId!, req.auth?.parentRestaurantId, req.params.id) });
  }),
  /** POST /inventory/categories/assign — mover varios insumos a una categoría (o a ninguna). */
  bulkAssign: asyncHandler(async (req: Request, res: Response) => {
    const input = bulkAssignCategorySchema.parse(req.body);
    res.json({ data: await inventoryCategoryService.bulkAssign(req.restaurantId!, req.auth?.parentRestaurantId, input) });
  }),
};
