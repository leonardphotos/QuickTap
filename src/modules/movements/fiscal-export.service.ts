import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { PAYMENT_LABELS } from '../../utils/whatsapp';
import { round2, toDecimal } from '../../utils/money';
import { describeDateSpec, resolveDateFilter, type DateSpec } from '../../utils/date-range';
import { applyMoneyFormat, caracasParts, styleHeader } from '../../utils/excel';

/**
 * Libros fiscales en Excel: el mismo libro de compras y libro de ventas que se ve en
 * Administración → Libros fiscales, pero completo (sin la paginación de la pantalla) y con
 * las columnas que pide el SENIAT: fecha, proveedor/cliente, RIF, documento, base imponible,
 * IVA y total, más una fila de totales al cierre.
 */

const CATEGORY_LABELS: Record<string, string> = {
  UTILITIES: 'Servicios públicos',
  SUPPLIES: 'Compra de producto e insumos',
  RENT: 'Arriendo',
  PAYROLL: 'Nómina',
  ADMIN: 'Gastos administrativos',
  MARKETING: 'Mercadeo y Publicidad',
  TRANSPORT: 'Transporte (fletes, taxis)',
  MAINTENANCE: 'Mantenimiento',
  FURNITURE: 'Muebles',
  FUEL: 'Combustible / gasolina',
  TRAVEL: 'Viáticos y viajes',
  MEALS: 'Comidas',
  LODGING: 'Hospedaje / hotel',
  OTHER: 'Otros',
};

const DOCUMENT_LABELS: Record<string, string> = {
  FISCAL_INVOICE: 'Factura fiscal',
  DELIVERY_NOTE: 'Nota de entrega',
};

const CHANNEL_LABELS: Record<string, string> = {
  DINE_IN: 'Mesa',
  DELIVERY: 'Delivery',
  PICKUP: 'Pick-up',
  BAR: 'Barra',
};

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'QuickTap.club';
  workbook.created = new Date();
  return workbook;
}

