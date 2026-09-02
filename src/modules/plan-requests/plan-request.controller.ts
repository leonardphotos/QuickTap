import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { platformSettingsService, currencySymbolFor } from '../platform-settings/platform-settings.service';
import { masterWhatsappBotService } from '../master-whatsapp/master-whatsapp-bot.service';
import {
  addPlanRequestPaymentSchema,
  approvePlanRequestSchema,
  createInstallmentPlanRequestSchema,
  createPlanRequestSchema,
  createRamblayCheckoutSchema,
  quoteQuerySchema,
  rejectPlanRequestSchema,
  updatePlanRequestSchema,
} from './plan-request.dto';
import { PLAN_LABELS, planRequestService } from './plan-request.service';

/**
 * El formulario manda JSON normal cuando no hay comprobante; cuando el prospecto adjunta uno,
 * pasa a `multipart/form-data` (por el archivo) y empaqueta el resto de los campos como un
 * único campo `payload` en JSON — así el DTO de validación no cambia según haya foto o no
 * (evita el problema de que multer entrega todo lo demás como texto plano, ej. los booleanos
 * de un plan CUSTOM llegarían como "false"/"true" en vez de boolean).
 */
function parseBody(req: Request): unknown {
  if (typeof req.body?.payload === 'string') {
    try {
      return JSON.parse(req.body.payload);
    } catch {
      throw badRequest('Datos del formulario inválidos.');
    }
  }
  return req.body;
}

/**
 * Si el prospecto/restaurante adjuntó el comprobante, lo reenvía de una vez al número
 * verificador (Dashboard maestro → WhatsApp) para que el equipo lo revise sin tener que entrar
 * a buscarlo — la activación en sí sigue siendo la misma acción manual de siempre
 * ("Activar cuenta" en /master/proofs), esto solo acelera que lo vean. Nunca debe tumbar la
 * creación de la solicitud: si el bot no está conectado o falla el envío, se ignora en silencio.
 */
