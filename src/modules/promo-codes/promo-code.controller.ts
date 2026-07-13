import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createPromoCodeSchema, updatePromoCodeSchema } from './promo-code.dto';
import { promoCodeService } from './promo-code.service';

export const promoCodeController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await promoCodeService.list() });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPromoCodeSchema.parse(req.body);
    res.status(201).json({ data: await promoCodeService.create(input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePromoCodeSchema.parse(req.body);
    res.json({ data: await promoCodeService.update(req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await promoCodeService.remove(req.params.id) });
  }),
  validate: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await promoCodeService.validate(req.params.code) });
  }),
};
