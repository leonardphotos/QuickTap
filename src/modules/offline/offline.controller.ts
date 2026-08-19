import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/error.middleware';
import { offlineService } from './offline.service';

const decimalString = z.string();

const syncOrderSchema = z.object({
  id: z.string().min(1),
  offlineTicketRef: z.string().min(1).max(40),
  status: z.enum(['KITCHEN', 'SERVED']),
  tableId: z.string().min(1).nullable(),
  tableSessionId: z.string().min(1).nullable(),
  currency: z.enum(['USD', 'EUR']),
  subtotalBase: decimalString,
  serviceChargeBase: decimalString,
  ivaBase: decimalString,
  totalBase: decimalString,
  exchangeRate: decimalString,
  totalBs: decimalString,
  tipBase: decimalString,
  customerName: z.string().nullable(),
  customerIdNumber: z.string().nullable(),
  customerPhone: z.string().nullable(),
  placedByUserId: z.string().nullable(),
  createdAt: z.string(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        productId: z.string().min(1).nullable(),
        productName: z.string(),
        variantName: z.string().nullable(),
        unitPrice: decimalString,
        quantity: z.number().int().positive(),
        lineTotal: decimalString,
        note: z.string().nullable(),
        kitchenName: z.string().nullable(),
        modifiers: z.array(
          z.object({
            id: z.string().min(1),
            modifierId: z.string().min(1).nullable(),
            name: z.string(),
            priceBase: decimalString,
            quantity: z.number().int().positive(),
          }),
        ),
      }),
    )
    .min(1),
});

const syncSessionSchema = z.object({
  id: z.string().min(1),
  tableId: z.string().min(1),
  customerName: z.string(),
  customerIdNumber: z.string(),
  customerPhone: z.string().nullable(),
  label: z.string().nullable(),
  status: z.enum(['OPEN', 'CLOSED']),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
});

/** Tope por tanda: un corte largo se sube en varias, no en una petición gigante. */
const syncSchema = z.object({
  sessions: z.array(syncSessionSchema).max(200),
  orders: z.array(syncOrderSchema).max(200),
});

export const offlineController = {
  catalogSnapshot: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await offlineService.catalogSnapshot(req.restaurantId!) });
  }),

  syncOrders: asyncHandler(async (req: Request, res: Response) => {
    const input = syncSchema.parse(req.body);
    res.json({ data: await offlineService.syncOrders(req.restaurantId!, input) });
  }),
};
