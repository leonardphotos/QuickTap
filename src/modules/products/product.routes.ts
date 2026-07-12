import { Router } from 'express';
import { authGuard } from '../../middlewares/auth.middleware';
import { productController } from './product.controller';

/**
 * Rutas protegidas de productos. `authGuard` inyecta `req.restaurantId`
 * desde el JWT, forzando el aislamiento por inquilino.
 *
 * Base: /api/v1/products
 */
const router = Router();

router.use(authGuard);

router.get('/', productController.list);
router.post('/', productController.create);
router.get('/:id', productController.getOne);
router.patch('/:id', productController.update);
router.delete('/:id', productController.remove);

export default router;
