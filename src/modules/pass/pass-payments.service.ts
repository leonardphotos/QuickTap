import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';

/**
 * Abonos que el cliente reporta desde QuickTap Pass y que el local verifica.
 *
 * Un abono reportado NO mueve el saldo: mientras está PENDING no existe para las cuentas del
 * negocio. Solo al aprobarlo se crea el pago real. Quien dice haber pagado no puede darse por
 * pagado solo — mismo criterio que la verificación de comprobantes de suscripción.
 */

/** Saldo real de una venta, mora incluida. Se calcula, nunca se cachea. */
async function saldoDeVenta(shopSaleId: string) {
  const venta = await prisma.shopSale.findUnique({
    where: { id: shopSaleId },
    include: { payments: true, installmentPlan: { include: { installments: true } } },
  });
  if (!venta) throw notFound('Compra no encontrada.');
  const abonado = (venta.amountPaidNow ?? 0) + venta.payments.reduce((a, p) => a + p.amount, 0);
  const mora = venta.installmentPlan?.installments.reduce((a, c) => a + c.lateFeeCharged, 0) ?? 0;
  const saldo = Math.max(0, Math.round((venta.total + mora - abonado) * 100) / 100);
  return { venta, saldo };
}

export const passPaymentsService = {
  /** Métodos que acepta el negocio de esa compra, para que el cliente elija cómo pagó. */
  async metodosDe(shopSaleId: string, customerId: string) {
    const venta = await prisma.shopSale.findUnique({
      where: { id: shopSaleId },
      select: { restaurantId: true, customerPhone: true },
    });
    if (!venta) throw notFound('Compra no encontrada.');
    await this.asegurarDuenio(shopSaleId, customerId);

    const negocio = await prisma.restaurant.findUnique({
      where: { id: venta.restaurantId },
      select: { paymentMethodsConfig: true },
    });
    const config = (negocio?.paymentMethodsConfig ?? {}) as Record<string, unknown>;
    // Se devuelven los datos tal cual los cargó el negocio (banco, teléfono, cédula…) para que
    // el cliente sepa a dónde transferir sin tener que pedírselos por otro lado.
    return config;
  },

  /**
   * El cliente solo puede tocar SUS compras. Se comprueba por teléfono y no por id de venta a
   * secas: sin esto, cualquiera con una sesión de Pass podría reportar abonos contra la compra
   * de otro y ensuciarle la cuenta al negocio.
   */
  async asegurarDuenio(shopSaleId: string, customerId: string) {
    const cliente = await prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true } });
    if (!cliente) throw notFound('Cuenta no encontrada.');
    const cola = cliente.phone.replace(/\D/g, '').slice(-7);
    const venta = await prisma.shopSale.findUnique({ where: { id: shopSaleId }, select: { customerPhone: true } });
    if (!venta?.customerPhone || !venta.customerPhone.replace(/\D/g, '').endsWith(cola)) {
      throw notFound('Compra no encontrada.');
    }
  },

  /** El cliente reporta un abono. Queda esperando verificación del local. */
  async reportar(
    customerId: string,
    shopSaleId: string,
    input: { amount: number; method: string; installmentId?: string; proofImageUrl?: string },
  ) {
    await this.asegurarDuenio(shopSaleId, customerId);
    const { venta, saldo } = await saldoDeVenta(shopSaleId);

    if (input.amount <= 0) throw badRequest('El monto debe ser mayor que cero.');
    if (saldo <= 0) throw badRequest('Esta compra ya está saldada.');
    // Se admite un centavo de margen por el redondeo, pero no reportar de más: el local
    // terminaría con un abono que no puede imputar a ninguna deuda.
    if (input.amount > saldo + 0.01) throw badRequest(`El monto no puede superar tu saldo de ${saldo.toFixed(2)}.`);

    const pendientes = await prisma.shopPassPayment.count({ where: { shopSaleId, status: 'PENDING' } });
    if (pendientes >= 3) throw badRequest('Ya tienes abonos esperando verificación en esta compra.');

    return prisma.shopPassPayment.create({
      data: {
        restaurantId: venta.restaurantId,
        shopSaleId,
        customerId,
        installmentId: input.installmentId,
        amount: input.amount,
        method: input.method,
        proofImageUrl: input.proofImageUrl,
      },
    });
  },

  /** Lo que el cliente ya reportó en una compra, para que vea en qué va. */
  async misReportes(customerId: string) {
    return prisma.shopPassPayment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, shopSaleId: true, amount: true, method: true, status: true, createdAt: true, rejectionReason: true },
    });
  },
};

