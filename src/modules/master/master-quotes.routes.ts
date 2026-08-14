import { Router } from 'express';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { platformAuthGuard } from '../../middlewares/platform-auth.middleware';
import { createPlatformQuoteSchema, listPlatformQuotesSchema } from './master-quotes.dto';
import { masterQuotesService } from './master-quotes.service';

/** Base: /api/v1/master/quotes — cotizaciones a futuros clientes (solo equipo QuickTap). */
const router = Router();
router.use(platformAuthGuard);

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { status } = listPlatformQuotesSchema.parse(req.query);
    res.json({ data: await masterQuotesService.list(status) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = createPlatformQuoteSchema.parse(req.body);
    res.status(201).json({ data: await masterQuotesService.create(input) });
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const input = createPlatformQuoteSchema.parse(req.body);
    res.json({ data: await masterQuotesService.update(req.params.id, input) });
  }),
);

router.post(
  '/:id/send',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterQuotesService.send(req.params.id) });
  }),
);

router.post(
  '/:id/approve',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterQuotesService.approve(req.params.id) });
  }),
);

router.post(
  '/:id/unapprove',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterQuotesService.unapprove(req.params.id) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterQuotesService.remove(req.params.id) });
  }),
);

export default router;
