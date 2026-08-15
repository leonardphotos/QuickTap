import { Router } from 'express';
import { requireFeature, requireRole, requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { optimizeImage, uploadExpenseReceipt, uploadExpenseQuote, uploadExpensePaymentProof, uploadSpreadsheet } from '../../middlewares/upload.middleware';
import { movementController } from './movement.controller';

/** Base: /api/v1/movements — botón "Añadir movimiento" en Administración → Resumen. */
const router = Router();
router.use(tenantGuard);
router.use(requireFeature('administration'));

// Ver los movimientos del día (por método de pago, ingresos/egresos manuales) es una de las
// dos habilidades que Cajero conserva siempre, sin depender de `cashierFullAccess`. Crear/borrar
// movimientos y marcar créditos pagados sí requiere acceso completo (dueño/admin, o cajero con el flag).
router.get('/', requireRole('OWNER', 'ADMIN', 'CASHIER'), movementController.list);
router.get('/export', requireRole('OWNER', 'ADMIN', 'CASHIER'), movementController.exportExcel);
const mutate = requireRoleOrCashierFullAccess('OWNER', 'ADMIN');
// Carga del historial financiero por Excel (Contabilidad): plantilla + import masivo.
router.get('/import-template', mutate, movementController.downloadImportTemplate);
router.post('/import', mutate, uploadSpreadsheet, movementController.importExcel);
router.post('/', mutate, movementController.create);
router.post('/upload-receipt', mutate, uploadExpenseReceipt, optimizeImage(1400, 1400), movementController.uploadReceipt);
router.post('/upload-quote', mutate, uploadExpenseQuote, optimizeImage(1400, 1400), movementController.uploadQuote);
router.post(
  '/upload-payment-proof',
  mutate,
  uploadExpensePaymentProof,
  optimizeImage(1400, 1400),
  movementController.uploadPaymentProof,
);
router.patch('/:id', mutate, movementController.update);
router.delete('/:id', mutate, movementController.remove);
router.patch('/:id/mark-paid', mutate, movementController.markCreditPaid);

export default router;
