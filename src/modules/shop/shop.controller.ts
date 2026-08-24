import { Request, Response } from 'express';
import { z } from 'zod';
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
  openOrderSchema,
  createConsumptionPlanSchema,
  consumePlanSchema,
  closeShopTillSchema,
  addShopCategorySchema,
  addShopSubcategorySchema,
  createShopSalePaymentSchema,
  setShopSaleDueDateSchema,
  setShopServiceSuppliesSchema,
  breakEvenQuerySchema,
} from './shop.dto';
import { shopService } from './shop.service';
import { shopImportService } from './shop-import.service';
import { approvalService } from '../approvals/approval.service';

/**
 * Control de aprobación del dueño. Se hace acá y no en el servicio porque acá están el rol y el
 * usuario del JWT — y porque al aprobar, approvalService ejecuta el cambio directo contra la
 * base, sin volver a pasar por este control: si pasara, pediría permiso para lo que el dueño
 * acaba de autorizar.
 *
 * Devuelve true si la acción quedó en solicitud (y ya respondió al cliente); false si el usuario
 * puede hacerla de una.
 */
async function pidePermiso(
  req: Request,
  res: Response,
  action: 'PRODUCT_PRICE' | 'PRODUCT_DELETE' | 'PRICE_RAISE' | 'STOCK_ADJUST' | 'SALE_RETURN',
  summary: string,
  payload: Record<string, string | number | boolean>,
): Promise<boolean> {
  if (!(await approvalService.requiereAprobacion(req.restaurantId!, req.auth!.role, action))) return false;
  const solicitud = await approvalService.crear({
    restaurantId: req.restaurantId!,
    action,
    payload,
    summary,
    userId: req.auth!.userId,
  });
  // 202: se recibió el pedido pero el cambio todavía no ocurrió. El frontend lo distingue del
  // 200 para avisar "queda esperando al dueño" en vez de dar el cambio por hecho.
  res.status(202).json({ data: { pendienteDeAprobacion: true, solicitud } });
  return true;
}

