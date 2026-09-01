import { Router } from 'express';
import { requireRoleOrCashierFullAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { modifierCategoryController } from './modifier-category.controller';

/** Base: /api/v1/modifier-categories — gestión de "Modificadores" desde Productos. */
const router = Router();
router.use(tenantGuard);
router.use(requireRoleOrCashierFullAccess('OWNER', 'ADMIN'));

router.get('/', modifierCategoryController.list);
router.post('/', modifierCategoryController.create);
router.patch('/:id', modifierCategoryController.update);
router.delete('/:id', modifierCategoryController.remove);
// "Duplicar lista": copia la categoría con todos sus modificadores y asociaciones.
router.post('/:id/duplicate', modifierCategoryController.duplicate);

router.post('/:id/modifiers', modifierCategoryController.createModifier);
router.patch('/:id/modifiers/reorder', modifierCategoryController.reorderModifiers);
router.patch('/modifiers/:modifierId', modifierCategoryController.updateModifier);
router.delete('/modifiers/:modifierId', modifierCategoryController.removeModifier);

router.put('/modifiers/:modifierId/variant-prices/:variantId', modifierCategoryController.setModifierVariantPrice);
router.delete('/modifiers/:modifierId/variant-prices/:variantId', modifierCategoryController.removeModifierVariantPrice);
// En qué variantes DE UN PRODUCTO puntual aparece este modificador (no el grupo entero, ver
// PATCH /:id/products/:productId de abajo para eso).
router.patch('/modifiers/:modifierId/products/:productId/variant-visibility', modifierCategoryController.setModifierVariantVisibility);

router.get('/:id/products', modifierCategoryController.listLinkedProducts);
router.post('/:id/products', modifierCategoryController.associateProduct);
router.patch('/:id/products/:productId', modifierCategoryController.updateProductLink);
router.delete('/:id/products/:productId', modifierCategoryController.dissociateProduct);

export default router;
