import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { createTabOrderSchema, masterCodeSchema, reportTabPaymentSchema } from './club-tablet.dto';
import { clubTabletService } from './club-tablet.service';

export const clubTabletController = {
  session: asyncHandler(async (req: Request, res: Response) => {
    // La llave maestra viaja como query: abre la reserva aunque sea de otra
    // cancha o esté fuera de hora.
    const master = typeof req.query.master === 'string' ? req.query.master : undefined;
    res.json({
      data: await clubTabletService.getSession(req.restaurantId!, req.auth!.userId, req.params.accessToken, master),
    });
  }),
  masterCourts: asyncHandler(async (req: Request, res: Response) => {
    const input = masterCodeSchema.parse(req.body);
    res.json({ data: await clubTabletService.masterCourts(req.restaurantId!, input.code) });
  }),
  court: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTabletService.getOwnCourt(req.restaurantId!, req.auth!.userId) });
  }),
  catalog: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubTabletService.getCatalog(req.restaurantId!) });
  }),
  createOrder: asyncHandler(async (req: Request, res: Response) => {
    const input = createTabOrderSchema.parse(req.body);
    res.status(201).json({ data: await clubTabletService.createOrder(req.restaurantId!, req.auth!.userId, input) });
  }),
  reportPayment: asyncHandler(async (req: Request, res: Response) => {
    const input = reportTabPaymentSchema.parse(req.body);
    res.status(201).json({ data: await clubTabletService.reportPayment(req.restaurantId!, req.auth!.userId, input) });
  }),
};
