import ExcelJS from 'exceljs';

// Helpers compartidos por las exportaciones a Excel (historial de ventas, historial de
// pedidos y libros fiscales): mismo formato de fecha, misma cabecera y mismo formato de
// moneda en todos los archivos que descarga el negocio.

/** Formatea una fecha en hora de Caracas y devuelve fecha y hora por separado. */
export function caracasParts(date: Date): { fecha: string; hora: string } {
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

export function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1428' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export function applyMoneyFormat(sheet: ExcelJS.Worksheet, keys: string[]) {
  for (const key of keys) sheet.getColumn(key).numFmt = '#,##0.00';
}

