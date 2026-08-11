import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { closeCashSessionSchema, openCashSessionSchema } from './cash-session.dto';
import { cashSessionService } from './cash-session.service';

export const cashSessionController = {
  current: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await cashSessionService.getCurrent(req.restaurantId!) });
  }),
  open: asyncHandler(async (req: Request, res: Response) => {
    const input = openCashSessionSchema.parse(req.body);
    res.status(201).json({ data: await cashSessionService.open(req.restaurantId!, req.auth?.userId, input) });
  }),
  previewClose: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await cashSessionService.previewClose(req.restaurantId!, req.params.id) });
  }),
  close: asyncHandler(async (req: Request, res: Response) => {
    // Body vacío = cierre de siempre, sin arqueo (ver closeCashSessionSchema).
    const { countedBalances } = closeCashSessionSchema.parse(req.body ?? {});
    const counted = countedBalances
      ? Object.fromEntries(Object.entries(countedBalances).map(([m, v]) => [m, String(v)]))
      : null;
    res.json({ data: await cashSessionService.close(req.restaurantId!, req.params.id, req.auth?.userId, counted) });
  }),
  getById: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await cashSessionService.getById(req.restaurantId!, req.params.id) });
  }),
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await cashSessionService.list(req.restaurantId!) });
  }),
};
