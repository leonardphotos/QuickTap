import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { exchangeRateService } from './exchange-rate.service';
import { setManualRateSchema } from './exchange-rate.dto';

export const exchangeRateController = {
  /** GET /api/v1/exchange-rates — resumen USD/EUR para el panel ("Tasa cambiaria"). */
  summary: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await exchangeRateService.getSummary(req.restaurantId) });
  }),

  /** POST /api/v1/exchange-rates/refresh — fuerza un refresco manual contra el BCV. */
  refresh: asyncHandler(async (req: Request, res: Response) => {
    await exchangeRateService.refreshAll();
    res.json({ data: await exchangeRateService.getSummary(req.restaurantId) });
  }),

  /** PATCH /api/v1/exchange-rates/manual — activa/edita la tasa manual del restaurante. */
  setManual: asyncHandler(async (req: Request, res: Response) => {
    const input = setManualRateSchema.parse(req.body);
    res.json({ data: await exchangeRateService.setManualRate(req.restaurantId!, input.manual, input.rateBs ?? null) });
  }),
};
