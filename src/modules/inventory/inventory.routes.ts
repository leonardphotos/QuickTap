import { Router } from 'express';
import { requireFeature, requireInventoryAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { inventoryController } from './inventory.controller';
import { recipeController } from './recipe.controller';

/**
 * Base: /api/v1/inventory. Insumos "normales" = Pro/Premium/CUSTOM con el
 * adicional; Recetas (vincula insumos a productos) = solo Premium/CUSTOM con
 * el adicional de receta, ver hasFeature() en utils/subscription.ts.
 * Ver (GET) además requiere `requireInventoryAccess`: roles de acceso total
 * siempre pasan, Mesero/Cocina solo si tienen el permiso individual activado.
 */
const router = Router();
router.use(tenantGuard);

const mutate = requireRole(...FULL_ACCESS_ROLES);

// Insumos "normales": stock directo por insumo.
router.get('/', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryController.list);
router.post('/', requireFeature('inventoryBasic'), mutate, inventoryController.create);
router.patch('/:id', requireFeature('inventoryBasic'), mutate, inventoryController.update);
router.delete('/:id', requireFeature('inventoryBasic'), mutate, inventoryController.remove);

// Recetas: vincula productos del menú con insumos (descuenta stock al vender).
router.get('/recipes', requireFeature('inventoryRecipe'), requireInventoryAccess, recipeController.listOverview);
router.get(
  '/recipes/:productId',
  requireFeature('inventoryRecipe'),
  requireInventoryAccess,
  recipeController.getByProduct,
);
router.post('/recipes/:productId', requireFeature('inventoryRecipe'), mutate, recipeController.addIngredient);
router.patch('/recipes/ingredient/:id', requireFeature('inventoryRecipe'), mutate, recipeController.updateIngredient);
router.delete('/recipes/ingredient/:id', requireFeature('inventoryRecipe'), mutate, recipeController.removeIngredient);

export default router;
