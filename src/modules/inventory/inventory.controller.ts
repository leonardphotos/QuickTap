import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import {
  bulkDeleteInventoryItemsSchema,
  createInventoryItemSchema,
  listInventoryQuerySchema,
  updateInventoryItemSchema,
} from './inventory.dto';
import { inventoryService } from './inventory.service';
import { inventoryImportService } from './inventory-import.service';

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
  bulkRemove: asyncHandler(async (req: Request, res: Response) => {
    const { ids } = bulkDeleteInventoryItemsSchema.parse(req.body);
    res.json({ data: await inventoryService.bulkRemove(req.restaurantId!, req.auth?.parentRestaurantId, ids) });
  }),
  printList: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await inventoryService.printList(req.restaurantId!, req.auth?.parentRestaurantId) });
  }),
  downloadImportTemplate: asyncHandler(async (_req: Request, res: Response) => {
    const workbook = inventoryImportService.buildTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-insumos.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),
  importExcel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    const result = await inventoryImportService.importFromExcel(req.restaurantId!, req.auth?.parentRestaurantId, req.file.buffer);
    res.json({ data: result });
  }),
};
