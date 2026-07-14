import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { updateRestaurantSchema } from './restaurant.dto';
import { restaurantService } from './restaurant.service';

export const restaurantController = {
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRestaurantSchema.parse(req.body);
    const restaurant = await restaurantService.update(req.restaurantId!, input);
    res.json({ data: restaurant });
  }),

  uploadLogo: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/logos/${req.file.filename}` } });
  }),

  uploadFullscreenImage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/fullscreen/${req.file.filename}` } });
  }),

  uploadCoverImage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/covers/${req.file.filename}` } });
  }),
};
