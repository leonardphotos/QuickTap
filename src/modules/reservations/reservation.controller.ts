import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { hasRoleOrCashierFullAccess } from '../../middlewares/auth.middleware';
import {
  createReservationSchema,
  createStaffReservationSchema,
  listReservationsQuerySchema,
  seatReservationSchema,
  updateReservationSchema,
} from './reservation.dto';
import { reservationService } from './reservation.service';

export const reservationController = {
  tableStatuses: asyncHandler(async (req: Request, res: Response) => {
    const statuses = await reservationService.getTableStatuses(req.params.slug);
    res.json({ data: statuses });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createReservationSchema.parse(req.body);
    const reservation = await reservationService.create(req.params.slug, input);
    res.status(201).json({ data: reservation });
  }),

  /**
   * Leerlas puede cualquiera del equipo, pero el mesero solo ve las ya aceptadas: decidir si se
   * acepta una reserva es de dueño/admin, y no tiene por qué ver la cola de pendientes.
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = listReservationsQuerySchema.parse(req.query);
    const fullAccess = await hasRoleOrCashierFullAccess(req, 'OWNER', 'ADMIN');
    const reservations = await reservationService.list(req.restaurantId!, {
      date: query.date,
      confirmedOnly: !fullAccess,
    });
    res.json({ data: reservations });
  }),

  createByStaff: asyncHandler(async (req: Request, res: Response) => {
    const input = createStaffReservationSchema.parse(req.body);
    res.status(201).json({ data: await reservationService.createByStaff(req.restaurantId!, input) });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateReservationSchema.parse(req.body);
    res.json({ data: await reservationService.update(req.restaurantId!, req.params.id, input) });
  }),

  seat: asyncHandler(async (req: Request, res: Response) => {
    const input = seatReservationSchema.parse(req.body);
    res.json({ data: await reservationService.seat(req.restaurantId!, req.params.id, input) });
  }),

  noShow: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await reservationService.noShow(req.restaurantId!, req.params.id) });
  }),

  accept: asyncHandler(async (req: Request, res: Response) => {
    const reservation = await reservationService.accept(req.restaurantId!, req.params.id);
    res.json({ data: reservation });
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const reservation = await reservationService.cancel(req.restaurantId!, req.params.id);
    res.json({ data: reservation });
  }),
};
