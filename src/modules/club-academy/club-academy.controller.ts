import { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/error.middleware';
import { badRequest, notFound } from '../../utils/http-error';
import { prisma } from '../../config/prisma';
import { clubAcademyService } from './club-academy.service';
import { clubAcademyMoneyService } from './club-academy-money.service';
import {
  academySettingsSchema,
  adjustCreditsSchema,
  attendanceSchema,
  cancelSessionSchema,
  coachAvailabilitySchema,
  coachTimeOffSchema,
  createCoachSchema,
  createEnrollmentSchema,
  createGroupSchema,
  createSessionSchema,
  createStudentSchema,
  generateChargesSchema,
  generateSessionsSchema,
  listChargesQuerySchema,
  listSessionsQuerySchema,
  listStudentsQuerySchema,
  payoutSchema,
  publicPrivateRequestSchema,
  rangeQuerySchema,
  reassignSessionSchema,
  recordPaymentSchema,
  sellPackageSchema,
  updateCoachSchema,
  updateEnrollmentSchema,
  updateGroupSchema,
  updatePackageSchema,
  updateStudentSchema,
} from './club-academy.dto';

/**
 * Resuelve el profesor a partir del usuario del token. El portal del entrenador
 * NUNCA acepta un coachId por parámetro: si lo hiciera, un profesor podría pasar
 * lista en las clases de otro con solo cambiar un id en la URL.
 */
async function myCoachId(req: Request): Promise<string> {
  const coach = await prisma.clubCoach.findFirst({
    where: { restaurantId: req.restaurantId!, userId: req.auth!.userId },
    select: { id: true },
  });
  if (!coach) throw notFound('Tu usuario no está vinculado a ningún profesor de la academia.');
  return coach.id;
}

export const clubAcademyController = {
  // Ajustes
  getSettings: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.getSettings(req.restaurantId!) });
  }),
  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const input = academySettingsSchema.parse(req.body);
    res.json({ data: await clubAcademyService.updateSettings(req.restaurantId!, input) });
  }),

  // Dashboard
  dashboard: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.dashboard(req.restaurantId!) });
  }),

  // Entrenadores
  listCoaches: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.listCoaches(req.restaurantId!) });
  }),
  createCoach: asyncHandler(async (req: Request, res: Response) => {
    const input = createCoachSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyService.createCoach(req.restaurantId!, input) });
  }),
  updateCoach: asyncHandler(async (req: Request, res: Response) => {
    const input = updateCoachSchema.parse(req.body);
    res.json({ data: await clubAcademyService.updateCoach(req.restaurantId!, req.params.id, input) });
  }),
  deleteCoach: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.deactivateCoach(req.restaurantId!, req.params.id) });
  }),
  setAvailability: asyncHandler(async (req: Request, res: Response) => {
    const input = coachAvailabilitySchema.parse(req.body);
    res.json({ data: await clubAcademyService.setCoachAvailability(req.restaurantId!, req.params.id, input) });
  }),
  addTimeOff: asyncHandler(async (req: Request, res: Response) => {
    const input = coachTimeOffSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyService.addCoachTimeOff(req.restaurantId!, req.params.id, input) });
  }),
  removeTimeOff: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.removeCoachTimeOff(req.restaurantId!, req.params.id, req.params.timeOffId) });
  }),
  coachEarnings: asyncHandler(async (req: Request, res: Response) => {
    const q = rangeQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyMoneyService.coachEarnings(req.restaurantId!, req.params.id, q.from, q.to) });
  }),
  payCoach: asyncHandler(async (req: Request, res: Response) => {
    const input = payoutSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyMoneyService.payCoach(req.restaurantId!, req.params.id, input, req.auth?.userId) });
  }),

  // Grupos
  listGroups: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.listGroups(req.restaurantId!) });
  }),
  createGroup: asyncHandler(async (req: Request, res: Response) => {
    const input = createGroupSchema.parse(req.body);
    const group = await clubAcademyService.createGroup(req.restaurantId!, input);
    // Se generan las sesiones de una vez: un grupo sin clases en el calendario no
    // le sirve a nadie, y así el admin ve los conflictos en el mismo momento.
    const generation = await clubAcademyService.generateSessions(req.restaurantId!, group.id);
    res.status(201).json({ data: { group, generation } });
  }),
  updateGroup: asyncHandler(async (req: Request, res: Response) => {
    const input = updateGroupSchema.parse(req.body);
    res.json({ data: await clubAcademyService.updateGroup(req.restaurantId!, req.params.id, input) });
  }),
  generateSessions: asyncHandler(async (req: Request, res: Response) => {
    const { weeks } = generateSessionsSchema.parse(req.body);
    res.json({ data: await clubAcademyService.generateSessions(req.restaurantId!, req.params.id, weeks) });
  }),
  listConflicts: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.listConflicts(req.restaurantId!, req.query.groupId as string | undefined) });
  }),
  endGroup: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.updateGroup(req.restaurantId!, req.params.id, { status: 'ENDED' }) });
  }),

  // Sesiones
  listSessions: asyncHandler(async (req: Request, res: Response) => {
    const query = listSessionsQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyService.listSessions(req.restaurantId!, query) });
  }),
  createSession: asyncHandler(async (req: Request, res: Response) => {
    const input = createSessionSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyService.createSession(req.restaurantId!, input) });
  }),
  reassignSession: asyncHandler(async (req: Request, res: Response) => {
    const input = reassignSessionSchema.parse(req.body);
    res.json({ data: await clubAcademyService.reassignSession(req.restaurantId!, req.params.id, input) });
  }),
  cancelSession: asyncHandler(async (req: Request, res: Response) => {
    const input = cancelSessionSchema.parse(req.body);
    res.json({ data: await clubAcademyService.cancelSession(req.restaurantId!, req.params.id, input) });
  }),
  getRoster: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.getRoster(req.restaurantId!, req.params.id) });
  }),
  markAttendance: asyncHandler(async (req: Request, res: Response) => {
    const input = attendanceSchema.parse(req.body);
    res.json({ data: await clubAcademyService.markAttendance(req.restaurantId!, req.params.id, input, req.auth?.userId) });
  }),

  // Alumnos
  listStudents: asyncHandler(async (req: Request, res: Response) => {
    const query = listStudentsQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyService.listStudents(req.restaurantId!, query) });
  }),
  createStudent: asyncHandler(async (req: Request, res: Response) => {
    const input = createStudentSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyService.createStudent(req.restaurantId!, input) });
  }),
  updateStudent: asyncHandler(async (req: Request, res: Response) => {
    const input = updateStudentSchema.parse(req.body);
    res.json({ data: await clubAcademyService.updateStudent(req.restaurantId!, req.params.id, input) });
  }),
  getStudent: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyService.getStudent(req.restaurantId!, req.params.id) });
  }),
  creditLedger: asyncHandler(async (req: Request, res: Response) => {
    await clubAcademyMoneyService.sweepExpiredCredits(req.restaurantId!);
    const [balance, entries] = await Promise.all([
      clubAcademyMoneyService.creditBalance(req.restaurantId!, req.params.id),
      clubAcademyMoneyService.creditLedger(req.restaurantId!, req.params.id),
    ]);
    res.json({ data: { balance, entries } });
  }),
  adjustCredits: asyncHandler(async (req: Request, res: Response) => {
    const input = adjustCreditsSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyMoneyService.adjustCredits(req.restaurantId!, req.params.id, input) });
  }),

  // Inscripciones
  createEnrollment: asyncHandler(async (req: Request, res: Response) => {
    const input = createEnrollmentSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyService.createEnrollment(req.restaurantId!, input) });
  }),
  updateEnrollment: asyncHandler(async (req: Request, res: Response) => {
    const input = updateEnrollmentSchema.parse(req.body);
    res.json({ data: await clubAcademyService.updateEnrollment(req.restaurantId!, req.params.id, input) });
  }),

  // Lotes y dinero
  sellPackage: asyncHandler(async (req: Request, res: Response) => {
    const input = sellPackageSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyMoneyService.sellPackage(req.restaurantId!, input, req.auth?.userId) });
  }),
  updatePackage: asyncHandler(async (req: Request, res: Response) => {
    const input = updatePackageSchema.parse(req.body);
    res.json({ data: await clubAcademyMoneyService.updatePackage(req.restaurantId!, req.params.id, input) });
  }),
  listCharges: asyncHandler(async (req: Request, res: Response) => {
    await clubAcademyMoneyService.markOverdueCharges(req.restaurantId!);
    const query = listChargesQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyMoneyService.listCharges(req.restaurantId!, query) });
  }),
  generateCharges: asyncHandler(async (req: Request, res: Response) => {
    const input = generateChargesSchema.parse(req.body);
    res.json({ data: await clubAcademyMoneyService.generateMonthlyCharges(req.restaurantId!, input) });
  }),
  notifyCharges: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyMoneyService.notifyPendingCharges(req.restaurantId!) });
  }),
  waiveCharge: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await clubAcademyMoneyService.waiveCharge(req.restaurantId!, req.params.id) });
  }),
  recordPayment: asyncHandler(async (req: Request, res: Response) => {
    const input = recordPaymentSchema.parse(req.body);
    res.status(201).json({ data: await clubAcademyMoneyService.recordPayment(req.restaurantId!, input, req.auth?.userId) });
  }),

  // Reportes
  revenueReport: asyncHandler(async (req: Request, res: Response) => {
    const q = rangeQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyMoneyService.revenueReport(req.restaurantId!, q.from, q.to) });
  }),
  attendanceReport: asyncHandler(async (req: Request, res: Response) => {
    const q = rangeQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyMoneyService.attendanceReport(req.restaurantId!, q.from, q.to) });
  }),

  // ------------------------------------------------- Portal del entrenador
  mySessions: asyncHandler(async (req: Request, res: Response) => {
    const coachId = await myCoachId(req);
    const query = listSessionsQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyService.listSessions(req.restaurantId!, { ...query, coachId }) });
  }),
  myRoster: asyncHandler(async (req: Request, res: Response) => {
    const coachId = await myCoachId(req);
    const roster = await clubAcademyService.getRoster(req.restaurantId!, req.params.id);
    if (roster.session.coachId !== coachId) throw notFound('Esa clase no es tuya.');
    res.json({ data: roster });
  }),
  myAttendance: asyncHandler(async (req: Request, res: Response) => {
    const coachId = await myCoachId(req);
    const session = await prisma.clubClassSession.findFirst({
      where: { id: req.params.id, restaurantId: req.restaurantId!, coachId },
      select: { id: true },
    });
    if (!session) throw notFound('Esa clase no es tuya.');
    const input = attendanceSchema.parse(req.body);
    res.json({ data: await clubAcademyService.markAttendance(req.restaurantId!, req.params.id, input, req.auth?.userId) });
  }),
  myAvailability: asyncHandler(async (req: Request, res: Response) => {
    const coachId = await myCoachId(req);
    res.json({
      data: await prisma.clubCoachAvailability.findMany({
        where: { coachId },
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
      }),
    });
  }),
  setMyAvailability: asyncHandler(async (req: Request, res: Response) => {
    const coachId = await myCoachId(req);
    const input = coachAvailabilitySchema.parse(req.body);
    res.json({ data: await clubAcademyService.setCoachAvailability(req.restaurantId!, coachId, input) });
  }),
  myEarnings: asyncHandler(async (req: Request, res: Response) => {
    const coachId = await myCoachId(req);
    const q = rangeQuerySchema.parse(req.query);
    res.json({ data: await clubAcademyMoneyService.coachEarnings(req.restaurantId!, coachId, q.from, q.to) });
  }),

  // ------------------------------------------------------------- Público
  publicAcademy: asyncHandler(async (req: Request, res: Response) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, isActive: true, businessType: true },
    });
    if (!restaurant || !restaurant.isActive || restaurant.businessType !== 'SPORTS_CLUB') {
      throw notFound('Este club no existe o no está disponible.');
    }
    const groups = await prisma.clubClassGroup.findMany({
      where: { restaurantId: restaurant.id, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        levelMin: true,
        levelMax: true,
        capacityMax: true,
        priceMonthlyBase: true,
        pricePerClassBase: true,
        packagePriceBase: true,
        packageClasses: true,
        coach: { select: { displayName: true, photoUrl: true } },
        slots: { select: { weekday: true, startTime: true, durationMinutes: true } },
      },
    });
    res.json({ data: { club: { name: restaurant.name }, groups } });
  }),

  /** Ficha del alumno, resuelta por el token opaco — sin JWT, como el QR de reserva. */
  publicStudent: asyncHandler(async (req: Request, res: Response) => {
    const student = await prisma.clubStudent.findUnique({
      where: { accessToken: req.params.token },
      include: {
        customer: { select: { name: true, phone: true } },
        restaurant: { select: { name: true, slug: true, logoUrl: true, theme: true } },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { group: { select: { id: true, name: true, coach: { select: { displayName: true } } } } },
        },
      },
    });
    if (!student) throw notFound('Esta ficha no existe.');

    await clubAcademyMoneyService.sweepExpiredCredits(student.restaurantId);
    const [balance, upcoming] = await Promise.all([
      clubAcademyMoneyService.creditBalance(student.restaurantId, student.id),
      prisma.clubClassSession.findMany({
        where: {
          restaurantId: student.restaurantId,
          startsAt: { gt: new Date() },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
          groupId: { in: student.enrollments.map((e) => e.groupId) },
        },
        orderBy: { startsAt: 'asc' },
        take: 20,
        include: { court: { select: { name: true } }, coach: { select: { displayName: true } }, group: { select: { name: true } } },
      }),
    ]);

    res.json({ data: { student, creditBalance: balance, upcoming } });
  }),

  /**
   * El alumno cancela una clase. Dentro del plazo gana ficha; fuera de plazo la
   * pierde — es lo que hace que el plazo signifique algo.
   */
  publicCancel: asyncHandler(async (req: Request, res: Response) => {
    const student = await prisma.clubStudent.findUnique({ where: { accessToken: req.params.token } });
    if (!student) throw notFound('Esta ficha no existe.');

    const session = await prisma.clubClassSession.findFirst({
      where: { id: req.params.sessionId, restaurantId: student.restaurantId },
    });
    if (!session) throw notFound('Esa clase no existe.');
    if (session.startsAt <= new Date()) throw badRequest('Esa clase ya pasó.');

    const settings = await clubAcademyService.getSettingsRaw(student.restaurantId);
    const hoursToStart = (session.startsAt.getTime() - Date.now()) / 3_600_000;
    const inTime = hoursToStart >= settings.cancelDeadlineHours;

    await prisma.$transaction(async (tx) => {
      await tx.clubAttendance.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
        create: {
          sessionId: session.id,
          studentId: student.id,
          status: inTime ? 'JUSTIFIED' : 'ABSENT',
        },
        update: { status: inTime ? 'JUSTIFIED' : 'ABSENT' },
      });
      if (inTime) {
        await tx.clubClassCreditEntry.create({
          data: {
            restaurantId: student.restaurantId,
            studentId: student.id,
            delta: 1,
            reason: 'CANCELLATION_TOKEN',
            sessionId: session.id,
            note: 'Cancelada por el alumno dentro del plazo',
          },
        });
      }
    });

    res.json({
      data: {
        cancelled: true,
        creditGranted: inTime,
        message: inTime
          ? 'Clase cancelada. Te acreditamos una ficha para recuperarla.'
          : `Cancelaste con menos de ${settings.cancelDeadlineHours}h de antelación, así que la clase se consume.`,
      },
    });
  }),

  /**
   * El alumno se agenda una clase particular pagando por adelantado.
   *
   * La cancha se bloquea YA, pero con `holdExpiresAt`: entre que reserva y que
   * el club verifica el pago pasan horas, y sin bloquear se vendería la misma
   * pista dos veces. El barrido de expirePrivateHolds la suelta si nadie
   * confirma a tiempo, para que no se pueda secuestrar el horario sin pagar.
   */
  publicPrivateRequest: asyncHandler(async (req: Request, res: Response) => {
    const student = await prisma.clubStudent.findUnique({
      where: { accessToken: req.params.token },
      include: { customer: { select: { name: true } } },
    });
    if (!student) throw notFound('Esta ficha no existe.');

    const input = publicPrivateRequestSchema.parse(req.body);
    const settings = await clubAcademyService.getSettingsRaw(student.restaurantId);

    const session = await clubAcademyService.createPrivateRequest(student.restaurantId, {
      ...input,
      studentId: student.id,
      studentName: student.customer.name,
      holdMinutes: settings.privateHoldMinutes,
    });

    res.status(201).json({
      data: {
        session,
        message: `Tu cancha queda apartada ${settings.privateHoldMinutes} minutos. En cuanto el club verifique el pago te la confirmamos.`,
      },
    });
  }),

  /** El alumno se apunta a recuperar, gastando una ficha. */
  publicMakeup: asyncHandler(async (req: Request, res: Response) => {
    const student = await prisma.clubStudent.findUnique({ where: { accessToken: req.params.token } });
    if (!student) throw notFound('Esta ficha no existe.');

    const balance = await clubAcademyMoneyService.creditBalance(student.restaurantId, student.id);
    if (balance <= 0) throw badRequest('No tienes fichas disponibles para recuperar.');

    const session = await prisma.clubClassSession.findFirst({
      where: { id: req.params.sessionId, restaurantId: student.restaurantId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    });
    if (!session) throw notFound('Esa clase no existe o no admite recuperaciones.');
    if (session.startsAt <= new Date()) throw badRequest('Esa clase ya pasó.');

    const seats = await clubAcademyService.occupiedSeats(session);
    if (seats >= session.capacityMax) throw badRequest('Esa clase está llena.');

    await prisma.clubAttendance.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
      create: { sessionId: session.id, studentId: student.id, status: 'MAKEUP' },
      update: { status: 'MAKEUP' },
    });

    res.json({ data: { ok: true } });
  }),
};
