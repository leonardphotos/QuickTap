import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { aiPhotoService } from './ai-photo.service';

export const aiPhotoController = {
  enhance: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: await aiPhotoService.enhance(req.file) } });
  }),
  whiteBackground: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: await aiPhotoService.whiteBackground(req.file) } });
  }),
};
