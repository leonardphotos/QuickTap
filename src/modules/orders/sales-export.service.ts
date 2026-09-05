import ExcelJS from 'exceljs';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { PAYMENT_LABELS } from '../../utils/whatsapp';
import { round2, toDecimal } from '../../utils/money';
import { describeDateSpec } from '../../utils/date-range';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';
import { applyMoneyFormat, caracasParts, styleHeader } from '../../utils/excel';
import type { OrderHistoryQuery } from './order.dto';
import { orderService } from './order.service';

const CHANNEL_LABELS: Record<string, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pick-up',
  BAR: 'Barra',
};

/**
 * En qué moneda se cobra realmente cada método. Define en cuál de las dos
 * columnas de monto ("Monto Bs" / "Monto $") cae cada cobro, que es lo que
 * pide el reporte: el monto va en la moneda del método usado.
 */
const METHOD_CURRENCY: Record<PaymentMethod, 'BS' | 'USD'> = {
  MOBILE_PAYMENT: 'BS',
  CASH: 'BS',
  CARD: 'BS',
  TRANSFER: 'BS',
  CASH_USD: 'USD',
  ZELLE: 'USD',
  BINANCE: 'USD',
  PAYPAL: 'USD',
  PAYROLL_DEDUCTION: 'USD',
};

/**
 * El vertical Local (ShopSale) guarda el método como etiqueta legible, no como
 * enum. Mismo criterio que ShopPosPage.tsx (USD_PAYMENT_LABELS) para saber si
 * el cobro fue en divisa.
 */
const USD_SHOP_LABELS = new Set(['Efectivo $', 'Zelle', 'Binance', 'PayPal']);

