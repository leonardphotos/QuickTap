import { Router } from 'express';
import { requireFeature, requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { optimizeImage, uploadProductPhoto } from '../../middlewares/upload.middleware';
import { productController } from './product.controller';

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
router.get('/margin', mutate, requireFeature('administration'), productController.margin);
router.get('/:id', productController.getOne);
router.patch('/:id', mutate, productController.update);
router.delete('/:id', mutate, productController.remove);

export default router;
