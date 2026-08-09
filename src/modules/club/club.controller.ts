import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest } from '../../utils/http-error';
import {
  availabilityQuerySchema,
  calendarQuerySchema,
  createBookingSchema,
  createCourtSchema,
  createMaintenanceSchema,
  createScheduleSchema,
  listBookingsQuerySchema,
  recordBookingPaymentSchema,
  setBookingAwaitingPaymentSchema,
  updateCourtSchema,
  updateScheduleSchema,
} from './club.dto';
import { clubService } from './club.service';

export const clubController = {
  // Canchas
  listCourts: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.listCourts(req.restaurantId!) });
  }),
  createCourt: asyncHandler(async (req: Request, res: Response) => {
    const input = createCourtSchema.parse(req.body);
    res.status(201).json({ data: await clubService.createCourt(req.restaurantId!, input) });
  }),
  updateCourt: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCourtSchema.parse(req.body);
    res.json({ data: await clubService.updateCourt(req.restaurantId!, req.params.id, input) });
  }),
  deleteCourt: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.deleteCourt(req.restaurantId!, req.params.id) });
  }),

  // Horarios
  listSchedules: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.listSchedules(req.restaurantId!) });
  }),
  createSchedule: asyncHandler(async (req: Request, res: Response) => {
    const input = createScheduleSchema.parse(req.body);
    res.status(201).json({ data: await clubService.createSchedule(req.restaurantId!, input) });
  }),
  updateSchedule: asyncHandler(async (req: Request, res: Response) => {
    const input = updateScheduleSchema.parse(req.body);
    res.json({ data: await clubService.updateSchedule(req.restaurantId!, req.params.id, input) });
  }),
  deleteSchedule: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.deleteSchedule(req.restaurantId!, req.params.id) });
  }),

  // Calendario y disponibilidad
  calendar: asyncHandler(async (req: Request, res: Response) => {
    const { date } = calendarQuerySchema.parse(req.query);
    res.json({ data: await clubService.getCalendar(req.restaurantId!, date) });
  }),
  panelCourts: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.getPanelCourts(req.restaurantId!) });
  }),
  availability: asyncHandler(async (req: Request, res: Response) => {
    const { date, courtId } = availabilityQuerySchema.parse(req.query);
    res.json({ data: await clubService.getAvailability(req.restaurantId!, date, courtId) });
  }),

  // Reservas
  listBookings: asyncHandler(async (req: Request, res: Response) => {
    const query = listBookingsQuerySchema.parse(req.query);
    res.json({ data: await clubService.listBookings(req.restaurantId!, query) });
  }),
  createBooking: asyncHandler(async (req: Request, res: Response) => {
    const input = createBookingSchema.parse(req.body);
    res.status(201).json({ data: await clubService.createBooking(req.restaurantId!, input) });
  }),
  cancelBooking: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.cancelBooking(req.restaurantId!, req.params.id) });
  }),
  checkIn: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.checkIn(req.restaurantId!, req.params.accessToken) });
  }),

  // Caja (Pagar / Pago fraccionado / Deuda)
  addBookingPayment: asyncHandler(async (req: Request, res: Response) => {
    const input = recordBookingPaymentSchema.parse(req.body);
    res.status(201).json({ data: await clubService.addBookingPayment(req.restaurantId!, req.params.id, input) });
  }),
  setBookingAwaitingPayment: asyncHandler(async (req: Request, res: Response) => {
    const input = setBookingAwaitingPaymentSchema.parse(req.body);
    res.json({ data: await clubService.setBookingAwaitingPayment(req.restaurantId!, req.params.id, input.awaitingPayment) });
  }),
  uploadPaymentProof: asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('No se recibió ningún archivo.');
    res.status(201).json({ data: { url: `/uploads/club-payment-proofs/${req.file.filename}` } });
  }),

  // Mantenimiento
  createMaintenance: asyncHandler(async (req: Request, res: Response) => {
    const input = createMaintenanceSchema.parse(req.body);
    res.status(201).json({ data: await clubService.createMaintenance(req.restaurantId!, input) });
  }),
  removeBlock: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.removeBlock(req.restaurantId!, req.params.id) });
  }),

  // Públicas (sin auth, resueltas por slug / token opaco)
  publicClub: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.getPublicClub(req.params.slug) });
  }),
  publicLive: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.getLiveStatus(req.params.slug) });
  }),
  publicAvailability: asyncHandler(async (req: Request, res: Response) => {
    const { date, courtId } = availabilityQuerySchema.parse(req.query);
    res.json({ data: await clubService.getPublicAvailability(req.params.slug, date, courtId) });
  }),
  publicCreateBooking: asyncHandler(async (req: Request, res: Response) => {
    const input = createBookingSchema.parse(req.body);
    res.status(201).json({ data: await clubService.createPublicBooking(req.params.slug, input) });
  }),
  publicBookingByToken: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubService.getByAccessToken(req.params.accessToken) });
  }),
};
