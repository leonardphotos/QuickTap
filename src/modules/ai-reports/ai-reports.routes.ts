import { Router } from 'express';
import { tenantGuard, requireRole } from '../../middlewares/auth.middleware';
import { aiReportRequestSchema } from './ai-reports.dto';
import { aiReportsService } from './ai-reports.service';
import { prisma } from '../../config/prisma';

const router = Router();
router.use(tenantGuard, requireRole('OWNER', 'ADMIN'));
router.get('/status', async (req, res, next) => {
  try { res.json({ data: { enabled: Boolean((await prisma.restaurant.findUnique({ where: { id: req.restaurantId! }, select: { aiReportsEnabled: true } }))?.aiReportsEnabled) } }); }
  catch (error) { next(error); }
});
router.post('/export', async (req, res, next) => {
  try {
    const { book, filename } = await aiReportsService.build(req.restaurantId!, aiReportRequestSchema.parse(req.body));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await book.xlsx.write(res); res.end();
  } catch (error) { next(error); }
});
export default router;
