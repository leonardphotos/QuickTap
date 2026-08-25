import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { walletService } from './wallet.service';
import { walletAuthService } from './wallet-auth.service';
import { walletPaymentsService } from './wallet-payments.service';

const loginSchema = z.object({
  phone: z.string().min(7, 'Escribe tu teléfono.'),
  // Se cuenta sobre los dígitos, no sobre el texto: "V-123" tiene 5 caracteres
  // pero solo 3 números. La cédula se reconoce por el número, sin la V.
  idNumber: z.string().refine((v) => v.replace(/\D/g, '').length >= 5, 'Escribe tu cédula, solo los números.'),
});

const reportarSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.string().min(1),
  installmentId: z.string().optional(),
  proofImageUrl: z.string().optional(),
});

const estadoSchema = z.object({ phone: z.string().min(7) });
const codigoSchema = z.object({ phone: z.string().min(7), code: z.string().min(4).max(8) });
const claveNuevaSchema = z.object({ setupToken: z.string().min(10), password: z.string().min(1).max(200) });
const loginClaveSchema = z.object({ phone: z.string().min(7), password: z.string().min(1).max(200) });

export const walletController = {
  /** POST /public/wallet/login — teléfono + cédula (solo cuentas que aún no crearon su clave). */
  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    res.json({ data: await walletService.login(input) });
  }),

  /** POST /public/wallet/status — si este teléfono ya tiene clave (la pantalla cambia la casilla). */
  estado: asyncHandler(async (req: Request, res: Response) => {
    const input = estadoSchema.parse(req.body);
    res.json({ data: await walletAuthService.estado(input.phone) });
  }),

  /** POST /public/wallet/send-code — teléfono + cédula → SMS de 4 dígitos. */
  enviarCodigo: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    res.json({ data: await walletAuthService.enviarCodigo(input) });
  }),

  /** POST /public/wallet/verify-code — código → permiso corto para crear la clave. */
  verificarCodigo: asyncHandler(async (req: Request, res: Response) => {
    const input = codigoSchema.parse(req.body);
    res.json({ data: await walletAuthService.verificarCodigo(input) });
  }),

  /** POST /public/wallet/set-password — crea la clave y entra. */
  crearClave: asyncHandler(async (req: Request, res: Response) => {
    const input = claveNuevaSchema.parse(req.body);
    res.json({ data: await walletAuthService.crearClave(input) });
  }),

  /** POST /public/wallet/login-password — teléfono + clave. */
  loginConClave: asyncHandler(async (req: Request, res: Response) => {
    const input = loginClaveSchema.parse(req.body);
    res.json({ data: await walletAuthService.loginConClave(input) });
  }),

  /** GET /public/wallet/me — compras, saldos y cuotas del cliente autenticado. */
  me: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletService.resumen(req.walletCustomerId!) });
  }),

  /** GET /public/wallet/stores — locales con tienda virtual, para el carrusel. */
  tiendas: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await walletService.tiendas() });
  }),

  /** GET /public/wallet/history — todo lo comprado en cualquier vertical, con enlace al negocio. */
  historial: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletService.historial(req.walletCustomerId!) });
  }),

  /** GET /public/wallet/tickets — las entradas de eventos que compró. */
  entradas: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletService.entradas(req.walletCustomerId!) });
  }),

  /** GET /public/wallet/sales/:id/methods — cómo puede pagarle a ese negocio. */
  metodos: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletPaymentsService.metodosDe(req.params.id, req.walletCustomerId!) });
  }),

  /** POST /public/wallet/sales/:id/payments — reporta un abono; queda por verificar. */
  reportar: asyncHandler(async (req: Request, res: Response) => {
    const input = reportarSchema.parse(req.body);
    res.status(201).json({ data: await walletPaymentsService.reportar(req.walletCustomerId!, req.params.id, input) });
  }),

  /** POST /public/wallet/proof — sube el comprobante y devuelve su URL. */
  subirComprobante: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Adjunta la imagen del comprobante.');
    res.status(201).json({ data: { url: `/uploads/shop-payment-proofs/${req.file.filename}` } });
  }),

  /** GET /public/wallet/reports — el estado de lo que el cliente ya reportó. */
  misReportes: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await walletPaymentsService.misReportes(req.walletCustomerId!) });
  }),
};