export const salesExportService = {
  /**
   * Historial completo de cobros del negocio, un renglón por cada pago
   * registrado (un pedido pagado en varias partes aparece en varias filas).
   * Es el respaldo "todo lo que ha entrado" que el dueño descarga desde Ajustes.
   *
   * Los dos verticales guardan sus ventas en tablas distintas: el restaurante en
   * Order/OrderPayment y el local comercial en ShopSale, así que cada uno arma
   * su hoja con las columnas que le aplican.
   */
  async buildSalesHistoryWorkbook(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, baseCurrency: true, businessType: true },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuickTap.club';
    workbook.created = new Date();

    const rows =
      restaurant?.businessType === 'SHOP'
        ? await buildShopSheet(workbook, restaurantId, restaurant.baseCurrency)
        : await buildRestaurantSheet(workbook, restaurantId);

    return {
      workbook,
      filename: `Historial de ventas - ${(restaurant?.name ?? 'QuickTap').replace(/[\\/:*?"<>|]/g, '')}.xlsx`,
      rows,
    };
  },

  /**
   * Botón "Exportar" del Historial de pedidos: un renglón por pedido con los mismos
   * filtros que el usuario tiene puestos en pantalla (rango/fechas, canal, método de
   * pago, origen y mesero), más una hoja con el detalle de productos de cada pedido.
   */
  async buildOrderHistoryWorkbook(restaurantId: string, query: OrderHistoryQuery) {
    const [restaurant, orders] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.order.findMany({
        where: orderService.historyWhere(restaurantId, query),
        orderBy: { createdAt: 'desc' },
        select: {
          orderNumber: true,
          channel: true,
          status: true,
          paymentMethod: true,
          subtotalBase: true,
          serviceChargeBase: true,
          ivaBase: true,
          deliveryFeeBase: true,
          totalBase: true,
          totalBs: true,
          tipBase: true,
          exchangeRate: true,
          customerName: true,
          createdAt: true,
          table: { select: { number: true } },
          placedByUser: { select: { name: true, role: true } },
          items: { select: { productName: true, variantName: true, quantity: true, unitPrice: true, lineTotal: true } },
          payments: { select: { method: true, referenceNumber: true, amountBase: true } },
        },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuickTap.club';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Pedidos');
    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Hora', key: 'hora', width: 8 },
      { header: 'Pedido N.°', key: 'orderNumber', width: 11 },
      { header: 'Canal', key: 'channel', width: 12 },
      { header: 'Mesa', key: 'table', width: 12 },
      { header: 'Origen', key: 'source', width: 16 },
      { header: 'Atendido por', key: 'placedBy', width: 22 },
      { header: 'Cliente', key: 'customer', width: 24 },
      { header: 'Método de pago', key: 'method', width: 18 },
      { header: 'Referencias', key: 'reference', width: 22 },
      { header: 'Subtotal $', key: 'subtotal', width: 12 },
      { header: 'Servicio $', key: 'service', width: 12 },
      { header: 'IVA $', key: 'iva', width: 10 },
      { header: 'Envío $', key: 'delivery', width: 10 },
      { header: 'Propina $', key: 'tip', width: 11 },
      { header: 'Total $', key: 'total', width: 12 },
      { header: 'Total Bs', key: 'totalBs', width: 16 },
      { header: 'Tasa usada', key: 'rate', width: 12 },
      { header: 'Estado', key: 'status', width: 14 },
    ];
    styleHeader(sheet);

    const detail = workbook.addWorksheet('Detalle de productos');
    detail.columns = [
      { header: 'Pedido N.°', key: 'orderNumber', width: 11 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Producto', key: 'product', width: 34 },
      { header: 'Cantidad', key: 'quantity', width: 10 },
      { header: 'Precio unitario $', key: 'unitPrice', width: 16 },
      { header: 'Total línea $', key: 'lineTotal', width: 14 },
    ];
    styleHeader(detail);

    for (const o of orders) {
      const { fecha, hora } = caracasParts(o.createdAt);
      sheet.addRow({
        fecha,
        hora,
        orderNumber: o.orderNumber,
        channel: CHANNEL_LABELS[o.channel] ?? o.channel,
        table: o.table?.number ?? '',
        source: o.placedByUser ? (o.placedByUser.role === 'COMANDA' ? 'Autoservicio' : 'Personal') : 'Cliente',
        placedBy: o.placedByUser?.role === 'COMANDA' ? 'Autoservicio (tablet)' : (o.placedByUser?.name ?? ''),
        customer: o.customerName ?? '',
        method: o.payments.length
          ? o.payments.map((p) => PAYMENT_LABELS[p.method] ?? p.method).join(' + ')
          : o.paymentMethod
            ? PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod
            : '',
        reference: o.payments.map((p) => p.referenceNumber).filter(Boolean).join(' / '),
        subtotal: round2(toDecimal(o.subtotalBase)).toNumber(),
        service: round2(toDecimal(o.serviceChargeBase)).toNumber(),
        iva: round2(toDecimal(o.ivaBase)).toNumber(),
        delivery: round2(toDecimal(o.deliveryFeeBase)).toNumber(),
        tip: round2(toDecimal(o.tipBase)).toNumber(),
        total: round2(toDecimal(o.totalBase)).toNumber(),
        totalBs: round2(toDecimal(o.totalBs)).toNumber(),
        rate: round2(toDecimal(o.exchangeRate)).toNumber(),
        status: o.status,
      });

      for (const i of o.items) {
        detail.addRow({
          orderNumber: o.orderNumber,
          fecha,
          product: i.variantName ? `${i.productName} (${i.variantName})` : i.productName,
          quantity: i.quantity,
          unitPrice: round2(toDecimal(i.unitPrice)).toNumber(),
          lineTotal: round2(toDecimal(i.lineTotal)).toNumber(),
        });
      }
    }

    applyMoneyFormat(sheet, ['subtotal', 'service', 'iva', 'delivery', 'tip', 'total', 'totalBs', 'rate']);
    applyMoneyFormat(detail, ['unitPrice', 'lineTotal']);

    const totalsRow = sheet.addRow({
      method: 'TOTALES',
      tip: round2(orders.reduce((acc, o) => acc.add(o.tipBase), toDecimal(0))).toNumber(),
      total: round2(orders.reduce((acc, o) => acc.add(o.totalBase), toDecimal(0))).toNumber(),
      totalBs: round2(orders.reduce((acc, o) => acc.add(o.totalBs), toDecimal(0))).toNumber(),
    });
    totalsRow.font = { bold: true };

    const period = describeDateSpec({ range: query.range, date: query.date, from: query.from, to: query.to });
    return {
      workbook,
      filename: `Historial de pedidos ${period} - ${(restaurant?.name ?? 'QuickTap').replace(/[\\/:*?"<>|]/g, '')}.xlsx`,
      rows: orders.length,
    };
  },
};

