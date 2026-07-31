import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { updateWhatsappBotSettingsSchema } from './whatsapp-bot.dto';
import { whatsappBotService } from './whatsapp-bot.service';
import { prisma } from '../../config/prisma';

export const whatsappBotController = {
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.restaurantId! },
      select: { whatsappBotEnabled: true, whatsappBotNotifyReceived: true, whatsappBotNotifyReady: true },
    });
    res.json({ data: { ...whatsappBotService.getStatus(req.restaurantId!), ...restaurant } });
  }),

  connect: asyncHandler(async (req: Request, res: Response) => {
    await prisma.restaurant.update({ where: { id: req.restaurantId! }, data: { whatsappBotEnabled: true } });
    whatsappBotService.connect(req.restaurantId!).catch(() => undefined);
    res.status(202).json({ data: { started: true } });
  }),

  disconnect: asyncHandler(async (req: Request, res: Response) => {
    await prisma.restaurant.update({ where: { id: req.restaurantId! }, data: { whatsappBotEnabled: false } });
    await whatsappBotService.disconnect(req.restaurantId!);
    res.json({ data: { disconnected: true } });
  }),

  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const input = updateWhatsappBotSettingsSchema.parse(req.body);
    const data = await whatsappBotService.updateSettings(req.restaurantId!, input);
    res.json({ data });
  }),
};
