import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createPromotionSchema, updatePromotionSchema, validatePromotionQuerySchema } from './promotion.dto';
import { promotionService } from './promotion.service';

export const promotionController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await promotionService.list(req.restaurantId!) });
  }),
  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await promotionService.detail(req.restaurantId!, req.params.id) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPromotionSchema.parse(req.body);
    res.status(201).json({ data: await promotionService.create(req.restaurantId!, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePromotionSchema.parse(req.body);
    res.json({ data: await promotionService.update(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await promotionService.remove(req.restaurantId!, req.params.id) });
  }),
  markSent: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await promotionService.markSent(req.restaurantId!, req.params.id, req.params.customerId) });
  }),
  /** GET /promotions/validate?code=X&phone=Y — la caja pregunta si el código aplica. */
  validate: asyncHandler(async (req: Request, res: Response) => {
    const query = validatePromotionQuerySchema.parse(req.query);
    res.json({ data: await promotionService.validate(req.restaurantId!, query.code, query.phone) });
  }),
};
