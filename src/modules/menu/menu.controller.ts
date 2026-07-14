import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { menuService } from './menu.service';
import { tableSessionService } from '../table-sessions/table-session.service';
import { tableService } from '../tables/table.service';
import { setTableSessionPinSchema } from '../table-sessions/table-session.dto';

export const menuController = {
  /** GET /api/v1/public/menu/:slug — endpoint público del QR. */
  getPublicMenu: asyncHandler(async (req: Request, res: Response) => {
    const menu = await menuService.getPublicMenuBySlug(req.params.slug);
    // Cache corta en CDN/navegador: el menú cambia con poca frecuencia.
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ data: menu });
  }),

  /** GET /api/v1/public/table-session/:qrToken — ¿la mesa ya tiene una cuenta abierta? */
  getPublicTableSession: asyncHandler(async (req: Request, res: Response) => {
    const status = await tableSessionService.getPublicStatusByQrToken(req.params.qrToken);
    res.json({ data: status });
  }),

  /** POST /api/v1/public/table-session/:qrToken/call-waiter — "Llamar al mesonero". */
  callWaiter: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.requestService(req.params.qrToken, 'WAITER_CALL') });
  }),

  /** POST /api/v1/public/table-session/:qrToken/request-bill — "Pedir la cuenta". */
  requestBill: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableService.requestService(req.params.qrToken, 'BILL_REQUEST') });
  }),

  /** POST /api/v1/public/table-session/:qrToken/pin — protege la mesa con una clave de 4 dígitos. */
  setPin: asyncHandler(async (req: Request, res: Response) => {
    const input = setTableSessionPinSchema.parse(req.body);
    res.json({ data: await tableSessionService.setPinByQrToken(req.params.qrToken, input.pin) });
  }),

  /** POST /api/v1/public/table-session/:qrToken/skip-pin — deja la cuenta abierta, sin clave. */
  skipPin: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await tableSessionService.skipPinByQrToken(req.params.qrToken) });
  }),
};
