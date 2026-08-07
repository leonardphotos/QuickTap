import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import {
  optimizeImage,
  optimizeImages,
  uploadProductPhoto,
  uploadProductPhotosBulk,
  uploadSpreadsheet,
} from '../../middlewares/upload.middleware';
import { productController } from './product.controller';
import { productVariantController } from './product-variant.controller';

/**
 * Rutas protegidas de productos. `tenantGuard` inyecta `req.restaurantId`
 * desde el JWT (forzando el aislamiento por inquilino) y corta el acceso
 * si la cuenta está bloqueada por falta de pago. `GET /` queda sin restricción
 * de rol porque la toma de pedidos (mesero/personal) también necesita listar
 * el menú; solo la gestión (crear/editar/borrar) es de dueño/admin/cajero.
 *
 * Base: /api/v1/products
 */
const router = Router();

router.use(tenantGuard);

const mutate = requireRole(...ADMIN_CASHIER_ROLES);

router.get('/', productController.list);
router.post('/', mutate, productController.create);
router.post('/upload-photo', mutate, uploadProductPhoto, optimizeImage(900, 900), productController.uploadPhoto);
// Carga masiva de fotos: cada archivo se vincula al producto cuyo nombre coincida con el
// nombre del archivo (sin extensión) — ver product-photo-bulk.service.ts.
router.post('/bulk-photos', mutate, uploadProductPhotosBulk, optimizeImages(900, 900), productController.bulkUploadPhotos);
router.get('/margin', mutate, requireFeature('administration'), productController.margin);

// Carga masiva de productos por Excel: plantilla descargable + subida que crea/actualiza por
// nombre. Van ANTES de `/:id` para que "import-template" no se lea como un id de producto.
router.get('/import-template', mutate, productController.downloadImportTemplate);
router.post('/import', mutate, uploadSpreadsheet, productController.importExcel);

router.post('/bulk-delete', mutate, productController.bulkRemove);

router.get('/:id', productController.getOne);
router.patch('/:id', mutate, productController.update);
router.delete('/:id', mutate, productController.remove);

router.get('/:productId/variants', productVariantController.list);
router.post('/:productId/variants', mutate, productVariantController.create);
router.patch('/:productId/variants/:variantId', mutate, productVariantController.update);
router.delete('/:productId/variants/:variantId', mutate, productVariantController.remove);

export default router;
