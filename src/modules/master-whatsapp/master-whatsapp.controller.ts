import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { prisma } from '../../config/prisma';
import { formatVenezuelanWhatsappPhone } from '../../utils/whatsapp';
import { sendMasterWhatsappMessageSchema, updateMasterWhatsappSettingsSchema } from './master-whatsapp.dto';
import { masterWhatsappBotService } from './master-whatsapp-bot.service';

const SINGLETON_ID = 'singleton';

export const masterWhatsappController = {
  getStatus: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { masterWhatsappEnabled: true, subscriptionVerifierPhone: true },
    });
    res.json({
      data: {
        ...masterWhatsappBotService.getStatus(),
        masterWhatsappEnabled: settings?.masterWhatsappEnabled ?? false,
        subscriptionVerifierPhone: settings?.subscriptionVerifierPhone ?? null,
      },
    });
  }),

  connect: asyncHandler(async (_req: Request, res: Response) => {
    await masterWhatsappBotService.setEnabled(true);
    masterWhatsappBotService.connect().catch(() => undefined);
    res.status(202).json({ data: { started: true } });
  }),

  disconnect: asyncHandler(async (_req: Request, res: Response) => {
    await masterWhatsappBotService.disconnect();
    res.json({ data: { disconnected: true } });
  }),

  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const input = updateMasterWhatsappSettingsSchema.parse(req.body);
    if (input.subscriptionVerifierPhone !== undefined) {
      await masterWhatsappBotService.updateVerifierPhone(
        input.subscriptionVerifierPhone ? formatVenezuelanWhatsappPhone(input.subscriptionVerifierPhone).replace(/\D/g, '') : null,
      );
    }
    const settings = await prisma.platformSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { subscriptionVerifierPhone: true },
    });
    res.json({ data: { subscriptionVerifierPhone: settings?.subscriptionVerifierPhone ?? null } });
  }),

  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    const input = sendMasterWhatsappMessageSchema.parse(req.body);
    const phoneDigits = formatVenezuelanWhatsappPhone(input.phone).replace(/\D/g, '');
    const sent = await masterWhatsappBotService.sendMessage(phoneDigits, input.message);
    res.json({ data: { sent } });
  }),
};
