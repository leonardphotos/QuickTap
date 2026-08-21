import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { passService } from './pass.service';
import { passPaymentsService } from './pass-payments.service';

const loginSchema = z.object({
  phone: z.string().min(7, 'Escribe tu teléfono.'),
  idNumber: z.string().min(5, 'Escribe tu cédula.'),
});

const reportarSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().min(1),
  installmentId: z.string().optional(),
  proofImageUrl: z.string().optional(),
});

export const passController = {
  /** POST /public/pass/login — teléfono + cédula. */
  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    res.json({ data: await passService.login(input) });
  }),

  /** GET /public/pass/me — compras, saldos y cuotas del cliente autenticado. */
  me: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await passService.resumen(req.passCustomerId!) });
  }),

  /** GET /public/pass/sales/:id/methods — cómo puede pagarle a ese negocio. */
  metodos: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await passPaymentsService.metodosDe(req.params.id, req.passCustomerId!) });
  }),

  /** POST /public/pass/sales/:id/payments — reporta un abono; queda por verificar. */
  reportar: asyncHandler(async (req: Request, res: Response) => {
    const input = reportarSchema.parse(req.body);
    res.status(201).json({ data: await passPaymentsService.reportar(req.passCustomerId!, req.params.id, input) });
  }),

  /** POST /public/pass/proof — sube el comprobante y devuelve su URL. */
  subirComprobante: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Adjunta la imagen del comprobante.');
    res.status(201).json({ data: { url: `/uploads/shop-payment-proofs/${req.file.filename}` } });
  }),

  /** GET /public/pass/reports — el estado de lo que el cliente ya reportó. */
  misReportes: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await passPaymentsService.misReportes(req.passCustomerId!) });
  }),
};
