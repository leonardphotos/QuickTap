import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createTransferSchema } from './inventory-transfer.dto';
import { inventoryTransferService } from './inventory-transfer.service';

export const inventoryTransferController = {
  listLocations: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryTransferService.listLocations(req.restaurantId!, req.auth?.parentRestaurantId) });
  }),
  listItemsForLocation: asyncHandler(async (req: Request, res: Response) => {
    const restaurantId = String(req.query.restaurantId ?? '');
    const scope = req.query.scope === 'CASA_MATRIZ' ? 'CASA_MATRIZ' : 'LOCAL';
    res.json({
      data: await inventoryTransferService.listItemsForLocation(req.restaurantId!, req.auth?.parentRestaurantId, restaurantId, scope),
    });
  }),
  list: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryTransferService.listTransfers(req.restaurantId!, req.auth?.parentRestaurantId) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createTransferSchema.parse(req.body);
    const transfer = await inventoryTransferService.transfer(
      req.restaurantId!,
      req.auth?.parentRestaurantId,
      req.auth?.userId,
      input,
    );
    res.status(201).json({ data: transfer });
  }),
};
