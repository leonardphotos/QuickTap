import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { optimizeImage, uploadShopProductPhoto, uploadShopPaymentProof, uploadSpreadsheet } from '../../middlewares/upload.middleware';
import { shopController } from './shop.controller';
import { shopInstallmentsController } from './shop-installments.controller';
import { shopWalletController } from './shop-wallet.controller';
import { shopTicketsController } from './shop-tickets.controller';
import { shopOrdersController } from './shop-storefront.controller';

/** Base: /api/v1/shop (el tenant activo, resuelto por JWT) — QuickTap Shop (businessType = SHOP). */
const router = Router();
router.use(tenantGuard);

router.get('/state', shopController.getState);
router.get('/service-providers', shopController.listServiceProviders);

router.post('/products', shopController.createProduct);
// Carga masiva de productos por Excel: plantilla descargable + subida (propia o exportada de
// otro sistema — ver shop-import.service.ts).
router.get('/products/import-template', shopController.downloadImportTemplate);
router.post('/products/import', requireRole('OWNER', 'ADMIN'), uploadSpreadsheet, shopController.importExcel);
// Antes de '/products/:id': si no, Express tomaría "published" como un id de producto.
router.patch('/products/published', requireRole('OWNER', 'ADMIN'), shopController.setProductsPublished);
// Mover TODOS los precios del catálogo es una decisión de dueño/admin, no de caja.
router.post('/products/raise-prices', requireRole('OWNER', 'ADMIN'), shopController.raisePrices);
router.patch('/products/:id', shopController.updateProduct);
// Borrar producto es de administración: el cajero cobra, no depura el catálogo.
router.delete('/products/:id', requireRole('OWNER', 'ADMIN'), shopController.deleteProduct);
router.post('/products/upload-photo', uploadShopProductPhoto, optimizeImage(900, 900), shopController.uploadProductPhoto);
router.post('/upload-payment-proof', uploadShopPaymentProof, optimizeImage(1200, 1200), shopController.uploadPaymentProof);

// Pedidos abiertos: carritos parados que se siguen cargando más tarde (no son ventas).
router.get('/open-orders', shopController.listOpenOrders);
router.post('/open-orders', shopController.saveOpenOrder);
router.delete('/open-orders/:id', shopController.deleteOpenOrder);

// Plan de consumo: metros comprados por adelantado, consumidos con el tiempo.
router.get('/consumption-plans/active', shopController.activePlan);
router.get('/consumption-plans', shopController.listPlans);
router.post('/consumption-plans', shopController.createConsumptionPlan);
router.post('/consumption-plans/:id/consume', shopController.consumePlan);
router.post('/consumption-plans/:id/close', shopController.closePlan);

router.post('/sales', shopController.recordSale);
router.post('/sales/:id/return', shopController.returnSale);

router.get('/sales-stats', requireRole('OWNER', 'ADMIN'), shopController.salesStats);
router.get('/sales-by-unit', shopController.salesByUnit);
router.get('/products/:id/lots', shopController.productLots);
router.get('/breakeven', requireRole('OWNER', 'ADMIN'), shopController.breakEven);

router.get('/receivables', shopController.listReceivables);
router.get('/receivables/history', shopController.listAllCredit);
router.post('/sales/:id/payments', shopController.addSalePayment);

// --- Cuotas: método de pago para cualquier venta a crédito del local (no solo eventos) ---
router.get('/sales/:id/installments', shopInstallmentsController.plan);
router.post('/sales/:id/installments', shopInstallmentsController.crear);
router.patch('/installments/:cuotaId', shopInstallmentsController.editar);
router.post('/installments/:cuotaId/payments', shopInstallmentsController.abonar);

// --- Entradas de eventos: lista de asistentes y verificación en la puerta ---
// Antes de '/tickets/:id/undo' para que "events" no se lea como un id.
router.get('/tickets/events', shopTicketsController.eventos);
router.get('/tickets', shopTicketsController.lista);
router.post('/tickets/check-in', shopTicketsController.verificar);
router.post('/tickets/:id/undo', requireRole('OWNER', 'ADMIN'), shopTicketsController.desmarcar);
// Borrar a un asistente devuelve un cupo a la venta: nunca el Verificador, que está en la
// puerta y solo debe marcar entradas.
router.delete('/tickets/:id', requireRole('OWNER', 'ADMIN'), shopTicketsController.eliminar);

// --- QuickTap Wallet: deudores y abonos que los clientes reportan desde su portal ---
router.get('/pass/pending', shopWalletController.pendientes);
router.get('/pass/debtors', shopWalletController.deudores);
// Antes de '/pass/:id': si no, Express tomaria "account" como el id de un abono.
router.get('/pass/account', shopWalletController.cuenta);
router.post('/pass/enroll', shopWalletController.alta);
// Verificar un abono mueve dinero en las cuentas del local: solo dueño/admin/cajero.
router.post('/pass/:id/approve', requireRole('OWNER', 'ADMIN', 'CASHIER'), shopWalletController.aprobar);
router.post('/pass/:id/reject', requireRole('OWNER', 'ADMIN', 'CASHIER'), shopWalletController.rechazar);
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
