import { Router } from 'express';
import { tenantGuard } from '../../middlewares/auth.middleware';
import { shopController } from './shop.controller';

/** Base: /api/v1/shop (el tenant activo, resuelto por JWT) — QuickTap Shop (businessType = SHOP). */
const router = Router();
router.use(tenantGuard);

router.get('/state', shopController.getState);

router.post('/products', shopController.createProduct);
router.patch('/products/:id', shopController.updateProduct);

router.post('/sales', shopController.recordSale);
router.post('/sales/:id/return', shopController.returnSale);

router.post('/purchases', shopController.recordPurchase);
router.post('/adjustments', shopController.recordAdjustment);

router.post('/till/open', shopController.openTill);
router.post('/till/close', shopController.closeTill);

router.post('/categories', shopController.addCategory);
router.post('/categories/:category/subcategories', shopController.addSubcategory);

export default router;
