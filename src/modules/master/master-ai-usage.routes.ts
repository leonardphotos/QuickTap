import { Router } from 'express';
import { z } from 'zod';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { asyncHandler } from '../../middlewares/error.middleware';
import { masterAiUsageService } from './master-ai-usage.service';

/**
 * Base: /api/v1/master/ai-usage — cuánto se está gastando en Gemini.
 *
 * Es la cuenta de luz de la PLATAFORMA, no un reporte de un inquilino: la carga de catálogo la
 * corre el equipo de QuickTap sobre el cliente que sea, y la factura la paga QuickTap. Por eso
 * va bajo platformAuthGuard y nunca bajo un guard de tenant.
 */
const router = Router();
router.use(platformAuthGuard);

const querySchema = z.object({ rango: z.enum(['hoy', 'semana', 'mes', 'trimestre']).optional().default('mes') });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rango } = querySchema.parse(req.query);
    res.json({ data: await masterAiUsageService.resumen(rango) });
  }),
);

export default router;
