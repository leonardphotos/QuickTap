import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { updatePaymentMethodsSchema, updatePlanContentSchema } from './platform-settings.dto';
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
};