export const shopController = {
  getState: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.getState(req.restaurantId!) });
  }),

  listServiceProviders: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.listServiceProviders(req.restaurantId!, req.auth!.userId) });
  }),

  createProduct: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopProductSchema.parse(req.body);
    res.status(201).json({ data: await shopService.createProduct(req.restaurantId!, input) });
  }),

  updateProduct: asyncHandler(async (req: Request, res: Response) => {
    const input = updateShopProductSchema.parse(req.body);
    // Solo se pide permiso si de verdad cambia el precio: corregir la ubicación o la marca de un
    // producto no tiene por qué esperar al dueño.
    if (input.price !== undefined) {
      const actual = await shopService.getProduct(req.restaurantId!, req.params.id);
      if (actual && actual.price !== input.price) {
        const verbo = input.price < actual.price ? 'Bajar' : 'Subir';
        const pedido = await pidePermiso(
          req,
          res,
          'PRODUCT_PRICE',
          `${verbo} ${actual.name} de $${actual.price.toFixed(2)} a $${input.price.toFixed(2)}`,
          { productId: req.params.id, price: input.price },
        );
        if (pedido) return;
      }
    }
    res.json({ data: await shopService.updateProduct(req.restaurantId!, req.params.id, input) });
  }),

  deleteProduct: asyncHandler(async (req: Request, res: Response) => {
    const actual = await shopService.getProduct(req.restaurantId!, req.params.id);
    if (actual && (await pidePermiso(req, res, 'PRODUCT_DELETE', `Eliminar el producto ${actual.name}`, { productId: req.params.id }))) return;
    res.json({ data: await shopService.deleteProduct(req.restaurantId!, req.params.id) });
  }),

  /** PATCH /shop/products/published — publica/despublica varios en la tienda virtual. */
  /** POST /shop/products/raise-prices — sube (o baja) todos los precios de venta un %. */
  /** GET /shop/sales-by-unit — cuánto se vendió por categoría y producto, en su unidad. */
  salesByUnit: asyncHandler(async (req: Request, res: Response) => {
    const { desde, hasta } = z.object({ desde: z.string().optional(), hasta: z.string().optional() }).parse(req.query);
    res.json({ data: await shopService.salesByUnit(req.restaurantId!, desde, hasta) });
  }),

  salesStats: asyncHandler(async (req: Request, res: Response) => {
    const q = z
      .object({ range: z.enum(['week', 'month']).default('week'), desde: z.string().optional(), hasta: z.string().optional() })
      .parse(req.query);
    res.json({ data: await shopService.salesStats(req.restaurantId!, q.range, q.desde, q.hasta) });
  }),

  productLots: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.productLots(req.restaurantId!, req.params.id) });
  }),

  // ─── Plan de consumo ─────────────────────────────────────────────────────

  /** GET /shop/consumption-plans/active?productId=&phone= — para el POS: ¿este cliente tiene
   *  saldo vigente en este producto? */
  activePlan: asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({ productId: z.string().min(1), phone: z.string().min(4) }).parse(req.query);
    res.json({ data: await shopService.findActivePlan(req.restaurantId!, q.productId, q.phone) });
  }),

  listPlans: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.listPlans(req.restaurantId!) });
  }),

  createConsumptionPlan: asyncHandler(async (req: Request, res: Response) => {
    const input = createConsumptionPlanSchema.parse(req.body);
    res.status(201).json({ data: await shopService.createConsumptionPlan(req.restaurantId!, input) });
  }),

  consumePlan: asyncHandler(async (req: Request, res: Response) => {
    const input = consumePlanSchema.parse(req.body);
    res.json({ data: await shopService.consumePlan(req.restaurantId!, req.params.id, input) });
  }),

  closePlan: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.closePlan(req.restaurantId!, req.params.id) });
  }),

  /** GET /shop/products/import-template — plantilla de carga masiva de productos. */
  downloadImportTemplate: asyncHandler(async (_req: Request, res: Response) => {
    const workbook = shopImportService.buildTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),

  /** POST /shop/products/import — carga masiva desde un Excel, propio o exportado de otro sistema. */
  importExcel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.json({ data: await shopImportService.importFromExcel(req.restaurantId!, req.file.buffer) });
  }),

  raisePrices: asyncHandler(async (req: Request, res: Response) => {
    const { percent } = z.object({ percent: z.coerce.number() }).parse(req.body);
    const verbo = percent < 0 ? 'Bajar' : 'Subir';
    if (await pidePermiso(req, res, 'PRICE_RAISE', `${verbo} TODOS los precios del local un ${Math.abs(percent)}%`, { percent })) return;
    res.json({ data: await shopService.raisePrices(req.restaurantId!, percent) });
  }),

  setProductsPublished: asyncHandler(async (req: Request, res: Response) => {
    const { productIds, isPublished } = setShopProductsPublishedSchema.parse(req.body);
    res.json({ data: await shopService.setProductsPublished(req.restaurantId!, productIds, isPublished) });
  }),

  /** GET /shop/open-orders — pedidos parados, el más reciente primero. */
  listOpenOrders: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.listOpenOrders(req.restaurantId!) });
  }),

  /** POST /shop/open-orders — deja el carrito abierto (con `id`, actualiza el que ya existe). */
  saveOpenOrder: asyncHandler(async (req: Request, res: Response) => {
    const input = openOrderSchema.parse(req.body);
    res.json({ data: await shopService.saveOpenOrder(req.restaurantId!, req.auth!.userId, input) });
  }),

  /** DELETE /shop/open-orders/:id — se llama al cobrarlo o al descartarlo. */
  deleteOpenOrder: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopService.deleteOpenOrder(req.restaurantId!, req.params.id) });
  }),

  recordSale: asyncHandler(async (req: Request, res: Response) => {
    const input = createShopSaleSchema.parse(req.body);
    res.status(201).json({ data: await shopService.recordSale(req.restaurantId!, req.auth!.userId, input) });
  }),

  returnSale: asyncHandler(async (req: Request, res: Response) => {
    const venta = await shopService.getSale(req.restaurantId!, req.params.id);
    if (
      venta &&
      (await pidePermiso(
        req,
        res,
        'SALE_RETURN',
        `Anular la venta de $${venta.total.toFixed(2)} del ${venta.time.toLocaleDateString('es-VE')}${venta.customerName ? ` a ${venta.customerName}` : ''}`,
        { saleId: req.params.id },
      ))
    )
      return;
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

  breakEven: asyncHandler(async (req: Request, res: Response) => {
    const { range, date } = breakEvenQuerySchema.parse(req.query);
    res.json({ data: await shopService.getBreakEven(req.restaurantId!, range, date) });
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
