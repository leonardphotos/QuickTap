import ExcelJS from 'exceljs';

/**
 * ============================================================================
 *  Utilidades compartidas para las importaciones por Excel (insumos, productos)
 * ============================================================================
 *  La regla central: NUNCA leer las columnas por posición fija. Los archivos
 *  que sube un restaurante casi nunca respetan el orden exacto de la plantilla
 *  (vienen exportados de otro sistema, con columnas de más, o en otro orden),
 *  y leer por posición hacía que, por ejemplo, el nombre del producto cayera
 *  en la columna de "Unidad" y TODAS las filas fallaran con un error confuso.
 *
 *  En vez de eso, se lee la fila 1 como encabezados y se mapea cada columna
 *  por su NOMBRE, aceptando sinónimos comunes (ver los `spec` de cada
 *  importador). Una columna que no se reconoce simplemente se ignora.
 */

/** Minúsculas, sin acentos, sin espacios de más — para comparar encabezados escritos a mano. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mapea cada clave del `spec` a un número de columna de la hoja, buscando por nombre de
 * encabezado. Primero exige coincidencia exacta (así "Cantidad mínima" nunca se confunde con
 * "Cantidad") y recién después acepta coincidencia parcial, empezando por los alias más
 * largos/específicos. Una columna ya asignada no se vuelve a usar.
 */
export function resolveColumns<K extends string>(
  sheet: ExcelJS.Worksheet,
  spec: Record<K, string[]>,
): { columns: Partial<Record<K, number>>; headers: string[] } {
  const headerRow = sheet.getRow(1);
  const columnCount = Math.max(sheet.columnCount || 0, headerRow.cellCount || 0);

  const headers: string[] = [];
  for (let c = 1; c <= columnCount; c++) {
    headers.push(String(headerRow.getCell(c).value ?? '').trim());
  }
  const normalized = headers.map(normalizeHeader);

  const columns: Partial<Record<K, number>> = {};
  const claimed = new Set<number>();
  const entries = Object.entries(spec) as [K, string[]][];

  // 1) Coincidencia exacta.
  for (const [key, aliases] of entries) {
    const normalizedAliases = aliases.map(normalizeHeader);
    const idx = normalized.findIndex((h, i) => h.length > 0 && !claimed.has(i + 1) && normalizedAliases.includes(h));
    if (idx >= 0) {
      columns[key] = idx + 1;
      claimed.add(idx + 1);
    }
  }

  // 2) Coincidencia parcial ("Cantidad mínima (kg)" -> minQuantity). Se procesan las claves
  // cuyo alias más largo es más específico primero, para que "cantidad minima" gane sobre
  // "cantidad" cuando el archivo solo trae una de las dos.
  const bySpecificity = [...entries].sort(
    (a, b) => Math.max(...b[1].map((x) => x.length)) - Math.max(...a[1].map((x) => x.length)),
  );
  for (const [key, aliases] of bySpecificity) {
    if (columns[key]) continue;
    const normalizedAliases = aliases.map(normalizeHeader).sort((a, b) => b.length - a.length);
    const idx = normalized.findIndex((h, i) => h.length > 0 && !claimed.has(i + 1) && normalizedAliases.some((a) => h.includes(a)));
    if (idx >= 0) {
      columns[key] = idx + 1;
      claimed.add(idx + 1);
    }
  }

  return { columns, headers };
}

/** Texto de una celda, ya recortado. Devuelve '' si la celda está vacía. */
export function cellText(row: ExcelJS.Row, column: number | undefined): string {
  if (!column) return '';
  const value = row.getCell(column).value;
  if (value == null) return '';
  // Celdas con fórmula/hipervínculo traen un objeto; ExcelJS expone el valor mostrado en `result`/`text`.
  if (typeof value === 'object') {
    const obj = value as { result?: unknown; text?: unknown };
    if (obj.result != null) return String(obj.result).trim();
    if (obj.text != null) return String(obj.text).trim();
  }
  return String(value).trim();
}

/**
 * Número de una celda, tolerando el formato que escribe la gente: "1.234,56", "$ 12,50",
 * "12 kg". Devuelve undefined si la celda está vacía o no tiene ningún número reconocible —
 * quien llama decide si eso es un error o un valor por defecto.
 */
export function cellNumber(row: ExcelJS.Row, column: number | undefined): number | undefined {
  const raw = cellText(row, column);
  if (!raw) return undefined;

  let cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return undefined;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador decimal es el que aparece último ("1.234,56" vs "1,234.56").
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    cleaned = cleaned.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    // Solo comas: decimal si quedan 1-2 dígitos detrás ("12,50"), si no es separador de miles.
    cleaned = cleaned.length - lastComma - 1 <= 2 ? cleaned.replace(',', '.') : cleaned.split(',').join('');
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Interpreta "sí/si/true/1/x" como verdadero y "no/false/0" como falso. undefined si está vacío. */
export function cellBoolean(row: ExcelJS.Row, column: number | undefined): boolean | undefined {
  const raw = normalizeHeader(cellText(row, column));
  if (!raw) return undefined;
  if (['si', 'sí', 'true', '1', 'x', 'verdadero', 'yes'].includes(raw)) return true;
  if (['no', 'false', '0', 'falso'].includes(raw)) return false;
  return undefined;
}

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: ImportRowError[];
}

/** Encabezado azul QuickTap + fila fijada, compartido por todas las plantillas. */
export function styleTemplateHeader(sheet: ExcelJS.Worksheet): void {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1428' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}
