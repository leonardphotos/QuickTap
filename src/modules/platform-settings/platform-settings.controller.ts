import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import {
  updateMessageTemplatesSchema,
  updatePaymentMethodsSchema,
  updatePlanContentSchema,
  updateSubscriptionCurrencySchema,
} from './platform-settings.dto';
import { platformSettingsService } from './platform-settings.service';

export const platformSettingsController = {
  getPaymentMethods: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await platformSettingsService.getPaymentMethods() });
  }),
  updatePaymentMethods: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePaymentMethodsSchema.parse(req.body);
    res.json({ data: await platformSettingsService.updatePaymentMethods(input) });
  }),
  getPlanContent: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await platformSettingsService.getPlanContent() });
  }),
  updatePlanContent: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePlanContentSchema.parse(req.body);
    res.json({ data: await platformSettingsService.updatePlanContent(input) });
  }),
  /** Lectura pública a propósito: es tan sensible como el precio de un plan, que ya es
   * público — la necesitan tanto la landing como el billing autenticado del restaurante. */
  getSubscriptionCurrency: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: { currency: await platformSettingsService.getSubscriptionCurrency() } });
  }),
  updateSubscriptionCurrency: asyncHandler(async (req: Request, res: Response) => {
    const { currency } = updateSubscriptionCurrencySchema.parse(req.body);
    res.json({ data: { currency: await platformSettingsService.setSubscriptionCurrency(currency) } });
  }),
  getMessageTemplates: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await platformSettingsService.getMessageTemplates() });
  }),
  updateMessageTemplates: asyncHandler(async (req: Request, res: Response) => {
    const input = updateMessageTemplatesSchema.parse(req.body);
    res.json({ data: await platformSettingsService.updateMessageTemplates(input) });
  }),
};
