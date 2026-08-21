import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { passInboxService } from '../pass/pass-payments.service';

const rechazarSchema = z.object({ motivo: z.string().min(3, 'Escribe por qué lo rechazas.') });

/** Ventana "QuickTap Pass" del panel del local. */
export const shopPassController = {
  /** GET /shop/pass/pending — abonos reportados esperando verificación. */
  pendientes: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await passInboxService.pendientes(req.restaurantId!) });
  }),

  /** GET /shop/pass/debtors — todos los clientes con deuda, de mayor a menor. */
  deudores: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await passInboxService.deudores(req.restaurantId!) });
  }),

  /** POST /shop/pass/:id/approve — el abono se vuelve real y suma al cliente. */
  aprobar: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await passInboxService.aprobar(req.restaurantId!, req.params.id, req.auth?.userId) });
  }),

  /** POST /shop/pass/:id/reject — no se crea ningún pago; el cliente ve el motivo. */
  rechazar: asyncHandler(async (req: Request, res: Response) => {
    const { motivo } = rechazarSchema.parse(req.body);
    res.json({ data: await passInboxService.rechazar(req.restaurantId!, req.params.id, motivo, req.auth?.userId) });
  }),
};
