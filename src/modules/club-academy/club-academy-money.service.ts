import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { atTimeCaracas, caracasPartsOf } from '../../utils/timezone';
import { CURRENCY_SYMBOLS, round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { academyNotifier } from './club-academy.notify';
import type {
  AdjustCreditsInput,
  GenerateChargesInput,
  ListChargesQuery,
  PayoutInput,
  RecordPaymentInput,
  SellPackageInput,
  UpdatePackageInput,
} from './club-academy.dto';

async function rateFor(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    select: { baseCurrency: true },
  });
  const rate = await exchangeRateService.getRate(restaurant.baseCurrency, restaurantId);
  return { rateBs: new Prisma.Decimal(rate.rateBs), symbol: CURRENCY_SYMBOLS[restaurant.baseCurrency] };
}

export const clubAcademyMoneyService = {
  // -------------------------------------------------------------------- Fichas
  /**
   * Saldo de fichas: SUM(delta) del libro mayor, nunca un contador guardado.
   * Un contador se desincroniza en el primer error a mitad de transacción y deja
   * al alumno con clases pagadas que no puede usar, sin rastro de dónde se
   * perdieron.
   */
  async creditBalance(restaurantId: string, studentId: string): Promise<number> {
    const agg = await prisma.clubClassCreditEntry.aggregate({
      where: { restaurantId, studentId },
      _sum: { delta: true },
    });
    return agg._sum.delta ?? 0;
  },

  async creditLedger(restaurantId: string, studentId: string) {
    return prisma.clubClassCreditEntry.findMany({
      where: { restaurantId, studentId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { session: { select: { startsAt: true } }, package: { select: { name: true } } },
    });
  },

  /**
   * Caduca las fichas vencidas escribiendo una entrada NEGATIVA, en vez de
   * filtrarlas por fecha al leer: así el saldo sigue siendo una suma plana sin
   * lógica de fechas repartida por diez consultas, y el vencimiento queda
   * auditable. Perezoso, como el resto de barridos del vertical.
   *
   * Idempotente: solo caduca lo que ese paquete aportó y aún no se ha caducado.
   */
  async sweepExpiredCredits(restaurantId: string) {
    const now = new Date();
    const expired = await prisma.clubClassPackage.findMany({
      where: { restaurantId, expiresAt: { lt: now } },
      select: { id: true, studentId: true, totalClasses: true },
    });
    if (!expired.length) return { expired: 0 };

    let count = 0;
    for (const pkg of expired) {
      const moves = await prisma.clubClassCreditEntry.aggregate({
        where: { packageId: pkg.id },
        _sum: { delta: true },
      });
      const remaining = moves._sum.delta ?? 0;
      if (remaining <= 0) continue; // ya se gastó o ya se caducó

      await prisma.clubClassCreditEntry.create({
        data: {
          restaurantId,
          studentId: pkg.studentId,
          delta: -remaining,
          reason: 'EXPIRED',
          packageId: pkg.id,
          note: `Vencieron ${remaining} ficha(s) sin usar`,
        },
      });
      count++;
    }
    return { expired: count };
  },

  /** Ajuste manual. El motivo es obligatorio en el DTO: sin él, el libro mayor
   * deja de ser auditable, que es su única razón de existir. */
  async adjustCredits(restaurantId: string, studentId: string, input: AdjustCreditsInput) {
    const student = await prisma.clubStudent.findFirst({ where: { id: studentId, restaurantId }, select: { id: true } });
    if (!student) throw notFound('El alumno no existe o no pertenece a este club.');
    return prisma.clubClassCreditEntry.create({
      data: { restaurantId, studentId, delta: input.delta, reason: 'MANUAL_ADJUST', note: input.note },
    });
  },

  // --------------------------------------------------------------------- Lotes
  /**
   * Venta de un lote: «se cancela al momento de pagar y se va descontando como
   * crédito de uso».
   *
   * Todo en UNA transacción — el paquete, el dinero y las fichas. Si el pago se
   * registrara aparte y algo fallara en medio, el club habría cobrado sin
   * entregar fichas, o al revés.
   *
   * El lote además RESERVA una silla recurrente (`slotId` + `holdsSeat`): el
   * alumno escoge "todos los lunes 7pm" y ese puesto queda tomado durante meses,
   * por eso el cupo se cuenta hacia adelante y no solo por asistencias pasadas.
   */
  async sellPackage(restaurantId: string, input: SellPackageInput, userId?: string) {
    const student = await prisma.clubStudent.findFirst({
      where: { id: input.studentId, restaurantId },
      include: { customer: { select: { name: true } } },
    });
    if (!student) throw notFound('El alumno no existe o no pertenece a este club.');

    if (input.slotId) {
      const slot = await prisma.clubClassSlot.findFirst({
        where: { id: input.slotId, group: { restaurantId } },
        select: { id: true, groupId: true },
      });
      if (!slot) throw notFound('El horario elegido no existe o no pertenece a este club.');
      if (input.groupId && slot.groupId !== input.groupId) {
        throw badRequest('El horario elegido no es de ese grupo.');
      }
    }

    const settings = await prisma.clubAcademySettings.findUnique({ where: { restaurantId } });
    const expiryDays = settings?.creditExpiryDays ?? 90;
    const expiresAt = input.expiresAt
      ? atTimeCaracas(input.expiresAt, '23:59')
      : expiryDays
        ? new Date(Date.now() + expiryDays * 86_400_000)
        : null;

    const { rateBs } = await rateFor(restaurantId);
    const priceBase = new Prisma.Decimal(input.priceBase);
    // Congelado: es lo que va a valer cada ficha al gastarse, aunque mañana suba
    // el precio del lote.
    const pricePerClass = round2(priceBase.div(input.totalClasses));

    return prisma.$transaction(async (tx) => {
      const pkg = await tx.clubClassPackage.create({
        data: {
          restaurantId,
          studentId: input.studentId,
          name: input.name ?? `Lote de ${input.totalClasses} clases`,
          totalClasses: input.totalClasses,
          priceBase,
          pricePerClassBase: pricePerClass,
          groupId: input.groupId ?? null,
          slotId: input.slotId ?? null,
          holdsSeat: input.holdsSeat,
          expiresAt,
        },
      });

      const payment = await tx.clubAcademyPayment.create({
        data: {
          restaurantId,
          studentId: input.studentId,
          kind: 'PACKAGE',
          packageId: pkg.id,
          amountBase: priceBase,
          exchangeRate: rateBs,
          amountBs: round2(priceBase.mul(rateBs)),
          method: input.method,
          referenceNumber: input.referenceNumber ?? null,
          proofImageUrl: input.proofImageUrl ?? null,
          receivedByUserId: userId ?? null,
        },
      });

      await tx.clubClassCreditEntry.create({
        data: {
          restaurantId,
          studentId: input.studentId,
          delta: input.totalClasses,
          reason: 'PACKAGE_PURCHASE',
          packageId: pkg.id,
          expiresAt,
          note: pkg.name,
        },
      });

      return { package: pkg, payment };
    });
  },

  /** El vencimiento y la silla se pueden mover después: un alumno lesionado dos
   * meses no puede perder lo que pagó porque el plazo por defecto no lo preveía. */
  async updatePackage(restaurantId: string, id: string, input: UpdatePackageInput) {
    const pkg = await prisma.clubClassPackage.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!pkg) throw notFound('El lote no existe o no pertenece a este club.');
    const expiresAt =
      input.expiresAt !== undefined ? (input.expiresAt ? atTimeCaracas(input.expiresAt, '23:59') : null) : undefined;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.clubClassPackage.update({
        where: { id },
        data: { expiresAt, holdsSeat: input.holdsSeat, slotId: input.slotId },
      });
      // La entrada de compra lleva su propia fecha: si no se mueve también, el
      // barrido de caducidad seguiría usando la vieja.
      if (expiresAt !== undefined) {
        await tx.clubClassCreditEntry.updateMany({
          where: { packageId: id, reason: 'PACKAGE_PURCHASE' },
          data: { expiresAt },
        });
      }
      return updated;
    });
  },

  // -------------------------------------------------------------------- Cobros
  /**
   * Genera las mensualidades del mes. Idempotente por
   * @@unique([enrollmentId, periodYear, periodMonth]): se puede correr diez
   * veces el mismo día sin duplicarle la deuda a nadie.
   */
  async generateMonthlyCharges(restaurantId: string, input: GenerateChargesInput) {
    const now = new Date();
    const { dateStr } = caracasPartsOf(now);
    const [y, m] = dateStr.split('-').map(Number);
    const year = input.year ?? y;
    const month = input.month ?? m;

    const enrollments = await prisma.clubEnrollment.findMany({
      where: { restaurantId, status: 'ACTIVE', billingMode: 'MONTHLY' },
      include: { student: { include: { customer: { select: { name: true, phone: true } } } } },
    });

    let created = 0;
    for (const e of enrollments) {
      const day = Math.min(e.billingDay ?? 1, 28);
      const dueDate = atTimeCaracas(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, '23:59');
      try {
        await prisma.clubAcademyCharge.create({
          data: {
            restaurantId,
            enrollmentId: e.id,
            periodYear: year,
            periodMonth: month,
            amountBase: e.priceBase,
            dueDate,
          },
        });
        created++;
      } catch (err) {
        // P2002 = ya existía el cargo de ese mes. Es el caso normal al re-correr.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    return { created, total: enrollments.length };
  },

  async listCharges(restaurantId: string, query: ListChargesQuery) {
    return prisma.clubAcademyCharge.findMany({
      where: {
        restaurantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.year ? { periodYear: query.year } : {}),
        ...(query.month ? { periodMonth: query.month } : {}),
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { dueDate: 'asc' }],
      take: 300,
      include: {
        enrollment: {
          include: {
            student: { include: { customer: { select: { name: true, phone: true } } } },
            group: { select: { name: true } },
          },
        },
        payments: { select: { amountBase: true } },
      },
    });
  },

  /** Marca vencidos los cargos que pasaron su fecha. Perezoso. */
  async markOverdueCharges(restaurantId: string) {
    const r = await prisma.clubAcademyCharge.updateMany({
      where: { restaurantId, status: 'PENDING', dueDate: { lt: new Date() } },
      data: { status: 'OVERDUE' },
    });
    return { overdue: r.count };
  },

  /** Avisa por WhatsApp los cargos pendientes que aún no se notificaron. */
  async notifyPendingCharges(restaurantId: string) {
    const { rateBs, symbol } = await rateFor(restaurantId);
    const charges = await prisma.clubAcademyCharge.findMany({
      where: { restaurantId, status: { in: ['PENDING', 'OVERDUE'] }, notifiedAt: null },
      include: { enrollment: { include: { student: { include: { customer: true } } } } },
      take: 50,
    });

    let sent = 0;
    for (const c of charges) {
      const customer = c.enrollment.student.customer;
      const phone = c.enrollment.student.guardianPhone ?? customer.phone;
      const ok = await academyNotifier.chargeDue(
        restaurantId,
        phone,
        customer.name,
        c.amountBase.toFixed(2),
        round2(c.amountBase.mul(rateBs)).toFixed(2),
        symbol,
      );
      if (ok) {
        await prisma.clubAcademyCharge.update({ where: { id: c.id }, data: { notifiedAt: new Date() } });
        sent++;
      }
    }
    return { sent, total: charges.length };
  },

  /**
   * Registra un cobro. Es la fila que DEBE aparecer en collectPayments del
   * arqueo — si no, el club cierra la caja con diferencia todos los días.
   */
  async recordPayment(restaurantId: string, input: RecordPaymentInput, userId?: string) {
    const student = await prisma.clubStudent.findFirst({ where: { id: input.studentId, restaurantId }, select: { id: true } });
    if (!student) throw notFound('El alumno no existe o no pertenece a este club.');

    if (input.chargeId) {
      const charge = await prisma.clubAcademyCharge.findFirst({
        where: { id: input.chargeId, restaurantId },
        select: { id: true },
      });
      if (!charge) throw notFound('El cargo no existe o no pertenece a este club.');
    }

    const { rateBs } = await rateFor(restaurantId);
    const amountBase = new Prisma.Decimal(input.amountBase);

    return prisma.$transaction(async (tx) => {
      const payment = await tx.clubAcademyPayment.create({
        data: {
          restaurantId,
          studentId: input.studentId,
          kind: input.kind,
          chargeId: input.chargeId ?? null,
          sessionId: input.sessionId ?? null,
          amountBase,
          exchangeRate: rateBs,
          amountBs: round2(amountBase.mul(rateBs)),
          method: input.method,
          referenceNumber: input.referenceNumber ?? null,
          proofImageUrl: input.proofImageUrl ?? null,
          receivedByUserId: userId ?? null,
        },
      });

      // Un cargo se salda cuando lo cobrado alcanza su monto, no con el primer
      // abono: un pago parcial no puede marcarlo como pagado.
      if (input.chargeId) {
        const charge = await tx.clubAcademyCharge.findUniqueOrThrow({
          where: { id: input.chargeId },
          include: { payments: { select: { amountBase: true } } },
        });
        const paid = charge.payments.reduce((acc, p) => acc.add(p.amountBase), toDecimal(0));
        if (paid.gte(charge.amountBase)) {
          await tx.clubAcademyCharge.update({ where: { id: input.chargeId }, data: { status: 'PAID' } });
        }
      }

      return payment;
    });
  },

  async waiveCharge(restaurantId: string, id: string) {
    const charge = await prisma.clubAcademyCharge.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!charge) throw notFound('El cargo no existe o no pertenece a este club.');
    return prisma.clubAcademyCharge.update({ where: { id }, data: { status: 'WAIVED' } });
  },

  // -------------------------------------------------------------- Honorarios
  /** Lo que un profesor lleva ganado en un rango, con el detalle por clase. */
  async coachEarnings(restaurantId: string, coachId: string, from?: string, to?: string) {
    const start = from ? atTimeCaracas(from, '00:00') : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(atTimeCaracas(to, '00:00').getTime() + 86_400_000) : new Date();

    const sessions = await prisma.clubClassSession.findMany({
      where: { restaurantId, coachId, startsAt: { gte: start, lt: end }, status: 'DONE' },
      orderBy: { startsAt: 'desc' },
      include: {
        group: { select: { name: true } },
        attendances: { select: { status: true, consumedValueBase: true } },
      },
    });

    const total = sessions.reduce((acc, s) => acc.add(s.coachFeeBase ?? toDecimal(0)), toDecimal(0));
    const paid = await prisma.clubCoachPayout.aggregate({
      where: { restaurantId, coachId, periodStart: { gte: start }, periodEnd: { lte: end }, paidAt: { not: null } },
      _sum: { amountBase: true },
    });

    return {
      from: start,
      to: end,
      sessionsCount: sessions.length,
      totalBase: round2(total).toFixed(2),
      paidBase: round2(paid._sum.amountBase ?? toDecimal(0)).toFixed(2),
      pendingBase: round2(total.sub(paid._sum.amountBase ?? toDecimal(0))).toFixed(2),
      sessions,
    };
  },

  /**
   * Liquida honorarios de un período. Registra el gasto reutilizando la nómina
   * que ya existe (Movement EXPENSE/PAYROLL + EmployeePayment) para que el
   * honorario pese en el balance y en el arqueo, en vez de ser un gasto
   * invisible.
   */
  async payCoach(restaurantId: string, coachId: string, input: PayoutInput, userId?: string) {
    const coach = await prisma.clubCoach.findFirst({ where: { id: coachId, restaurantId } });
    if (!coach) throw notFound('El profesor no existe o no pertenece a este club.');

    const start = atTimeCaracas(input.from, '00:00');
    const end = new Date(atTimeCaracas(input.to, '00:00').getTime() + 86_400_000);

    const sessions = await prisma.clubClassSession.findMany({
      where: { restaurantId, coachId, startsAt: { gte: start, lt: end }, status: 'DONE' },
      select: { id: true, coachFeeBase: true },
    });
    const amount = round2(sessions.reduce((acc, s) => acc.add(s.coachFeeBase ?? toDecimal(0)), toDecimal(0)));
    if (amount.lte(0)) throw badRequest('No hay honorarios que liquidar en ese período.');

    return prisma.$transaction(async (tx) => {
      let movementId: string | null = null;
      let employeePaymentId: string | null = null;

      if (input.registerExpense) {
        const movement = await tx.movement.create({
          data: {
            restaurantId,
            type: 'EXPENSE',
            category: 'PAYROLL',
            amountBase: amount,
            description: `Honorarios academia — ${coach.displayName}`,
            paymentMethod: input.paymentMethod,
            expenseDate: new Date(),
            createdByUserId: userId ?? null,
          },
        });
        movementId = movement.id;

        if (coach.employeeId) {
          const ep = await tx.employeePayment.create({
            data: {
              restaurantId,
              employeeId: coach.employeeId,
              amountBase: amount,
              periodLabel: `${input.from} a ${input.to}`,
              paymentMethod: input.paymentMethod,
              movementId,
              createdByUserId: userId ?? null,
            },
          });
          employeePaymentId = ep.id;
        }
      }

      return tx.clubCoachPayout.create({
        data: {
          restaurantId,
          coachId,
          periodStart: start,
          periodEnd: end,
          sessionsCount: sessions.length,
          amountBase: amount,
          movementId,
          employeePaymentId,
          paidAt: new Date(),
        },
      });
    });
  },

  // ---------------------------------------------------------------- Reportes
  /** Rentabilidad por grupo: lo que entró menos lo que costó el profesor. */
  async revenueReport(restaurantId: string, from?: string, to?: string) {
    const start = from ? atTimeCaracas(from, '00:00') : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(atTimeCaracas(to, '00:00').getTime() + 86_400_000) : new Date();

    const [sessions, payments] = await Promise.all([
      prisma.clubClassSession.findMany({
        where: { restaurantId, startsAt: { gte: start, lt: end }, status: 'DONE' },
        include: {
          group: { select: { id: true, name: true } },
          attendances: { select: { status: true, consumedValueBase: true } },
        },
      }),
      prisma.clubAcademyPayment.aggregate({
        where: { restaurantId, createdAt: { gte: start, lt: end } },
        _sum: { amountBase: true },
        _count: true,
      }),
    ]);

    const byGroup = new Map<string, { name: string; sessions: number; consumed: Prisma.Decimal; coachCost: Prisma.Decimal }>();
    for (const s of sessions) {
      const key = s.groupId ?? 'sueltas';
      const name = s.group?.name ?? 'Clases sueltas';
      const row = byGroup.get(key) ?? { name, sessions: 0, consumed: toDecimal(0), coachCost: toDecimal(0) };
      row.sessions++;
      row.consumed = row.consumed.add(
        s.attendances
          .filter((a) => a.status === 'PRESENT' || a.status === 'MAKEUP')
          .reduce((acc, a) => acc.add(a.consumedValueBase), toDecimal(0)),
      );
      row.coachCost = row.coachCost.add(s.coachFeeBase ?? toDecimal(0));
      byGroup.set(key, row);
    }

    return {
      from: start,
      to: end,
      collectedBase: round2(payments._sum.amountBase ?? toDecimal(0)).toFixed(2),
      paymentsCount: payments._count,
      groups: [...byGroup.entries()].map(([id, r]) => ({
        groupId: id,
        name: r.name,
        sessions: r.sessions,
        consumedBase: round2(r.consumed).toFixed(2),
        coachCostBase: round2(r.coachCost).toFixed(2),
        marginBase: round2(r.consumed.sub(r.coachCost)).toFixed(2),
      })),
    };
  },

  /**
   * Retención y churn, mes a mes.
   *
   * Se calcula de las FECHAS de la inscripción (startsAt / endsAt / status), no de
   * un contador de bajas: un contador solo sabe el total de hoy, y la pregunta es
   * cuántos se fueron en marzo. Con las fechas se puede reconstruir cualquier mes
   * pasado, incluso meses que ya ocurrieron antes de que existiera este reporte.
   *
   * Activo en el mes = empezó antes de que terminara el mes y no se había ido
   * antes de que empezara. Churn = los que se fueron ese mes sobre los que había
   * al empezarlo.
   */
  async retentionReport(restaurantId: string, months = 6) {
    const enrollments = await prisma.clubEnrollment.findMany({
      where: { restaurantId },
      select: { startsAt: true, endsAt: true, status: true, studentId: true },
    });

    const now = new Date();
    const rows: {
      period: string;
      activeStart: number;
      joined: number;
      left: number;
      activeEnd: number;
      churnPercent: number | null;
      retentionPercent: number | null;
    }[] = [];

    for (let i = months - 1; i >= 0; i -= 1) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));

      /** Cuándo dejó de estar activa esa inscripción, si dejó de estarlo. */
      const leftAt = (e: (typeof enrollments)[number]) =>
        e.status === 'CANCELLED' || e.status === 'FINISHED' ? (e.endsAt ?? null) : null;

      const activeStart = enrollments.filter((e) => {
        const out = leftAt(e);
        return e.startsAt < monthStart && (!out || out >= monthStart);
      }).length;

      const joined = enrollments.filter((e) => e.startsAt >= monthStart && e.startsAt < monthEnd).length;

      const left = enrollments.filter((e) => {
        const out = leftAt(e);
        return out && out >= monthStart && out < monthEnd;
      }).length;

      const activeEnd = activeStart + joined - left;

      rows.push({
        period: `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`,
        activeStart,
        joined,
        left,
        activeEnd,
        // Sin nadie al empezar el mes no hay churn que medir. Devuelve null y no 0:
        // "0% de bajas" y "no había a quién perder" son cosas distintas, y mostrar
        // 0% en un club que recién arranca haría creer que retiene perfecto.
        churnPercent: activeStart > 0 ? Math.round((left / activeStart) * 100) : null,
        retentionPercent: activeStart > 0 ? Math.round(((activeStart - left) / activeStart) * 100) : null,
      });
    }

    const activeNow = enrollments.filter((e) => e.status === 'ACTIVE').length;
    const last = rows[rows.length - 1];

    return {
      months: rows,
      activeNow,
      currentChurnPercent: last?.churnPercent ?? null,
      currentRetentionPercent: last?.retentionPercent ?? null,
    };
  },

  /**
   * Facturación generada por cada entrenador y por cada programa.
   *
   * Ojo con la diferencia: `coachEarnings` dice lo que se le PAGA al profesor;
   * esto dice lo que su clase FACTURÓ. Son cifras distintas y confundirlas haría
   * ver rentable a un profesor caro que llena poco.
   *
   * El ingreso atribuido sale de `consumedValueBase` de las asistencias — la
   * columna que ya congela, en cada silla, la plata que consumió (ver §0.5 del
   * diseño). Es lo único que permite repartir una mensualidad entre las clases
   * que de verdad se dieron.
   */
  async revenueByCoachAndProgram(restaurantId: string, from?: string, to?: string) {
    const start = from ? atTimeCaracas(from, '00:00') : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(atTimeCaracas(to, '00:00').getTime() + 86_400_000) : new Date();

    const sessions = await prisma.clubClassSession.findMany({
      where: { restaurantId, startsAt: { gte: start, lt: end }, status: 'DONE' },
      include: {
        coach: { select: { id: true, displayName: true } },
        group: { select: { id: true, name: true, program: { select: { id: true, name: true } } } },
        attendances: { select: { status: true, consumedValueBase: true } },
      },
    });

    const billed = (s: (typeof sessions)[number]) =>
      s.attendances
        .filter((a) => a.status === 'PRESENT' || a.status === 'MAKEUP')
        .reduce((acc, a) => acc.add(a.consumedValueBase), toDecimal(0));

    const byCoach = new Map<string, { id: string; name: string; sessions: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();
    const byProgram = new Map<string, { id: string; name: string; sessions: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }>();

    for (const s of sessions) {
      const rev = billed(s);
      const cost = s.coachFeeBase ?? toDecimal(0);

      const c = byCoach.get(s.coachId) ?? {
        id: s.coachId,
        name: s.coach.displayName,
        sessions: 0,
        revenue: toDecimal(0),
        cost: toDecimal(0),
      };
      c.sessions += 1;
      c.revenue = c.revenue.add(rev);
      c.cost = c.cost.add(cost);
      byCoach.set(s.coachId, c);

      const pid = s.group?.program?.id ?? 'sin-programa';
      const p = byProgram.get(pid) ?? {
        id: pid,
        name: s.group?.program?.name ?? 'Sin programa',
        sessions: 0,
        revenue: toDecimal(0),
        cost: toDecimal(0),
      };
      p.sessions += 1;
      p.revenue = p.revenue.add(rev);
      p.cost = p.cost.add(cost);
      byProgram.set(pid, p);
    }

    const shape = (m: Map<string, { id: string; name: string; sessions: number; revenue: Prisma.Decimal; cost: Prisma.Decimal }>) =>
      [...m.values()]
        .map((r) => ({
          id: r.id,
          name: r.name,
          sessions: r.sessions,
          revenueBase: round2(r.revenue).toFixed(2),
          costBase: round2(r.cost).toFixed(2),
          marginBase: round2(r.revenue.sub(r.cost)).toFixed(2),
        }))
        .sort((a, b) => Number(b.revenueBase) - Number(a.revenueBase));

    return { from: start, to: end, byCoach: shape(byCoach), byProgram: shape(byProgram) };
  },

  async attendanceReport(restaurantId: string, from?: string, to?: string) {
    const start = from ? atTimeCaracas(from, '00:00') : new Date(Date.now() - 30 * 86_400_000);
    const end = to ? new Date(atTimeCaracas(to, '00:00').getTime() + 86_400_000) : new Date();

    const rows = await prisma.clubAttendance.findMany({
      where: { session: { restaurantId, startsAt: { gte: start, lt: end } } },
      include: { student: { include: { customer: { select: { name: true } } } } },
    });

    const byStudent = new Map<string, { name: string; present: number; absent: number; justified: number }>();
    for (const r of rows) {
      const row = byStudent.get(r.studentId) ?? { name: r.student.customer.name, present: 0, absent: 0, justified: 0 };
      if (r.status === 'PRESENT' || r.status === 'MAKEUP') row.present++;
      else if (r.status === 'ABSENT') row.absent++;
      else row.justified++;
      byStudent.set(r.studentId, row);
    }

    return [...byStudent.entries()]
      .map(([studentId, r]) => ({
        studentId,
        ...r,
        attendanceRate: r.present + r.absent > 0 ? Math.round((r.present / (r.present + r.absent)) * 100) : null,
      }))
      .sort((a, b) => b.absent - a.absent);
  },
};
