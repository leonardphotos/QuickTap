import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { createInventoryItemSchema, listInventoryQuerySchema, updateInventoryItemSchema } from './inventory.dto';
import { inventoryService } from './inventory.service';

export const inventoryController = {
  uploadPhoto: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/inventory/${req.file.filename}` } });
  }),
  list: asyncHandler(async (req: Request, res: Response) => {
    const { locationScope } = listInventoryQuerySchema.parse(req.query);
    res.json({ data: await inventoryService.list(req.restaurantId!, req.auth?.parentRestaurantId, locationScope) });
  }),
  listPackaging: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryService.listPackaging(req.restaurantId!, req.auth?.parentRestaurantId) });
  }),
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createInventoryItemSchema.parse(req.body);
    res.status(201).json({ data: await inventoryService.create(req.restaurantId!, req.auth?.parentRestaurantId, input) });
  }),
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateInventoryItemSchema.parse(req.body);
    res.json({ data: await inventoryService.update(req.restaurantId!, req.auth?.parentRestaurantId, req.params.id, input) });
  }),
  remove: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryService.remove(req.restaurantId!, req.auth?.parentRestaurantId, req.params.id) });
  }),
  printList: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryService.printList(req.restaurantId!, req.auth?.parentRestaurantId) });
  }),
};
