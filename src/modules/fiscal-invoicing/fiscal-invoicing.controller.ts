import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { enableFiscalInvoicingSchema } from './fiscal-invoicing.dto';
import { fiscalInvoicingService } from './fiscal-invoicing.service';

export const fiscalInvoicingController = {
  /** GET /api/v1/fiscal-invoicing/status */
  status: asyncHandler(async (req: Request, res: Response) => {
    const data = await fiscalInvoicingService.getStatus(req.restaurantId!);
    res.json({ data });
  }),

  /** GET /api/v1/fiscal-invoicing/orders/:orderId */
  orderInvoice: asyncHandler(async (req: Request, res: Response) => {
    const data = await fiscalInvoicingService.getInvoiceForOrder(req.restaurantId!, req.params.orderId);
    res.json({ data });
  }),

  /** PATCH /api/v1/master/restaurants/:id/fiscal-invoicing */
  enable: asyncHandler(async (req: Request, res: Response) => {
    const input = enableFiscalInvoicingSchema.parse(req.body);
    const data = await fiscalInvoicingService.enableForRestaurant(req.params.id, input);
    res.json({ data });
  }),
};
