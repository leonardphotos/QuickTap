import { nanoid } from 'nanoid';
import { Prisma, ClubClassSessionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../../utils/http-error';
import { clubPlayerService } from '../club-players/club-player.service';
import { atTimeCaracas, caracasPartsOf } from '../../utils/timezone';
import { round2, toDecimal } from '../../utils/money';
import { emitToKitchen, SocketEvents } from '../../sockets';
import { customerService } from '../customers/customer.service';
import { academyNotifier } from './club-academy.notify';
import type {
  AcademySettingsInput,
  AttendanceInput,
  CancelSessionInput,
  CoachAvailabilityInput,
  CoachTimeOffInput,
  CreateCoachInput,
  CreateEnrollmentInput,
  CreateGroupInput,
  CreateSessionInput,
  CreateStudentInput,
  ListSessionsQuery,
  ListStudentsQuery,
  ReassignSessionInput,
  UpdateCoachInput,
  UpdateEnrollmentInput,
  UpdateGroupInput,
  UpdateStudentInput,
} from './club-academy.dto';

/**
 * Horizonte de generación de sesiones recurrentes.
 *
 * Corto a propósito: generar seis meses al crear el grupo congelaría la parrilla
 * entera — el club no podría vender alquiler libre a tres meses porque la
 * academia ya se comió la rejilla, para grupos que quizá ni se llenen. Se
 * extiende solo, al cargar el panel, igual que settlePastBookings.
 */
export const ACADEMY_HORIZON_WEEKS = 8;

/** Misma restricción que protege las reservas de cancha (ver club.service.ts). */
const OVERLAP_CONSTRAINT = 'club_court_blocks_no_overlap';
function isOverlapError(err: unknown): boolean {
  return err instanceof Error && err.message.includes(OVERLAP_CONSTRAINT);
}

const DEFAULT_SETTINGS = {
  defaultReleaseHoursBefore: 12,
  cancelDeadlineHours: 24,
  maxMakeupPerMonth: 2,
  creditExpiryDays: 90 as number | null,
  enrollmentOpensDaysBefore: 30,
  privateHoldMinutes: 30,
  enforceLevelOnEnroll: true,
  notifyCoachOnEnroll: true,
};

async function getSettings(restaurantId: string) {
  const row = await prisma.clubAcademySettings.findUnique({ where: { restaurantId } });
  return row ?? { ...DEFAULT_SETTINGS, restaurantId, id: '' };
}

async function assertCoach(restaurantId: string, coachId: string) {
  const coach = await prisma.clubCoach.findFirst({ where: { id: coachId, restaurantId } });
  if (!coach) throw notFound('El profesor no existe o no pertenece a este club.');
  return coach;
}

async function assertStudent(restaurantId: string, studentId: string) {
  const student = await prisma.clubStudent.findFirst({
    where: { id: studentId, restaurantId },
    include: { customer: true },
  });
  if (!student) throw notFound('El alumno no existe o no pertenece a este club.');
  return student;
}

/**
 * Cuántas plazas de una sesión están tomadas.
 *
 * UNA sola función para los tres consumidores (cupo máximo al inscribir, regla
 * de liberación, y el "quedan 2 puestos" del portal público). Calcularlo por
 * separado en cada sitio garantizaría que se desincronicen.
 *
 * Cuenta hacia adelante, no solo asistencias pasadas: un lote con `holdsSeat`
 * reserva la silla del alumno en esa franja durante meses, así que una sesión de
 * octubre ya tiene puestos ocupados aunque nadie haya asistido todavía. Sin esto
 * recepción vendría el mismo puesto dos veces.
 */
async function occupiedSeats(session: {
  id: string;
  groupId: string | null;
  startsAt: Date;
  restaurantId: string;
}): Promise<number> {
  const holders = new Set<string>();

  if (session.groupId) {
    const [enrollments, packages] = await Promise.all([
      prisma.clubEnrollment.findMany({
        where: {
          groupId: session.groupId,
          status: 'ACTIVE',
          startsAt: { lte: session.startsAt },
          OR: [{ endsAt: null }, { endsAt: { gte: session.startsAt } }],
        },
        select: { studentId: true },
      }),
      prisma.clubClassPackage.findMany({
        where: {
          groupId: session.groupId,
          holdsSeat: true,
          purchasedAt: { lte: session.startsAt },
          OR: [{ expiresAt: null }, { expiresAt: { gte: session.startsAt } }],
        },
        select: { studentId: true },
      }),
    ]);
    enrollments.forEach((e) => holders.add(e.studentId));
    packages.forEach((p) => holders.add(p.studentId));
  }

  // Asistencias ya registradas (incluye recuperaciones de alumnos de otro grupo).
  const marked = await prisma.clubAttendance.findMany({
    where: { sessionId: session.id, status: { not: 'ABSENT' } },
    select: { studentId: true },
  });
  marked.forEach((a) => holders.add(a.studentId));

  return holders.size;
}

export const clubAcademyService = {
  // ------------------------------------------------------------------ Ajustes
  async getSettings(restaurantId: string) {
    return getSettings(restaurantId);
  },

  async updateSettings(restaurantId: string, input: AcademySettingsInput) {
    return prisma.clubAcademySettings.upsert({
      where: { restaurantId },
      create: { restaurantId, ...input },
      update: input,
    });
  },

  // ------------------------------------------------------------- Entrenadores
  async listCoaches(restaurantId: string) {
    return prisma.clubCoach.findMany({
      where: { restaurantId },
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { displayName: 'asc' }],
      include: { availability: true, timeOff: { where: { endsAt: { gte: new Date() } } } },
    });
  },

  async createCoach(restaurantId: string, input: CreateCoachInput) {
    if (input.userId) {
      const user = await prisma.user.findFirst({ where: { id: input.userId, restaurantId }, select: { id: true } });
      if (!user) throw notFound('El usuario no existe o no pertenece a este club.');
    }
    if (input.employeeId) {
      const emp = await prisma.employee.findFirst({ where: { id: input.employeeId, restaurantId }, select: { id: true } });
      if (!emp) throw notFound('El empleado no existe o no pertenece a este club.');
    }
    return prisma.clubCoach.create({
      data: {
        restaurantId,
        displayName: input.displayName,
        phone: input.phone,
        email: input.email ?? null,
        userId: input.userId ?? null,
        employeeId: input.employeeId ?? null,
        levelMin: input.levelMin != null ? new Prisma.Decimal(input.levelMin) : null,
        levelMax: input.levelMax != null ? new Prisma.Decimal(input.levelMax) : null,
        bio: input.bio ?? null,
        payType: input.payType,
        payAmountBase: input.payAmountBase != null ? new Prisma.Decimal(input.payAmountBase) : null,
        commissionPercent: input.commissionPercent != null ? new Prisma.Decimal(input.commissionPercent) : null,
      },
    });
  },

  async updateCoach(restaurantId: string, id: string, input: UpdateCoachInput) {
    await assertCoach(restaurantId, id);
    return prisma.clubCoach.update({
      where: { id },
      data: {
        ...input,
        levelMin: input.levelMin !== undefined ? (input.levelMin != null ? new Prisma.Decimal(input.levelMin) : null) : undefined,
        levelMax: input.levelMax !== undefined ? (input.levelMax != null ? new Prisma.Decimal(input.levelMax) : null) : undefined,
        payAmountBase:
          input.payAmountBase !== undefined
            ? input.payAmountBase != null
              ? new Prisma.Decimal(input.payAmountBase)
              : null
            : undefined,
        commissionPercent:
          input.commissionPercent !== undefined
            ? input.commissionPercent != null
              ? new Prisma.Decimal(input.commissionPercent)
              : null
            : undefined,
      },
    });
  },

  /** Se desactiva, no se borra: sus sesiones dadas son historial contable. */
  async deactivateCoach(restaurantId: string, id: string) {
    await assertCoach(restaurantId, id);
    const future = await prisma.clubClassSession.count({
      where: { coachId: id, startsAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    });
    if (future > 0) {
      throw badRequest(`Este profesor tiene ${future} clase(s) futuras. Reasígnalas antes de darlo de baja.`);
    }
    return prisma.clubCoach.update({ where: { id }, data: { active: false } });
  },

  async setCoachAvailability(restaurantId: string, coachId: string, input: CoachAvailabilityInput) {
    await assertCoach(restaurantId, coachId);
    return prisma.$transaction(async (tx) => {
      await tx.clubCoachAvailability.deleteMany({ where: { coachId } });
      if (input.slots.length) {
        await tx.clubCoachAvailability.createMany({ data: input.slots.map((s) => ({ coachId, ...s })) });
      }
      return tx.clubCoachAvailability.findMany({ where: { coachId }, orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }] });
    });
  },

  async addCoachTimeOff(restaurantId: string, coachId: string, input: CoachTimeOffInput) {
    await assertCoach(restaurantId, coachId);
    return prisma.clubCoachTimeOff.create({ data: { coachId, ...input, reason: input.reason ?? null } });
  },

  async removeCoachTimeOff(restaurantId: string, coachId: string, id: string) {
    await assertCoach(restaurantId, coachId);
    await prisma.clubCoachTimeOff.deleteMany({ where: { id, coachId } });
    return { ok: true };
  },

  /** ¿Puede este profesor dar clase en esta franja? Disponibilidad + ausencias. */
  async coachIsFree(coachId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
    const { dayOfWeek, hhmm } = caracasPartsOf(startsAt);
    const endHhmm = caracasPartsOf(endsAt).hhmm;

    const [availability, timeOff, overlapping] = await Promise.all([
      prisma.clubCoachAvailability.findMany({ where: { coachId, weekday: dayOfWeek } }),
      prisma.clubCoachTimeOff.count({ where: { coachId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } }),
      // Un profesor no puede estar en dos canchas a la vez, aunque las canchas sí
      // estén libres — la restricción de PostgreSQL protege la cancha, no a él.
      prisma.clubClassSession.count({
        where: {
          coachId,
          status: { in: ['SCHEDULED', 'CONFIRMED', 'PENDING_PAYMENT'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      }),
    ]);

    if (timeOff > 0 || overlapping > 0) return false;
    // Sin franjas cargadas se asume disponible: obligar a configurarlas antes de
    // poder agendar nada haría inusable el módulo el primer día.
    if (availability.length === 0) return true;
    return availability.some((a) => a.startTime <= hhmm && a.endTime >= endHhmm);
  },

  // ---------------------------------------------------------------- Programas
  async listPrograms(restaurantId: string) {
    return prisma.clubProgram.findMany({
      where: { restaurantId },
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { groups: true } } },
    });
  },

  async createProgram(restaurantId: string, input: { name: string; description?: string | null; color?: string | null }) {
    return prisma.clubProgram.create({
      data: { restaurantId, name: input.name, description: input.description ?? null, color: input.color ?? null },
    });
  },

  async updateProgram(
    restaurantId: string,
    id: string,
    input: { name?: string; description?: string | null; color?: string | null; active?: boolean; sortOrder?: number },
  ) {
    const program = await prisma.clubProgram.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!program) throw notFound('El programa no existe o no pertenece a este club.');
    return prisma.clubProgram.update({ where: { id }, data: input });
  },

  /** Se desactiva, no se borra: los grupos que lo usaron son historial. */
  async deactivateProgram(restaurantId: string, id: string) {
    const program = await prisma.clubProgram.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!program) throw notFound('El programa no existe o no pertenece a este club.');
    return prisma.clubProgram.update({ where: { id }, data: { active: false } });
  },

  // ----------------------------------------------------------- Lista de espera
  /**
   * Anota a alguien en la lista de espera de un grupo lleno.
   *
   * El orden es por `createdAt`, no por una posición guardada: una posición
   * habría que reordenarla entera cada vez que alguien se cae de la lista, y se
   * desincroniza al primer fallo a mitad de camino.
   */
  async joinWaitlist(restaurantId: string, groupId: string, studentId: string, note?: string | null) {
    const group = await prisma.clubClassGroup.findFirst({ where: { id: groupId, restaurantId }, select: { id: true } });
    if (!group) throw notFound('El grupo no existe o no pertenece a este club.');
    await assertStudent(restaurantId, studentId);

    const enrolled = await prisma.clubEnrollment.findFirst({
      where: { groupId, studentId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (enrolled) throw conflict('Ese alumno ya está inscrito en este grupo.');

    const existing = await prisma.clubWaitlistEntry.findUnique({
      where: { groupId_studentId: { groupId, studentId } },
    });
    // Re-anotarse tras haberse caído de la lista vuelve a ponerlo al final, no
    // le devuelve su puesto viejo: sería injusto con quien esperó todo ese rato.
    if (existing) {
      if (existing.status === 'WAITING' || existing.status === 'OFFERED') return existing;
      return prisma.clubWaitlistEntry.update({
        where: { id: existing.id },
        data: { status: 'WAITING', note: note ?? null, notifiedAt: null, createdAt: new Date() },
      });
    }

    return prisma.clubWaitlistEntry.create({
      data: { restaurantId, groupId, studentId, note: note ?? null },
    });
  },

  async listWaitlist(restaurantId: string, groupId?: string) {
    const rows = await prisma.clubWaitlistEntry.findMany({
      where: { restaurantId, status: { in: ['WAITING', 'OFFERED'] }, ...(groupId ? { groupId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        group: { select: { id: true, name: true, capacityMax: true } },
        student: { include: { customer: { select: { name: true, phone: true } } } },
      },
    });
    // La posición se deriva del orden dentro de cada grupo.
    const seen = new Map<string, number>();
    return rows.map((r) => {
      const pos = (seen.get(r.groupId) ?? 0) + 1;
      seen.set(r.groupId, pos);
      return { ...r, position: pos };
    });
  },

  async leaveWaitlist(restaurantId: string, id: string) {
    const entry = await prisma.clubWaitlistEntry.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!entry) throw notFound('Esa anotación no existe o no pertenece a este club.');
    return prisma.clubWaitlistEntry.update({ where: { id }, data: { status: 'CANCELLED' } });
  },

  /**
   * Avisa al primero de la lista cuando se libera un puesto.
   *
   * Solo AVISA — no lo inscribe solo. Meter a alguien a un grupo (y empezar a
   * cobrarle) sin que lo confirme sería cobrarle por algo que no pidió. Se marca
   * `notifiedAt` para no repetirle el aviso en cada barrido.
   */
  async offerWaitlistSeats(restaurantId: string) {
    const waiting = await prisma.clubWaitlistEntry.findMany({
      where: { restaurantId, status: 'WAITING', notifiedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        group: { select: { id: true, name: true, capacityMax: true } },
        student: { include: { customer: { select: { name: true, phone: true } } } },
      },
    });
    if (!waiting.length) return { offered: 0 };

    let offered = 0;
    const seenGroup = new Set<string>();

    for (const entry of waiting) {
      // Un puesto por grupo y por barrido: si quedan dos libres, el segundo se
      // ofrece en la pasada siguiente, cuando ya se sepa si el primero aceptó.
      if (seenGroup.has(entry.groupId)) continue;

      const nextSession = await prisma.clubClassSession.findFirst({
        where: { groupId: entry.groupId, startsAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        orderBy: { startsAt: 'asc' },
      });
      if (!nextSession) continue;

      const seats = await occupiedSeats(nextSession);
      if (seats >= entry.group.capacityMax) continue;

      await prisma.clubWaitlistEntry.update({
        where: { id: entry.id },
        data: { status: 'OFFERED', notifiedAt: new Date() },
      });
      seenGroup.add(entry.groupId);
      offered += 1;

      await academyNotifier.waitlistSeatFree(
        restaurantId,
        entry.student.customer.phone,
        entry.student.customer.name,
        entry.group.name,
      );
    }

    return { offered };
  },

  // ------------------------------------------------------------------- Grupos
  async listGroups(restaurantId: string) {
    const groups = await prisma.clubClassGroup.findMany({
      where: { restaurantId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        coach: { select: { id: true, displayName: true } },
        program: { select: { id: true, name: true, color: true } },
        slots: { include: { court: { select: { id: true, name: true } } } },
        _count: { select: { enrollments: true, sessions: true, waitlist: true } },
      },
    });
    return groups;
  },

  async createGroup(restaurantId: string, input: CreateGroupInput) {
    await assertCoach(restaurantId, input.coachId);
    for (const slot of input.slots) {
      if (slot.courtId) {
        const court = await prisma.clubCourt.findFirst({ where: { id: slot.courtId, restaurantId }, select: { id: true } });
        if (!court) throw notFound('Una de las canchas indicadas no pertenece a este club.');
      }
    }

    if (input.programId) {
      const program = await prisma.clubProgram.findFirst({ where: { id: input.programId, restaurantId }, select: { id: true } });
      if (!program) throw notFound('El programa no existe o no pertenece a este club.');
    }

    const group = await prisma.clubClassGroup.create({
      data: {
        restaurantId,
        coachId: input.coachId,
        programId: input.programId ?? null,
        name: input.name,
        levelMin: new Prisma.Decimal(input.levelMin),
        levelMax: new Prisma.Decimal(input.levelMax),
        classType: input.classType,
        capacityMin: input.capacityMin,
        capacityMax: input.capacityMax,
        seasonStart: atTimeCaracas(input.seasonStart, '00:00'),
        seasonEnd: input.seasonEnd ? atTimeCaracas(input.seasonEnd, '23:59') : null,
        priceMonthlyBase: input.priceMonthlyBase != null ? new Prisma.Decimal(input.priceMonthlyBase) : null,
        pricePerClassBase: input.pricePerClassBase != null ? new Prisma.Decimal(input.pricePerClassBase) : null,
        packagePriceBase: input.packagePriceBase != null ? new Prisma.Decimal(input.packagePriceBase) : null,
        packageClasses: input.packageClasses ?? null,
        releaseHoursBefore: input.releaseHoursBefore ?? null,
        // El defecto vive también acá y no solo en el DTO: el modelo trae DRAFT, y
        // un grupo en borrador no sale en el enlace público, no admite inscripciones
        // y extendHorizon nunca le genera más semanas.
        status: input.status ?? 'ACTIVE',
        slots: { create: input.slots.map((s) => ({ ...s, courtId: s.courtId ?? null })) },
      },
      include: { slots: true },
    });

    return group;
  },

  async updateGroup(restaurantId: string, id: string, input: UpdateGroupInput) {
    const group = await prisma.clubClassGroup.findFirst({ where: { id, restaurantId } });
    if (!group) throw notFound('El grupo no existe o no pertenece a este club.');
    if (input.coachId) await assertCoach(restaurantId, input.coachId);

    const updated = await prisma.clubClassGroup.update({
      where: { id },
      data: {
        ...input,
        seasonEnd: input.seasonEnd !== undefined ? (input.seasonEnd ? atTimeCaracas(input.seasonEnd, '23:59') : null) : undefined,
        levelMin: input.levelMin != null ? new Prisma.Decimal(input.levelMin) : undefined,
        levelMax: input.levelMax != null ? new Prisma.Decimal(input.levelMax) : undefined,
        priceMonthlyBase:
          input.priceMonthlyBase !== undefined
            ? input.priceMonthlyBase != null
              ? new Prisma.Decimal(input.priceMonthlyBase)
              : null
            : undefined,
        pricePerClassBase:
          input.pricePerClassBase !== undefined
            ? input.pricePerClassBase != null
              ? new Prisma.Decimal(input.pricePerClassBase)
              : null
            : undefined,
        packagePriceBase:
          input.packagePriceBase !== undefined
            ? input.packagePriceBase != null
              ? new Prisma.Decimal(input.packagePriceBase)
              : null
            : undefined,
      },
    });

    // Pausar o terminar un grupo libera sus canchas futuras: si no, la parrilla
    // queda ocupada por clases que ya nadie va a dar.
    if (input.status === 'PAUSED' || input.status === 'ENDED') {
      await this.cancelFutureSessions(restaurantId, id, 'Grupo ' + (input.status === 'PAUSED' ? 'pausado' : 'finalizado'));
    }
    return updated;
  },

  async cancelFutureSessions(restaurantId: string, groupId: string, reason: string) {
    const sessions = await prisma.clubClassSession.findMany({
      where: { restaurantId, groupId, startsAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED', 'NEEDS_COURT'] } },
      select: { id: true, blockId: true },
    });
    if (!sessions.length) return { cancelled: 0 };

    await prisma.$transaction([
      prisma.clubCourtBlock.updateMany({
        where: { id: { in: sessions.map((s) => s.blockId).filter((b): b is string => !!b) } },
        data: { status: 'CANCELLED' },
      }),
      prisma.clubClassSession.updateMany({
        where: { id: { in: sessions.map((s) => s.id) } },
        data: { status: 'CANCELLED', cancelReason: reason },
      }),
    ]);
    emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    return { cancelled: sessions.length };
  },

  // ------------------------------------------- Generación de sesiones (Fase 2)
  /**
   * Expande los horarios recurrentes del grupo en sesiones concretas.
   *
   * Cada ocurrencia va en SU PROPIA transacción, no todas en una: un choque en
   * la semana 7 no puede tirar abajo las seis semanas buenas, y una transacción
   * larga mantendría un lock sobre la tabla del calendario — justo la tabla por
   * la que pasa cada reserva del club.
   *
   * Idempotente: se puede llamar mil veces, el @@unique([groupId, startsAt])
   * descarta lo ya generado.
   */
  async generateSessions(restaurantId: string, groupId: string, weeks = ACADEMY_HORIZON_WEEKS) {
    const group = await prisma.clubClassGroup.findFirst({
      where: { id: groupId, restaurantId },
      include: { slots: true, coach: true },
    });
    if (!group) throw notFound('El grupo no existe o no pertenece a este club.');
    if (group.status === 'ENDED') throw badRequest('Este grupo ya terminó.');
    if (!group.slots.length) throw badRequest('El grupo no tiene horarios cargados.');

    const settings = await getSettings(restaurantId);
    const releaseHours = group.releaseHoursBefore ?? settings.defaultReleaseHoursBefore;

    const now = new Date();
    const horizonEnd = new Date(now.getTime() + weeks * 7 * 86_400_000);
    const until = group.seasonEnd && group.seasonEnd < horizonEnd ? group.seasonEnd : horizonEnd;
    const from = group.seasonStart > now ? group.seasonStart : now;

    const courts = await prisma.clubCourt.findMany({
      where: { restaurantId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const created: string[] = [];
    const conflicts: { date: string; startTime: string }[] = [];

    for (const slot of group.slots) {
      // Primer día >= from que caiga en el weekday del slot.
      const cursor = new Date(from);
      while (caracasPartsOf(cursor).dayOfWeek !== slot.weekday) {
        cursor.setTime(cursor.getTime() + 86_400_000);
      }

      for (let d = new Date(cursor); d <= until; d.setTime(d.getTime() + 7 * 86_400_000)) {
        const dateStr = caracasPartsOf(d).dateStr;
        const startsAt = atTimeCaracas(dateStr, slot.startTime);
        const endsAt = new Date(startsAt.getTime() + slot.durationMinutes * 60_000);
        if (endsAt <= now) continue;

        const already = await prisma.clubClassSession.findFirst({
          where: { groupId, startsAt },
          select: { id: true },
        });
        if (already) continue;

        // Si el slot fija cancha se intenta solo esa; si no, cualquiera libre.
        const candidates = slot.courtId ? [slot.courtId] : courts.map((c) => c.id);
        let placed = false;

        for (const courtId of candidates) {
          try {
            const session = await prisma.$transaction(async (tx) => {
              const block = await tx.clubCourtBlock.create({
                data: { restaurantId, courtId, kind: 'CLASS', startsAt, endsAt, note: group.name },
              });
              return tx.clubClassSession.create({
                data: {
                  restaurantId,
                  blockId: block.id,
                  groupId,
                  coachId: group.coachId,
                  courtId,
                  startsAt,
                  endsAt,
                  classType: group.classType,
                  capacityMin: group.capacityMin,
                  capacityMax: group.capacityMax,
                  releaseHoursBefore: releaseHours,
                  payType: group.coach.payType,
                  payAmountBase: group.coach.payAmountBase,
                  commissionPercent: group.coach.commissionPercent,
                },
              });
            });
            created.push(session.id);
            placed = true;
            break;
          } catch (err) {
            if (isOverlapError(err)) continue; // esa cancha está tomada, probar la siguiente
            throw err;
          }
        }

        if (!placed) {
          // Ninguna cancha libre: la sesión existe igual, marcada para reubicar a
          // mano. Abortar aquí dejaría al club sin poder abrir el grupo por una
          // reserva suelta dentro de dos meses.
          await prisma.clubClassSession.create({
            data: {
              restaurantId,
              groupId,
              coachId: group.coachId,
              startsAt,
              endsAt,
              classType: group.classType,
              capacityMin: group.capacityMin,
              capacityMax: group.capacityMax,
              releaseHoursBefore: releaseHours,
              payType: group.coach.payType,
              payAmountBase: group.coach.payAmountBase,
              commissionPercent: group.coach.commissionPercent,
              status: 'NEEDS_COURT',
            },
          });
          conflicts.push({ date: dateStr, startTime: slot.startTime });
        }
      }
    }

    if (created.length) emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    return { created: created.length, conflicts };
  },

  /** Extiende el horizonte de todos los grupos activos. Perezoso, como settlePastBookings. */
  async extendHorizon(restaurantId: string) {
    const groups = await prisma.clubClassGroup.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      select: { id: true },
    });
    let created = 0;
    for (const g of groups) {
      const r = await this.generateSessions(restaurantId, g.id).catch(() => ({ created: 0 }));
      created += r.created;
    }
    return { created };
  },

  async listConflicts(restaurantId: string, groupId?: string) {
    return prisma.clubClassSession.findMany({
      where: { restaurantId, status: 'NEEDS_COURT', ...(groupId ? { groupId } : {}) },
      orderBy: { startsAt: 'asc' },
      include: { group: { select: { id: true, name: true } }, coach: { select: { displayName: true } } },
    });
  },

  /** Reubicar una sesión: cambiar de cancha y/u hora, respetando la restricción. */
  async reassignSession(restaurantId: string, id: string, input: ReassignSessionInput) {
    const session = await prisma.clubClassSession.findFirst({ where: { id, restaurantId } });
    if (!session) throw notFound('La clase no existe o no pertenece a este club.');
    if (session.status === 'DONE' || session.status === 'CANCELLED') {
      throw badRequest('No se puede mover una clase que ya se dio o se canceló.');
    }

    const duration = session.endsAt.getTime() - session.startsAt.getTime();
    const startsAt =
      input.date || input.startTime
        ? atTimeCaracas(input.date ?? caracasPartsOf(session.startsAt).dateStr, input.startTime ?? caracasPartsOf(session.startsAt).hhmm)
        : session.startsAt;
    const endsAt = new Date(startsAt.getTime() + duration);
    const courtId = input.courtId ?? session.courtId;
    if (!courtId) throw badRequest('Indica a qué cancha se mueve la clase.');

    const court = await prisma.clubCourt.findFirst({ where: { id: courtId, restaurantId }, select: { id: true } });
    if (!court) throw notFound('La cancha no existe o no pertenece a este club.');

    // La disponibilidad del profesor se devuelve como aviso, no como bloqueo: al
    // reubicar, el admin suele saber algo que el sistema no (el profesor cambió
    // el turno con otro). Lo que sí bloquea siempre es la cancha, y de eso se
    // encarga la restricción de la base de datos, no este chequeo.
    const coachFree = await this.coachIsFree(session.coachId, startsAt, endsAt);

    try {
      return await prisma.$transaction(async (tx) => {
        if (session.blockId) {
          await tx.clubCourtBlock.update({ where: { id: session.blockId }, data: { status: 'CANCELLED' } });
        }
        const block = await tx.clubCourtBlock.create({
          data: { restaurantId, courtId, kind: 'CLASS', startsAt, endsAt },
        });
        const moved = await tx.clubClassSession.update({
          where: { id },
          data: { blockId: block.id, courtId, startsAt, endsAt, status: 'SCHEDULED' },
        });
        return { ...moved, coachWarning: coachFree ? null : 'El profesor no figura disponible en ese horario.' };
      });
    } catch (err) {
      if (isOverlapError(err)) throw conflict('Ese horario choca con una reserva o clase existente.');
      throw err;
    } finally {
      emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    }
  },

  // ----------------------------------------------------------------- Sesiones
  async listSessions(restaurantId: string, query: ListSessionsQuery) {
    const where: Prisma.ClubClassSessionWhereInput = { restaurantId };
    if (query.coachId) where.coachId = query.coachId;
    if (query.groupId) where.groupId = query.groupId;
    if (query.status) where.status = query.status;
    if (query.date) {
      const start = atTimeCaracas(query.date, '00:00');
      where.startsAt = { gte: start, lt: new Date(start.getTime() + 86_400_000) };
    } else if (query.from || query.to) {
      where.startsAt = {
        ...(query.from ? { gte: atTimeCaracas(query.from, '00:00') } : {}),
        ...(query.to ? { lt: new Date(atTimeCaracas(query.to, '00:00').getTime() + 86_400_000) } : {}),
      };
    }

    const sessions = await prisma.clubClassSession.findMany({
      where,
      orderBy: { startsAt: 'asc' },
      take: 300,
      include: {
        group: { select: { id: true, name: true } },
        coach: { select: { id: true, displayName: true } },
        court: { select: { id: true, name: true } },
        attendances: { select: { id: true, studentId: true, status: true } },
      },
    });

    return Promise.all(
      sessions.map(async (s) => ({
        ...s,
        occupiedSeats: await occupiedSeats(s),
      })),
    );
  },

  /** Clase suelta o personalizada creada desde el mostrador. */
  async createSession(restaurantId: string, input: CreateSessionInput) {
    const coach = await assertCoach(restaurantId, input.coachId);
    const court = await prisma.clubCourt.findFirst({ where: { id: input.courtId, restaurantId }, select: { id: true } });
    if (!court) throw notFound('La cancha no existe o no pertenece a este club.');

    const startsAt = atTimeCaracas(input.date, input.startTime);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    if (endsAt <= new Date()) throw badRequest('No se puede agendar una clase en un horario que ya pasó.');

    if (!(await this.coachIsFree(input.coachId, startsAt, endsAt))) {
      throw conflict('El profesor no está disponible en ese horario.');
    }

    const settings = await getSettings(restaurantId);

    try {
      const session = await prisma.$transaction(async (tx) => {
        const block = await tx.clubCourtBlock.create({
          data: { restaurantId, courtId: input.courtId, kind: 'CLASS', startsAt, endsAt, note: input.note ?? null },
        });
        const created = await tx.clubClassSession.create({
          data: {
            restaurantId,
            blockId: block.id,
            coachId: input.coachId,
            courtId: input.courtId,
            startsAt,
            endsAt,
            classType: input.classType,
            capacityMin: input.capacityMin,
            capacityMax: input.capacityMax,
            releaseHoursBefore: settings.defaultReleaseHoursBefore,
            payType: coach.payType,
            payAmountBase: coach.payAmountBase,
            commissionPercent: coach.commissionPercent,
          },
        });
        if (input.studentIds?.length) {
          await tx.clubAttendance.createMany({
            data: input.studentIds.map((studentId) => ({ sessionId: created.id, studentId, status: 'PRESENT' as const, consumedValueBase: new Prisma.Decimal(0) })),
            skipDuplicates: true,
          });
        }
        return created;
      });

      emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
      await academyNotifier.coachAssigned(restaurantId, coach, session);
      return session;
    } catch (err) {
      if (isOverlapError(err)) throw conflict('Ese horario choca con una reserva o clase existente.');
      throw err;
    }
  },

  /**
   * Particular que agenda el propio alumno, pagando por adelantado.
   *
   * Crea el bloque de cancha DE VERDAD (si no, dos alumnos pagan la misma pista
   * mientras se verifica el pago) pero con `holdExpiresAt`: si nadie confirma el
   * cobro a tiempo, `expirePrivateHolds` lo suelta y el horario vuelve a la
   * parrilla. Es el equilibrio entre no vender dos veces y no regalar el hueco
   * a quien nunca paga.
   */
  async createPrivateRequest(
    restaurantId: string,
    input: {
      coachId: string;
      courtId: string;
      date: string;
      startTime: string;
      durationMinutes: number;
      studentId: string;
      studentName: string;
      holdMinutes: number;
    },
  ) {
    const coach = await assertCoach(restaurantId, input.coachId);
    const court = await prisma.clubCourt.findFirst({
      where: { id: input.courtId, restaurantId, active: true },
      select: { id: true },
    });
    if (!court) throw notFound('La cancha no existe o no está disponible.');

    const startsAt = atTimeCaracas(input.date, input.startTime);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    if (endsAt <= new Date()) throw badRequest('Ese horario ya pasó.');

    if (!(await this.coachIsFree(input.coachId, startsAt, endsAt))) {
      throw conflict('El profesor no está disponible en ese horario.');
    }

    const settings = await getSettings(restaurantId);

    try {
      const session = await prisma.$transaction(async (tx) => {
        const block = await tx.clubCourtBlock.create({
          data: {
            restaurantId,
            courtId: input.courtId,
            kind: 'CLASS',
            startsAt,
            endsAt,
            note: `Particular — ${input.studentName}`,
          },
        });
        const created = await tx.clubClassSession.create({
          data: {
            restaurantId,
            blockId: block.id,
            coachId: input.coachId,
            courtId: input.courtId,
            startsAt,
            endsAt,
            classType: 'PRIVATE',
            capacityMin: 1,
            capacityMax: 2,
            releaseHoursBefore: settings.defaultReleaseHoursBefore,
            payType: coach.payType,
            payAmountBase: coach.payAmountBase,
            commissionPercent: coach.commissionPercent,
            status: 'PENDING_PAYMENT',
            holdExpiresAt: new Date(Date.now() + input.holdMinutes * 60_000),
          },
        });
        await tx.clubAttendance.create({
          data: { sessionId: created.id, studentId: input.studentId, status: 'PRESENT', consumedValueBase: toDecimal(0) },
        });
        return created;
      });

      emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
      emitToKitchen(restaurantId, SocketEvents.CLUB_ACADEMY_SESSION_UPDATED, { id: session.id });
      await academyNotifier.coachAssigned(restaurantId, coach, session);
      return session;
    } catch (err) {
      if (isOverlapError(err)) throw conflict('Ese horario acaba de ser tomado. Elige otro.');
      throw err;
    }
  },

  async cancelSession(restaurantId: string, id: string, input: CancelSessionInput) {
    const session = await prisma.clubClassSession.findFirst({
      where: { id, restaurantId },
      include: { coach: true, group: true },
    });
    if (!session) throw notFound('La clase no existe o no pertenece a este club.');
    if (session.status === 'DONE') throw badRequest('Esta clase ya se dio.');

    const holders = session.groupId
      ? await prisma.clubEnrollment.findMany({
          where: { groupId: session.groupId, status: 'ACTIVE' },
          select: { studentId: true },
        })
      : [];

    await prisma.$transaction(async (tx) => {
      if (session.blockId) {
        await tx.clubCourtBlock.update({ where: { id: session.blockId }, data: { status: 'CANCELLED' } });
      }
      await tx.clubClassSession.update({
        where: { id },
        data: { status: 'CANCELLED', cancelReason: input.reason ?? null },
      });
      // La cancela el club, no el alumno: no puede perder su clase.
      if (input.refundCredits && holders.length) {
        await tx.clubClassCreditEntry.createMany({
          data: holders.map((h) => ({
            restaurantId,
            studentId: h.studentId,
            delta: 1,
            reason: 'CANCELLATION_TOKEN' as const,
            sessionId: id,
            note: input.reason ?? 'Clase cancelada por el club',
          })),
        });
      }
    });

    emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    emitToKitchen(restaurantId, SocketEvents.CLUB_ACADEMY_SESSION_UPDATED, { id });
    await academyNotifier.sessionCancelled(restaurantId, session.coach, session, input.reason ?? null);
    return { ok: true, refunded: input.refundCredits ? holders.length : 0 };
  },

  /**
   * Regla de liberación por cupo mínimo.
   *
   * Perezosa (se llama al abrir el panel), así que DEBE ser idempotente: dos
   * peticiones simultáneas no pueden liberar dos veces ni regalar dos fichas por
   * la misma cancelación. Por eso la transición va con un updateMany condicionado
   * a status SCHEDULED y solo se actúa si `count > 0`.
   */
  async releaseUnderfilledSessions(restaurantId: string) {
    const now = new Date();
    // Ventana amplia: se filtra por sesión con su propio releaseHoursBefore congelado.
    const candidates = await prisma.clubClassSession.findMany({
      where: {
        restaurantId,
        status: 'SCHEDULED',
        startsAt: { gt: now, lt: new Date(now.getTime() + 168 * 3_600_000) },
      },
      include: { coach: true, group: { select: { name: true } } },
    });

    let released = 0;
    let confirmed = 0;

    for (const session of candidates) {
      const hoursToStart = (session.startsAt.getTime() - now.getTime()) / 3_600_000;
      if (hoursToStart > session.releaseHoursBefore) continue;

      const seats = await occupiedSeats(session);
      if (seats >= session.capacityMin) {
        const r = await prisma.clubClassSession.updateMany({
          where: { id: session.id, status: 'SCHEDULED' },
          data: { status: 'CONFIRMED' },
        });
        if (r.count > 0) confirmed++;
        continue;
      }

      // Solo el que gana la carrera del updateMany hace el resto del trabajo.
      const claimed = await prisma.clubClassSession.updateMany({
        where: { id: session.id, status: 'SCHEDULED' },
        data: { status: 'RELEASED', cancelReason: `Sin cupo mínimo (${seats}/${session.capacityMin})` },
      });
      if (claimed.count === 0) continue;

      const holders = session.groupId
        ? await prisma.clubEnrollment.findMany({
            where: { groupId: session.groupId, status: 'ACTIVE' },
            select: { studentId: true },
          })
        : [];

      await prisma.$transaction(async (tx) => {
        if (session.blockId) {
          // Cancelar el bloque devuelve la cancha a la parrilla al instante: la
          // restricción solo mira los bloques que no están CANCELLED.
          await tx.clubCourtBlock.update({ where: { id: session.blockId }, data: { status: 'CANCELLED' } });
        }
        if (holders.length) {
          await tx.clubClassCreditEntry.createMany({
            data: holders.map((h) => ({
              restaurantId,
              studentId: h.studentId,
              delta: 1,
              reason: 'CANCELLATION_TOKEN' as const,
              sessionId: session.id,
              note: 'Clase liberada por no llegar al cupo mínimo',
            })),
          });
        }
      });

      released++;
      await academyNotifier.sessionReleased(restaurantId, session.coach, session, seats);
    }

    if (released > 0) emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    return { released, confirmed };
  },

  /**
   * Libera las particulares cuyo hold venció sin pago verificado. Sin esto,
   * cualquiera podría secuestrar las 7pm reservando y no pagando nunca.
   */
  async expirePrivateHolds(restaurantId: string) {
    const now = new Date();
    const expired = await prisma.clubClassSession.findMany({
      where: { restaurantId, status: 'PENDING_PAYMENT', holdExpiresAt: { lt: now } },
      select: { id: true, blockId: true },
    });
    if (!expired.length) return { expired: 0 };

    const claimed = await prisma.clubClassSession.updateMany({
      where: { id: { in: expired.map((e) => e.id) }, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED', cancelReason: 'Reserva sin pago verificado a tiempo' },
    });
    if (claimed.count === 0) return { expired: 0 };

    await prisma.clubCourtBlock.updateMany({
      where: { id: { in: expired.map((e) => e.blockId).filter((b): b is string => !!b) } },
      data: { status: 'CANCELLED' },
    });
    emitToKitchen(restaurantId, SocketEvents.CLUB_CALENDAR_CHANGED, {});
    return { expired: claimed.count };
  },

  /** Cierra las clases cuya hora ya pasó. Igual criterio que settlePastBookings. */
  async settlePastSessions(restaurantId: string) {
    const done = await prisma.clubClassSession.updateMany({
      where: { restaurantId, status: { in: ['SCHEDULED', 'CONFIRMED'] }, endsAt: { lt: new Date() } },
      data: { status: 'DONE' },
    });
    return { done: done.count };
  },

  // --------------------------------------------------------------- Asistencia
  async getRoster(restaurantId: string, sessionId: string) {
    const session = await prisma.clubClassSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: {
        group: { select: { id: true, name: true, priceMonthlyBase: true, pricePerClassBase: true } },
        coach: { select: { id: true, displayName: true } },
        court: { select: { id: true, name: true } },
        attendances: true,
      },
    });
    if (!session) throw notFound('La clase no existe o no pertenece a este club.');

    const enrolled = session.groupId
      ? await prisma.clubEnrollment.findMany({
          where: { groupId: session.groupId, status: 'ACTIVE' },
          include: { student: { include: { customer: { select: { name: true, phone: true } } } } },
        })
      : [];

    const byStudent = new Map(session.attendances.map((a) => [a.studentId, a]));
    const roster = enrolled.map((e) => ({
      studentId: e.studentId,
      name: e.student.customer.name,
      phone: e.student.customer.phone,
      level: e.student.level,
      billingMode: e.billingMode,
      attendance: byStudent.get(e.studentId) ?? null,
    }));

    // Quien vino a recuperar no está inscrito en el grupo pero sí en la lista.
    for (const a of session.attendances) {
      if (roster.some((r) => r.studentId === a.studentId)) continue;
      const s = await prisma.clubStudent.findUnique({
        where: { id: a.studentId },
        include: { customer: { select: { name: true, phone: true } } },
      });
      if (s) {
        roster.push({
          studentId: s.id,
          name: s.customer.name,
          phone: s.customer.phone,
          level: s.level,
          billingMode: 'PACKAGE',
          attendance: a,
        });
      }
    }

    return { session, roster, occupiedSeats: await occupiedSeats(session) };
  },

  /**
   * Pasar lista. En lote y en una sola transacción.
   *
   * Cada asistencia congela `consumedValueBase`: el dinero que consumió esa
   * silla. Es lo que después hace que salgan solos el honorario por comisión y
   * la rentabilidad del grupo, sin reconstruir a posteriori por qué vía llegó
   * cada alumno (mensualidad, ficha o pago suelto).
   */
  async markAttendance(restaurantId: string, sessionId: string, input: AttendanceInput, userId?: string) {
    const session = await prisma.clubClassSession.findFirst({
      where: { id: sessionId, restaurantId },
      include: { group: true },
    });
    if (!session) throw notFound('La clase no existe o no pertenece a este club.');
    if (session.status === 'CANCELLED' || session.status === 'RELEASED') {
      throw badRequest('Esta clase fue cancelada.');
    }

    // Cuánto vale una silla en esta sesión, según cómo paga cada alumno.
    const sessionsThisMonth = session.groupId
      ? await prisma.clubClassSession.count({
          where: {
            groupId: session.groupId,
            startsAt: {
              gte: new Date(Date.UTC(session.startsAt.getUTCFullYear(), session.startsAt.getUTCMonth(), 1)),
              lt: new Date(Date.UTC(session.startsAt.getUTCFullYear(), session.startsAt.getUTCMonth() + 1, 1)),
            },
            status: { not: 'CANCELLED' },
          },
        })
      : 1;

    const enrollments = session.groupId
      ? await prisma.clubEnrollment.findMany({ where: { groupId: session.groupId, status: 'ACTIVE' } })
      : [];
    const enrollmentByStudent = new Map(enrollments.map((e) => [e.studentId, e]));

    const result = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const entry of input.entries) {
        const enrollment = enrollmentByStudent.get(entry.studentId);
        let consumed = toDecimal(0);
        let creditEntryId: string | null = null;

        if (entry.status === 'PRESENT' || entry.status === 'MAKEUP') {
          if (enrollment?.billingMode === 'MONTHLY') {
            // Imputación de costo, no cobro: la mensualidad real vive en
            // ClubAcademyPayment. Repartida entre las sesiones del mes.
            consumed = round2(enrollment.priceBase.div(Math.max(1, sessionsThisMonth)));
          } else {
            // Ficha: vale lo que valía el lote del que salió.
            const pkg = await tx.clubClassPackage.findFirst({
              where: {
                studentId: entry.studentId,
                restaurantId,
                OR: [{ expiresAt: null }, { expiresAt: { gte: session.startsAt } }],
              },
              orderBy: { purchasedAt: 'asc' },
            });
            consumed = pkg ? pkg.pricePerClassBase : (session.group?.pricePerClassBase ?? toDecimal(0));

            const credit = await tx.clubClassCreditEntry.create({
              data: {
                restaurantId,
                studentId: entry.studentId,
                delta: -1,
                reason: 'CLASS_CONSUMED',
                sessionId: session.id,
                packageId: pkg?.id ?? null,
              },
            });
            creditEntryId = credit.id;
          }
        }

        const row = await tx.clubAttendance.upsert({
          where: { sessionId_studentId: { sessionId, studentId: entry.studentId } },
          create: {
            sessionId,
            studentId: entry.studentId,
            status: entry.status,
            consumedValueBase: consumed,
            creditEntryId,
            markedByUserId: userId ?? null,
          },
          update: {
            status: entry.status,
            consumedValueBase: consumed,
            markedByUserId: userId ?? null,
            markedAt: new Date(),
          },
        });
        rows.push(row);
      }

      // Honorario del profesor, con el criterio congelado al generar la sesión.
      const present = rows.filter((r) => r.status === 'PRESENT' || r.status === 'MAKEUP');
      const consumedTotal = present.reduce((acc, r) => acc.add(r.consumedValueBase), toDecimal(0));
      const hours = (session.endsAt.getTime() - session.startsAt.getTime()) / 3_600_000;
      const amount = session.payAmountBase ?? toDecimal(0);
      const pct = session.commissionPercent ?? toDecimal(0);

      let fee = toDecimal(0);
      switch (session.payType) {
        case 'FIXED_PER_SESSION':
          fee = amount;
          break;
        case 'HOURLY':
          fee = round2(amount.mul(hours));
          break;
        case 'COMMISSION_ON_CONSUMED':
          fee = round2(consumedTotal.mul(pct).div(100));
          break;
        case 'COMMISSION_ON_ENROLLMENT': {
          const cartera = enrollments.reduce((acc, e) => acc.add(e.priceBase), toDecimal(0));
          fee = round2(cartera.div(Math.max(1, sessionsThisMonth)).mul(pct).div(100));
          break;
        }
        case 'MIXED':
          fee = round2(amount.add(consumedTotal.mul(pct).div(100)));
          break;
      }

      await tx.clubClassSession.update({
        where: { id: sessionId },
        data: { coachFeeBase: fee, status: session.endsAt < new Date() ? 'DONE' : session.status },
      });

      return { marked: rows.length, coachFeeBase: fee.toFixed(2) };
    });

    emitToKitchen(restaurantId, SocketEvents.CLUB_ACADEMY_SESSION_UPDATED, { id: sessionId });
    return result;
  },

  /**
   * Recepción reubica a un alumno en una clase de recuperación.
   *
   * Mismas dos reglas que cuando lo hace el alumno solo: no pasar el aforo de la
   * pista y tener ficha disponible. La diferencia es que recepción SÍ puede
   * hacerlo sin ficha (`force`) — un alumno al que el club le canceló la clase por
   * lluvia no debería quedarse fuera por un detalle de saldo.
   */
  async scheduleMakeup(restaurantId: string, sessionId: string, studentId: string, force = false) {
    const session = await prisma.clubClassSession.findFirst({
      where: { id: sessionId, restaurantId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
    });
    if (!session) throw notFound('Esa clase no existe o no admite recuperaciones.');
    if (session.startsAt <= new Date()) throw badRequest('Esa clase ya pasó.');

    const student = await assertStudent(restaurantId, studentId);

    const seats = await occupiedSeats(session);
    if (seats >= session.capacityMax) throw conflict('Esa clase está llena.');

    if (!force) {
      const balance = await prisma.clubClassCreditEntry.aggregate({
        where: { restaurantId, studentId },
        _sum: { delta: true },
      });
      if ((balance._sum.delta ?? 0) <= 0) {
        throw badRequest('Ese alumno no tiene fichas disponibles. Puedes reubicarlo igual marcando "sin descontar ficha".');
      }
    }

    const row = await prisma.clubAttendance.upsert({
      where: { sessionId_studentId: { sessionId, studentId } },
      create: { sessionId, studentId, status: 'MAKEUP' },
      update: { status: 'MAKEUP' },
    });

    emitToKitchen(restaurantId, SocketEvents.CLUB_ACADEMY_SESSION_UPDATED, { id: sessionId });
    return { ...row, studentName: student.customer.name };
  },

  // ------------------------------------------------------------------ Alumnos
  async listStudents(restaurantId: string, query: ListStudentsQuery) {
    const where: Prisma.ClubStudentWhereInput = { restaurantId };
    if (query.active) where.active = query.active === 'true';
    if (query.level != null) where.level = new Prisma.Decimal(query.level);
    if (query.groupId) where.enrollments = { some: { groupId: query.groupId, status: 'ACTIVE' } };
    if (query.q) {
      where.customer = {
        OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }],
      };
    }

    const students = await prisma.clubStudent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        customer: { select: { name: true, phone: true, idNumber: true } },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { group: { select: { id: true, name: true } } },
        },
      },
    });

    // Saldo de fichas de todos en una sola consulta, no una por alumno.
    const balances = await prisma.clubClassCreditEntry.groupBy({
      by: ['studentId'],
      where: { restaurantId, studentId: { in: students.map((s) => s.id) } },
      _sum: { delta: true },
    });
    const byStudent = new Map(balances.map((b) => [b.studentId, b._sum.delta ?? 0]));

    return students.map((s) => ({ ...s, creditBalance: byStudent.get(s.id) ?? 0 }));
  },

  /** El alumno ES un Customer: se hace upsert por teléfono, igual que una reserva. */
  async createStudent(restaurantId: string, input: CreateStudentInput) {
    await customerService.upsertFromOrder(restaurantId, {
      name: input.name,
      phone: input.phone,
      idNumber: input.idNumber ?? undefined,
    });
    const customer = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone: input.phone } },
      select: { id: true },
    });
    if (!customer) throw badRequest('No se pudo registrar al alumno.');

    const existing = await prisma.clubStudent.findUnique({ where: { customerId: customer.id } });
    if (existing) throw conflict('Esta persona ya está registrada como alumno.');

    return prisma.clubStudent.create({
      data: {
        restaurantId,
        customerId: customer.id,
        level: input.level != null ? new Prisma.Decimal(input.level) : null,
        birthDate: input.birthDate ? atTimeCaracas(input.birthDate, '00:00') : null,
        guardianName: input.guardianName ?? null,
        guardianPhone: input.guardianPhone ?? null,
        medicalNotes: input.medicalNotes ?? null,
        accessToken: nanoid(14),
      },
      include: { customer: true },
    });
  },

  async updateStudent(restaurantId: string, id: string, input: UpdateStudentInput) {
    await assertStudent(restaurantId, id);
    return prisma.clubStudent.update({
      where: { id },
      data: {
        ...input,
        level: input.level !== undefined ? (input.level != null ? new Prisma.Decimal(input.level) : null) : undefined,
        birthDate: input.birthDate !== undefined ? (input.birthDate ? atTimeCaracas(input.birthDate, '00:00') : null) : undefined,
      },
      include: { customer: true },
    });
  },

  async getStudent(restaurantId: string, id: string) {
    const student = await prisma.clubStudent.findFirst({
      where: { id, restaurantId },
      include: {
        customer: true,
        enrollments: { include: { group: { select: { id: true, name: true } } }, orderBy: { startsAt: 'desc' } },
        packages: { orderBy: { purchasedAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' }, take: 50 },
        attendances: {
          orderBy: { markedAt: 'desc' },
          take: 50,
          include: { session: { select: { startsAt: true, groupId: true } } },
        },
      },
    });
    if (!student) throw notFound('El alumno no existe o no pertenece a este club.');

    const balance = await prisma.clubClassCreditEntry.aggregate({
      where: { restaurantId, studentId: id },
      _sum: { delta: true },
    });
    return { ...student, creditBalance: balance._sum.delta ?? 0 };
  },

  // ------------------------------------------------------------ Inscripciones
  async createEnrollment(restaurantId: string, input: CreateEnrollmentInput) {
    const student = await assertStudent(restaurantId, input.studentId);
    const group = await prisma.clubClassGroup.findFirst({
      where: { id: input.groupId, restaurantId },
      include: { coach: true },
    });
    if (!group) throw notFound('El grupo no existe o no pertenece a este club.');
    if (group.status === 'ENDED') throw badRequest('Este grupo ya terminó.');

    const settings = await getSettings(restaurantId);

    // Regla de nivel. Bloquea, pero con salida: en un club real el profesor
    // decide que un 3.5 aguanta el grupo de 4.0. Lo que no puede pasar es que
    // esa excepción quede sin rastro.
    if (settings.enforceLevelOnEnroll && student.level && !input.levelOverrideReason) {
      const lvl = Number(student.level);
      if (lvl < Number(group.levelMin) || lvl > Number(group.levelMax)) {
        throw conflict(
          `El alumno es nivel ${lvl.toFixed(1)} y el grupo admite de ${Number(group.levelMin).toFixed(1)} a ${Number(group.levelMax).toFixed(1)}. Indica un motivo para inscribirlo igual.`,
        );
      }
    }

    // Cupo: se mide sobre la próxima sesión, que es donde de verdad se sienta.
    const nextSession = await prisma.clubClassSession.findFirst({
      where: { groupId: group.id, startsAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      orderBy: { startsAt: 'asc' },
    });
    if (nextSession) {
      const seats = await occupiedSeats(nextSession);
      if (seats >= group.capacityMax) throw conflict('El grupo está lleno.');
    }

    const priceBase =
      input.priceBase != null
        ? new Prisma.Decimal(input.priceBase)
        : input.billingMode === 'MONTHLY'
          ? (group.priceMonthlyBase ?? toDecimal(0))
          : (group.pricePerClassBase ?? toDecimal(0));

    const enrollment = await prisma.clubEnrollment.create({
      data: {
        restaurantId,
        studentId: input.studentId,
        groupId: input.groupId,
        billingMode: input.billingMode,
        priceBase,
        billingDay: input.billingDay ?? null,
        startsAt: input.startsAt ? atTimeCaracas(input.startsAt, '00:00') : new Date(),
        levelOverrideReason: input.levelOverrideReason ?? null,
      },
      include: { student: { include: { customer: true } }, group: true },
    });

    // Si venía de la lista de espera, su anotación se cierra: dejarla abierta lo
    // mantendría recibiendo avisos de "se liberó un puesto" ya estando dentro.
    await prisma.clubWaitlistEntry.updateMany({
      where: { groupId: input.groupId, studentId: input.studentId, status: { in: ['WAITING', 'OFFERED'] } },
      data: { status: 'ENROLLED' },
    });

    emitToKitchen(restaurantId, SocketEvents.CLUB_ACADEMY_ENROLLMENT_NEW, { id: enrollment.id });
    if (settings.notifyCoachOnEnroll) {
      await academyNotifier.studentEnrolled(restaurantId, group.coach, group.name, enrollment.student.customer.name);
    }
    return enrollment;
  },

  /**
   * Alta por autoservicio desde el enlace público.
   *
   * Reutiliza la verificación por WhatsApp que ya protege las reservas: sin
   * código validado no se inscribe a nadie, o el club amanecería con inscripciones
   * de números inventados.
   *
   * Si el grupo está lleno NO falla: anota en lista de espera y lo dice. Devolver
   * un error "está lleno" y perder al interesado es justo lo que la lista de
   * espera existe para evitar.
   */
  async publicEnroll(
    restaurantId: string,
    input: { groupId: string; name: string; phone: string; level?: number | null; birthDate?: string | null; guardianName?: string | null; guardianPhone?: string | null; medicalNotes?: string | null },
  ) {
    const group = await prisma.clubClassGroup.findFirst({
      where: { id: input.groupId, restaurantId, status: 'ACTIVE' },
      include: { coach: true },
    });
    if (!group) throw notFound('Ese grupo no existe o no está abierto.');

    const verified = await clubPlayerService.hasRecentVerification(restaurantId, input.phone);
    if (!verified) throw badRequest('Verifica tu número con el código que te enviamos por WhatsApp.');

    const blocked = await clubPlayerService.isBlacklisted(restaurantId, input.phone);
    if (blocked) throw forbidden('No puedes inscribirte por internet. Comunícate con el club.');

    // El alumno es un Customer, como en todo el sistema: si ya reservó cancha
    // alguna vez, se reusa su ficha en vez de partirle el historial.
    await customerService.upsertFromOrder(restaurantId, { name: input.name, phone: input.phone });
    const customer = await prisma.customer.findUnique({
      where: { restaurantId_phone: { restaurantId, phone: input.phone } },
      select: { id: true },
    });
    if (!customer) throw badRequest('No se pudo registrar el alumno.');

    const student =
      (await prisma.clubStudent.findUnique({ where: { customerId: customer.id } })) ??
      (await prisma.clubStudent.create({
        data: {
          restaurantId,
          customerId: customer.id,
          level: input.level != null ? new Prisma.Decimal(input.level) : null,
          birthDate: input.birthDate ? atTimeCaracas(input.birthDate, '00:00') : null,
          guardianName: input.guardianName ?? null,
          guardianPhone: input.guardianPhone ?? null,
          medicalNotes: input.medicalNotes ?? null,
          accessToken: nanoid(14),
        },
      }));

    const already = await prisma.clubEnrollment.findFirst({
      where: { groupId: group.id, studentId: student.id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (already) {
      return { status: 'ALREADY' as const, accessToken: student.accessToken, groupName: group.name };
    }

    // ¿Hay puesto en la próxima clase?
    const nextSession = await prisma.clubClassSession.findFirst({
      where: { groupId: group.id, startsAt: { gt: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      orderBy: { startsAt: 'asc' },
    });
    const seats = nextSession ? await occupiedSeats(nextSession) : 0;
    const full = nextSession ? seats >= group.capacityMax : false;

    if (full) {
      await this.joinWaitlist(restaurantId, group.id, student.id, 'Solicitud desde el enlace público');
      await academyNotifier.enrollmentRequested(restaurantId, input.phone, input.name, group.name, true);
      return { status: 'WAITLISTED' as const, accessToken: student.accessToken, groupName: group.name };
    }

    await this.createEnrollment(restaurantId, {
      studentId: student.id,
      groupId: group.id,
      billingMode: group.priceMonthlyBase ? 'MONTHLY' : 'PER_CLASS',
      // La regla de nivel no bloquea al que se inscribe solo: se anota el motivo y
      // el club decide. Rechazarlo en la web, sin nadie a quien explicarle, se
      // traduce en un alumno perdido.
      levelOverrideReason: 'Inscripción por autoservicio',
    } as never);
    await academyNotifier.enrollmentRequested(restaurantId, input.phone, input.name, group.name, false);
    return { status: 'ENROLLED' as const, accessToken: student.accessToken, groupName: group.name };
  },

  async updateEnrollment(restaurantId: string, id: string, input: UpdateEnrollmentInput) {
    const enrollment = await prisma.clubEnrollment.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!enrollment) throw notFound('La inscripción no existe o no pertenece a este club.');
    return prisma.clubEnrollment.update({
      where: { id },
      data: {
        ...input,
        endsAt: input.endsAt !== undefined ? (input.endsAt ? atTimeCaracas(input.endsAt, '23:59') : null) : undefined,
      },
    });
  },

  // ---------------------------------------------------------------- Dashboard
  /**
   * Resumen del panel. Aprovecha para correr los tres barridos perezosos: cerrar
   * clases pasadas, liberar las que no llegaron a cupo y soltar los holds
   * vencidos. Mismo patrón que getCalendar con settlePastBookings — este
   * proyecto prefiere esto a un cron.
   */
  async dashboard(restaurantId: string) {
    await this.settlePastSessions(restaurantId);
    await this.expirePrivateHolds(restaurantId);
    await this.releaseUnderfilledSessions(restaurantId);
    await this.extendHorizon(restaurantId);
    // Liberar una sesión o dar de baja a alguien abre puestos: hay que avisarle al
    // que espera en el mismo barrido, o se enteraría días después.
    await this.offerWaitlistSeats(restaurantId).catch(() => undefined);

    const now = new Date();
    const { dateStr } = caracasPartsOf(now);
    const dayStart = atTimeCaracas(dateStr, '00:00');
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const [todaySessions, needsCourt, activeStudents, activeGroups, pendingCharges, waitlistCount] = await Promise.all([
      prisma.clubClassSession.findMany({
        where: { restaurantId, startsAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ['CANCELLED'] } },
        orderBy: { startsAt: 'asc' },
        include: {
          coach: { select: { displayName: true } },
          court: { select: { name: true } },
          group: { select: { name: true } },
          _count: { select: { attendances: true } },
        },
      }),
      prisma.clubClassSession.count({ where: { restaurantId, status: 'NEEDS_COURT' } }),
      prisma.clubStudent.count({ where: { restaurantId, active: true } }),
      prisma.clubClassGroup.count({ where: { restaurantId, status: 'ACTIVE' } }),
      prisma.clubAcademyCharge.aggregate({
        where: { restaurantId, status: { in: ['PENDING', 'OVERDUE'] } },
        _sum: { amountBase: true },
        _count: true,
      }),
      prisma.clubWaitlistEntry.count({ where: { restaurantId, status: { in: ['WAITING', 'OFFERED'] } } }),
    ]);

    return {
      todaySessions,
      needsCourt,
      activeStudents,
      activeGroups,
      waitlistCount,
      pendingCharges: {
        count: pendingCharges._count,
        amountBase: (pendingCharges._sum.amountBase ?? toDecimal(0)).toFixed(2),
      },
    };
  },

  occupiedSeats,
  getSettingsRaw: getSettings,
};

export type { ClubClassSessionStatus };
