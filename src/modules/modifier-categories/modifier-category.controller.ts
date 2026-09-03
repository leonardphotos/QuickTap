import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  associateProductSchema,
  createModifierCategorySchema,
  createModifierSchema,
  reorderModifiersSchema,
  reorderProductCategoriesSchema,
  setModifierVariantPriceSchema,
  setModifierVariantVisibilitySchema,
  updateModifierCategorySchema,
  updateModifierSchema,
  updateProductLinkSchema,
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
  duplicate: asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json({ data: await modifierCategoryService.duplicate(req.restaurantId!, req.params.id) });
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
  reorderModifiers: asyncHandler(async (req: Request, res: Response) => {
    const input = reorderModifiersSchema.parse(req.body);
    res.json({ data: await modifierCategoryService.reorderModifiers(req.restaurantId!, req.params.id, input) });
  }),
  /** Orden en que salen los grupos de modificadores de un producto al armarlo. */
  reorderProductCategories: asyncHandler(async (req: Request, res: Response) => {
    const { modifierCategoryIds } = reorderProductCategoriesSchema.parse(req.body);
    res.json({
      data: await modifierCategoryService.reorderProductCategories(
        req.restaurantId!,
        req.params.productId,
        modifierCategoryIds,
      ),
    });
  }),
  listLinkedProducts: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await modifierCategoryService.listLinkedProducts(req.restaurantId!, req.params.id) });
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
  updateProductLink: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProductLinkSchema.parse(req.body);
    res.json({
      data: await modifierCategoryService.updateProductLink(req.restaurantId!, req.params.id, req.params.productId, input),
    });
  }),
  setModifierVariantPrice: asyncHandler(async (req: Request, res: Response) => {
    const input = setModifierVariantPriceSchema.parse(req.body);
    res.json({
      data: await modifierCategoryService.setModifierVariantPrice(
        req.restaurantId!,
        req.params.modifierId,
        req.params.variantId,
        input,
      ),
    });
  }),
  removeModifierVariantPrice: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      data: await modifierCategoryService.removeModifierVariantPrice(req.restaurantId!, req.params.modifierId, req.params.variantId),
    });
  }),
  setModifierVariantVisibility: asyncHandler(async (req: Request, res: Response) => {
    const input = setModifierVariantVisibilitySchema.parse(req.body);
    res.json({
      data: await modifierCategoryService.setModifierVariantVisibility(
        req.restaurantId!,
        req.params.modifierId,
        req.params.productId,
        input,
      ),
    });
  }),
};
