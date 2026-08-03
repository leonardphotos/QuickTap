import { Router } from 'express';
import { requireRole, tenantGuard } from '../../middlewares/auth.middleware';
import { ADMIN_CASHIER_ROLES } from '../../utils/roles';
import { modifierCategoryController } from './modifier-category.controller';

/** Base: /api/v1/modifier-categories — gestión de "Modificadores" desde Productos. */
const router = Router();
router.use(tenantGuard);
router.use(requireRole(...ADMIN_CASHIER_ROLES));

router.get('/', modifierCategoryController.list);
router.post('/', modifierCategoryController.create);
router.patch('/:id', modifierCategoryController.update);
router.delete('/:id', modifierCategoryController.remove);

router.post('/:id/modifiers', modifierCategoryController.createModifier);
router.patch('/:id/modifiers/reorder', modifierCategoryController.reorderModifiers);
router.patch('/modifiers/:modifierId', modifierCategoryController.updateModifier);
router.delete('/modifiers/:modifierId', modifierCategoryController.removeModifier);

router.put('/modifiers/:modifierId/variant-prices/:variantId', modifierCategoryController.setModifierVariantPrice);
router.delete('/modifiers/:modifierId/variant-prices/:variantId', modifierCategoryController.removeModifierVariantPrice);

router.get('/:id/products', modifierCategoryController.listLinkedProducts);
router.post('/:id/products', modifierCategoryController.associateProduct);
router.patch('/:id/products/:productId', modifierCategoryController.updateProductLink);
router.delete('/:id/products/:productId', modifierCategoryController.dissociateProduct);

export default router;
