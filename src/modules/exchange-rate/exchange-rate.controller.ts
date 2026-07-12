import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { exchangeRateService } from './exchange-rate.service';

export const exchangeRateController = {
  /** GET /api/v1/exchange-rates — resumen USD/EUR para el panel ("Tasa cambiaria"). */
  summary: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await exchangeRateService.getSummary() });
  }),

  /** POST /api/v1/exchange-rates/refresh — fuerza un refresco manual contra el BCV. */
  refresh: asyncHandler(async (_req: Request, res: Response) => {
    await exchangeRateService.refreshAll();
    res.json({ data: await exchangeRateService.getSummary() });
  }),
};
