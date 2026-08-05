import { Router } from 'express';
import { requireFeature, requireInventoryAccess, tenantGuard } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/auth.middleware';
import { FULL_ACCESS_ROLES } from '../../utils/roles';
import { uploadInventoryPhoto, uploadSpreadsheet, optimizeImage } from '../../middlewares/upload.middleware';
import { inventoryController } from './inventory.controller';
import { inventoryCategoryController } from './inventory-category.controller';
import { inventoryTransferController } from './inventory-transfer.controller';
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

// Categorías de insumos / stock de productos.
router.get('/categories', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryCategoryController.list);
router.post('/categories', requireFeature('inventoryBasic'), mutate, inventoryCategoryController.create);
router.patch('/categories/:id', requireFeature('inventoryBasic'), mutate, inventoryCategoryController.update);
router.delete('/categories/:id', requireFeature('inventoryBasic'), mutate, inventoryCategoryController.remove);

router.post(
  '/upload-photo',
  requireFeature('inventoryBasic'),
  mutate,
  uploadInventoryPhoto,
  optimizeImage(700, 700),
  inventoryController.uploadPhoto,
);

// Insumos marcados como envase (para el picker de "Vincular con stock" en Productos).
router.get('/packaging', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryController.listPackaging);

// Insumos "normales": stock directo por insumo.
router.get('/', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryController.list);
router.post('/', requireFeature('inventoryBasic'), mutate, inventoryController.create);
router.patch('/:id', requireFeature('inventoryBasic'), mutate, inventoryController.update);
router.delete('/:id', requireFeature('inventoryBasic'), mutate, inventoryController.remove);
router.post('/print-list', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryController.printList);

// Carga masiva de insumos por Excel: plantilla descargable + subida que crea/actualiza por nombre.
router.get('/import-template', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryController.downloadImportTemplate);
router.post('/import', requireFeature('inventoryBasic'), mutate, uploadSpreadsheet, inventoryController.importExcel);

// Transferencia de insumos entre sedes del mismo grupo (o hacia/desde Casa Matriz).
router.get('/transfer-locations', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryTransferController.listLocations);
router.get(
  '/transfer-locations/items',
  requireFeature('inventoryBasic'),
  requireInventoryAccess,
  inventoryTransferController.listItemsForLocation,
);
router.get('/transfers', requireFeature('inventoryBasic'), requireInventoryAccess, inventoryTransferController.list);
router.post('/transfers', requireFeature('inventoryBasic'), mutate, inventoryTransferController.create);

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

// Carga de la receta de un producto por Excel (insumo, cantidad) — un producto a la vez.
router.get(
  '/recipes/:productId/import-template',
  requireFeature('inventoryRecipe'),
  requireInventoryAccess,
  recipeController.downloadImportTemplate,
);
router.post(
  '/recipes/:productId/import',
  requireFeature('inventoryRecipe'),
  mutate,
  uploadSpreadsheet,
  recipeController.importExcel,
);

export default router;
