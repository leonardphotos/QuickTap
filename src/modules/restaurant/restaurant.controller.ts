import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import { demoAdminUnlockSchema, setDeleteOrderPinSchema, updateRestaurantSchema, updateScheduleSchema } from './restaurant.dto';
import { restaurantService } from './restaurant.service';

export const restaurantController = {
  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateRestaurantSchema.parse(req.body);
    const restaurant = await restaurantService.update(req.restaurantId!, input);
    res.json({ data: restaurant });
  }),

  getSchedule: asyncHandler(async (req: Request, res: Response) => {
    const schedule = await restaurantService.getSchedule(req.restaurantId!);
    res.json({ data: schedule });
  }),

  updateSchedule: asyncHandler(async (req: Request, res: Response) => {
    const input = updateScheduleSchema.parse(req.body);
    const schedule = await restaurantService.updateSchedule(req.restaurantId!, input);
    res.json({ data: schedule });
  }),

  markWelcomeSeen: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await restaurantService.markWelcomeSeen(req.restaurantId!) });
  }),

  setDeleteOrderPin: asyncHandler(async (req: Request, res: Response) => {
    const { pin } = setDeleteOrderPinSchema.parse(req.body);
    res.json({ data: await restaurantService.setDeleteOrderPin(req.restaurantId!, pin) });
  }),

  demoAdminUnlock: asyncHandler(async (req: Request, res: Response) => {
    const { pin } = demoAdminUnlockSchema.parse(req.body);
    res.json({ data: await restaurantService.unlockDemoAdmin(req.restaurantId!, pin) });
  }),

  uploadLogo: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/logos/${req.file.filename}` } });
  }),

  uploadPaymentQr: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/payment-qr/${req.file.filename}` } });
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
