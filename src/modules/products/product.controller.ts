import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createProductSchema, updateProductSchema } from './product.dto';
import { productService } from './product.service';

/** Controladores CRUD de productos (panel del restaurante). */
export const productController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const products = await productService.list(req.restaurantId!);
    res.json({ data: products });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getById(req.restaurantId!, req.params.id);
    res.json({ data: product });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createProductSchema.parse(req.body);
    const product = await productService.create(req.restaurantId!, input);
    res.status(201).json({ data: product });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProductSchema.parse(req.body);
    const product = await productService.update(req.restaurantId!, req.params.id, input);
    res.json({ data: product });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const result = await productService.remove(req.restaurantId!, req.params.id);
    res.json({ data: result });
  }),
};
