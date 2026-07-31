import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createQuoteSchema, markQuoteConvertedSchema } from './quote.dto';
import { quoteService } from './quote.service';

export const quoteController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await quoteService.list(req.restaurantId!) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createQuoteSchema.parse(req.body);
    res.status(201).json({ data: await quoteService.create(req.restaurantId!, input) });
  }),
  markConverted: asyncHandler(async (req: Request, res: Response) => {
    const input = markQuoteConvertedSchema.parse(req.body);
    res.json({ data: await quoteService.markConverted(req.restaurantId!, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await quoteService.remove(req.restaurantId!, req.params.id) });
  }),
};
