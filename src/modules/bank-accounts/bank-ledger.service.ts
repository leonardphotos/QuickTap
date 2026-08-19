import { PaymentMethod, Prisma } from '@prisma/client';
import { baseToBs, round2, toDecimal } from '../../utils/money';
import { shopMethodToEnum } from '../../utils/payment-method';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';

/**
 * Libro mayor bancario: asienta cobros y pagos en la cuenta vinculada a cada método de pago.
 *
 * Vive separado de bank-account.service.ts a propósito: esto lo importan los flujos de cobro
 * de TODA la app (pedidos, reservas de cancha, ventas de local, gastos, órdenes de pago), y
 * debe ser un no-op silencioso cuando el método no está vinculado a ninguna cuenta — el
 * negocio puede usar Cuentas bancarias a medias (o no usarlas) sin que eso rompa el cobro
 * que origina el asiento.
 */

type Tx = Prisma.TransactionClient;

const VALID_METHODS = new Set<string>(Object.values(PaymentMethod));

interface ApplyMethodPaymentInput {
  restaurantId: string;
  /** Método de pago como string laxo (Shop lo guarda así) — se valida contra el enum. */
  method: string | null | undefined;
  /** CREDIT = entra dinero (cobro/ingreso), DEBIT = sale (gasto/orden de pago). */
  direction: 'CREDIT' | 'DEBIT';
  amountBase: number | Prisma.Decimal;
  description: string;
  /** Para poder revertir el asiento si se borra el movimiento origen. */
  movementId?: string | null;
  /** Id del cobro/orden origen — solo trazabilidad. */
  sourceRef?: string | null;
  /** Cuenta bancaria elegida en caja cuando el método tiene varias (varios Zelle,
   * varios Pago Móvil). Se verifica contra el tenant; si no existe (cuenta borrada),
   * se cae al lookup por método como si no se hubiera elegido nada. */
  bankAccountId?: string | null;
  /** Si el pago fue en Bs y se conoce el monto exacto (ej. paidAmountBs de una orden),
   * se usa tal cual para cuentas Bs en vez de reconvertir con la tasa del momento. */
  bsAmount?: number | Prisma.Decimal | null;
  /** Tasa Bs conocida del documento origen (ej. la congelada en el pedido) — evita que un
   * cobro viejo se asiente con la tasa de hoy. */
  rateBs?: number | Prisma.Decimal | null;
  createdByUserId?: string | null;
}

export const bankLedgerService = {
  /** Asienta el monto en la cuenta vinculada al método. Devuelve el id de la cuenta afectada,
   * o null si el método no está vinculado a ninguna (no-op). */
  async applyMethodPayment(tx: Tx, input: ApplyMethodPaymentInput): Promise<string | null> {
    const { restaurantId, direction } = input;
    // Shop guarda el método como etiqueta ("Zelle", "Efectivo Bs"), no como enum: sin
    // esta traducción, todo cobro de Local era un no-op y su banco nunca sumaba.
    let method = input.method?.trim() || null;
    if (method && !VALID_METHODS.has(method)) method = shopMethodToEnum(method);
    if (!method) return null;
    const amountBase = round2(toDecimal(input.amountBase));
    if (amountBase.lte(0)) return null;

    // Primero la cuenta elegida explícitamente en caja; si no hay (o ya no existe),
    // la vinculada al método — el comportamiento de siempre.
    let account = input.bankAccountId
      ? await tx.bankAccount.findFirst({ where: { id: input.bankAccountId, restaurantId } })
      : null;
    account ??= await tx.bankAccount.findFirst({
      where: { restaurantId, paymentMethods: { has: method as PaymentMethod } },
    });
    if (!account) return null;

    // Monto en la moneda de la cuenta. Para cuentas Bs: el Bs exacto del documento si se
    // conoce; si no, se convierte con la tasa del documento o, en su defecto, la del día.
    let amount = amountBase;
    if (account.currency === 'BS') {
      if (input.bsAmount != null) {
        amount = round2(toDecimal(input.bsAmount));
      } else {
        let rateBs = input.rateBs;
        if (rateBs == null) {
          const restaurant = await tx.restaurant.findUnique({
            where: { id: restaurantId },
            select: { baseCurrency: true },
          });
          const rate = await exchangeRateService.getRate(restaurant?.baseCurrency ?? 'USD', restaurantId);
          rateBs = rate.rateBs;
        }
        amount = round2(baseToBs(amountBase, rateBs));
      }
    }

    await tx.bankTransaction.create({
      data: {
        restaurantId,
        accountId: account.id,
        type: direction,
        amount,
        amountBase,
        description: input.description,
        paymentMethod: method as PaymentMethod,
        movementId: input.movementId ?? null,
        sourceRef: input.sourceRef ?? null,
        createdByUserId: input.createdByUserId ?? null,
      },
    });
    await tx.bankAccount.update({
      where: { id: account.id },
      data: { balance: direction === 'CREDIT' ? { increment: amount } : { decrement: amount } },
    });
    return account.id;
  },

  /** Revierte (y borra) los asientos que generó un movimiento — se llama al borrar el gasto/
   * ingreso origen para que el saldo del banco no quede inflado/desinflado. */
  async reverseMovement(tx: Tx, restaurantId: string, movementId: string): Promise<void> {
    const rows = await tx.bankTransaction.findMany({ where: { restaurantId, movementId } });
    for (const row of rows) {
      await tx.bankAccount.update({
        where: { id: row.accountId },
        data: { balance: row.type === 'CREDIT' ? { decrement: row.amount } : { increment: row.amount } },
      });
    }
    if (rows.length > 0) {
      await tx.bankTransaction.deleteMany({ where: { restaurantId, movementId } });
    }
  },

  /** Igual que `reverseMovement` pero para los asientos que dejó un pedido (`sourceRef` = orderId):
   * al borrar un pedido ya cobrado, el cobro desaparecía de la caja pero el crédito seguía
   * inflando el saldo del banco. */
  async reverseBySourceRef(tx: Tx, restaurantId: string, sourceRef: string): Promise<void> {
    const rows = await tx.bankTransaction.findMany({ where: { restaurantId, sourceRef } });
    for (const row of rows) {
      await tx.bankAccount.update({
        where: { id: row.accountId },
        data: { balance: row.type === 'CREDIT' ? { decrement: row.amount } : { increment: row.amount } },
      });
    }
    if (rows.length > 0) {
      await tx.bankTransaction.deleteMany({ where: { restaurantId, sourceRef } });
    }
  },
};
