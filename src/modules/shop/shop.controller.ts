import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import {
  createShopProductSchema,
  updateShopProductSchema,
  setShopProductsPublishedSchema,
  createShopSaleSchema,
  createShopPurchaseSchema,
  createShopAdjustmentSchema,
  openShopTillSchema,
  closeShopTillSchema,
  addShopCategorySchema,
  addShopSubcategorySchema,
  createShopSalePaymentSchema,
  setShopSaleDueDateSchema,
  setShopServiceSuppliesSchema,
} from './shop.dto';
import { shopService } from './shop.service';

export const shopController = {
  getState: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.getState(req.restaurantId!) });
  }),

  createProduct: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopProductSchema.parse(req.body);
    res.status(201).json({ data: await shopService.createProduct(req.restaurantId!, input) });
  }),

  updateProduct: asyncHandler(async (req: Request, res: Response) => {
    const input = updateShopProductSchema.parse(req.body);
    res.json({ data: await shopService.updateProduct(req.restaurantId!, req.params.id, input) });
  }),

  deleteProduct: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.deleteProduct(req.restaurantId!, req.params.id) });
  }),

  /** PATCH /shop/products/published — publica/despublica varios en la tienda virtual. */
  setProductsPublished: asyncHandler(async (req: Request, res: Response) => {
    const { productIds, isPublished } = setShopProductsPublishedSchema.parse(req.body);
    res.json({ data: await shopService.setProductsPublished(req.restaurantId!, productIds, isPublished) });
  }),

  recordSale: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopSaleSchema.parse(req.body);
    res.status(201).json({ data: await shopService.recordSale(req.restaurantId!, input) });
  }),

  returnSale: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.returnSale(req.restaurantId!, req.params.id) });
  }),

  /** PUT /shop/products/:id/supplies — reemplaza la receta de insumos de un servicio. */
  setServiceSupplies: asyncHandler(async (req: Request, res: Response) => {
    const input = setShopServiceSuppliesSchema.parse(req.body);
    res.json({ data: await shopService.setServiceSupplies(req.restaurantId!, req.params.id, input) });
  }),

  recordPurchase: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopPurchaseSchema.parse(req.body);
    res.status(201).json({ data: await shopService.recordPurchase(req.restaurantId!, input) });
  }),

  recordAdjustment: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopAdjustmentSchema.parse(req.body);
    res.status(201).json({ data: await shopService.recordAdjustment(req.restaurantId!, input) });
  }),

  openTill: asyncHandler(async (req: Request, res: Response) => {
    const input = openShopTillSchema.parse(req.body);
    res.status(201).json({ data: await shopService.openTill(req.restaurantId!, input) });
  }),

  closeTill: asyncHandler(async (req: Request, res: Response) => {
    const input = closeShopTillSchema.parse(req.body);
    res.json({ data: await shopService.closeTill(req.restaurantId!, input) });
  }),

  addCategory: asyncHandler(async (req: Request, res: Response) => {
    const input = addShopCategorySchema.parse(req.body);
    await shopService.addCategory(req.restaurantId!, input.name);
    res.status(201).json({ data: { name: input.name } });
  }),

  addSubcategory: asyncHandler(async (req: Request, res: Response) => {
    const input = addShopSubcategorySchema.parse(req.body);
    await shopService.addSubcategory(req.restaurantId!, req.params.category, input.name);
    res.status(201).json({ data: { category: req.params.category, name: input.name } });
  }),

  listReceivables: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.listReceivables(req.restaurantId!) });
  }),

  listAllCredit: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.listAllCredit(req.restaurantId!) });
  }),

  addSalePayment: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopSalePaymentSchema.parse(req.body);
    res.status(201).json({ data: await shopService.addSalePayment(req.restaurantId!, req.params.id, input) });
  }),

  setSaleDueDate: asyncHandler(async (req: Request, res: Response) => {
    const input = setShopSaleDueDateSchema.parse(req.body);
    res.json({ data: await shopService.setSaleDueDate(req.restaurantId!, req.params.id, input.dueDate) });
  }),

  uploadProductPhoto: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/shop-products/${req.file.filename}` } });
  }),

  uploadPaymentProof: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/shop-payment-proofs/${req.file.filename}` } });
  }),
};
