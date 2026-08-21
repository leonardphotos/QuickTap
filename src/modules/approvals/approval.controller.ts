import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { APPROVAL_LABELS, approvalService } from './approval.service';

const actionSchema = z.enum(['PRODUCT_PRICE', 'PRODUCT_DELETE', 'PRICE_RAISE', 'STOCK_ADJUST', 'SALE_RETURN']);

export const approvalController = {
  /** GET /approvals — solicitudes del local (opcionalmente filtradas por estado). */
  list: asyncHandler(async (req: Request, res: Response) => {
    const { status } = z.object({ status: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']).optional() }).parse(req.query);
    res.json({ data: await approvalService.list(req.restaurantId!, status) });
  }),

  /** GET /approvals/policy — qué acciones están bajo aprobación + el catálogo para la pantalla. */
  policy: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      data: {
        actions: await approvalService.policy(req.restaurantId!),
        catalogo: Object.entries(APPROVAL_LABELS).map(([value, label]) => ({ value, label })),
        pendientes: await approvalService.pendingCount(req.restaurantId!),
      },
    });
  }),

  /** PUT /approvals/policy — solo el dueño decide qué se controla. */
  setPolicy: asyncHandler(async (req: Request, res: Response) => {
    const { actions } = z.object({ actions: z.array(actionSchema) }).parse(req.body);
    res.json({ data: await approvalService.setPolicy(req.restaurantId!, actions) });
  }),

  /** PATCH /approvals/:id — aprobar o rechazar. El reviewer sale del JWT, nunca del body. */
  resolve: asyncHandler(async (req: Request, res: Response) => {
    const { aprobar, note } = z.object({ aprobar: z.boolean(), note: z.string().max(500).optional() }).parse(req.body);
    res.json({
      data: await approvalService.resolver(req.restaurantId!, req.params.id, {
        aprobar,
        note,
        reviewerUserId: req.auth!.userId,
      }),
    });
  }),
};
