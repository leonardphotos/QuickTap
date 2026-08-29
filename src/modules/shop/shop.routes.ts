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

/**
 * Tres niveles de permiso, porque `tenantGuard` solo dice "es de este local", no "puede hacer
 * esto": sin esto, CUALQUIER rol con sesión del local —incluido el Verificador de la puerta, o
 * un rol de restaurante si la cuenta cambió de vertical— podía cerrar la caja, cambiar precios
 * y ajustar stock. Los tres niveles siguen el trabajo real de cada quien:
 *
 *  - `vender`: cobrar y marcar entradas. El Verificador entra acá porque en la puerta también
 *    cobra (ver ShopLayout: sus dos pestañas son Entradas y Venta).
 *  - `caja`: todo lo demás del día a día — cerrar turno, devolver, fiar, cuotas, y también
 *    catálogo/compras/ajustes. El Cajero SÍ va acá: ve la pestaña Inventario desde siempre y
 *    sacarlo ahora le dejaría botones respondiendo 403 (el mismo error que ya se cometió con
 *    la taquilla, ver el comentario de /tickets más abajo). El Verificador queda afuera.
 *
 * Lo que ya era decisión de dueño/admin (borrar producto, subir todos los precios, borrar una
 * venta) se queda como estaba, con su propio requireRole explícito.
 */
const vender = requireRole('OWNER', 'ADMIN', 'STAFF', 'CASHIER', 'VERIFICADOR');
const caja = requireRole('OWNER', 'ADMIN', 'STAFF', 'CASHIER');

router.get('/state', shopController.getState);
router.get('/service-providers', shopController.listServiceProviders);

router.post('/products', caja, shopController.createProduct);
// Carga masiva de productos por Excel: plantilla descargable + subida (propia o exportada de
// otro sistema — ver shop-import.service.ts).
router.get('/products/import-template', shopController.downloadImportTemplate);
router.post('/products/import', requireRole('OWNER', 'ADMIN'), uploadSpreadsheet, shopController.importExcel);
// Antes de '/products/:id': si no, Express tomaría "published" como un id de producto.
router.patch('/products/published', requireRole('OWNER', 'ADMIN'), shopController.setProductsPublished);
// Mover TODOS los precios del catálogo es una decisión de dueño/admin, no de caja.
router.post('/products/raise-prices', requireRole('OWNER', 'ADMIN'), shopController.raisePrices);
router.patch('/products/:id', caja, shopController.updateProduct);
// Borrar producto es de administración: el cajero cobra, no depura el catálogo.
router.delete('/products/:id', requireRole('OWNER', 'ADMIN'), shopController.deleteProduct);
router.post('/products/upload-photo', caja, uploadShopProductPhoto, optimizeImage(900, 900), shopController.uploadProductPhoto);
router.post('/upload-payment-proof', vender, uploadShopPaymentProof, optimizeImage(1200, 1200), shopController.uploadPaymentProof);

// Pedidos abiertos: carritos parados que se siguen cargando más tarde (no son ventas).
router.get('/open-orders', shopController.listOpenOrders);
router.post('/open-orders', vender, shopController.saveOpenOrder);
router.delete('/open-orders/:id', vender, shopController.deleteOpenOrder);

// Plan de consumo: metros comprados por adelantado, consumidos con el tiempo.
router.get('/consumption-plans/active', shopController.activePlan);
router.get('/consumption-plans', shopController.listPlans);
router.post('/consumption-plans', caja, shopController.createConsumptionPlan);
router.post('/consumption-plans/:id/consume', caja, shopController.consumePlan);
router.post('/consumption-plans/:id/close', caja, shopController.closePlan);

router.post('/sales', vender, shopController.recordSale);
router.post('/sales/:id/return', caja, shopController.returnSale);
// Borrado completo del registro de venta (Local Comercial y Tickera, mismo ShopSale) — solo
// Dueño/Administrador, sin código alterno para otros roles (a diferencia de las comandas del
// restaurante). El registro permanente lo pueden consultar los mismos dos roles.
router.delete('/sales/:id', requireRole('OWNER', 'ADMIN'), shopController.deleteSale);
router.get('/sales/deletion-log', requireRole('OWNER', 'ADMIN'), shopController.saleDeletionLog);