/** Restaurante: un renglón por OrderPayment, con la tasa congelada del pedido. */
async function buildRestaurantSheet(workbook: ExcelJS.Workbook, restaurantId: string) {
  const payments = await prisma.orderPayment.findMany({
    where: { order: { restaurantId } },
    orderBy: { createdAt: 'asc' },
    select: {
      amountBase: true,
      method: true,
      referenceNumber: true,
      discountBase: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          channel: true,
          status: true,
          exchangeRate: true,
          totalBase: true,
          customerName: true,
          table: { select: { number: true } },
          placedByUser: { select: { name: true } },
        },
      },
    },
  });

  const sheet = workbook.addWorksheet('Historial de ventas');
  sheet.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Pedido N.°', key: 'orderNumber', width: 11 },
    { header: 'Canal', key: 'channel', width: 12 },
    { header: 'Mesa', key: 'table', width: 12 },
    { header: 'Cliente', key: 'customer', width: 24 },
    { header: 'Método de pago', key: 'method', width: 18 },
    { header: 'N.° de referencia', key: 'reference', width: 20 },
    { header: 'Monto Bs', key: 'amountBs', width: 16 },
    { header: 'Monto $', key: 'amountUsd', width: 14 },
    { header: 'Tasa usada', key: 'rate', width: 13 },
    { header: 'Descuento $', key: 'discount', width: 13 },
    { header: 'Total del pedido $', key: 'orderTotal', width: 18 },
    { header: 'Atendido por', key: 'placedBy', width: 22 },
    { header: 'Estado del pedido', key: 'status', width: 18 },
  ];
  styleHeader(sheet);

  let totalBs = 0;
  let totalUsd = 0;

  for (const p of payments) {
    const { fecha, hora } = caracasParts(p.createdAt);
    const rate = toDecimal(p.order.exchangeRate);
    const amountUsd = round2(toDecimal(p.amountBase)).toNumber();
    const amountBs = round2(toDecimal(p.amountBase).mul(rate)).toNumber();
    const chargedIn = METHOD_CURRENCY[p.method];

    if (chargedIn === 'BS') totalBs += amountBs;
    else totalUsd += amountUsd;

    sheet.addRow({
      fecha,
      hora,
      orderNumber: p.order.orderNumber,
      channel: CHANNEL_LABELS[p.order.channel] ?? p.order.channel,
      table: p.order.table?.number ?? '',
      customer: p.order.customerName ?? '',
      method: PAYMENT_LABELS[p.method] ?? p.method,
      reference: p.referenceNumber ?? '',
      // El monto solo se llena en la columna de la moneda en que se cobró.
      amountBs: chargedIn === 'BS' ? amountBs : null,
      amountUsd: chargedIn === 'USD' ? amountUsd : null,
      rate: round2(rate).toNumber(),
      discount: p.discountBase ? round2(toDecimal(p.discountBase)).toNumber() : null,
      orderTotal: round2(toDecimal(p.order.totalBase)).toNumber(),
      placedBy: p.order.placedByUser?.name ?? '',
      status: p.order.status,
    });
  }

  applyMoneyFormat(sheet, ['amountBs', 'amountUsd', 'rate', 'discount', 'orderTotal']);

  const totalsRow = sheet.addRow({
    method: 'TOTALES',
    amountBs: round2(toDecimal(totalBs)).toNumber(),
    amountUsd: round2(toDecimal(totalUsd)).toNumber(),
  });
  totalsRow.font = { bold: true };

  return payments.length;
}

