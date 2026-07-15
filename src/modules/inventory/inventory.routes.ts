import { Router } from 'express';
import { requirePremiumPlan, tenantGuard } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { inventoryController } from './inventory.controller';
import { recipeController } from './recipe.controller';

/** Base: /api/v1/inventory — solo plan Premium. */
const router = Router();
router.use(tenantGuard);
router.use(requirePremiumPlan);

const mutate = requireRole(...FULL_ACCESS_ROLES);

// Insumos "normales": stock directo por insumo.
router.get('/', inventoryController.list);
router.post('/', mutate, inventoryController.create);
router.patch('/:id', mutate, inventoryController.update);
router.delete('/:id', mutate, inventoryController.remove);

// Recetas: vincula productos del menú con insumos (descuenta stock al vender).
router.get('/recipes', recipeController.listOverview);
router.get('/recipes/:productId', recipeController.getByProduct);
router.post('/recipes/:productId', mutate, recipeController.addIngredient);
router.patch('/recipes/ingredient/:id', mutate, recipeController.updateIngredient);
router.delete('/recipes/ingredient/:id', mutate, recipeController.removeIngredient);

export default router;
