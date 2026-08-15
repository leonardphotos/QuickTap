import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { optimizeImage, uploadShopProductPhoto, uploadShopPaymentProof } from '../../middlewares/upload.middleware';
import { shopController } from './shop.controller';
import { shopOrdersController } from './shop-storefront.controller';

/** Base: /api/v1/shop (el tenant activo, resuelto por JWT) — QuickTap Shop (businessType = SHOP). */
const router = Router();
router.use(tenantGuard);

router.get('/state', shopController.getState);
router.get('/service-providers', shopController.listServiceProviders);

router.post('/products', shopController.createProduct);
// Antes de '/products/:id': si no, Express tomaría "published" como un id de producto.
router.patch('/products/published', requireRole('OWNER', 'ADMIN'), shopController.setProductsPublished);
router.patch('/products/:id', shopController.updateProduct);
// Borrar producto es de administración: el cajero cobra, no depura el catálogo.
router.delete('/products/:id', requireRole('OWNER', 'ADMIN'), shopController.deleteProduct);
router.post('/products/upload-photo', uploadShopProductPhoto, optimizeImage(900, 900), shopController.uploadProductPhoto);
router.post('/upload-payment-proof', uploadShopPaymentProof, optimizeImage(1200, 1200), shopController.uploadPaymentProof);

router.post('/sales', shopController.recordSale);
router.post('/sales/:id/return', shopController.returnSale);

router.get('/breakeven', requireRole('OWNER', 'ADMIN'), shopController.breakEven);

router.get('/receivables', shopController.listReceivables);
router.get('/receivables/history', shopController.listAllCredit);
router.post('/sales/:id/payments', shopController.addSalePayment);
router.patch('/sales/:id/due-date', shopController.setSaleDueDate);

router.put('/products/:id/supplies', shopController.setServiceSupplies);

router.post('/purchases', shopController.recordPurchase);
router.post('/adjustments', shopController.recordAdjustment);

router.post('/till/open', shopController.openTill);
router.post('/till/close', shopController.closeTill);

// Pedidos que entraron por el catálogo público (ver shop-orders.service.ts). Confirmar es lo
// que los convierte en venta, así que queda al alcance de cualquiera que pueda cobrar.
router.get('/orders', shopOrdersController.list);
router.post('/orders/:id/confirm', shopOrdersController.confirm);
router.post('/orders/:id/cancel', shopOrdersController.cancel);

router.post('/categories', shopController.addCategory);
router.post('/categories/:category/subcategories', shopController.addSubcategory);

export default router;
