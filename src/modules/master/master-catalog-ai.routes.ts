import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { uploadPhotoToMemory } from '../../middlewares/upload.middleware';
import { masterCatalogAiController } from './master-catalog-ai.controller';

/**
 * Base: /api/v1/master/catalog-ai
 *
 * Herramienta INTERNA del equipo QuickTap: montar el catálogo de un cliente nuevo a partir de
 * fotos, con la IA proponiendo receta e insumos. Protegida por platformAuthGuard — nunca
 * montar esto bajo /api/v1 a secas ni bajo un guard de tenant, porque escribe en el catálogo
 * de CUALQUIER restaurante según el :restaurantId de la URL.
 *
 * No la limita el interruptor de "IA de fotos" de Ajustes: ese apaga los botones de los
 * restaurantes, y esto es la herramienta de onboarding del propio equipo.
 */
const router = Router();
router.use(platformAuthGuard);

router.get('/:restaurantId/categorias', masterCatalogAiController.categorias);
router.post('/:restaurantId/analizar', uploadPhotoToMemory, masterCatalogAiController.analizar);
router.post('/:restaurantId/confirmar', masterCatalogAiController.confirmar);

export default router;