/**
 * Local comercial: un renglón por ShopSale. ShopSale no congela la tasa, así
 * que la conversión usa la tasa BCV vigente al momento de generar el archivo
 * (queda anotada en su propia columna para que el número sea auditable).
 */
async function buildShopSheet(workbook: ExcelJS.Workbook, restaurantId: string, baseCurrency: 'USD' | 'EUR') {
  const [sales, rateRow] = await Promise.all([
    prisma.shopSale.findMany({
      where: { restaurantId },
      orderBy: { time: 'asc' },
      select: {
        id: true,
        total: true,
        time: true,
        customerName: true,
        customerPhone: true,
        returned: true,
        paymentMethod: true,
        paymentMeta: true,
        creditTerms: true,
        amountPaidNow: true,
        items: { select: { name: true, qty: true } },
      },
    }),
    exchangeRateService.getRate(baseCurrency, restaurantId),
  ]);

  const rate = toDecimal(rateRow?.rateBs ?? 0);

  const sheet = workbook.addWorksheet('Historial de ventas');
  sheet.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Ticket', key: 'ticket', width: 12 },
    { header: 'Cliente', key: 'customer', width: 24 },
    { header: 'Teléfono', key: 'phone', width: 16 },
    { header: 'Productos', key: 'items', width: 40 },
    { header: 'Método de pago', key: 'method', width: 18 },
    { header: 'N.° de referencia', key: 'reference', width: 20 },
    { header: 'Monto Bs', key: 'amountBs', width: 16 },
    { header: 'Monto $', key: 'amountUsd', width: 14 },
    { header: 'Tasa usada', key: 'rate', width: 13 },
    { header: 'Venta fiada', key: 'credit', width: 14 },
    { header: 'Abonado ahora $', key: 'paidNow', width: 16 },
    { header: 'Devuelta', key: 'returned', width: 11 },
  ];
  styleHeader(sheet);

  let totalBs = 0;
  let totalUsd = 0;

  for (const s of sales) {
    const { fecha, hora } = caracasParts(s.time);
    const amountUsd = round2(toDecimal(s.total)).toNumber();
    const amountBs = round2(toDecimal(s.total).mul(rate)).toNumber();
    const chargedIn = s.paymentMethod && USD_SHOP_LABELS.has(s.paymentMethod) ? 'USD' : 'BS';
    const meta = (s.paymentMeta ?? {}) as { reference?: string };

    // Una venta devuelta no suma al total cobrado.
    if (!s.returned) {
      if (chargedIn === 'BS') totalBs += amountBs;
      else totalUsd += amountUsd;
    }

    sheet.addRow({
      fecha,
      hora,
      ticket: `#${s.id.slice(-6)}`,
      customer: s.customerName ?? '',
      phone: s.customerPhone ?? '',
      items: s.items.map((i) => `${i.qty}x ${i.name}`).join(', '),
      method: s.paymentMethod ?? '',
      reference: meta.reference ?? '',
      amountBs: chargedIn === 'BS' ? amountBs : null,
      amountUsd: chargedIn === 'USD' ? amountUsd : null,
      rate: round2(rate).toNumber(),
      credit: s.creditTerms === 'FULL' ? 'Sí (total)' : s.creditTerms === 'INSTALLMENT' ? 'Sí (abono)' : '',
      paidNow: s.amountPaidNow != null ? round2(toDecimal(s.amountPaidNow)).toNumber() : null,
      returned: s.returned ? 'Sí' : '',
    });
  }

  applyMoneyFormat(sheet, ['amountBs', 'amountUsd', 'rate', 'paidNow']);

  const totalsRow = sheet.addRow({
    method: 'TOTALES',
    amountBs: round2(toDecimal(totalBs)).toNumber(),
    amountUsd: round2(toDecimal(totalUsd)).toNumber(),
  });
  totalsRow.font = { bold: true };

  return sales.length;
}
