import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { uploadCartaToMemory } from '../../middlewares/upload.middleware';
import { uploadPhotoToMemory } from '../../middlewares/upload.middleware';
import { masterCatalogAiController } from './master-catalog-ai.controller';
import { conContextoIA } from './master-catalog-ai.service';

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
// Cada petición corre dentro de su propio contexto, para que el consumo de Gemini que se
// registre quede atado al cliente al que se le estaba cargando (ver registrarConsumo).
router.use(conContextoIA);

router.get('/:restaurantId/categorias', masterCatalogAiController.categorias);
router.post('/:restaurantId/analizar', uploadPhotoToMemory, masterCatalogAiController.analizar);
// Carga masiva: leer la carta entera (foto del menú o Excel del cliente) y después armar
// las fichas técnicas de los platos que el operador dejó marcados.
router.post('/:restaurantId/leer-carta', uploadCartaToMemory, masterCatalogAiController.leerCarta);
router.post('/:restaurantId/fichas', masterCatalogAiController.fichas);
router.post('/:restaurantId/confirmar', masterCatalogAiController.confirmar);

// Carga por partes en un cliente que YA está montado: se le carga solo la pieza que le
// falta (insumos, recetas) sin pisar lo que ya tiene. `estado` dice cuál es esa pieza.
router.get('/:restaurantId/estado', masterCatalogAiController.estado);
router.post('/:restaurantId/leer-insumos', uploadCartaToMemory, masterCatalogAiController.leerInsumos);
router.post('/:restaurantId/confirmar-insumos', masterCatalogAiController.confirmarInsumos);
router.post('/:restaurantId/fichas-catalogo', masterCatalogAiController.fichasCatalogo);
router.post('/:restaurantId/leer-recetas', uploadCartaToMemory, masterCatalogAiController.leerRecetas);
router.post('/:restaurantId/confirmar-recetas', masterCatalogAiController.confirmarRecetas);
// Empaques: en qué envase sale cada plato. Es lo que hace que el sistema cobre y descuente el
// empaque solo al vender para llevar, en vez de que el restaurante lo regale en cada delivery.
router.post('/:restaurantId/empaques', masterCatalogAiController.empaques);
router.post('/:restaurantId/confirmar-empaques', masterCatalogAiController.confirmarEmpaques);

export default router;
