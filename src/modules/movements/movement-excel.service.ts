import ExcelJS from 'exceljs';
import { ExpenseCategory, IncomeCategory, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import { resolveDateFilter } from '../../utils/date-range';
import {
  cellDate,
  cellNumber,
  cellText,
  ImportResult,
  normalizeHeader,
  resolveColumns,
  styleTemplateHeader,
} from '../../utils/excel-import';
import type { MovementQuery } from './movement.dto';

/**
 * Contabilidad → exportar/importar movimientos por Excel.
 *
 * El export saca el libro de ingresos/egresos del período con las MISMAS etiquetas que el
 * import entiende, para que un archivo exportado se pueda corregir y volver a subir. El
 * import existe para cargar el historial financiero previo a QuickTap: crea los movimientos
 * con la FECHA HISTÓRICA como createdAt (así caen en su período real en todos los reportes)
 * y NUNCA toca las cuentas bancarias — ese dinero ya se movió en el pasado.
 */

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  UTILITIES: 'Servicios públicos',
  SUPPLIES: 'Compra de producto e insumos',
  RENT: 'Arriendo',
  PAYROLL: 'Nómina',
  ADMINISTRATIVE: 'Gastos administrativos',
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

const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  TIP: 'Propina',
  DEBT: 'Deuda',
  OTHER: 'Otro',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo Bs',
  CASH_USD: 'Efectivo $',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
};

/** label normalizado -> código, aceptando también el código del enum escrito tal cual. */
function reverseMap<K extends string>(labels: Record<K, string>): Map<string, K> {
  const map = new Map<string, K>();
  for (const [code, label] of Object.entries(labels) as [K, string][]) {
    map.set(normalizeHeader(label), code);
    map.set(normalizeHeader(code), code);
  }
  return map;
}

const EXPENSE_CATEGORY_BY_LABEL = reverseMap(EXPENSE_CATEGORY_LABELS);
const INCOME_CATEGORY_BY_LABEL = reverseMap(INCOME_CATEGORY_LABELS);
const PAYMENT_METHOD_BY_LABEL = reverseMap(PAYMENT_METHOD_LABELS);

const HEADERS = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Método de pago', 'Proveedor', 'Referencia', 'Monto'] as const;

function dateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const movementExcelService = {
  /** Libro de ingresos/egresos del período, con los mismos filtros de la pantalla. */
  async exportMovements(restaurantId: string, query: MovementQuery): Promise<ExcelJS.Workbook> {
    const movements = await prisma.movement.findMany({
      where: {
        restaurantId,
        createdAt: resolveDateFilter({ range: query.range, date: query.date }),
        category: query.category,
        supplierId: query.supplierId,
      },
      orderBy: { createdAt: 'asc' },
      include: { supplier: { select: { name: true } } },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contabilidad');
    sheet.addRow([...HEADERS]);
    styleTemplateHeader(sheet);
    sheet.columns = [
      { width: 12 },
      { width: 10 },
      { width: 40 },
      { width: 28 },
      { width: 16 },
      { width: 26 },
      { width: 16 },
      { width: 12 },
    ];

    for (const m of movements) {
      sheet.addRow([
        dateStr(m.expenseDate ?? m.createdAt),
        m.type === 'INCOME' ? 'Ingreso' : 'Egreso',
        m.description,
        m.type === 'INCOME'
          ? (m.incomeCategory ? INCOME_CATEGORY_LABELS[m.incomeCategory] : '')
          : (m.category ? EXPENSE_CATEGORY_LABELS[m.category] : ''),
        m.paymentMethod ? PAYMENT_METHOD_LABELS[m.paymentMethod] : '',
        m.supplier?.name ?? '',
        m.referenceNumber ?? '',
        Number(m.amountBase),
      ]);
    }

    return workbook;
  },

  /** Plantilla para cargar el historial: encabezados + dos filas de ejemplo. */
  buildImportTemplate(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contabilidad');
    sheet.addRow([...HEADERS]);
    styleTemplateHeader(sheet);
    sheet.columns = [
      { width: 12 },
      { width: 10 },
      { width: 40 },
      { width: 28 },
      { width: 16 },
      { width: 26 },
      { width: 16 },
      { width: 12 },
    ];
    sheet.addRow(['2026-01-15', 'Egreso', 'Compra de harina', 'Compra de producto e insumos', 'Transferencia', 'Distribuidora X', 'F-00123', 45.5]);
    sheet.addRow(['2026-01-15', 'Ingreso', 'Venta del día', 'Otro', 'Efectivo Bs', '', '', 120]);
    return workbook;
  },

  /**
   * Carga el historial desde un Excel. Cada fila crea un movimiento con la fecha histórica
   * como `createdAt` (mediodía, misma convención que expenseDate). Se crea DIRECTO con
   * prisma y no vía movementService.create a propósito: el historial no debe asentar nada
   * en las cuentas bancarias ni reabastecer inventario.
   */
  async importFromExcel(restaurantId: string, userId: string | undefined, buffer: Buffer): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw badRequest('El archivo no tiene ninguna hoja.');

    const { columns } = resolveColumns(sheet, {
      date: ['fecha', 'dia', 'día'],
      type: ['tipo', 'tipo de movimiento', 'movimiento'],
      description: ['descripcion', 'descripción', 'detalle', 'concepto'],
      category: ['categoria', 'categoría', 'rubro'],
      method: ['metodo de pago', 'método de pago', 'metodo', 'método', 'forma de pago'],
      supplier: ['proveedor'],
      reference: ['referencia', 'nº factura', 'numero de factura', 'nro factura', 'ref'],
      amount: ['monto', 'importe', 'total'],
    });
    if (!columns.amount) throw badRequest('El archivo debe tener una columna "Monto".');
    if (sheet.rowCount - 1 > 2000) throw badRequest('Máximo 2.000 filas por archivo — divide el historial en varios.');

    // Proveedores existentes por nombre normalizado; los que no existan se crean al vuelo,
    // para que el historial quede vinculado igual que los gastos nuevos.
    const suppliers = await prisma.supplier.findMany({ where: { restaurantId }, select: { id: true, name: true } });
    const supplierByName = new Map(suppliers.map((s) => [normalizeHeader(s.name), s.id]));

    const result: ImportResult = { created: 0, updated: 0, errors: [] };
    const rows: Prisma.MovementCreateManyInput[] = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const description = cellText(row, columns.description);
      const amount = cellNumber(row, columns.amount);
      const date = cellDate(row, columns.date);
      const typeRaw = normalizeHeader(cellText(row, columns.type));

      // Fila totalmente vacía: se ignora sin error (colas de plantilla).
      if (!description && amount == null && !date && !typeRaw) continue;

      if (amount == null || amount <= 0) {
        result.errors.push({ row: r, message: 'Monto inválido o vacío.' });
        continue;
      }
      if (!date) {
        result.errors.push({ row: r, message: 'Fecha inválida o vacía (usa AAAA-MM-DD o DD/MM/AAAA).' });
        continue;
      }
      const type = typeRaw.startsWith('ingreso') || typeRaw === 'income' ? 'INCOME' : typeRaw.startsWith('egreso') || typeRaw.startsWith('gasto') || typeRaw === 'expense' ? 'EXPENSE' : null;
      if (!type) {
        result.errors.push({ row: r, message: 'Tipo inválido: escribe "Ingreso" o "Egreso".' });
        continue;
      }

      const categoryRaw = normalizeHeader(cellText(row, columns.category));
      const methodRaw = normalizeHeader(cellText(row, columns.method));
      const supplierName = cellText(row, columns.supplier);

      let supplierId: string | undefined;
      if (supplierName && type === 'EXPENSE') {
        const key = normalizeHeader(supplierName);
        supplierId = supplierByName.get(key);
        if (!supplierId) {
          const created = await prisma.supplier.create({ data: { restaurantId, name: supplierName } });
          supplierByName.set(key, created.id);
          supplierId = created.id;
        }
      }

      const when = new Date(`${date}T12:00:00`);
      rows.push({
        restaurantId,
        type,
        amountBase: amount,
        description: description || (type === 'INCOME' ? 'Ingreso importado' : 'Egreso importado'),
        createdByUserId: userId ?? null,
        createdAt: when,
        expenseDate: type === 'EXPENSE' ? when : null,
        category: type === 'EXPENSE' ? (EXPENSE_CATEGORY_BY_LABEL.get(categoryRaw) ?? null) : null,
        incomeCategory: type === 'INCOME' ? (INCOME_CATEGORY_BY_LABEL.get(categoryRaw) ?? null) : null,
        paymentMethod: PAYMENT_METHOD_BY_LABEL.get(methodRaw) ?? null,
        referenceNumber: cellText(row, columns.reference) || null,
        supplierId: supplierId ?? null,
      });
    }

    if (rows.length > 0) {
      const created = await prisma.movement.createMany({ data: rows });
      result.created = created.count;
    }
    return result;
  },
};
