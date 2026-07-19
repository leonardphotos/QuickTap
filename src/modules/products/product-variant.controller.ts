import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createProductVariantSchema, updateProductVariantSchema } from './product-variant.dto';
import { productVariantService } from './product-variant.service';

export const productVariantController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await productVariantService.list(req.restaurantId!, req.params.productId) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createProductVariantSchema.parse(req.body);
    res.status(201).json({ data: await productVariantService.create(req.restaurantId!, req.params.productId, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProductVariantSchema.parse(req.body);
    res.json({ data: await productVariantService.update(req.restaurantId!, req.params.variantId, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await productVariantService.remove(req.restaurantId!, req.params.variantId) });
  }),
};
