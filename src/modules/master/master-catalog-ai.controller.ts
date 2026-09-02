import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { analizarPlatoSchema, confirmarCatalogoSchema, fichasSchema } from './master-catalog-ai.dto';
import { masterCatalogAiService } from './master-catalog-ai.service';

export const masterCatalogAiController = {
  categorias: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterCatalogAiService.categorias(req.params.restaurantId) });
  }),

  analizar: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube una foto del plato.');
    const { nombre, mejorarFoto } = analizarPlatoSchema.parse(req.body);
    const data = await masterCatalogAiService.analizar(req.params.restaurantId, req.file, { nombre, mejorarFoto });
    res.json({ data });
  }),

  /** Foto del menú impreso o Excel del cliente -> lista de platos con precio y categoría. */
  leerCarta: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube una foto del menú o el archivo Excel del cliente.');
    const data = await masterCatalogAiService.leerCarta(req.params.restaurantId, req.file);
    res.json({ data });
  }),

  /** Lista de platos -> insumos y preparaciones de cada uno. */
  fichas: asyncHandler(async (req: Request, res: Response) => {
    const { platos } = fichasSchema.parse(req.body);
    const data = await masterCatalogAiService.fichas(req.params.restaurantId, platos);
    res.json({ data });
  }),

  confirmar: asyncHandler(async (req: Request, res: Response) => {
    const { productos } = confirmarCatalogoSchema.parse(req.body);
    const data = await masterCatalogAiService.confirmar(req.params.restaurantId, productos);
    res.status(201).json({ data });
  }),
};
