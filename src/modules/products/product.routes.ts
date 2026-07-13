import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { uploadProductPhoto } from '../../middlewares/upload.middleware';
import { productController } from './product.controller';

/**
 * Rutas protegidas de productos. `tenantGuard` inyecta `req.restaurantId`
 * desde el JWT (forzando el aislamiento por inquilino) y corta el acceso
 * si la cuenta está bloqueada por falta de pago.
 *
 * Base: /api/v1/products
 */
const router = Router();

router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

router.get('/', productController.list);
router.post('/', mutate, productController.create);
router.post('/upload-photo', mutate, uploadProductPhoto, productController.uploadPhoto);
router.get('/:id', productController.getOne);
router.patch('/:id', mutate, productController.update);
router.delete('/:id', mutate, productController.remove);

export default router;
