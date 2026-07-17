import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { approvePlanRequestSchema, createPlanRequestSchema, rejectPlanRequestSchema } from './plan-request.dto';
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

  /** DELETE /api/v1/master/plan-requests/:id — elimina el comprobante. */
  remove: asyncHandler(async (req: Request, res: Response) => {
    await planRequestService.remove(req.params.id);
    res.status(204).send();
  }),

  /** POST /api/v1/master/plan-requests/:id/whatsapp-link — reenviar el aviso de una solicitud ya decidida. */
  whatsappLink: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await planRequestService.getWhatsappLink(req.params.id) });
  }),
};
