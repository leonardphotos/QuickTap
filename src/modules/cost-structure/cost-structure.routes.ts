import { Router, Request, Response } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { costStructureService } from './cost-structure.service';
import { rangeQuerySchema, saveProductCostStructureSchema, updateCostStructureConfigSchema } from './cost-structure.dto';

/**
 * Base: /api/v1/cost-structure — Administración → Estructura de costo (calculadora por
 * producto + estadísticas). Contabilidad avanzada (Elite / Elite Shop / Club).
 */
const router = Router();
router.use(tenantGuard);
router.use(requireRole('OWNER', 'ADMIN', 'CASHIER'));
router.use(requireFeature('accounting'));

router.get(
  '/config',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await costStructureService.getConfig(req.restaurantId!) });
  }),
);

router.put(
  '/config',
  asyncHandler(async (req: Request, res: Response) => {
    const input = updateCostStructureConfigSchema.parse(req.body);
    res.json({ data: await costStructureService.updateConfig(req.restaurantId!, input) });
  }),
);

router.get(
  '/suggested-fixed-percent',
  asyncHandler(async (req: Request, res: Response) => {
    const { range } = rangeQuerySchema.parse(req.query);
    res.json({ data: await costStructureService.suggestFixedPercent(req.restaurantId!, range) });
  }),
);

router.get(
  '/materials',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await costStructureService.listMaterials(req.restaurantId!) });
  }),
);

router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { range } = rangeQuerySchema.parse(req.query);
    res.json({ data: await costStructureService.getStats(req.restaurantId!, range) });
  }),
);

router.get(
  '/products/:productId',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await costStructureService.getProduct(req.restaurantId!, req.params.productId) });
  }),
);

router.put(
  '/products/:productId',
  asyncHandler(async (req: Request, res: Response) => {
    const input = saveProductCostStructureSchema.parse(req.body);
    res.json({ data: await costStructureService.saveProduct(req.restaurantId!, req.params.productId, input) });
  }),
);

router.delete(
  '/products/:productId',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await costStructureService.removeProduct(req.restaurantId!, req.params.productId) });
  }),
);

export default router;