/** Nombre de archivo seguro: sin los caracteres que Windows/macOS rechazan en un nombre. */
function fileName(book: string, businessName: string, spec: DateSpec) {
  return `${book} ${describeDateSpec(spec)} - ${businessName.replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
}

export const fiscalExportService = {
  /** Libro de compras: un renglón por egreso del período, con su proveedor y su documento. */
  async buildPurchaseBookWorkbook(restaurantId: string, spec: DateSpec) {
    const [restaurant, movements] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      prisma.movement.findMany({
        where: { restaurantId, type: 'EXPENSE', createdAt: resolveDateFilter(spec) },
        orderBy: { createdAt: 'asc' },
        select: {
          description: true,
          amountBase: true,
          category: true,
          documentType: true,
          referenceNumber: true,
          isCredit: true,
          creditPaidAt: true,
          paymentMethod: true,
          expenseDate: true,
          createdAt: true,
          invoiceDueDate: true,
          supplier: { select: { name: true, taxId: true } },
        },
      }),
    ]);

    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet('Libro de compras');
    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Proveedor', key: 'supplier', width: 28 },
      { header: 'RIF / Cédula', key: 'taxId', width: 16 },
      { header: 'Descripción', key: 'description', width: 34 },
      { header: 'Categoría', key: 'category', width: 26 },
      { header: 'Tipo de documento', key: 'documentType', width: 18 },
      { header: 'Nº de factura', key: 'reference', width: 18 },
      { header: 'Condición', key: 'condition', width: 18 },
      { header: 'Método de pago', key: 'method', width: 18 },
      { header: 'Vence', key: 'dueDate', width: 12 },
      { header: 'Total $', key: 'total', width: 14 },
    ];
    styleHeader(sheet);

    for (const m of movements) {
      const { fecha } = caracasParts(m.expenseDate ?? m.createdAt);
      sheet.addRow({
        fecha,
        supplier: m.supplier?.name ?? '',
        taxId: m.supplier?.taxId ?? '',
        description: m.description,
        category: m.category ? CATEGORY_LABELS[m.category] ?? m.category : '',
        documentType: m.documentType ? DOCUMENT_LABELS[m.documentType] ?? m.documentType : '',
        reference: m.referenceNumber ?? '',
        condition: m.isCredit ? (m.creditPaidAt ? 'Crédito · pagada' : 'Crédito · pendiente') : 'De contado',
        method: m.paymentMethod ? PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod : '',
        dueDate: m.invoiceDueDate ? caracasParts(m.invoiceDueDate).fecha : '',
        total: round2(toDecimal(m.amountBase)).toNumber(),
      });
    }

    applyMoneyFormat(sheet, ['total']);
    const totalsRow = sheet.addRow({
      description: 'TOTALES',
      total: round2(movements.reduce((acc, m) => acc.add(m.amountBase), toDecimal(0))).toNumber(),
    });
    totalsRow.font = { bold: true };

    return { workbook, filename: fileName('Libro de compras', restaurant?.name ?? 'QuickTap', spec), rows: movements.length };
  },

  /**
   * Libro de ventas. Un restaurante/cancha factura `Order` (con su IVA congelado); un local
   * comercial factura `ShopSale`, que no separa IVA — ahí la columna va en blanco y el total
   * es la venta completa.
   */
  async buildSalesBookWorkbook(restaurantId: string, spec: DateSpec) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true, businessType: true },
    });
    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet('Libro de ventas');
    const dateFilter = resolveDateFilter(spec);

    if (restaurant?.businessType === 'SHOP') {
      const sales = await prisma.shopSale.findMany({
        where: { restaurantId, returned: false, time: dateFilter },
        orderBy: { time: 'asc' },
        select: { id: true, total: true, time: true, customerName: true, paymentMethod: true, creditTerms: true, settledAt: true },
      });

      sheet.columns = [
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Hora', key: 'hora', width: 8 },
        { header: 'Ticket', key: 'ticket', width: 12 },
        { header: 'Cliente', key: 'customer', width: 28 },
        { header: 'Método de pago', key: 'method', width: 18 },
        { header: 'Condición', key: 'condition', width: 18 },
        { header: 'Total $', key: 'total', width: 14 },
      ];
      styleHeader(sheet);

      for (const s of sales) {
        const { fecha, hora } = caracasParts(s.time);
        sheet.addRow({
          fecha,
          hora,
          ticket: `#${s.id.slice(-6)}`,
          customer: s.customerName ?? '',
          method: s.paymentMethod ?? '',
          condition: s.creditTerms ? (s.settledAt ? 'Fiada · saldada' : 'Fiada · pendiente') : 'De contado',
          total: round2(toDecimal(s.total)).toNumber(),
        });
      }

      applyMoneyFormat(sheet, ['total']);
      const totalsRow = sheet.addRow({
        customer: 'TOTALES',
        total: round2(sales.reduce((acc, s) => acc.add(toDecimal(s.total)), toDecimal(0))).toNumber(),
      });
      totalsRow.font = { bold: true };

      return { workbook, filename: fileName('Libro de ventas', restaurant.name, spec), rows: sales.length };
    }

    const orders = await prisma.order.findMany({
      where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: dateFilter },
      orderBy: { createdAt: 'asc' },
      select: {
        orderNumber: true,
        channel: true,
        customerName: true,
        paymentMethod: true,
        subtotalBase: true,
        serviceChargeBase: true,
        ivaBase: true,
        totalBase: true,
        totalBs: true,
        exchangeRate: true,
        createdAt: true,
      },
    });

    sheet.columns = [
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Hora', key: 'hora', width: 8 },
      { header: 'Pedido N.°', key: 'orderNumber', width: 11 },
      { header: 'Canal', key: 'channel', width: 12 },
      { header: 'Cliente', key: 'customer', width: 28 },
      { header: 'Método de pago', key: 'method', width: 18 },
      { header: 'Base imponible $', key: 'subtotal', width: 16 },
      { header: 'Servicio $', key: 'service', width: 12 },
      { header: 'IVA $', key: 'iva', width: 12 },
      { header: 'Total $', key: 'total', width: 14 },
      { header: 'Total Bs', key: 'totalBs', width: 16 },
      { header: 'Tasa usada', key: 'rate', width: 12 },
    ];
    styleHeader(sheet);

    for (const o of orders) {
      const { fecha, hora } = caracasParts(o.createdAt);
      sheet.addRow({
        fecha,
        hora,
        orderNumber: o.orderNumber,
        channel: CHANNEL_LABELS[o.channel] ?? o.channel,
        customer: o.customerName ?? '',
        method: o.paymentMethod ? PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod : '',
        subtotal: round2(toDecimal(o.subtotalBase)).toNumber(),
        service: round2(toDecimal(o.serviceChargeBase)).toNumber(),
        iva: round2(toDecimal(o.ivaBase)).toNumber(),
        total: round2(toDecimal(o.totalBase)).toNumber(),
        totalBs: round2(toDecimal(o.totalBs)).toNumber(),
        rate: round2(toDecimal(o.exchangeRate)).toNumber(),
      });
    }

    applyMoneyFormat(sheet, ['subtotal', 'service', 'iva', 'total', 'totalBs', 'rate']);
    const sum = (key: 'subtotalBase' | 'serviceChargeBase' | 'ivaBase' | 'totalBase' | 'totalBs') =>
      round2(orders.reduce((acc, o) => acc.add(o[key]), toDecimal(0))).toNumber();
    const totalsRow = sheet.addRow({
      customer: 'TOTALES',
      subtotal: sum('subtotalBase'),
      service: sum('serviceChargeBase'),
      iva: sum('ivaBase'),
      total: sum('totalBase'),
      totalBs: sum('totalBs'),
    });
    totalsRow.font = { bold: true };

    return { workbook, filename: fileName('Libro de ventas', restaurant?.name ?? 'QuickTap', spec), rows: orders.length };
  },
};
