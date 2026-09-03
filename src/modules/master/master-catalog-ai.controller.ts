import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import {
  analizarPlatoSchema,
  confirmarCatalogoSchema,
  confirmarInsumosSchema,
  confirmarRecetasSchema,
  fichasCatalogoSchema,
  fichasSchema,
} from './master-catalog-ai.dto';
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

  /** Qué tiene y qué le falta al cliente: por dónde entrar a cargarle lo que le falta. */
  estado: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterCatalogAiService.estado(req.params.restaurantId) });
  }),

  /** Lista de insumos del cliente (foto o Excel) -> insumos cruzados con los que ya tiene. */
  leerInsumos: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube una foto de la lista de insumos o el archivo del cliente.');
    const data = await masterCatalogAiService.leerInsumos(req.params.restaurantId, req.file);
    res.json({ data });
  }),

  confirmarInsumos: asyncHandler(async (req: Request, res: Response) => {
    const { insumos } = confirmarInsumosSchema.parse(req.body);
    const data = await masterCatalogAiService.confirmarInsumos(req.params.restaurantId, insumos);
    res.status(201).json({ data });
  }),

  /** Platos que el cliente ya tiene en la carta -> ficha técnica de cada uno. */
  fichasCatalogo: asyncHandler(async (req: Request, res: Response) => {
    const { productIds } = fichasCatalogoSchema.parse(req.body);
    const data = await masterCatalogAiService.fichasDeCatalogo(req.params.restaurantId, productIds);
    res.json({ data });
  }),

  /** Recetario propio del cliente (foto o Excel) -> fichas cruzadas con su carta e inventario. */
  leerRecetas: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube una foto del recetario o el archivo del cliente.');
    const data = await masterCatalogAiService.leerRecetas(req.params.restaurantId, req.file);
    res.json({ data });
  }),

  confirmarRecetas: asyncHandler(async (req: Request, res: Response) => {
    const { recetas, reemplazarExistentes } = confirmarRecetasSchema.parse(req.body);
    const data = await masterCatalogAiService.confirmarRecetas(req.params.restaurantId, recetas, reemplazarExistentes);
    res.status(201).json({ data });
  }),
};
