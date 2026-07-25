import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { connectOlaclickSchema, confirmOlaclickImportSchema } from './master-olaclick-import.dto';
import { masterOlaclickImportService } from './master-olaclick-import.service';

export const masterOlaclickImportController = {
  connect: asyncHandler(async (req: Request, res: Response) => {
    const { apiKey } = connectOlaclickSchema.parse(req.body);
    res.json({ data: await masterOlaclickImportService.connect(req.params.restaurantId, apiKey) });
  }),

  preview: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterOlaclickImportService.preview(req.params.restaurantId) });
  }),

  confirm: asyncHandler(async (req: Request, res: Response) => {
    const { excludedProductExternalIds } = confirmOlaclickImportSchema.parse(req.body);
    res.json({
      data: await masterOlaclickImportService.confirm(req.params.restaurantId, excludedProductExternalIds),
    });
  }),

  status: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await masterOlaclickImportService.status(req.params.restaurantId) });
  }),
};
