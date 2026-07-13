import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { approvePlanRequestSchema, createPlanRequestSchema } from './plan-request.dto';
import { planRequestService } from './plan-request.service';

export const planRequestController = {
  /** POST /api/v1/public/plan-requests — el prospecto elige plan + método de pago y sube su comprobante (inscripción). */
  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Falta el comprobante de pago.');
    const input = createPlanRequestSchema.parse(req.body);
    const proofUrl = `/uploads/payment-proofs/${req.file.filename}`;
    const request = await planRequestService.create(input, proofUrl, { kind: 'SIGNUP' });
    res.status(201).json({ data: request });
  }),

  /** POST /api/v1/plan-requests — el restaurante ya autenticado paga su mensualidad. */
  createRenewal: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Falta el comprobante de pago.');
    const input = createPlanRequestSchema.parse(req.body);
    const proofUrl = `/uploads/payment-proofs/${req.file.filename}`;
    const request = await planRequestService.create(input, proofUrl, {
      kind: 'RENEWAL',
      restaurantId: req.restaurantId!,
    });
    res.status(201).json({ data: request });
  }),

  /** GET /api/v1/master/plan-requests?kind=SIGNUP|RENEWAL&status=PENDING|APPROVED */
  listByKind: asyncHandler(async (req: Request, res: Response) => {
    const kind = req.query.kind === 'RENEWAL' ? 'RENEWAL' : 'SIGNUP';
    const status = req.query.status === 'APPROVED' ? 'APPROVED' : req.query.status === 'PENDING' ? 'PENDING' : undefined;
    res.json({ data: await planRequestService.listByKind(kind, status) });
  }),

  /** POST /api/v1/master/plan-requests/:id/approve — "Activar cuenta". */
  approve: asyncHandler(async (req: Request, res: Response) => {
    const input = approvePlanRequestSchema.parse(req.body);
    res.json({ data: await planRequestService.approve(req.params.id, input.restaurantId) });
  }),
};
