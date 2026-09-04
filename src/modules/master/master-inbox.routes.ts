import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { uploadCartaToMemory, uploadVariasHojasToMemory } from '../../middlewares/upload.middleware';
import { masterInboxService } from './master-inbox.service';

/**
 * Base: /api/v1/master/inbox/:restaurantId — el buzón de archivos del cliente.
 *
 * Herramienta INTERNA del equipo QuickTap, igual que la carga de catálogo: escribe en el
 * restaurante que diga la URL, así que va bajo platformAuthGuard y nunca bajo un guard de
 * tenant.
 */
const router = Router();
router.use(platformAuthGuard);

const clientesSchema = z.object({
  clientes: z
    .array(
      z.object({
        nombre: z.string().min(1).max(120),
        telefono: z.string().min(1).max(30),
        cedula: z.string().max(30).optional(),
        email: z.string().max(160).optional(),
        direccion: z.string().max(300).optional(),
        cumpleanos: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional(),
        notas: z.string().max(500).optional(),
      }),
    )
    .min(1, 'No hay clientes que cargar.')
    .max(3000, 'Carga como máximo 3000 clientes a la vez.'),
});

const proveedoresSchema = z.object({
  proveedores: z
    .array(
      z.object({
        nombre: z.string().min(1).max(160),
        rif: z.string().max(30).optional(),
        telefono: z.string().max(30).optional(),
      }),
    )
    .min(1, 'No hay proveedores que cargar.')
    .max(1000, 'Carga como máximo 1000 proveedores a la vez.'),
});

/** Suelta N archivos y dice qué es cada uno. No escribe nada. */
router.post(
  '/:restaurantId/clasificar',
  uploadVariasHojasToMemory,
  asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files ?? []) as Express.Multer.File[];
    if (files.length === 0) throw badRequest('Sube al menos un archivo .xlsx.');
    res.json({ data: await masterInboxService.clasificar(req.params.restaurantId, files) });
  }),
);

router.post(
  '/:restaurantId/leer-clientes',
  uploadCartaToMemory,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube el archivo de clientes.');
    const hoja = typeof req.body?.hoja === 'string' ? req.body.hoja : undefined;
    res.json({ data: await masterInboxService.leerClientes(req.params.restaurantId, req.file, hoja) });
  }),
);

router.post(
  '/:restaurantId/leer-proveedores',
  uploadCartaToMemory,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube el archivo de proveedores.');
    const hoja = typeof req.body?.hoja === 'string' ? req.body.hoja : undefined;
    res.json({ data: await masterInboxService.leerProveedores(req.params.restaurantId, req.file, hoja) });
  }),
);

router.post(
  '/:restaurantId/confirmar-clientes',
  asyncHandler(async (req: Request, res: Response) => {
    const { clientes } = clientesSchema.parse(req.body);
    res.status(201).json({ data: await masterInboxService.confirmarClientes(req.params.restaurantId, clientes) });
  }),
);

router.post(
  '/:restaurantId/confirmar-proveedores',
  asyncHandler(async (req: Request, res: Response) => {
    const { proveedores } = proveedoresSchema.parse(req.body);
    res.status(201).json({ data: await masterInboxService.confirmarProveedores(req.params.restaurantId, proveedores) });
  }),
);

export default router;
