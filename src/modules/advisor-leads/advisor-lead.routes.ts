import { Router } from 'express';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { publicBookingRateLimit } from '../../middlewares/rate-limit.middleware';
import { advisorLeadController } from './advisor-lead.controller';

/** Base: /api/v1/public/advisor-leads — formulario abierto, sin sesión. */
export const publicAdvisorLeadRoutes = Router();
// Endpoint público sin captcha: el límite por IP es lo único que separa el formulario de
// convertirse en un buzón de basura si alguien lo encuentra.
publicAdvisorLeadRoutes.post('/', publicBookingRateLimit, advisorLeadController.create);

/** Base: /api/v1/master/advisor-leads — solo el equipo de QuickTap. */
export const masterAdvisorLeadRoutes = Router();
masterAdvisorLeadRoutes.use(platformAuthGuard);
masterAdvisorLeadRoutes.get('/', advisorLeadController.list);
masterAdvisorLeadRoutes.patch('/:id', advisorLeadController.update);
