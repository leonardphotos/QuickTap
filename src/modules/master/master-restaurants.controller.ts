import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { activateRestaurantSchema } from '../plan-requests/plan-request.dto';
import { planRequestService } from '../plan-requests/plan-request.service';
import {
  extendDaysSchema,
  setPeriodEndSchema,
  setSuspendedSchema,
  updateRestaurantUserSchema,
} from './master-restaurants.dto';
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
  /** Bloquear/desbloquear la cuenta manualmente. */
  setSuspended: asyncHandler(async (req: Request, res: Response) => {
    const { suspended } = setSuspendedSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setSuspended(req.params.id, suspended) });
  }),
  /** Extender (o recortar) el vencimiento por una cantidad exacta de días. */
  extendDays: asyncHandler(async (req: Request, res: Response) => {
    const { days } = extendDaysSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.extendDays(req.params.id, days) });
  }),
  /** Fija el vencimiento a una fecha exacta (día/mes/año). */
  setPeriodEnd: asyncHandler(async (req: Request, res: Response) => {
    const { periodEnd } = setPeriodEndSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.setPeriodEnd(req.params.id, periodEnd) });
  }),
  /** Edita nombre/correo/contraseña de un usuario del restaurante. */
  updateUser: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRestaurantUserSchema.parse(req.body);
    res.json({ data: await masterRestaurantsService.updateUser(req.params.id, req.params.userId, input) });
  }),
  /** Elimina el restaurante y todos sus datos. No se puede deshacer. */
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterRestaurantsService.remove(req.params.id) });
  }),
};
