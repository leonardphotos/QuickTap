import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { listKitchenOrdersQuerySchema, redeemLinkCodeSchema, setTabOrderStatusSchema } from './club-link.dto';
import { clubLinkService } from './club-link.service';

export const clubLinkController = {
  // Lado restaurante
  createCode: asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json({ data: await clubLinkService.createCode(req.restaurantId!) });
  }),
  restaurantState: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubLinkService.getRestaurantState(req.restaurantId!) });
  }),
  unlinkClub: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubLinkService.unlinkClub(req.restaurantId!, req.params.clubId) });
  }),
  kitchenOrders: asyncHandler(async (req: Request, res: Response) => {
    const query = listKitchenOrdersQuerySchema.parse(req.query);
    res.json({ data: await clubLinkService.listKitchenOrders(req.restaurantId!, query.includeDelivered) });
  }),
  setOrderStatus: asyncHandler(async (req: Request, res: Response) => {
    const input = setTabOrderStatusSchema.parse(req.body);
    res.json({ data: await clubLinkService.setKitchenOrderStatus(req.restaurantId!, req.params.id, input.status) });
  }),

  // Lado club
  redeem: asyncHandler(async (req: Request, res: Response) => {
    const input = redeemLinkCodeSchema.parse(req.body);
    res.json({ data: await clubLinkService.redeemCode(req.restaurantId!, input.code) });
  }),
  clubState: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubLinkService.getClubLink(req.restaurantId!) });
  }),
  unlinkFromClub: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubLinkService.unlinkFromClub(req.restaurantId!) });
  }),
};
