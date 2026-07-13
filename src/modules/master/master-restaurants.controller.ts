import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { activateRestaurantSchema } from '../plan-requests/plan-request.dto';
import { planRequestService } from '../plan-requests/plan-request.service';
import { masterRestaurantsService } from './master-restaurants.service';

export const masterRestaurantsController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.list() });
  }),
  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.detail(req.params.id) });
  }),
  /** Activación/extensión manual sin comprobante (ej: el restaurante pagó por otro medio). */
  activate: asyncHandler(async (req: Request, res: Response) => {
    const input = activateRestaurantSchema.parse(req.body);
    res.json({ data: await planRequestService.activateRestaurant(req.params.id, input) });
  }),
};
