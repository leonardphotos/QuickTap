import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import {
  bulkDeleteProductsSchema,
  createProductSchema,
  marginReportQuerySchema,
  reorderProductsSchema,
  updateProductSchema,
} from './product.dto';
import { productService } from './product.service';
import { catalogImportService } from './catalog-import.service';
import { productImportService } from './product-import.service';
import { productPhotoBulkService } from './product-photo-bulk.service';

/** Controladores CRUD de productos (panel del restaurante). */
export const productController = {
  uploadPhoto: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/products/${req.file.filename}` } });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const products = await productService.list(req.restaurantId!);
    res.json({ data: products });
  }),

  margin: asyncHandler(async (req: Request, res: Response) => {
    const { range, date, from, to } = marginReportQuerySchema.parse(req.query);
    const result = await productService.listWithMargin(req.restaurantId!, range, date, from, to);
    res.json({ data: result });
  }),

  breakEven: asyncHandler(async (req: Request, res: Response) => {
    const { range, date } = marginReportQuerySchema.parse(req.query);
    const result = await productService.getBreakEven(req.restaurantId!, range, date);
    res.json({ data: result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.getById(req.restaurantId!, req.params.id);
    res.json({ data: product });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createProductSchema.parse(req.body);
    const product = await productService.create(req.restaurantId!, req.auth?.parentRestaurantId, input);
    res.status(201).json({ data: product });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProductSchema.parse(req.body);
    const product = await productService.update(req.restaurantId!, req.auth?.parentRestaurantId, req.params.id, input);
    res.json({ data: product });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const result = await productService.remove(req.restaurantId!, req.params.id);
    res.json({ data: result });
  }),

  bulkRemove: asyncHandler(async (req: Request, res: Response) => {
    const { ids } = bulkDeleteProductsSchema.parse(req.body);
    const result = await productService.bulkRemove(req.restaurantId!, ids);
    res.json({ data: result });
  }),

  duplicate: asyncHandler(async (req: Request, res: Response) => {
    const copy = await productService.duplicate(req.restaurantId!, req.params.id);
    res.status(201).json({ data: copy });
  }),

  reorder: asyncHandler(async (req: Request, res: Response) => {
    const input = reorderProductsSchema.parse(req.body);
    const result = await productService.reorder(req.restaurantId!, input.categoryId, input.productIds);
    res.json({ data: result });
  }),

  /**
   * GET /products/catalog-template — plantilla ÚNICA con las cuatro hojas (Productos, Insumos,
   * Modificadores, Recetas) para montar el menú completo de una vez, fotos incluidas.
   */
  downloadCatalogTemplate: asyncHandler(async (req: Request, res: Response) => {
    const workbook = await catalogImportService.buildTemplate(req.restaurantId!);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="catalogo-quicktap.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),

  /** POST /products/catalog-import — carga ese mismo archivo y devuelve el reporte por hoja. */
  importCatalog: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube el archivo de Excel.');
    res.json({ data: await catalogImportService.importWorkbook(req.restaurantId!, req.file.buffer) });
  }),

  downloadImportTemplate: asyncHandler(async (_req: Request, res: Response) => {
    const workbook = productImportService.buildTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),

  importExcel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    const result = await productImportService.importFromExcel(req.restaurantId!, req.auth?.parentRestaurantId, req.file.buffer);
    res.json({ data: result });
  }),

  bulkUploadPhotos: asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No se recibió ninguna foto.');
    const result = await productPhotoBulkService.matchAndAssign(req.restaurantId!, files);
    res.json({ data: result });
  }),

  /** GET /api/v1/products/:id/combo — los platos que componen el combo. */
  getCombo: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await productService.getComboComponents(req.restaurantId!, req.params.id) });
  }),

  /** PUT /api/v1/products/:id/combo — reemplaza los componentes (vacío = deja de ser combo). */
  setCombo: asyncHandler(async (req: Request, res: Response) => {
    const input = z
      .object({
        components: z
          .array(
            z.object({
              componentProductId: z.string().min(1),
              quantity: z.coerce.number().int().min(1).max(10),
              // Tamaño fijado del componente (obligatorio si el plato se vende por variantes).
              variantId: z.string().min(1).nullable().optional(),
            }),
          )
          .max(10),
        // Pool escogible: el cliente elige entre min y max platos de la lista (ambos en null =
        // combo fijo de siempre). Se validan juntos para no guardar un rango imposible.
        minSelections: z.coerce.number().int().min(1).max(20).nullable().optional(),
        maxSelections: z.coerce.number().int().min(1).max(20).nullable().optional(),
      })
      .refine((v) => v.minSelections == null || v.maxSelections == null || v.minSelections <= v.maxSelections, {
        message: 'El mínimo de platos no puede ser mayor que el máximo.',
      })
      .parse(req.body);
    res.json({
      data: await productService.setComboComponents(req.restaurantId!, req.params.id, input.components, {
        minSelections: input.minSelections ?? null,
        maxSelections: input.maxSelections ?? null,
      }),
    });
  }),
};
