import ExcelJS from 'exceljs';
import { BusinessType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { platformSettingsService } from '../platform-settings/platform-settings.service';
import { forbidden, HttpError, serviceUnavailable } from '../../utils/http-error';
import { styleHeader, applyMoneyFormat } from '../../utils/excel';
import { startOfDayCaracas } from '../../utils/timezone';
import type { AiReportRequest } from './ai-reports.dto';

type Area = 'OVERVIEW' | 'SALES' | 'INVENTORY' | 'OPERATIONS' | 'FINANCE';
type Intent = { area: Area; title: string; from?: string; to?: string };

function windowFor(input: AiReportRequest, intent: Intent) {
  const from = input.from ?? intent.from;
  const to = input.to ?? intent.to;
  const end = to ?? new Date().toISOString().slice(0, 10);
  const start = from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const gte = startOfDayCaracas(start);
  const lt = new Date(startOfDayCaracas(end).getTime() + 86_400_000);
  if (gte >= lt || (lt.getTime() - gte.getTime()) / 86_400_000 > 366) throw new HttpError(400, 'El período debe ser de 1 a 366 días.');
  return { gte, lt, label: `${start} a ${end}` };
}

async function interpret(question: string, businessType: BusinessType): Promise<Intent> {
  let response: Response;
  const t0 = Date.now();
  try {
    response = await fetch(`${env.aiPhotoServiceUrl}/report-intent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, vertical: businessType }),
    });
  } catch { throw serviceUnavailable('El servicio de reportes con IA no está disponible.'); }
  const total = Number(response.headers.get('X-Gemini-Total') ?? 0);
  if (total > 0) prisma.aiUsage.create({ data: {
    operacion: 'reporte-intent', modelo: response.headers.get('X-Gemini-Modelo') ?? 'desconocido', entrada: Number(response.headers.get('X-Gemini-Entrada') ?? 0),
    salida: Number(response.headers.get('X-Gemini-Salida') ?? 0), razonamiento: Number(response.headers.get('X-Gemini-Razonamiento') ?? 0), total, ms: Date.now() - t0,
  } }).catch(() => undefined);
  if (!response.ok) throw serviceUnavailable('No se pudo interpretar la solicitud.');
  const data = await response.json() as Partial<Intent>;
  const area: Area = ['OVERVIEW', 'SALES', 'INVENTORY', 'OPERATIONS', 'FINANCE'].includes(data.area ?? '') ? data.area as Area : 'OVERVIEW';
  return { area, title: String(data.title ?? 'Reporte de estadísticas').slice(0, 100), from: data.from, to: data.to };
}

function addSummary(book: ExcelJS.Workbook, title: string, period: string, rows: { metric: string; value: number | string }[]) {
  const sheet = book.addWorksheet('Resumen');
  sheet.columns = [{ header: 'Métrica', key: 'metric', width: 34 }, { header: 'Valor', key: 'value', width: 20 }];
  styleHeader(sheet); sheet.addRows(rows);
  sheet.spliceRows(1, 0, [title, period]);
  sheet.mergeCells('A1:B1'); sheet.mergeCells('A2:B2'); sheet.getCell('A1').font = { bold: true, size: 15 }; sheet.getCell('A2').font = { italic: true, color: { argb: 'FF4B5563' } };
}

async function restaurantReport(book: ExcelJS.Workbook, restaurantId: string, w: { gte: Date; lt: Date }) {
  const where = { restaurantId, status: { not: 'CANCELLED' as const }, createdAt: { gte: w.gte, lt: w.lt }, isPartnerConsumption: false };
  const [sales, channels, products] = await Promise.all([
    prisma.order.aggregate({ where, _sum: { totalBase: true }, _count: true }),
    prisma.order.groupBy({ by: ['channel'], where, _sum: { totalBase: true }, _count: true }),
    prisma.orderItem.groupBy({ by: ['productName'], where: { order: where }, _sum: { quantity: true, lineTotal: true }, orderBy: { _sum: { lineTotal: 'desc' } }, take: 100 }),
  ]);
  addSummary(book, 'Reporte de restaurante', '', [{ metric: 'Ventas', value: Number(sales._sum.totalBase ?? 0) }, { metric: 'Pedidos', value: sales._count }, { metric: 'Ticket promedio', value: sales._count ? Number(sales._sum.totalBase ?? 0) / sales._count : 0 }]);
  const sheet = book.addWorksheet('Productos'); sheet.columns = [{ header: 'Producto', key: 'name', width: 34 }, { header: 'Unidades', key: 'qty', width: 14 }, { header: 'Ventas', key: 'total', width: 16 }]; styleHeader(sheet); sheet.addRows(products.map(p => ({ name: p.productName, qty: Number(p._sum.quantity ?? 0), total: Number(p._sum.lineTotal ?? 0) }))); applyMoneyFormat(sheet, ['total']);
  const c = book.addWorksheet('Canales'); c.columns = [{ header: 'Canal', key: 'channel', width: 18 }, { header: 'Pedidos', key: 'count', width: 14 }, { header: 'Ventas', key: 'total', width: 16 }]; styleHeader(c); c.addRows(channels.map(x => ({ channel: x.channel, count: x._count, total: Number(x._sum.totalBase ?? 0) }))); applyMoneyFormat(c, ['total']);
}

async function shopReport(book: ExcelJS.Workbook, restaurantId: string, w: { gte: Date; lt: Date }) {
  const where = { restaurantId, returned: false, time: { gte: w.gte, lt: w.lt } };
  const [sales, products] = await Promise.all([
    prisma.shopSale.aggregate({ where, _sum: { total: true }, _count: true }),
    prisma.shopSaleItem.groupBy({ by: ['name'], where: { sale: where }, _sum: { qty: true, price: true }, orderBy: { _sum: { qty: 'desc' } }, take: 100 }),
  ]);
  addSummary(book, 'Reporte de local comercial', '', [{ metric: 'Ventas', value: sales._sum.total ?? 0 }, { metric: 'Tickets', value: sales._count }, { metric: 'Ticket promedio', value: sales._count ? (sales._sum.total ?? 0) / sales._count : 0 }]);
  const sheet = book.addWorksheet('Productos'); sheet.columns = [{ header: 'Producto', key: 'name', width: 34 }, { header: 'Unidades', key: 'qty', width: 14 }]; styleHeader(sheet); sheet.addRows(products.map(p => ({ name: p.name, qty: p._sum.qty ?? 0 })));
}

async function clubReport(book: ExcelJS.Workbook, restaurantId: string, w: { gte: Date; lt: Date }) {
  const where = { restaurantId, createdAt: { gte: w.gte, lt: w.lt }, status: { not: 'CANCELLED' as const } };
  const [bookings, statuses] = await Promise.all([
    prisma.clubBooking.aggregate({ where, _sum: { totalBase: true }, _count: true }),
    prisma.clubBooking.groupBy({ by: ['status'], where, _count: true, _sum: { totalBase: true } }),
  ]);
  addSummary(book, 'Reporte de club deportivo', '', [{ metric: 'Reservas', value: bookings._count }, { metric: 'Facturación de reservas', value: Number(bookings._sum.totalBase ?? 0) }]);
  const sheet = book.addWorksheet('Reservas por estado'); sheet.columns = [{ header: 'Estado', key: 'status', width: 24 }, { header: 'Reservas', key: 'count', width: 14 }, { header: 'Facturación', key: 'total', width: 16 }]; styleHeader(sheet); sheet.addRows(statuses.map(s => ({ status: s.status, count: s._count, total: Number(s._sum.totalBase ?? 0) }))); applyMoneyFormat(sheet, ['total']);
}

async function officeReport(book: ExcelJS.Workbook, restaurantId: string, w: { gte: Date; lt: Date }) {
  const [companies, entries, lines] = await Promise.all([
    prisma.company.count({ where: { restaurantId, active: true } }),
    prisma.journalEntry.count({ where: { company: { restaurantId }, date: { gte: w.gte, lt: w.lt }, voidedAt: null } }),
    prisma.journalLine.aggregate({ where: { entry: { company: { restaurantId }, date: { gte: w.gte, lt: w.lt } } }, _sum: { debit: true, credit: true } }),
  ]);
  addSummary(book, 'Reporte de oficina administrativa', '', [{ metric: 'Empresas activas', value: companies }, { metric: 'Asientos contables', value: entries }, { metric: 'Debe', value: Number(lines._sum.debit ?? 0) }, { metric: 'Haber', value: Number(lines._sum.credit ?? 0) }]);
}

export const aiReportsService = {
  async build(restaurantId: string, input: AiReportRequest) {
    if (!(await platformSettingsService.getAiReportsEnabledOrDefault())) throw forbidden('Los reportes con IA están desactivados por el administrador de QuickTap.');
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true, businessType: true } });
    const intent = await interpret(input.question, restaurant.businessType);
    const w = windowFor(input, intent); const book = new ExcelJS.Workbook(); book.creator = 'QuickTap.club'; book.created = new Date();
    if (restaurant.businessType === 'RESTAURANT') await restaurantReport(book, restaurantId, w);
    else if (restaurant.businessType === 'SHOP') await shopReport(book, restaurantId, w);
    else if (restaurant.businessType === 'SPORTS_CLUB') await clubReport(book, restaurantId, w);
    else await officeReport(book, restaurantId, w);
    const summary = book.getWorksheet('Resumen')!; summary.getCell('A1').value = intent.title; summary.getCell('A2').value = `Período: ${w.label} · Solicitud: ${input.question}`;
    return { book, filename: `reporte-ia-${restaurant.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.xlsx` };
  },
};
