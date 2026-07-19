import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  associateProductSchema,
  createModifierCategorySchema,
  createModifierSchema,
  updateModifierCategorySchema,
  updateModifierSchema,
} from './modifier-category.dto';
import { modifierCategoryService } from './modifier-category.service';

export const modifierCategoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await modifierCategoryService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createModifierCategorySchema.parse(req.body);
    res.status(201).json({ data: await modifierCategoryService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateModifierCategorySchema.parse(req.body);
    res.json({ data: await modifierCategoryService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await modifierCategoryService.remove(req.restaurantId!, req.params.id) });
  }),
  createModifier: asyncHandler(async (req: Request, res: Response) => {
    const input = createModifierSchema.parse(req.body);
    res.status(201).json({ data: await modifierCategoryService.createModifier(req.restaurantId!, req.params.id, input) });
  }),
  updateModifier: asyncHandler(async (req: Request, res: Response) => {
    const input = updateModifierSchema.parse(req.body);
    res.json({ data: await modifierCategoryService.updateModifier(req.restaurantId!, req.params.modifierId, input) });
  }),
  removeModifier: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await modifierCategoryService.removeModifier(req.restaurantId!, req.params.modifierId) });
  }),
  associateProduct: asyncHandler(async (req: Request, res: Response) => {
    const input = associateProductSchema.parse(req.body);
    res.status(201).json({ data: await modifierCategoryService.associateProduct(req.restaurantId!, req.params.id, input) });
  }),
  dissociateProduct: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      data: await modifierCategoryService.dissociateProduct(req.restaurantId!, req.params.id, req.params.productId),
    });
  }),
};
