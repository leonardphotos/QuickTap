import { Router } from 'express';
import { Request, Response } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { kpiService } from './kpi.service';

/** Base: /api/v1/kpis — panel general del Dashboard (las 5 cifras del negocio). */
const router = Router();
router.use(tenantGuard);
router.use(requireRole('OWNER', 'ADMIN', 'CASHIER'));
router.use(requireFeature('administration'));

router.get(
  '/general',
  asyncHandler(async (req: Request, res: Response) => {
    const range = ['day', 'week', 'month', 'year'].includes(String(req.query.range))
      ? (String(req.query.range) as 'day' | 'week' | 'month' | 'year')
      : 'month';
    res.json({ data: await kpiService.getGeneralKpis(req.restaurantId!, range) });
  }),
);

export default router;
