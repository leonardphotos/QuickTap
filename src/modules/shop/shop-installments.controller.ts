import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { shopInstallmentsService } from './shop-installments.service';

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const crearPlanSchema = z.object({
  cantidad: z.coerce.number().int().min(2).max(60),
  primeraFecha: z.string().regex(FECHA_ISO, 'La fecha debe ser yyyy-mm-dd.'),
  lateFeeAmount: z.coerce.number().min(0).optional(),
  alertDaysBefore: z.coerce.number().int().min(0).max(30).optional(),
  frecuencia: z.enum(['SEMANAL', 'QUINCENAL', 'MENSUAL', 'TRIMESTRAL', 'SEMESTRAL']).optional(),
  recargoPorcentaje: z.coerce.number().min(0).max(200).optional(),
});

const editarCuotaSchema = z
  .object({
    amount: z.coerce.number().positive().optional(),
    dueDate: z.string().regex(FECHA_ISO).optional(),
  })
  .refine((v) => v.amount != null || v.dueDate != null, 'Nada que cambiar.');

const abonarSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().optional(),
});

export const shopInstallmentsController = {
  /** GET /shop/sales/:id/installments — plan con el estado de cada cuota ya resuelto. */
  plan: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await shopInstallmentsService.planDeVenta(req.restaurantId!, req.params.id) });
  }),

  /** POST /shop/sales/:id/installments — arma el calendario de cuotas de una venta a crédito. */
  crear: asyncHandler(async (req: Request, res: Response) => {
    const input = crearPlanSchema.parse(req.body);
    res.status(201).json({ data: await shopInstallmentsService.crearPlan(req.restaurantId!, req.params.id, input) });
  }),

  /** PATCH /shop/installments/:cuotaId — reacomodar monto o fecha de una cuota. */
  editar: asyncHandler(async (req: Request, res: Response) => {
    const input = editarCuotaSchema.parse(req.body);
    res.json({ data: await shopInstallmentsService.editarCuota(req.restaurantId!, req.params.cuotaId, input) });
  }),

  /** POST /shop/installments/:cuotaId/payments — abono contra una cuota. */
  abonar: asyncHandler(async (req: Request, res: Response) => {
    const input = abonarSchema.parse(req.body);
    res.json({ data: await shopInstallmentsService.abonarCuota(req.restaurantId!, req.params.cuotaId, input) });
  }),
};
