import ExcelJS from 'exceljs';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { PAYMENT_LABELS } from '../../utils/whatsapp';
import { round2, toDecimal } from '../../utils/money';
import { exchangeRateService } from '../exchange-rate/exchange-rate.service';

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
};

/**
 * El vertical Local (ShopSale) guarda el método como etiqueta legible, no como
 * enum. Mismo criterio que ShopPosPage.tsx (USD_PAYMENT_LABELS) para saber si
 * el cobro fue en divisa.
 */
const USD_SHOP_LABELS = new Set(['Efectivo $', 'Zelle', 'Binance', 'PayPal']);

/** Formatea una fecha en hora de Caracas y devuelve fecha y hora por separado. */
function caracasParts(date: Date): { fecha: string; hora: string } {
  const fecha = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  const hora = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return { fecha, hora };
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1428' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function applyMoneyFormat(sheet: ExcelJS.Worksheet, keys: string[]) {
  for (const key of keys) sheet.getColumn(key).numFmt = '#,##0.00';
}

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
