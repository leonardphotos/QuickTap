import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { accountingService } from './accounting.service';

/** Base: /api/v1/accounting — estados financieros NIIF (Contabilidad). Contabilidad avanzada. */
const router = Router();
router.use(tenantGuard);
router.use(requireRole('OWNER', 'ADMIN', 'CASHIER'));
router.use(requireFeature('accounting'));

const querySchema = z.object({
  range: z.enum(['day', 'week', 'month', 'year', 'all']).default('month'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // ISLR estimado: tarifa máxima venezolana por defecto; el dueño la ajusta a su tramo.
  taxRate: z.coerce.number().min(0).max(100).default(34),
});

router.get(
  '/income-statement',
  asyncHandler(async (req: Request, res: Response) => {
    const { taxRate, ...spec } = querySchema.parse(req.query);
    res.json({ data: await accountingService.incomeStatement(req.restaurantId!, spec, taxRate) });
  }),
);

router.get(
  '/balance-sheet',
  asyncHandler(async (req: Request, res: Response) => {
    const { taxRate } = querySchema.parse(req.query);
    res.json({ data: await accountingService.balanceSheet(req.restaurantId!, taxRate) });
  }),
);

export default router;
