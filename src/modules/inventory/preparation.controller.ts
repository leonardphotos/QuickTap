import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  createPreparationIngredientSchema,
  createPreparationSchema,
  updatePreparationIngredientSchema,
  updatePreparationSchema,
} from './preparation.dto';
import { preparationService } from './preparation.service';

export const preparationController = {
  listOverview: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await preparationService.listOverview(req.restaurantId!) });
  }),
  getById: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await preparationService.getById(req.restaurantId!, req.params.id) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPreparationSchema.parse(req.body);
    res.status(201).json({ data: await preparationService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePreparationSchema.parse(req.body);
    res.json({ data: await preparationService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await preparationService.remove(req.restaurantId!, req.params.id) });
  }),
  addIngredient: asyncHandler(async (req: Request, res: Response) => {
    const input = createPreparationIngredientSchema.parse(req.body);
    res.status(201).json({ data: await preparationService.addIngredient(req.restaurantId!, req.params.id, input) });
  }),
  updateIngredient: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePreparationIngredientSchema.parse(req.body);
    res.json({ data: await preparationService.updateIngredient(req.restaurantId!, req.params.ingredientId, input) });
  }),
  removeIngredient: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await preparationService.removeIngredient(req.restaurantId!, req.params.ingredientId) });
  }),
};