async function notifyVerifierOfProof(request: {
  id: string;
  plan: keyof typeof PLAN_LABELS;
  billingCycle: string;
  priceUsd: unknown;
  paymentReference: string;
  contactName: string;
  restaurantName: string | null;
}, proofImageUrl: string): Promise<void> {
  try {
    const verifierPhone = await platformSettingsService.getSubscriptionVerifierPhone();
    if (!verifierPhone) return;
    const filePath = path.join(UPLOADS_DIR, proofImageUrl.replace(/^\/uploads\//, ''));
    const buffer = await fs.promises.readFile(filePath).catch(() => null);
    if (!buffer) return;
    const symbol = currencySymbolFor(await platformSettingsService.getSubscriptionCurrency());
    const caption = [
      `📄 Comprobante de pago — ${request.restaurantName ?? request.contactName}`,
      `📦 Plan: ${PLAN_LABELS[request.plan]} (${request.billingCycle})`,
      `💰 Monto: ${symbol}${Number(request.priceUsd).toFixed(2)}`,
      `🔖 Referencia: ${request.paymentReference}`,
      '',
      'Revísalo y actívalo desde el Dashboard maestro (Comprobantes de pago).',
    ].join('\n');
    await masterWhatsappBotService.sendImage(verifierPhone, buffer, caption);
  } catch {
    // Silencioso a propósito, ver comentario de arriba.
  }
}

/**
 * El Plan Elite no se contrata solo: se pide un asesor (ver advisor-leads). El botón ya no
 * existe en la página, pero el endpoint es público, así que se cierra también acá — si no,
 * un POST a mano seguiría dando de alta un Elite sin que nadie del equipo se entere.
 *
 * Solo aplica al alta pública. La renovación y la mejora de plan van por rutas autenticadas:
 * un cliente que YA es Elite tiene que poder seguir pagando su mensualidad.
 */
function assertPlanContratableSolo(plan: string): void {
  if (plan === 'ELITE') {
    throw badRequest('El Plan Elite se contrata con un asesor. Escríbenos desde "Contactar a un asesor" y te llamamos.');
  }
}

export const planRequestController = {
  /** POST /api/v1/public/plan-requests — el prospecto elige plan + método de pago y escribe el número de referencia (inscripción). */
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPlanRequestSchema.parse(parseBody(req));
    assertPlanContratableSolo(input.plan);
    const proofImageUrl = req.file ? `/uploads/plan-payment-proofs/${req.file.filename}` : undefined;
    const request = await planRequestService.create(input, { kind: 'SIGNUP' }, proofImageUrl);
    if (proofImageUrl) void notifyVerifierOfProof(request, proofImageUrl);
    res.status(201).json({ data: request });
  }),

  /** POST /api/v1/plan-requests — el restaurante ya autenticado paga su mensualidad. */
  createRenewal: asyncHandler(async (req: Request, res: Response) => {
    const input = createPlanRequestSchema.parse(parseBody(req));
    const proofImageUrl = req.file ? `/uploads/plan-payment-proofs/${req.file.filename}` : undefined;
    const request = await planRequestService.create(
      input,
      { kind: 'RENEWAL', restaurantId: req.restaurantId! },
      proofImageUrl,
    );
    if (proofImageUrl) void notifyVerifierOfProof(request, proofImageUrl);
    res.status(201).json({ data: request });
  }),

  /** GET /api/v1/plan-requests/my-plan — el plan actual y las mejoras con su prorrateo (Ajustes). */
  myPlan: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await planRequestService.myPlanOverview(req.restaurantId!) });
  }),

  /** POST /api/v1/plan-requests/upgrade — mejora de plan pagando la diferencia prorrateada. */
  createUpgrade: asyncHandler(async (req: Request, res: Response) => {
    const input = z
      .object({
        plan: z.string().min(2).max(30),
        paymentMethod: z.enum(['PAGO_MOVIL', 'BINANCE', 'BANK_TRANSFER']),
        paymentReference: z.string().min(2).max(80),
      })
      .parse(parseBody(req));
    const proofImageUrl = req.file ? `/uploads/plan-payment-proofs/${req.file.filename}` : undefined;
    const request = await planRequestService.createUpgrade(req.restaurantId!, input, proofImageUrl);
    if (proofImageUrl) void notifyVerifierOfProof(request, proofImageUrl);
    res.status(201).json({ data: request });
  }),

  /** POST /api/v1/plan-requests/downgrade — programa la baja (aplica en la próxima renovación). */
  scheduleDowngrade: asyncHandler(async (req: Request, res: Response) => {
    const input = z.object({ plan: z.string().min(2).max(30) }).parse(req.body);
    res.json({ data: await planRequestService.scheduleDowngrade(req.restaurantId!, input.plan) });
  }),

  /** DELETE /api/v1/plan-requests/downgrade — cancela la baja programada. */
  cancelDowngrade: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await planRequestService.cancelDowngrade(req.restaurantId!) });
  }),

  /** POST /api/v1/plan-requests/installment — inicia un "pago fraccionado" (sin método/referencia todavía). */
  createInstallment: asyncHandler(async (req: Request, res: Response) => {
    const input = createInstallmentPlanRequestSchema.parse(req.body);
    const request = await planRequestService.createInstallment(input, {
      kind: 'RENEWAL',
      restaurantId: req.restaurantId!,
    });
    res.status(201).json({ data: request });
  }),

  /** GET /api/v1/plan-requests/installment/pending — retoma el pago fraccionado pendiente, si hay uno. */
  getPendingInstallment: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await planRequestService.getPendingInstallment(req.restaurantId!) });
  }),

  /** GET /api/v1/plan-requests/quote — mensualidad + cargos adicionales, desglosado. */
  getQuote: asyncHandler(async (req: Request, res: Response) => {
    const input = quoteQuerySchema.parse(req.query);
    res.json({
      data: await planRequestService.getQuote(req.restaurantId!, input.plan, input.billingCycle, input.promoCode),
    });
  }),

  /** POST /api/v1/plan-requests/:id/payments — registra un abono (monto + método + comprobante). */
  addPayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Sube el comprobante de este abono.');
    const input = addPlanRequestPaymentSchema.parse(req.body);
    const proofImageUrl = `/uploads/plan-payment-proofs/${req.file.filename}`;
    const payment = await planRequestService.addPayment(req.params.id, req.restaurantId!, input, proofImageUrl);
    res.status(201).json({ data: payment });
  }),

  /** POST /api/v1/public/plan-requests/ramblay-checkout — inscripción pagando con Ramblay (C2P/Binance Pay), sin comprobante manual. */
  createRamblayCheckout: asyncHandler(async (req: Request, res: Response) => {
    const input = createRamblayCheckoutSchema.parse(req.body);
    assertPlanContratableSolo(input.plan);
    const result = await planRequestService.createRamblayCheckout(input, { kind: 'SIGNUP' });
    res.status(201).json({ data: result });
  }),

  /** POST /api/v1/plan-requests/ramblay-checkout — mensualidad pagando con Ramblay, ya autenticado. */
  createRenewalRamblayCheckout: asyncHandler(async (req: Request, res: Response) => {
    const input = createRamblayCheckoutSchema.parse(req.body);
    const result = await planRequestService.createRamblayCheckout(input, {
      kind: 'RENEWAL',
      restaurantId: req.restaurantId!,
    });
    res.status(201).json({ data: result });
  }),

  /** GET /api/v1/master/plan-requests?kind=SIGNUP|RENEWAL&status=PENDING|APPROVED|REJECTED|PAYMENT_NOT_RECEIVED */
  listByKind: asyncHandler(async (req: Request, res: Response) => {
    const kind = req.query.kind === 'RENEWAL' ? 'RENEWAL' : req.query.kind === 'UPGRADE' ? 'UPGRADE' : 'SIGNUP';
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'PAYMENT_NOT_RECEIVED'] as const;
    const status = validStatuses.includes(req.query.status as any) ? (req.query.status as (typeof validStatuses)[number]) : undefined;
    res.json({ data: await planRequestService.listByKind(kind, status) });
  }),

  /** POST /api/v1/master/plan-requests/:id/approve — "Activar cuenta". */
  approve: asyncHandler(async (req: Request, res: Response) => {
    const input = approvePlanRequestSchema.parse(req.body);
    res.json({ data: await planRequestService.approve(req.params.id, input.restaurantId) });
  }),

  /** POST /api/v1/master/plan-requests/:id/reject — "Rechazar" o "Pago no recibido". */
  reject: asyncHandler(async (req: Request, res: Response) => {
    const input = rejectPlanRequestSchema.parse(req.body);
    res.json({ data: await planRequestService.reject(req.params.id, input.status) });
  }),

  /** DELETE /api/v1/master/plan-requests/:id — elimina la solicitud/registro de pago. */
  remove: asyncHandler(async (req: Request, res: Response) => {
    await planRequestService.remove(req.params.id);
    res.status(204).send();
  }),

  /** PATCH /api/v1/master/plan-requests/:id — corrige monto/referencia (drill-down de Ingresos de QuickTap). */
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePlanRequestSchema.parse(req.body);
    res.json({ data: await planRequestService.update(req.params.id, input) });
  }),

  /** POST /api/v1/master/plan-requests/:id/whatsapp-link — reenviar el aviso de una solicitud ya decidida. */
  whatsappLink: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await planRequestService.getWhatsappLink(req.params.id) });
  }),
};