/** Lado del local: la ventana "QuickTap Pass" de su panel. */
export const passInboxService = {
  /** Abonos reportados esperando verificación. */
  async pendientes(restaurantId: string) {
    const filas = await prisma.shopPassPayment.findMany({
      where: { restaurantId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { shopSale: { select: { id: true, total: true, customerName: true, customerPhone: true } } },
    });
    return filas.map((f) => ({
      id: f.id,
      cliente: f.shopSale.customerName ?? 'Sin nombre',
      telefono: f.shopSale.customerPhone,
      monto: f.amount,
      metodo: f.method,
      comprobante: f.proofImageUrl,
      reportadoEl: f.createdAt,
      ventaId: f.shopSale.id,
      installmentId: f.installmentId,
    }));
  },

  /**
   * Todos los clientes con deuda en el local, que es lo que el dueño quiere ver de un vistazo.
   * Agrupa por teléfono: un mismo comprador puede tener varias compras abiertas.
   */
  async deudores(restaurantId: string) {
    const ventas = await prisma.shopSale.findMany({
      where: { restaurantId, returned: false, creditTerms: { not: null }, settledAt: null },
      include: { payments: true, installmentPlan: { include: { installments: true } } },
    });

    const porCliente = new Map<string, { nombre: string; telefono: string; total: number; abonado: number; compras: number; cuotasVencidas: number }>();
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });

    for (const v of ventas) {
      const clave = (v.customerPhone ?? 'sin-telefono').replace(/\D/g, '');
      const mora = v.installmentPlan?.installments.reduce((a, c) => a + c.lateFeeCharged, 0) ?? 0;
      const abonado = (v.amountPaidNow ?? 0) + v.payments.reduce((a, p) => a + p.amount, 0);
      const vencidas =
        v.installmentPlan?.installments.filter((c) => c.dueDate < hoy && !c.paidAt).length ?? 0;

      const actual = porCliente.get(clave) ?? {
        nombre: v.customerName ?? 'Sin nombre',
        telefono: v.customerPhone ?? '',
        total: 0,
        abonado: 0,
        compras: 0,
        cuotasVencidas: 0,
      };
      actual.total += v.total + mora;
      actual.abonado += abonado;
      actual.compras += 1;
      actual.cuotasVencidas += vencidas;
      porCliente.set(clave, actual);
    }

    return [...porCliente.values()]
      .map((c) => ({
        ...c,
        total: Math.round(c.total * 100) / 100,
        abonado: Math.round(c.abonado * 100) / 100,
        saldo: Math.max(0, Math.round((c.total - c.abonado) * 100) / 100),
      }))
      .filter((c) => c.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo);
  },

  /**
   * El local aprueba: recién acá el abono se vuelve real y suma al cliente.
   *
   * Si el cliente lo imputó a una cuota, se descuenta de esa cuota y se marca pagada si
   * corresponde; si no, queda como abono libre contra el saldo de la compra.
   */
  async aprobar(restaurantId: string, id: string, revisorId?: string) {
    const reporte = await prisma.shopPassPayment.findFirst({ where: { id, restaurantId } });
    if (!reporte) throw notFound('Abono no encontrado.');
    if (reporte.status !== 'PENDING') throw badRequest('Este abono ya fue revisado.');

    return prisma.$transaction(async (tx) => {
      const pago = await tx.shopSalePayment.create({
        data: {
          shopSaleId: reporte.shopSaleId,
          amount: reporte.amount,
          method: reporte.method,
          installmentId: reporte.installmentId,
        },
      });

      if (reporte.installmentId) {
        const cuota = await tx.shopInstallment.findUnique({ where: { id: reporte.installmentId } });
        if (cuota) {
          const pendiente = Math.max(0, cuota.amount + cuota.lateFeeCharged - cuota.paidAmount);
          const aplicado = Math.min(reporte.amount, pendiente);
          const nuevoPagado = Math.round((cuota.paidAmount + aplicado) * 100) / 100;
          await tx.shopInstallment.update({
            where: { id: cuota.id },
            data: {
              paidAmount: nuevoPagado,
              paidAt: nuevoPagado + 0.001 >= cuota.amount + cuota.lateFeeCharged ? new Date() : null,
            },
          });
        }
      }

      // Si con esto quedó saldada la venta, sale de cuentas por cobrar.
      const venta = await tx.shopSale.findUnique({
        where: { id: reporte.shopSaleId },
        include: { payments: true, installmentPlan: { include: { installments: true } } },
      });
      if (venta) {
        const mora = venta.installmentPlan?.installments.reduce((a, c) => a + c.lateFeeCharged, 0) ?? 0;
        const abonado = (venta.amountPaidNow ?? 0) + venta.payments.reduce((a, p) => a + p.amount, 0);
        if (abonado + 0.01 >= venta.total + mora) {
          await tx.shopSale.update({ where: { id: venta.id }, data: { settledAt: new Date() } });
        }
      }

      return tx.shopPassPayment.update({
        where: { id },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: revisorId, salePaymentId: pago.id },
      });
    });
  },

  /** El local rechaza: no se crea ningún pago y el cliente ve el motivo en su portal. */
  async rechazar(restaurantId: string, id: string, motivo: string, revisorId?: string) {
    const reporte = await prisma.shopPassPayment.findFirst({ where: { id, restaurantId } });
    if (!reporte) throw notFound('Abono no encontrado.');
    if (reporte.status !== 'PENDING') throw badRequest('Este abono ya fue revisado.');
    return prisma.shopPassPayment.update({
      where: { id },
      data: { status: 'REJECTED', reviewedAt: new Date(), reviewedById: revisorId, rejectionReason: motivo },
    });
  },
};
