import { PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { baseToBs, bsToBase, round2, toDecimal } from '../../utils/money';
import { resolveDateFilter } from '../../utils/date-range';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import type {
  AdjustInput,
  BankTransactionQuery,
  CreateBankAccountInput,
  TransferInput,
  UpdateBankAccountInput,
} from './bank-account.dto';

/**
 * Cuentas bancarias y caja chica: el "dónde está la plata" del negocio. Los saldos los mueven
 * los asientos (BankTransaction) — cobros/gastos vía bank-ledger.service.ts, transferencias y
 * ajustes acá — siempre en la misma transacción, para que el saldo denormalizado nunca se
 * desincronice del libro.
 */

/** Un método de pago solo puede estar vinculado a UNA cuenta: si estuviera en dos, un cobro
 * no sabría a qué banco sumar. */
async function assertMethodsFree(restaurantId: string, methods: PaymentMethod[], excludeAccountId?: string) {
  if (methods.length === 0) return;
  const clash = await prisma.bankAccount.findFirst({
    where: {
      restaurantId,
      ...(excludeAccountId ? { id: { not: excludeAccountId } } : {}),
      paymentMethods: { hasSome: methods },
    },
    select: { name: true, paymentMethods: true },
  });
  if (clash) {
    const taken = methods.filter((m) => clash.paymentMethods.includes(m));
    throw badRequest(`${taken.join(', ')} ya está vinculado a la cuenta "${clash.name}". Quítalo de allá primero.`);
  }
}

async function getRateBs(restaurantId: string): Promise<Prisma.Decimal> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
  const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', restaurantId);
  return toDecimal(rate.rateBs);
}

