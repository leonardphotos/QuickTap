import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { menuService } from './menu.service';

export const menuController = {
  /** GET /api/v1/public/menu/:slug — endpoint público del QR. */
  getPublicMenu: asyncHandler(async (req: Request, res: Response) => {
    const menu = await menuService.getPublicMenuBySlug(req.params.slug);
    // Cache corta en CDN/navegador: el menú cambia con poca frecuencia.
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ data: menu });
  }),
};
