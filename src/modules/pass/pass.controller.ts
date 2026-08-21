import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { passService } from './pass.service';

const loginSchema = z.object({
  phone: z.string().min(7, 'Escribe tu teléfono.'),
  idNumber: z.string().min(5, 'Escribe tu cédula.'),
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
};
