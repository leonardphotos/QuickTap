import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';

/**
 * Cuotas y mora de las ventas a crédito de locales comerciales.
 *
 * El saldo NUNCA se cachea: se calcula sumando lo abonado contra lo pactado, igual que el resto
 * de las cuentas por cobrar del local. Lo único que se persiste es la mora ya aplicada
 * (`lateFeeCharged`), porque eso sí es algo que se le cobró al cliente y no puede cambiar
 * retroactivamente si el local edita su política.
 */

/** Fecha de hoy como yyyy-mm-dd en el calendario del local (Venezuela). */
function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(`${desdeISO}T00:00:00Z`);
  const b = Date.parse(`${hastaISO}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export type EstadoCuota = 'PAGADA' | 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE';

export interface CuotaResumen {
  id: string;
  number: number;
  amount: number;
  dueDate: string;
  paidAmount: number;
  lateFeeCharged: number;
  /** Lo que falta de esta cuota, mora incluida. */
  saldo: number;
  estado: EstadoCuota;
  /** Días que faltan (positivo) o que lleva vencida (negativo). */
  diasParaVencer: number;
}

/**
 * Clasifica una cuota. `POR_VENCER` es la que dispara el aviso previo: es la ventana entre que
 * se acerca la fecha y que efectivamente cae la mora, que es justo cuando avisar sirve de algo.
 */
export function resumirCuota(
  cuota: { id: string; number: number; amount: number; dueDate: string; paidAmount: number; lateFeeCharged: number },
  alertDaysBefore: number,
  hoy = hoyISO(),
): CuotaResumen {
  const saldo = Math.max(0, cuota.amount + cuota.lateFeeCharged - cuota.paidAmount);
  const dias = diasEntre(hoy, cuota.dueDate);

  let estado: EstadoCuota;
  if (saldo <= 0.001) estado = 'PAGADA';
  else if (dias < 0) estado = 'VENCIDA';
  else if (dias <= alertDaysBefore) estado = 'POR_VENCER';
  else estado = 'PENDIENTE';

  return {
    id: cuota.id,
    number: cuota.number,
    amount: cuota.amount,
    dueDate: cuota.dueDate,
    paidAmount: cuota.paidAmount,
    lateFeeCharged: cuota.lateFeeCharged,
    saldo: Math.round(saldo * 100) / 100,
    estado,
    diasParaVencer: dias,
  };
}

/** Días que separan una cuota de la siguiente, por frecuencia. */
const DIAS_POR_FRECUENCIA: Record<string, number> = {
  SEMANAL: 7,
  QUINCENAL: 15,
  MENSUAL: 30,
  TRIMESTRAL: 90,
  SEMESTRAL: 180,
};

export const shopInstallmentsService = {
  /**
   * Arma el plan de cuotas de una venta. Reparte el total en `cantidad` cuotas mensuales; el
   * redondeo sobrante se suma a la primera para que la suma cuadre exacta con el total y el
   * cliente no termine debiendo un centavo suelto al final.
   */
  async crearPlan(
    restaurantId: string,
    shopSaleId: string,
    input: {
      cantidad: number;
      primeraFecha: string;
      lateFeeAmount?: number;
      alertDaysBefore?: number;
      /** SEMANAL | QUINCENAL | MENSUAL | TRIMESTRAL | SEMESTRAL. */
      frecuencia?: string;
      /** Recargo por financiar, en % sobre el saldo. */
      recargoPorcentaje?: number;
    },
  ) {
    if (input.cantidad < 2) throw badRequest('Un plan de cuotas necesita al menos 2 cuotas.');

    const venta = await prisma.shopSale.findFirst({
      where: { id: shopSaleId, restaurantId },
      include: { installmentPlan: true, payments: true },
    });
    if (!venta) throw notFound('Venta no encontrada.');
    if (venta.installmentPlan) throw badRequest('Esta venta ya tiene un plan de cuotas.');

    const abonado = (venta.amountPaidNow ?? 0) + venta.payments.reduce((a, p) => a + p.amount, 0);
    const aFinanciar = Math.round((venta.total - abonado) * 100) / 100;
    if (aFinanciar <= 0) throw badRequest('Esta venta ya está saldada, no hay nada que financiar.');

    // El recargo por financiar se calcula UNA vez sobre el saldo y se reparte dentro de las
    // cuotas, para que el cliente vea el total que va a pagar y no una sorpresa al final.
    const recargoPct = input.recargoPorcentaje ?? 0;
    const recargo = Math.round(aFinanciar * (recargoPct / 100) * 100) / 100;
    const conRecargo = Math.round((aFinanciar + recargo) * 100) / 100;

    const base = Math.floor((conRecargo / input.cantidad) * 100) / 100;
    const sobrante = Math.round((conRecargo - base * input.cantidad) * 100) / 100;
    const frecuencia = input.frecuencia && DIAS_POR_FRECUENCIA[input.frecuencia] ? input.frecuencia : 'MENSUAL';
    const paso = DIAS_POR_FRECUENCIA[frecuencia];

    return prisma.$transaction(async (tx) => {
      const plan = await tx.shopInstallmentPlan.create({
        data: {
          restaurantId,
          shopSaleId,
          lateFeeAmount: input.lateFeeAmount ?? 0,
          alertDaysBefore: input.alertDaysBefore ?? 3,
          frequency: frecuencia,
          surchargePercent: recargoPct,
          surchargeAmount: recargo,
        },
      });

      const inicio = Date.parse(`${input.primeraFecha}T00:00:00Z`);
      for (let i = 0; i < input.cantidad; i += 1) {
        // Se avanza por días y no por meses de calendario: así "cada 15 días" cae siempre a 15
        // días reales, y mensual/trimestral/semestral usan 30/90/180 de forma consistente.
        const fecha = new Date(inicio + i * paso * 86400000);
        await tx.shopInstallment.create({
          data: {
            planId: plan.id,
            number: i + 1,
            amount: i === 0 ? Math.round((base + sobrante) * 100) / 100 : base,
            dueDate: fecha.toISOString().slice(0, 10),
          },
        });
      }

      await tx.shopSale.update({ where: { id: shopSaleId }, data: { creditTerms: 'INSTALLMENT' } });
      return tx.shopInstallmentPlan.findUnique({
        where: { id: plan.id },
        include: { installments: { orderBy: { number: 'asc' } } },
      });
    });
  },

  /** Editar monto o fecha de una cuota — el local reacomoda el pago sin anular la venta. */
  async editarCuota(restaurantId: string, cuotaId: string, input: { amount?: number; dueDate?: string }) {
    const cuota = await prisma.shopInstallment.findFirst({
      where: { id: cuotaId, plan: { restaurantId } },
    });
    if (!cuota) throw notFound('Cuota no encontrada.');
    if (input.amount != null && input.amount <= 0) throw badRequest('El monto de la cuota debe ser mayor que cero.');
    if (input.amount != null && input.amount < cuota.paidAmount) {
      throw badRequest('El monto no puede quedar por debajo de lo ya abonado en esa cuota.');
    }
    return prisma.shopInstallment.update({
      where: { id: cuotaId },
      data: { ...(input.amount != null ? { amount: input.amount } : {}), ...(input.dueDate ? { dueDate: input.dueDate } : {}) },
    });
  },

  /**
   * Registra un abono contra una cuota. Si sobra dinero, el excedente NO se reparte solo a las
   * siguientes: se deja como abono libre de la venta, para que el local decida a dónde imputarlo
   * y no se le mueva un calendario que quizás acaba de acordar con el cliente.
   */
  async abonarCuota(restaurantId: string, cuotaId: string, input: { amount: number; method?: string }) {
    if (input.amount <= 0) throw badRequest('El abono debe ser mayor que cero.');
    const cuota = await prisma.shopInstallment.findFirst({
      where: { id: cuotaId, plan: { restaurantId } },
      include: { plan: true },
    });
    if (!cuota) throw notFound('Cuota no encontrada.');

    return prisma.$transaction(async (tx) => {
      const pendiente = Math.max(0, cuota.amount + cuota.lateFeeCharged - cuota.paidAmount);
      const aplicado = Math.min(input.amount, pendiente);

      await tx.shopSalePayment.create({
        data: {
          shopSaleId: cuota.plan.shopSaleId,
          amount: input.amount,
          method: input.method,
          installmentId: cuota.id,
        },
      });

      const nuevoPagado = Math.round((cuota.paidAmount + aplicado) * 100) / 100;
      const saldada = nuevoPagado + 0.001 >= cuota.amount + cuota.lateFeeCharged;
      await tx.shopInstallment.update({
        where: { id: cuota.id },
        data: { paidAmount: nuevoPagado, paidAt: saldada ? new Date() : null },
      });

      // Si con esto se saldó todo el plan, la venta deja de estar por cobrar.
      const cuotas = await tx.shopInstallment.findMany({ where: { planId: cuota.planId } });
      const todoPago = cuotas.every((c) =>
        (c.id === cuota.id ? nuevoPagado : c.paidAmount) + 0.001 >= c.amount + c.lateFeeCharged,
      );
      if (todoPago) {
        await tx.shopSale.update({ where: { id: cuota.plan.shopSaleId }, data: { settledAt: new Date() } });
      }
      return { aplicado, sobrante: Math.round((input.amount - aplicado) * 100) / 100 };
    });
  },

  /**
   * Aplica la mora a las cuotas que vencieron y todavía deben. Se cobra UNA vez por cuota: si ya
   * tiene mora sellada no se vuelve a sumar, así una cuota vieja no crece sin límite.
   */
  async aplicarMoraVencidas(restaurantId?: string) {
    const hoy = hoyISO();
    const candidatas = await prisma.shopInstallment.findMany({
      where: {
        dueDate: { lt: hoy },
        lateFeeCharged: 0,
        paidAt: null,
        ...(restaurantId ? { plan: { restaurantId } } : {}),
      },
      include: { plan: true },
    });

    let aplicadas = 0;
    for (const c of candidatas) {
      if (c.plan.lateFeeAmount <= 0) continue;
      if (c.paidAmount + 0.001 >= c.amount) continue; // se pagó completa aunque no se haya sellado
      await prisma.shopInstallment.update({
        where: { id: c.id },
        data: { lateFeeCharged: c.plan.lateFeeAmount },
      });
      aplicadas += 1;
    }
    return { aplicadas };
  },

  /** Plan de una venta, con el estado de cada cuota ya resuelto. */
  async planDeVenta(restaurantId: string, shopSaleId: string) {
    const plan = await prisma.shopInstallmentPlan.findFirst({
      where: { shopSaleId, restaurantId },
      include: { installments: { orderBy: { number: 'asc' } } },
    });
    if (!plan) return null;
    return {
      id: plan.id,
      lateFeeAmount: plan.lateFeeAmount,
      alertDaysBefore: plan.alertDaysBefore,
      frequency: plan.frequency,
      surchargePercent: plan.surchargePercent,
      surchargeAmount: plan.surchargeAmount,
      cuotas: plan.installments.map((c) => resumirCuota(c, plan.alertDaysBefore)),
    };
  },
};

/**
 * Puestos vendidos de cada evento del local.
 *
 * Se cuenta sobre las líneas de venta y no se guarda un contador: así una devolución libera el
 * puesto sola, sin que nadie tenga que acordarse de descontarlo. El nombre se congela en la
 * línea al vender (ShopSaleItem.name), así que se cruza por ahí.
 */
export async function puestosVendidosPorEvento(restaurantId: string): Promise<Record<string, number>> {
  const eventos = await prisma.shopProduct.findMany({
    where: { restaurantId, isEvent: true },
    select: { id: true, name: true, eventSeats: true },
  });
  if (eventos.length === 0) return {};

  const lineas = await prisma.shopSaleItem.findMany({
    where: {
      sale: { restaurantId, returned: false },
      name: { in: eventos.map((e) => e.name) },
    },
    select: { name: true, qty: true },
  });

  const porNombre = new Map<string, number>();
  for (const l of lineas) porNombre.set(l.name, (porNombre.get(l.name) ?? 0) + l.qty);

  const salida: Record<string, number> = {};
  for (const e of eventos) salida[e.id] = porNombre.get(e.name) ?? 0;
  return salida;
}
