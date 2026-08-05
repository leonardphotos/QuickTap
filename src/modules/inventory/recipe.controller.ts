import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { createRecipeIngredientSchema, updateRecipeIngredientSchema } from './recipe.dto';
import { recipeService } from './recipe.service';

export const recipeController = {
  listOverview: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await recipeService.listOverview(req.restaurantId!) });
  }),
  getByProduct: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await recipeService.getByProduct(req.restaurantId!, req.params.productId) });
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
