import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
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
import { planRequestService } from './plan-request.service';

export const planRequestController = {
  /** POST /api/v1/public/plan-requests — el prospecto elige plan + método de pago y escribe el número de referencia (inscripción). */
  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createPlanRequestSchema.parse(req.body);
    const request = await planRequestService.create(input, { kind: 'SIGNUP' });
    res.status(201).json({ data: request });
  }),

  /** POST /api/v1/plan-requests — el restaurante ya autenticado paga su mensualidad. */
  createRenewal: asyncHandler(async (req: Request, res: Response) => {
    const input = createPlanRequestSchema.parse(req.body);
    const request = await planRequestService.create(input, {
      kind: 'RENEWAL',
      restaurantId: req.restaurantId!,
    });
    res.status(201).json({ data: request });
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
    const kind = req.query.kind === 'RENEWAL' ? 'RENEWAL' : 'SIGNUP';
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
