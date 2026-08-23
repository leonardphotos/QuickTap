import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { createRecipeIngredientSchema, duplicateRecipeSchema, duplicateRecipeVariantSchema, updateCascadeConfigSchema, updateRecipeIngredientSchema } from './recipe.dto';
import { recipeService } from './recipe.service';

export const recipeController = {
  getCascade: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await recipeService.getCascade(req.restaurantId!, req.params.productId) });
  }),
  updateCascadeConfig: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCascadeConfigSchema.parse(req.body);
    res.json({ data: await recipeService.updateCascadeConfig(req.restaurantId!, req.params.productId, input) });
  }),
  listOverview: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await recipeService.listOverview(req.restaurantId!) });
  }),
  getByProduct: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await recipeService.getByProduct(req.restaurantId!, req.params.productId) });
  }),
  /** GET /inventory/recipes/import-template — plantilla del recetario COMPLETO. */
  downloadGlobalImportTemplate: asyncHandler(async (req: Request, res: Response) => {
    const workbook = await recipeService.buildGlobalImportTemplate(req.restaurantId!);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="recetario.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  }),

  /** POST /inventory/recipes/import — carga el recetario completo desde el Excel. */
  importGlobal: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube el archivo de Excel.');
    res.json({ data: await recipeService.importGlobalFromExcel(req.restaurantId!, req.file.buffer) });
  }),

  /** POST /inventory/recipes/:productId/duplicate-variant — copia de un tamaño a otro del mismo plato. */
  duplicateVariant: asyncHandler(async (req: Request, res: Response) => {
    const input = duplicateRecipeVariantSchema.parse(req.body);
    res.json({ data: await recipeService.duplicateVariant(req.restaurantId!, req.params.productId, input) });
  }),

  /** POST /inventory/recipes/:productId/duplicate — copia esta receta a otro plato. */
  duplicate: asyncHandler(async (req: Request, res: Response) => {
    const input = duplicateRecipeSchema.parse(req.body);
    res.json({ data: await recipeService.duplicate(req.restaurantId!, req.params.productId, input) });
  }),

  addIngredient: asyncHandler(async (req: Request, res: Response) => {
    const input = createRecipeIngredientSchema.parse(req.body);
    res.status(201).json({ data: await recipeService.addIngredient(req.restaurantId!, req.params.productId, input) });
  }),
  updateIngredient: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRecipeIngredientSchema.parse(req.body);
    res.json({ data: await recipeService.updateIngredient(req.restaurantId!, req.params.id, input) });
  }),
  removeIngredient: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await recipeService.removeIngredient(req.restaurantId!, req.params.id) });
  }),
  downloadImportTemplate: asyncHandler(async (req: Request, res: Response) => {
    const { workbook, productName } = await recipeService.buildImportTemplate(req.restaurantId!, req.params.productId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="receta-${encodeURIComponent(productName)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }),
  importExcel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    const result = await recipeService.importFromExcel(req.restaurantId!, req.params.productId, req.file.buffer);
    res.json({ data: result });
  }),
};