router.get('/sales-stats', requireRole('OWNER', 'ADMIN'), shopController.salesStats);
router.get('/sales-by-unit', shopController.salesByUnit);
router.get('/products/:id/lots', shopController.productLots);
router.get('/breakeven', requireRole('OWNER', 'ADMIN'), shopController.breakEven);

router.get('/receivables', shopController.listReceivables);
router.get('/receivables/history', shopController.listAllCredit);
router.post('/sales/:id/payments', caja, shopController.addSalePayment);

// --- Cuotas: método de pago para cualquier venta a crédito del local (no solo eventos) ---
router.get('/sales/:id/installments', shopInstallmentsController.plan);
router.post('/sales/:id/installments', caja, shopInstallmentsController.crear);
router.patch('/installments/:cuotaId', caja, shopInstallmentsController.editar);
router.post('/installments/:cuotaId/payments', caja, shopInstallmentsController.abonar);

// --- Entradas de eventos: lista de asistentes y verificación en la puerta ---
// Antes de '/tickets/:id/undo' para que "events" no se lea como un id.
router.get('/tickets/events', shopTicketsController.eventos);
router.get('/tickets', shopTicketsController.lista);
router.post('/tickets/check-in', vender, shopTicketsController.verificar);
// CASHIER incluido: la taquilla se opera desde la caja (el mismo rol que aprueba y rechaza
// pagos, ver /wallet más abajo). Restringirlo a OWNER/ADMIN dejaba el botón a la vista y el
// servidor respondiendo 403. El Verificador sigue afuera: en la puerta solo se marca.
router.post('/tickets/:id/undo', requireRole('OWNER', 'ADMIN', 'CASHIER'), shopTicketsController.desmarcar);
router.delete('/tickets/:id', requireRole('OWNER', 'ADMIN', 'CASHIER'), shopTicketsController.eliminar);

// --- QuickTap Wallet: deudores y abonos que los clientes reportan desde su portal ---
// El prefijo es /wallet (no /pass) — así es como lo llama todo el frontend
// (ShopWalletPage.tsx, ShopWalletEnrollDialog.tsx, shopApi.ts). Antes estaba mal acá
// (/pass) y el diálogo de "Agregar cliente a QuickTap Wallet" daba 404 al guardar.
router.get('/wallet/pending', shopWalletController.pendientes);
router.get('/wallet/debtors', shopWalletController.deudores);
// Antes de '/wallet/:id': si no, Express tomaria "account" como el id de un abono.
router.get('/wallet/account', shopWalletController.cuenta);
router.post('/wallet/enroll', caja, shopWalletController.alta);
// Verificar un abono mueve dinero en las cuentas del local: solo dueño/admin/cajero.
router.post('/wallet/:id/approve', requireRole('OWNER', 'ADMIN', 'CASHIER'), shopWalletController.aprobar);
router.post('/wallet/:id/reject', requireRole('OWNER', 'ADMIN', 'CASHIER'), shopWalletController.rechazar);
router.patch('/sales/:id/due-date', caja, shopController.setSaleDueDate);

router.put('/products/:id/supplies', caja, shopController.setServiceSupplies);

router.post('/purchases', caja, shopController.recordPurchase);
router.post('/adjustments', caja, shopController.recordAdjustment);

router.post('/till/open', caja, shopController.openTill);
router.post('/till/close', caja, shopController.closeTill);

// Pedidos que entraron por el catálogo público (ver shop-orders.service.ts). Confirmar es lo
// que los convierte en venta, así que queda al alcance de cualquiera que pueda cobrar.
router.get('/orders', shopOrdersController.list);
router.post('/orders/:id/confirm', caja, shopOrdersController.confirm);
router.post('/orders/:id/cancel', caja, shopOrdersController.cancel);

router.post('/categories', caja, shopController.addCategory);
router.post('/categories/:category/subcategories', caja, shopController.addSubcategory);

export default router;
