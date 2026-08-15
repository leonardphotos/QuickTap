import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { baseToBs, bsToBase, round2, toDecimal } from '../../utils/money';
import { ReportRange, resolveDateFilter } from '../../utils/date-range';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { bankLedgerService } from '../bank-accounts/bank-ledger.service';
import { CreateMovementInput, MovementQuery, UpdateMovementInput } from './movement.dto';

export const movementService = {
  /** Botón "Añadir movimiento" / módulo de Gastos: ingreso/egreso manual, opcionalmente con
   * categoría, proveedor, reabastecimiento de inventario y marca de "a crédito". */
  async create(restaurantId: string, userId: string | undefined, input: CreateMovementInput) {
    let amountBase = toDecimal(input.amountBase);
    if (input.amountCurrency === 'BS') {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
      const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', restaurantId);
      amountBase = bsToBase(input.amountBase, rate.rateBs);
    }

    // El proveedor es opcional, pero si viene tiene que ser de este restaurante — si no se
    // valida, un id de proveedor de otro restaurante queda enlazado igual (y su nombre/
    // teléfono/RIF se filtran de vuelta en list()/getById() vía el include de abajo).
    if (input.supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, restaurantId } });
      if (!supplier) throw notFound('El proveedor no existe o no pertenece a este restaurante.');
    }

    return prisma.$transaction(async (tx) => {
      const movement = await tx.movement.create({
        data: {
          restaurantId,
          type: input.type,
          amountBase,
          description: input.description,
          createdByUserId: userId,
          incomeCategory: input.incomeCategory,
          paymentMethod: input.paymentMethod,
          category: input.category,
          supplierId: input.supplierId,
          inventoryItemId: input.inventoryItemId,
          inventoryQuantity: input.inventoryQuantity,
          isCredit: input.isCredit,
          // Se guarda a mediodía para que el gasto no se corra de día al mostrarlo en otra
          // zona horaria (a las 00:00 UTC, en Venezuela caería el día anterior).
          expenseDate: input.expenseDate ? new Date(`${input.expenseDate}T12:00:00`) : undefined,
          referenceNumber: input.referenceNumber,
          receiptImageUrl: input.receiptImageUrl,
          spentByName: input.spentByName,
          quoteImageUrl: input.quoteImageUrl,
          paymentProofImageUrl: input.paymentProofImageUrl,
          notes: input.notes,
          documentType: input.documentType,
          isRecurring: input.isRecurring,
          // Mediodía por la misma razón que expenseDate: que no se corra de día en otra zona horaria.
          invoiceDueDate: input.invoiceDueDate ? new Date(`${input.invoiceDueDate}T12:00:00`) : undefined,
        },
        include: { createdByUser: { select: { name: true } }, supplier: true, inventoryItem: true },
      });

      // Reabastecimiento automático: llegó el insumo, se suma a la cantidad disponible.
      if (input.inventoryItemId && input.inventoryQuantity) {
        const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, restaurantId } });
        if (!item) throw notFound('El insumo no existe o no pertenece a este restaurante.');
        await tx.inventoryItem.update({
          where: { id: input.inventoryItemId },
          data: { quantity: { increment: input.inventoryQuantity } },
        });
      }

      // Cuentas bancarias: un ingreso con método suma a la cuenta vinculada; un gasto pagado
      // de contado resta. Un gasto A CRÉDITO no mueve dinero todavía — lo hará su orden de pago.
      if (input.paymentMethod && (input.type === 'INCOME' || !input.isCredit)) {
        await bankLedgerService.applyMethodPayment(tx, {
          restaurantId,
          method: input.paymentMethod,
          direction: input.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
          amountBase,
          bankAccountId: input.bankAccountId,
          description: `${input.type === 'INCOME' ? 'Ingreso' : 'Gasto'}: ${input.description}`,
          movementId: movement.id,
          createdByUserId: userId ?? null,
        });
      }

      return movement;
    });
  },

  /** Lista de movimientos + totales del período, para Administración → Resumen y el módulo de Gastos. */
  async list(restaurantId: string, query: MovementQuery) {
    const where = query.onlyPendingCredit
      ? { restaurantId, isCredit: true, creditPaidAt: null }
      : {
          restaurantId,
          createdAt: resolveDateFilter({ range: query.range, date: query.date }),
          category: query.category,
          supplierId: query.supplierId,
        };

    const movements = await prisma.movement.findMany({
      where,
      orderBy: { createdAt: query.onlyPendingCredit ? 'asc' : 'desc' },
      include: { createdByUser: { select: { name: true } }, supplier: true, inventoryItem: true },
    });

    const totalIncome = round2(
      movements.filter((m) => m.type === 'INCOME').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const totalExpense = round2(
      movements.filter((m) => m.type === 'EXPENSE').reduce((acc, m) => acc.add(m.amountBase), toDecimal(0)),
    );
    const net = round2(totalIncome.sub(totalExpense));

    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
    const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', restaurantId);

    return {
      totalIncome: totalIncome.toFixed(2),
      totalExpense: totalExpense.toFixed(2),
      net: net.toFixed(2),
      totalIncomeBs: baseToBs(totalIncome, rate.rateBs).toFixed(2),
      totalExpenseBs: baseToBs(totalExpense, rate.rateBs).toFixed(2),
      netBs: baseToBs(net, rate.rateBs).toFixed(2),
      movements: movements.map((m) => ({
        id: m.id,
        type: m.type,
        amountBase: m.amountBase.toFixed(2),
        description: m.description,
        incomeCategory: m.incomeCategory,
        paymentMethod: m.paymentMethod,
        category: m.category,
        supplier: m.supplier ? { id: m.supplier.id, name: m.supplier.name, taxId: m.supplier.taxId } : null,
        inventoryItem: m.inventoryItem ? { id: m.inventoryItem.id, name: m.inventoryItem.name } : null,
        inventoryQuantity: m.inventoryQuantity?.toFixed(2) ?? null,
        isCredit: m.isCredit,
        creditPaidAt: m.creditPaidAt,
        createdByName: m.createdByUser?.name ?? null,
        createdAt: m.createdAt,
        // Soporte del gasto (ver createMovementSchema): fecha real, referencia, recibo y quién gastó.
        expenseDate: m.expenseDate,
        referenceNumber: m.referenceNumber,
        receiptImageUrl: m.receiptImageUrl,
        spentByName: m.spentByName,
        quoteImageUrl: m.quoteImageUrl,
        paymentProofImageUrl: m.paymentProofImageUrl,
        notes: m.notes,
        documentType: m.documentType,
        isRecurring: m.isRecurring,
        invoiceDueDate: m.invoiceDueDate,
      })),
    };
  },

  /**
   * Gastos fijos del período, agrupados por categoría — para el Punto de equilibrio (CF de
   * `PE = CF / %MC`, ver src/utils/breakeven.ts). "Fijo" = `isRecurring: true`, el mismo
   * campo que ya usa el módulo de Gastos ("Gasto que se repite periódicamente: alquiler,
   * nómina, servicios") — no hace falta una clasificación nueva, es la que el usuario ya
   * elige al cargar cada gasto. Compartido tal cual por Restaurante, Shop y Club: `Movement`
   * no tiene ningún campo específico de vertical.
   */
  async summarizeFixedCosts(restaurantId: string, range: ReportRange, date?: string) {
    const grouped = await prisma.movement.groupBy({
      by: ['category'],
      where: {
        restaurantId,
        type: 'EXPENSE',
        isRecurring: true,
        createdAt: resolveDateFilter({ range, date }),
      },
      _sum: { amountBase: true },
    });

    const byCategory = grouped
      .map((g) => ({
        // Un gasto marcado recurrente sin categoría elegida cae en "OTHER" — nunca se pierde
        // del total, solo queda sin agrupar.
        category: g.category ?? 'OTHER',
        amountBase: round2(toDecimal(g._sum.amountBase ?? 0)).toFixed(2),
      }))
      .sort((a, b) => Number(b.amountBase) - Number(a.amountBase));

    const totalBase = round2(byCategory.reduce((acc, c) => acc.add(toDecimal(c.amountBase)), toDecimal(0))).toFixed(2);

    return { totalBase, byCategory };
  },

  /**
   * Edita un movimiento ya cargado. Lo delicado es el reabastecimiento: si el gasto sumó
   * existencia a un insumo, cambiar el insumo o la cantidad tiene que REVERTIR lo anterior
   * antes de aplicar lo nuevo — si no, corregir un monto dejaría la existencia inflada,
   * el mismo agujero que ya tapa remove(). Nunca baja de 0.
   */
  async update(restaurantId: string, id: string, input: UpdateMovementInput) {
    const existing = await prisma.movement.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Movimiento no encontrado.');

    if (input.supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, restaurantId } });
      if (!supplier) throw notFound('El proveedor no existe o no pertenece a este restaurante.');
    }

    let amountBase: Prisma.Decimal | undefined;
    if (input.amountBase != null) {
      amountBase = toDecimal(input.amountBase);
      if (input.amountCurrency === 'BS') {
        const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { baseCurrency: true } });
        const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', restaurantId);
        amountBase = bsToBase(input.amountBase, rate.rateBs);
      }
    }

    // `undefined` = no lo mandaron, se deja como está. `null` = lo están limpiando.
    const nextItemId = input.inventoryItemId === undefined ? existing.inventoryItemId : input.inventoryItemId;
    const nextQty = input.inventoryQuantity === undefined ? existing.inventoryQuantity : input.inventoryQuantity;

    return prisma.$transaction(async (tx) => {
      const restockChanged =
        String(nextItemId ?? '') !== String(existing.inventoryItemId ?? '') ||
        String(nextQty ?? '') !== String(existing.inventoryQuantity ?? '');

      if (restockChanged) {
        if (existing.inventoryItemId && existing.inventoryQuantity) {
          const prev = await tx.inventoryItem.findFirst({ where: { id: existing.inventoryItemId, restaurantId } });
          if (prev) {
            await tx.inventoryItem.update({
              where: { id: prev.id },
              data: { quantity: Prisma.Decimal.max(0, toDecimal(prev.quantity).sub(existing.inventoryQuantity)) },
            });
          }
        }
        if (nextItemId && nextQty) {
          const next = await tx.inventoryItem.findFirst({ where: { id: nextItemId, restaurantId } });
          if (!next) throw notFound('El insumo no existe o no pertenece a este restaurante.');
          await tx.inventoryItem.update({ where: { id: next.id }, data: { quantity: { increment: nextQty } } });
        }
      }

      return tx.movement.update({
        where: { id: existing.id },
        data: {
          amountBase,
          description: input.description,
          incomeCategory: input.incomeCategory,
          paymentMethod: input.paymentMethod,
          category: input.category,
          supplierId: input.supplierId,
          inventoryItemId: nextItemId,
          inventoryQuantity: nextQty,
          isCredit: input.isCredit,
          expenseDate:
            input.expenseDate === undefined
              ? undefined
              : input.expenseDate === null
                ? null
                : new Date(`${input.expenseDate}T12:00:00`),
          referenceNumber: input.referenceNumber,
          receiptImageUrl: input.receiptImageUrl,
          spentByName: input.spentByName,
          quoteImageUrl: input.quoteImageUrl,
          paymentProofImageUrl: input.paymentProofImageUrl,
          notes: input.notes,
          documentType: input.documentType,
          isRecurring: input.isRecurring,
          invoiceDueDate:
            input.invoiceDueDate === undefined
              ? undefined
              : input.invoiceDueDate === null
                ? null
                : new Date(`${input.invoiceDueDate}T12:00:00`),
        },
        include: { createdByUser: { select: { name: true } }, supplier: true, inventoryItem: true },
      });
    });
  },

  /** Marca un gasto a crédito como ya pagado al proveedor. */
  async markCreditPaid(restaurantId: string, id: string) {
    const existing = await prisma.movement.findFirst({ where: { id, restaurantId } });
    if (!existing) throw notFound('Movimiento no encontrado.');
    if (!existing.isCredit) throw badRequest('Este movimiento no es un gasto a crédito.');
    if (existing.creditPaidAt) throw badRequest('Ya estaba marcado como pagado.');
    return prisma.movement.update({ where: { id }, data: { creditPaidAt: new Date() } });
  },

  /**
   * Borra un movimiento y REVIERTE su reabastecimiento, si lo tenía. Antes solo
   * borraba la fila: un gasto cargado con "sumar al inventario" que después se
   * borraba (monto equivocado, insumo equivocado) dejaba la existencia inflada
   * para siempre, sin rastro de por qué. Nunca baja de 0.
   */
  async remove(restaurantId: string, id: string) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.movement.findFirst({ where: { id, restaurantId } });
      if (!existing) throw notFound('Movimiento no encontrado.');

      // Revierte el asiento bancario que este movimiento haya generado, por la misma razón
      // que se revierte el reabastecimiento: borrar el gasto no puede dejar el saldo torcido.
      await bankLedgerService.reverseMovement(tx, restaurantId, existing.id);

      if (existing.inventoryItemId && existing.inventoryQuantity) {
        const item = await tx.inventoryItem.findFirst({
          where: { id: existing.inventoryItemId, restaurantId },
        });
        if (item) {
          const restored = Prisma.Decimal.max(0, toDecimal(item.quantity).sub(existing.inventoryQuantity));
          await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: restored } });
        }
      }

      await tx.movement.delete({ where: { id: existing.id } });
      return { deleted: true };
    });
  },
};
