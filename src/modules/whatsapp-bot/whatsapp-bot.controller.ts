import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { sendWhatsappMessageSchema, updateWhatsappBotSettingsSchema } from './whatsapp-bot.dto';
import { whatsappBotService } from './whatsapp-bot.service';
import { prisma } from '../../config/prisma';

export const whatsappBotController = {
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.restaurantId! },
      select: {
        whatsappBotEnabled: true,
        whatsappBotNotifyReceived: true,
        whatsappBotNotifyReady: true,
        whatsappBotWelcomeEnabled: true,
        whatsappBotWelcomeMessage: true,
      },
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

  /** Botones "Enviar por WhatsApp" del panel (comanda, cotización, recordatorio, recibo...):
   * lo manda la sesión vinculada de este restaurante. Si no está conectada, `sent: false` y el
   * frontend cae al enlace wa.me de siempre para que el staff lo mande a mano. */
  send: asyncHandler(async (req: Request, res: Response) => {
    const input = sendWhatsappMessageSchema.parse(req.body);
    const sent = await whatsappBotService.sendMessage(req.restaurantId!, input.phone, input.message);
    res.json({ data: { sent } });
  }),
};
