import { Router, Request, Response } from 'express';
import { requireFeature, requireInventoryAccess, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { wasteService } from './waste.service';
import { createWasteSchema, wasteQuerySchema } from './waste.dto';

/**
 * Base: /api/v1/waste — registro e indicadores de merma. Va con el inventario básico (es
 * donde vive la existencia que se descuenta) y respeta el mismo `requireInventoryAccess`:
 * Mesero/Cocina solo entran si tienen el permiso individual — son justo quienes ven el
 * desperdicio de primera mano y deben poder anotarlo.
 */
const router = Router();
router.use(tenantGuard);
router.use(requireFeature('inventoryBasic'));

const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN', 'STAFF');

router.get(
  '/',
  requireInventoryAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const spec = wasteQuerySchema.parse(req.query);
    res.json({ data: await wasteService.list(req.restaurantId!, spec) });
  }),
);

router.get(
  '/stats',
  requireInventoryAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const spec = wasteQuerySchema.parse(req.query);
    res.json({ data: await wasteService.stats(req.restaurantId!, spec) });
  }),
);

router.post(
  '/',
  requireInventoryAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const input = createWasteSchema.parse(req.body);
    res.status(201).json({ data: await wasteService.create(req.restaurantId!, req.auth?.userId, input) });
  }),
);

router.delete(
  '/:id',
  mutate,
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await wasteService.remove(req.restaurantId!, req.params.id) });
  }),
);

export default router;
