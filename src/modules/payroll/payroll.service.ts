import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import type { CreateEmployeeInput, PayEmployeeInput, UpdateEmployeeInput } from './payroll.dto';

/**
 * ============================================================================
 *  Nómina
 * ============================================================================
 *  Lista del personal y registro de lo que se le paga. Cada pago genera además
 *  un `Movement` de tipo EXPENSE con categoría PAYROLL: si la nómina no pesara
 *  en el balance ni en el arqueo de caja, el negocio se vería más rentable de
 *  lo que es, que es el error más caro que puede cometer un dueño.
 *
 *  El personal es una lista aparte de `User` a propósito — ver el comentario del
 *  modelo Employee.
 */

async function list(restaurantId: string, includeInactive = false) {
  const employees = await prisma.employee.findMany({
    where: { restaurantId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      payments: {
        orderBy: { paidAt: 'desc' },
        take: 6,
        select: {
          id: true,
          amountBase: true,
          periodLabel: true,
          paidAt: true,
          paymentMethod: true,
          exchangeRate: true,
          totalBs: true,
        },
      },
    },
  });

  return employees.map((e) => ({
    ...e,
    // Lo pagado en los últimos 30 días: es lo que se necesita ver para decidir si a alguien
    // ya se le pagó el mes, sin abrir su historial completo.
    paidLast30: round2(
      e.payments
        .filter((p) => p.paidAt.getTime() >= Date.now() - 30 * 24 * 60 * 60 * 1000)
        .reduce((acc, p) => acc.add(p.amountBase), toDecimal(0)),
    ).toFixed(2),
  }));
}

async function create(restaurantId: string, input: CreateEmployeeInput) {
  return prisma.employee.create({
    data: {
      restaurantId,
      name: input.name,
      position: input.position ?? null,
      phone: input.phone ?? null,
      idNumber: input.idNumber ?? null,
      salaryBase: input.salaryBase ?? null,
      hireDate: input.hireDate ?? null,
    },
  });
}

async function update(restaurantId: string, id: string, input: UpdateEmployeeInput) {
  const existing = await prisma.employee.findFirst({ where: { id, restaurantId }, select: { id: true } });
  if (!existing) throw notFound('Empleado no encontrado.');
  return prisma.employee.update({ where: { id }, data: input });
}

/** Desactivar y no borrar: el historial de pagos tiene que sobrevivir a que alguien se vaya. */
async function deactivate(restaurantId: string, id: string) {
  const existing = await prisma.employee.findFirst({ where: { id, restaurantId }, select: { id: true } });
  if (!existing) throw notFound('Empleado no encontrado.');
  return prisma.employee.update({ where: { id }, data: { active: false } });
}

/**
 * Registra un pago de nómina: crea el gasto y el pago en la misma transacción, para que no
 * pueda quedar un pago sin su egreso (o al revés) si algo falla a mitad de camino.
 */
async function pay(restaurantId: string, employeeId: string, userId: string | undefined, input: PayEmployeeInput) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, restaurantId }, select: { id: true, name: true } });
  if (!employee) throw notFound('Empleado no encontrado.');
  if (input.amountBase <= 0) throw badRequest('El monto debe ser mayor a 0.');

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
  // Tasa vigente al momento del pago, congelada — igual que Order.exchangeRate/totalBs — así el
  // historial no cambia si la tasa sube después. Se guarda siempre (no solo en métodos "en Bs")
  // porque sirve de referencia aunque se haya pagado en la moneda base.
  const rate = restaurant ? await exchangeRateService.getRate(restaurant.baseCurrency, restaurantId) : null;
  const totalBs = rate ? round2(toDecimal(input.amountBase).mul(rate.rateBs)) : null;

  return prisma.$transaction(async (tx) => {
    const description = `Nómina · ${employee.name}${input.periodLabel ? ` · ${input.periodLabel}` : ''}`;
    const movement = await tx.movement.create({
      data: {
        restaurantId,
        type: 'EXPENSE',
        amountBase: input.amountBase,
        description,
        category: 'PAYROLL',
        paymentMethod: input.paymentMethod ?? null,
        createdByUserId: userId,
      },
    });

    return tx.employeePayment.create({
      data: {
        restaurantId,
        employeeId: employee.id,
        amountBase: input.amountBase,
        periodLabel: input.periodLabel ?? null,
        paymentMethod: input.paymentMethod ?? null,
        note: input.note ?? null,
        movementId: movement.id,
        createdByUserId: userId,
        exchangeRate: rate?.rateBs ?? null,
        totalBs,
      },
    });
  });
}

/** Historial completo de pagos de un empleado. */
async function payments(restaurantId: string, employeeId: string) {
  return prisma.employeePayment.findMany({
    where: { restaurantId, employeeId },
    orderBy: { paidAt: 'desc' },
    take: 100,
  });
}

export const payrollService = { list, create, update, deactivate, pay, payments };