export const bankAccountService = {
  async list(restaurantId: string) {
    const accounts = await prisma.bankAccount.findMany({
      where: { restaurantId },
      orderBy: [{ isPettyCash: 'desc' }, { createdAt: 'asc' }],
    });
    return accounts.map((a) => ({
      id: a.id,
      name: a.name,
      currency: a.currency,
      isPettyCash: a.isPettyCash,
      paymentMethods: a.paymentMethods,
      balance: a.balance.toFixed(2),
      createdAt: a.createdAt,
    }));
  },

  async create(restaurantId: string, userId: string | undefined, input: CreateBankAccountInput) {
    await assertMethodsFree(restaurantId, input.paymentMethods);
    const initial = round2(toDecimal(input.initialBalance ?? 0));
    // amountBase del saldo inicial: para cuentas Bs se convierte con la tasa del día — es
    // informativo (totalizar $ y Bs juntos), el saldo real de la cuenta va en su moneda.
    const rateBs = input.currency === 'BS' && initial.gt(0) ? await getRateBs(restaurantId) : null;

    return prisma.$transaction(async (tx) => {
      const account = await tx.bankAccount.create({
        data: {
          restaurantId,
          name: input.name,
          currency: input.currency,
          isPettyCash: input.isPettyCash,
          paymentMethods: input.paymentMethods,
          balance: initial,
        },
      });
      if (initial.gt(0)) {
        await tx.bankTransaction.create({
          data: {
            restaurantId,
            accountId: account.id,
            type: 'CREDIT',
            amount: initial,
            amountBase: input.currency === 'BS' ? round2(bsToBase(initial, rateBs!)) : initial,
            description: 'Saldo inicial',
            createdByUserId: userId ?? null,
          },
        });
      }
      return account;
    });
  },

  async update(restaurantId: string, id: string, input: UpdateBankAccountInput) {
    const existing = await prisma.bankAccount.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Cuenta no encontrada.');
    if (input.paymentMethods) await assertMethodsFree(restaurantId, input.paymentMethods, id);
    return prisma.bankAccount.update({
      where: { id },
      data: { name: input.name, isPettyCash: input.isPettyCash, paymentMethods: input.paymentMethods },
    });
  },

  /** Borra la cuenta y su libro (cascade). El dinero "registrado" no se mueve a ningún lado —
   * es un borrado administrativo, para cuentas creadas por error. */
  async remove(restaurantId: string, id: string) {
    const existing = await prisma.bankAccount.findFirst({ where: { id, restaurantId }, select: { id: true } });
    if (!existing) throw notFound('Cuenta no encontrada.');
    await prisma.bankAccount.delete({ where: { id } });
    return { deleted: true };
  },

  async transactions(restaurantId: string, accountId: string, query: BankTransactionQuery) {
    const account = await prisma.bankAccount.findFirst({ where: { id: accountId, restaurantId } });
    if (!account) throw notFound('Cuenta no encontrada.');
    const rows = await prisma.bankTransaction.findMany({
      where: { restaurantId, accountId, createdAt: resolveDateFilter({ range: query.range, date: query.date }) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    // Nombres de las contrapartes de transferencias, para "Transferencia a/desde X".
    const counterpartIds = [...new Set(rows.map((r) => r.counterpartAccountId).filter(Boolean))] as string[];
    const counterparts = counterpartIds.length
      ? await prisma.bankAccount.findMany({ where: { id: { in: counterpartIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(counterparts.map((c) => [c.id, c.name]));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount.toFixed(2),
      amountBase: r.amountBase.toFixed(2),
      description: r.description,
      paymentMethod: r.paymentMethod,
      counterpartName: r.counterpartAccountId ? (nameById.get(r.counterpartAccountId) ?? null) : null,
      createdAt: r.createdAt,
    }));
  },

  /** Transferencia entre cuentas propias (ej. caja chica → banco, o banco $ → banco Bs con
   * conversión a la tasa BCV del momento). Dos asientos espejados en la misma transacción. */
  async transfer(restaurantId: string, userId: string | undefined, input: TransferInput) {
    if (input.fromId === input.toId) throw badRequest('Elige dos cuentas distintas.');
    const [from, to] = await Promise.all([
      prisma.bankAccount.findFirst({ where: { id: input.fromId, restaurantId } }),
      prisma.bankAccount.findFirst({ where: { id: input.toId, restaurantId } }),
    ]);
    if (!from || !to) throw notFound('Cuenta no encontrada.');

    const amountFrom = round2(toDecimal(input.amount));
    if (from.balance.lt(amountFrom)) {
      throw badRequest(`Saldo insuficiente en "${from.name}" (disponible: ${from.balance.toFixed(2)}).`);
    }

    // Todo pasa por moneda base para cruzar monedas: Bs→base→Bs con la tasa del día.
    const needsRate = from.currency === 'BS' || to.currency === 'BS';
    const rateBs = needsRate ? await getRateBs(restaurantId) : null;
    const amountBase = from.currency === 'BS' ? round2(bsToBase(amountFrom, rateBs!)) : amountFrom;
    const amountTo = to.currency === from.currency ? amountFrom : to.currency === 'BS' ? round2(baseToBs(amountBase, rateBs!)) : amountBase;

    const note = input.note?.trim();
    return prisma.$transaction(async (tx) => {
      await tx.bankTransaction.create({
        data: {
          restaurantId,
          accountId: from.id,
          type: 'TRANSFER_OUT',
          amount: amountFrom,
          amountBase,
          description: note || `Transferencia a ${to.name}`,
          counterpartAccountId: to.id,
          createdByUserId: userId ?? null,
        },
      });
      await tx.bankTransaction.create({
        data: {
          restaurantId,
          accountId: to.id,
          type: 'TRANSFER_IN',
          amount: amountTo,
          amountBase,
          description: note || `Transferencia desde ${from.name}`,
          counterpartAccountId: from.id,
          createdByUserId: userId ?? null,
        },
      });
      await tx.bankAccount.update({ where: { id: from.id }, data: { balance: { decrement: amountFrom } } });
      await tx.bankAccount.update({ where: { id: to.id }, data: { balance: { increment: amountTo } } });
      return { fromId: from.id, toId: to.id, amountFrom: amountFrom.toFixed(2), amountTo: amountTo.toFixed(2) };
    });
  },

  /** Ajuste manual (conciliación contra el saldo real del banco), en la moneda de la cuenta. */
  async adjust(restaurantId: string, userId: string | undefined, accountId: string, input: AdjustInput) {
    const account = await prisma.bankAccount.findFirst({ where: { id: accountId, restaurantId } });
    if (!account) throw notFound('Cuenta no encontrada.');
    const amount = round2(toDecimal(input.amount));
    if (input.direction === 'DEBIT' && account.balance.lt(amount)) {
      throw badRequest(`El ajuste dejaría la cuenta en negativo (saldo: ${account.balance.toFixed(2)}).`);
    }
    const amountBase = account.currency === 'BS' ? round2(bsToBase(amount, await getRateBs(restaurantId))) : amount;
    return prisma.$transaction(async (tx) => {
      await tx.bankTransaction.create({
        data: {
          restaurantId,
          accountId,
          type: input.direction,
          amount,
          amountBase,
          description: input.note?.trim() || 'Ajuste manual',
          createdByUserId: userId ?? null,
        },
      });
      return tx.bankAccount.update({
        where: { id: accountId },
        data: { balance: input.direction === 'CREDIT' ? { increment: amount } : { decrement: amount } },
      });
    });
  },
};
