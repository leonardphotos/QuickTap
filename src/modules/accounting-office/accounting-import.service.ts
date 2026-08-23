import { AccountKind, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest } from '../../utils/http-error';
import { assertCompany } from './accounting.service';

/**
 * Carga masiva del vertical Administrativo desde un solo Excel.
 *
 * Un archivo con tres hojas —Cuentas, Contactos y Asientos— en vez de tres plantillas
 * sueltas: quien monta una empresa desde cero las necesita a las tres y en ese orden, y
 * separarlas obliga a subir tres veces cuidando que la primera haya entrado bien.
 *
 * La plantilla se baja YA LLENA con lo que la empresa tenga cargado, así que también sirve
 * de respaldo: se baja, se edita en Excel y se vuelve a subir.
 *
 * Todo o nada. Si una sola fila está mal no se escribe nada y se devuelve la lista completa
 * de errores con su número de fila. Media contabilidad importada es peor que ninguna: no se
 * sabe dónde quedó cortada y los libros arrancan descuadrados.
 */

const HOJA_CUENTAS = 'Cuentas';
const HOJA_CONTACTOS = 'Contactos';
const HOJA_ASIENTOS = 'Asientos';

/** El tipo de cuenta se escribe en español en el Excel; acá se traduce al enum. */
const TIPO_A_ENUM: Record<string, AccountKind> = {
  activo: 'ASSET',
  pasivo: 'LIABILITY',
  patrimonio: 'EQUITY',
  ingreso: 'INCOME',
  gasto: 'EXPENSE',
};
const ENUM_A_TIPO: Record<AccountKind, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

const d = (v: number | string) => new Prisma.Decimal(v);
const cero = new Prisma.Decimal(0);
const clave = (s: string) => s.trim().toLowerCase();

/**
 * Lista desplegable en una columna. ExcelJS solo expone la validación por celda, y tocar una
 * celda la crea, así que el rango se limita a lo que hay más un margen: pintar mil filas
 * dejaría el archivo con mil filas vacías y una barra de scroll que no lleva a ninguna parte.
 */
const MARGEN_FILAS = 60;
function desplegable(sheet: ExcelJS.Worksheet, columna: string, hasta: number, opciones: string[], obligatorio = false) {
  for (let n = 2; n <= hasta; n++) {
    sheet.getCell(`${columna}${n}`).dataValidation = {
      type: 'list',
      allowBlank: !obligatorio,
      formulae: [`"${opciones.join(',')}"`],
    };
  }
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1428' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

const texto = (c: ExcelJS.Cell): string => {
  const v = c.value;
  if (v == null) return '';
  // Una celda con fórmula o con texto enriquecido no es un string: hay que sacarle el valor.
  if (typeof v === 'object') {
    if ('result' in v) return String((v as { result?: unknown }).result ?? '').trim();
    if ('richText' in v) return (v as ExcelJS.RichText[] | { richText: ExcelJS.RichText[] } as { richText: ExcelJS.RichText[] }).richText.map((t) => t.text).join('').trim();
    if ('text' in v) return String((v as { text?: unknown }).text ?? '').trim();
  }
  return String(v).trim();
};

/** "Sí" / "No" del Excel a booleano. Vacío = no. */
const siNo = (c: ExcelJS.Cell): boolean => {
  const t = clave(texto(c));
  return t === 'si' || t === 'sí' || t === 'x' || t === 'true' || t === '1' || t === 'verdadero';
};

/**
 * Monto de una celda. Si viene numérica se usa tal cual; si viene como texto se interpreta
 * el formato local: "1.234,56" tiene el punto de miles y la coma decimal. Sin esto, un
 * archivo escrito a mano en Venezuela entra con los montos multiplicados por cien.
 */
function monto(c: ExcelJS.Cell): number | null {
  const v = c.value;
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let t = texto(c).replace(/[^\d.,-]/g, '');
  if (!t) return null;
  const tieneComa = t.includes(',');
  const tienePunto = t.includes('.');
  if (tieneComa && tienePunto) t = t.replace(/\./g, '').replace(',', '.');
  else if (tieneComa) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Fecha de una celda, venga como fecha de Excel o escrita a mano. */
function fecha(c: ExcelJS.Cell): Date | null {
  const v = c.value;
  if (v instanceof Date) return v;
  const t = texto(c);
  if (!t) return null;
  // dd/mm/aaaa es como se escribe acá; Date() lo leería al revés.
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  const iso = new Date(t);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

interface ErrorFila {
  hoja: string;
  row: number;
  message: string;
}

export const accountingImportService = {
  /**
   * Arma la plantilla con lo que la empresa ya tenga cargado. Si está vacía, deja una fila
   * de ejemplo por hoja para que se vea el formato esperado en vez de una hoja en blanco.
   */
  async buildTemplate(restaurantId: string, companyId: string) {
    const empresa = await assertCompany(restaurantId, companyId);
    const [cuentas, contactos, asientos] = await Promise.all([
      prisma.ledgerAccount.findMany({
        where: { companyId },
        select: { code: true, name: true, kind: true, postable: true, parent: { select: { code: true } } },
        orderBy: { code: 'asc' },
      }),
      prisma.businessContact.findMany({
        where: { companyId },
        select: { name: true, taxId: true, phone: true, email: true, address: true, isCustomer: true, isSupplier: true, isEmployee: true, notes: true },
        orderBy: { name: 'asc' },
      }),
      prisma.journalEntry.findMany({
        where: { companyId, voidedAt: null },
        select: {
          number: true,
          date: true,
          description: true,
          reference: true,
          lines: {
            select: { debit: true, credit: true, detail: true, account: { select: { code: true } }, contact: { select: { name: true } } },
          },
        },
        orderBy: { number: 'asc' },
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuickTap';

    // ─── Instrucciones ────────────────────────────────────────────────────
    const guia = workbook.addWorksheet('Instrucciones');
    guia.columns = [{ width: 108 }];
    const titulo = guia.addRow([`Carga de ${empresa.name}`]);
    titulo.font = { bold: true, size: 14 };
    for (const linea of [
      '',
      'Este archivo se baja ya lleno con lo que la empresa tiene cargado. Edítalo y vuelve a subirlo.',
      'Se revisa entero antes de escribir: si una fila está mal, no entra nada y se listan todos los errores.',
      '',
      'Hoja "Cuentas" — el plan de cuentas.',
      '   · Código: único por empresa. Es el que usan los asientos.',
      '   · Tipo: Activo, Pasivo, Patrimonio, Ingreso o Gasto.',
      '   · Recibe asientos: "No" en las cuentas de agrupación, que solo totalizan a sus hijas.',
      '   · Cuenta padre: el CÓDIGO de la cuenta que la agrupa. Puede estar más abajo en la hoja.',
      '   · Una cuenta que ya tenga movimientos no cambia de tipo: el archivo la deja como está.',
      '',
      'Hoja "Contactos" — clientes, proveedores y empleados.',
      '   · Se reconocen por el nombre. Si ya existe, se actualizan sus datos.',
      '   · Cliente / Proveedor / Empleado: escribe "Sí" en las que apliquen. Uno puede ser varias.',
      '',
      'Hoja "Asientos" — el libro diario.',
      '   · Un asiento ocupa VARIAS filas, una por línea. Todas llevan el mismo número en la',
      '     primera columna: así se sabe qué filas van juntas. Ese número solo agrupa; el',
      '     definitivo lo asigna el sistema al guardar.',
      '   · Cada línea lleva monto en el Debe o en el Haber, nunca en los dos.',
      '   · El asiento tiene que cuadrar: la suma del Debe igual a la del Haber.',
      '   · Cuenta: el código de la hoja "Cuentas". Contacto: el nombre de la hoja "Contactos".',
      '   · Fecha en formato dd/mm/aaaa.',
      '',
      'Los asientos de este archivo se AGREGAN a los que ya existen; no reemplazan nada.',
      'Por eso, si bajas la plantilla llena y la vuelves a subir tal cual, los asientos se duplican:',
      'borra las filas de la hoja "Asientos" que ya estén cargadas antes de subirla.',
    ]) {
      guia.addRow([linea]);
    }

    // ─── Cuentas ──────────────────────────────────────────────────────────
    const hCuentas = workbook.addWorksheet(HOJA_CUENTAS);
    hCuentas.columns = [
      { header: 'Código', width: 14 },
      { header: 'Nombre', width: 40 },
      { header: 'Tipo', width: 14 },
      { header: 'Recibe asientos', width: 16 },
      { header: 'Cuenta padre (código)', width: 22 },
    ];
    styleHeader(hCuentas);
    for (const c of cuentas) {
      hCuentas.addRow([c.code, c.name, ENUM_A_TIPO[c.kind], c.postable ? 'Sí' : 'No', c.parent?.code ?? '']);
    }
    if (cuentas.length === 0) {
      hCuentas.addRow(['1', 'Activo', 'Activo', 'No', '']);
      hCuentas.addRow(['1.1', 'Banco', 'Activo', 'Sí', '1']);
    }
    // Listas desplegables para que el tipo no se escriba de veinte formas distintas.
    // El tope se calcula ANTES de pintar: cada columna crea filas, y encadenarlas iría creciendo.
    const topeCuentas = hCuentas.rowCount + MARGEN_FILAS;
    desplegable(hCuentas, 'C', topeCuentas, ['Activo', 'Pasivo', 'Patrimonio', 'Ingreso', 'Gasto'], true);
    desplegable(hCuentas, 'D', topeCuentas, ['Sí', 'No']);

    // ─── Contactos ────────────────────────────────────────────────────────
    const hContactos = workbook.addWorksheet(HOJA_CONTACTOS);
    hContactos.columns = [
      { header: 'Nombre', width: 34 },
      { header: 'RIF o cédula', width: 18 },
      { header: 'Teléfono', width: 18 },
      { header: 'Correo', width: 28 },
      { header: 'Dirección', width: 34 },
      { header: 'Cliente', width: 10 },
      { header: 'Proveedor', width: 11 },
      { header: 'Empleado', width: 11 },
      { header: 'Notas', width: 34 },
    ];
    styleHeader(hContactos);
    for (const c of contactos) {
      hContactos.addRow([
        c.name,
        c.taxId ?? '',
        c.phone ?? '',
        c.email ?? '',
        c.address ?? '',
        c.isCustomer ? 'Sí' : '',
        c.isSupplier ? 'Sí' : '',
        c.isEmployee ? 'Sí' : '',
        c.notes ?? '',
      ]);
    }
    if (contactos.length === 0) {
      hContactos.addRow(['Distribuidora Ejemplo, C.A.', 'J-401234567', '0212-1234567', 'pagos@ejemplo.com', 'Caracas', '', 'Sí', '', '']);
    }
    const topeContactos = hContactos.rowCount + MARGEN_FILAS;
    for (const col of ['F', 'G', 'H']) desplegable(hContactos, col, topeContactos, ['Sí', 'No']);

    // ─── Asientos ─────────────────────────────────────────────────────────
    const hAsientos = workbook.addWorksheet(HOJA_ASIENTOS);
    hAsientos.columns = [
      { header: 'N° asiento', width: 11 },
      { header: 'Fecha', width: 13 },
      { header: 'Descripción', width: 40 },
      { header: 'Referencia', width: 18 },
      { header: 'Cuenta (código)', width: 16 },
      { header: 'Detalle', width: 30 },
      { header: 'Contacto', width: 26 },
      { header: 'Debe', width: 14 },
      { header: 'Haber', width: 14 },
    ];
    styleHeader(hAsientos);
    const fmtFecha = (f: Date) => f.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    for (const a of asientos) {
      for (const l of a.lines) {
        hAsientos.addRow([
          a.number,
          fmtFecha(a.date),
          a.description,
          a.reference ?? '',
          l.account.code,
          l.detail ?? '',
          l.contact?.name ?? '',
          Number(l.debit) || '',
          Number(l.credit) || '',
        ]);
      }
    }
    if (asientos.length === 0) {
      const codigo = cuentas.find((c) => c.postable)?.code ?? '1.1';
      const otro = cuentas.filter((c) => c.postable)[1]?.code ?? '4.1';
      hAsientos.addRow([1, fmtFecha(new Date()), 'Venta del día', 'F-001', codigo, '', '', 100, '']);
      hAsientos.addRow([1, fmtFecha(new Date()), 'Venta del día', 'F-001', otro, '', '', '', 100]);
    }
    hAsientos.getColumn(8).numFmt = '#,##0.00';
    hAsientos.getColumn(9).numFmt = '#,##0.00';

    return workbook;
  },

  /**
   * Lee el archivo completo y lo escribe en una sola transacción.
   *
   * Las tres hojas son opcionales por separado: se puede subir un archivo con solo cuentas,
   * o solo asientos sobre un plan ya cargado.
   */
  async importFromExcel(restaurantId: string, companyId: string, userId: string | undefined, buffer: Buffer) {
    await assertCompany(restaurantId, companyId);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const hCuentas = workbook.getWorksheet(HOJA_CUENTAS);
    const hContactos = workbook.getWorksheet(HOJA_CONTACTOS);
    const hAsientos = workbook.getWorksheet(HOJA_ASIENTOS);
    if (!hCuentas && !hContactos && !hAsientos) {
      throw badRequest(`El archivo no tiene ninguna hoja "${HOJA_CUENTAS}", "${HOJA_CONTACTOS}" ni "${HOJA_ASIENTOS}". Baja la plantilla y trabaja sobre ella.`);
    }

    const errores: ErrorFila[] = [];
    const [cuentasBD, contactosBD] = await Promise.all([
      prisma.ledgerAccount.findMany({
        where: { companyId },
        select: { id: true, code: true, kind: true, postable: true, _count: { select: { lines: true } } },
      }),
      prisma.businessContact.findMany({ where: { companyId }, select: { id: true, name: true } }),
    ]);
    const cuentaPorCodigo = new Map(cuentasBD.map((c) => [clave(c.code), c]));
    const contactoPorNombre = new Map(contactosBD.map((c) => [clave(c.name), c.id]));

    // ─── Fase 1: cuentas ──────────────────────────────────────────────────
    interface CuentaFila {
      code: string;
      name: string;
      kind: AccountKind;
      postable: boolean;
      parentCode: string | null;
      existente: (typeof cuentasBD)[number] | undefined;
    }
    const filasCuenta: CuentaFila[] = [];
    const codigosVistos = new Set<string>();
    if (hCuentas) {
      for (let n = 2; n <= hCuentas.rowCount; n++) {
        const row = hCuentas.getRow(n);
        const code = texto(row.getCell(1));
        const name = texto(row.getCell(2));
        if (!code && !name) continue;
        if (!code) { errores.push({ hoja: HOJA_CUENTAS, row: n, message: 'Falta el código de la cuenta.' }); continue; }
        if (!name) { errores.push({ hoja: HOJA_CUENTAS, row: n, message: `La cuenta ${code} no tiene nombre.` }); continue; }
        if (codigosVistos.has(clave(code))) {
          errores.push({ hoja: HOJA_CUENTAS, row: n, message: `El código ${code} está repetido en el archivo.` });
          continue;
        }
        codigosVistos.add(clave(code));

        const kind = TIPO_A_ENUM[clave(texto(row.getCell(3)))];
        if (!kind) {
          errores.push({ hoja: HOJA_CUENTAS, row: n, message: `Tipo inválido en la cuenta ${code}: usa Activo, Pasivo, Patrimonio, Ingreso o Gasto.` });
          continue;
        }
        const recibeCelda = texto(row.getCell(4));
        // Vacío = recibe asientos, que es lo normal en una cuenta de detalle.
        const postable = recibeCelda === '' ? true : siNo(row.getCell(4));
        const existente = cuentaPorCodigo.get(clave(code));
        if (existente && existente._count.lines > 0 && existente.kind !== kind) {
          errores.push({
            hoja: HOJA_CUENTAS,
            row: n,
            message: `La cuenta ${code} ya tiene movimientos: no se le puede cambiar el tipo.`,
          });
          continue;
        }
        filasCuenta.push({ code, name, kind, postable, parentCode: texto(row.getCell(5)) || null, existente });
      }

      // El padre puede estar más abajo en la hoja, así que se valida contra el archivo y la BD.
      for (const f of filasCuenta) {
        if (!f.parentCode) continue;
        if (!codigosVistos.has(clave(f.parentCode)) && !cuentaPorCodigo.has(clave(f.parentCode))) {
          errores.push({ hoja: HOJA_CUENTAS, row: 0, message: `La cuenta ${f.code} apunta a una cuenta padre (${f.parentCode}) que no existe.` });
        }
        if (clave(f.parentCode) === clave(f.code)) {
          errores.push({ hoja: HOJA_CUENTAS, row: 0, message: `La cuenta ${f.code} no puede ser su propia cuenta padre.` });
        }
      }
    }

    // ─── Fase 2: contactos ────────────────────────────────────────────────
    interface ContactoFila {
      name: string;
      taxId: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      isCustomer: boolean;
      isSupplier: boolean;
      isEmployee: boolean;
      notes: string | null;
      id: string | undefined;
    }
    const filasContacto: ContactoFila[] = [];
    const nombresVistos = new Set<string>();
    if (hContactos) {
      for (let n = 2; n <= hContactos.rowCount; n++) {
        const row = hContactos.getRow(n);
        const name = texto(row.getCell(1));
        if (!name) continue;
        if (nombresVistos.has(clave(name))) {
          errores.push({ hoja: HOJA_CONTACTOS, row: n, message: `El contacto "${name}" está repetido en el archivo.` });
          continue;
        }
        nombresVistos.add(clave(name));
        const email = texto(row.getCell(4)) || null;
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          errores.push({ hoja: HOJA_CONTACTOS, row: n, message: `El correo de "${name}" no es válido.` });
          continue;
        }
        filasContacto.push({
          name,
          taxId: texto(row.getCell(2)) || null,
          phone: texto(row.getCell(3)) || null,
          email,
          address: texto(row.getCell(5)) || null,
          isCustomer: siNo(row.getCell(6)),
          isSupplier: siNo(row.getCell(7)),
          isEmployee: siNo(row.getCell(8)),
          notes: texto(row.getCell(9)) || null,
          id: contactoPorNombre.get(clave(name)),
        });
      }
    }

    // ─── Fase 3: asientos ─────────────────────────────────────────────────
    interface LineaFila {
      row: number;
      accountCode: string;
      detail: string | null;
      contactName: string | null;
      debit: number;
      credit: number;
    }
    interface AsientoFila {
      grupo: string;
      date: Date;
      description: string;
      reference: string | null;
      lineas: LineaFila[];
    }
    const grupos = new Map<string, AsientoFila>();
    // Las cuentas que el archivo deja imputables: una cuenta creada en la hoja "Cuentas"
    // todavía no está en la BD, pero sus asientos sí pueden apuntarle en el mismo archivo.
    const postablePorCodigo = new Map<string, boolean>();
    for (const c of cuentasBD) postablePorCodigo.set(clave(c.code), c.postable);
    for (const f of filasCuenta) postablePorCodigo.set(clave(f.code), f.postable);

    if (hAsientos) {
      for (let n = 2; n <= hAsientos.rowCount; n++) {
        const row = hAsientos.getRow(n);
        const grupo = texto(row.getCell(1));
        const accountCode = texto(row.getCell(5));
        const descripcion = texto(row.getCell(3));
        if (!grupo && !accountCode && !descripcion) continue;
        if (!grupo) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: 'Falta el N° de asiento: es lo que agrupa las líneas.' }); continue; }

        const debit = monto(row.getCell(8)) ?? 0;
        const credit = monto(row.getCell(9)) ?? 0;
        if (debit > 0 && credit > 0) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: 'Una línea no puede ir al Debe y al Haber a la vez.' }); continue; }
        if (debit <= 0 && credit <= 0) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: 'La línea no tiene monto ni en el Debe ni en el Haber.' }); continue; }
        if (!accountCode) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: 'Falta el código de cuenta.' }); continue; }

        const esImputable = postablePorCodigo.get(clave(accountCode));
        if (esImputable === undefined) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: `No existe la cuenta ${accountCode}.` }); continue; }
        if (!esImputable) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: `La cuenta ${accountCode} es de agrupación y no recibe asientos.` }); continue; }

        const contactName = texto(row.getCell(7)) || null;
        if (contactName && !contactoPorNombre.has(clave(contactName)) && !nombresVistos.has(clave(contactName))) {
          errores.push({ hoja: HOJA_ASIENTOS, row: n, message: `No existe el contacto "${contactName}".` });
          continue;
        }

        let asiento = grupos.get(grupo);
        if (!asiento) {
          const f = fecha(row.getCell(2));
          if (!f) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: 'Fecha inválida: escríbela como dd/mm/aaaa.' }); continue; }
          if (!descripcion) { errores.push({ hoja: HOJA_ASIENTOS, row: n, message: `El asiento ${grupo} no tiene descripción.` }); continue; }
          asiento = { grupo, date: f, description: descripcion, reference: texto(row.getCell(4)) || null, lineas: [] };
          grupos.set(grupo, asiento);
        } else {
          // Reusar sin querer un N° ya usado fusionaría dos asientos distintos en uno solo, y
          // el resultado hasta podría cuadrar: se corta acá en vez de dejarlo pasar callado.
          const f = fecha(row.getCell(2));
          if (f && f.getTime() !== asiento.date.getTime()) {
            errores.push({ hoja: HOJA_ASIENTOS, row: n, message: `El asiento ${grupo} tiene dos fechas distintas. Si son asientos diferentes, dales números distintos.` });
            continue;
          }
          if (descripcion && descripcion !== asiento.description) {
            errores.push({ hoja: HOJA_ASIENTOS, row: n, message: `El asiento ${grupo} tiene dos descripciones distintas ("${asiento.description}" y "${descripcion}"). Si son asientos diferentes, dales números distintos.` });
            continue;
          }
        }
        asiento.lineas.push({ row: n, accountCode, detail: texto(row.getCell(6)) || null, contactName, debit, credit });
      }

      for (const a of grupos.values()) {
        if (a.lineas.length < 2) {
          errores.push({ hoja: HOJA_ASIENTOS, row: a.lineas[0]?.row ?? 0, message: `El asiento ${a.grupo} tiene una sola línea: hace falta al menos el debe y el haber.` });
          continue;
        }
        const debe = a.lineas.reduce((acc, l) => acc.add(d(l.debit)), cero);
        const haber = a.lineas.reduce((acc, l) => acc.add(d(l.credit)), cero);
        if (!debe.equals(haber)) {
          errores.push({
            hoja: HOJA_ASIENTOS,
            row: a.lineas[0].row,
            message: `El asiento ${a.grupo} no cuadra: debe ${debe.toFixed(2)} contra haber ${haber.toFixed(2)}.`,
          });
        }
      }
    }

    if (errores.length > 0) return { cuentas: 0, contactos: 0, asientos: 0, errors: errores };
    if (filasCuenta.length === 0 && filasContacto.length === 0 && grupos.size === 0) {
      throw badRequest('El archivo no tiene ninguna fila con datos.');
    }

    // ─── Escritura ────────────────────────────────────────────────────────
    return prisma.$transaction(async (tx) => {
      // Cuentas primero y sin padre: el padre puede venir después en la misma hoja.
      const idPorCodigo = new Map(cuentasBD.map((c) => [clave(c.code), c.id]));
      let creadas = 0;
      for (const f of filasCuenta) {
        if (f.existente) {
          await tx.ledgerAccount.update({
            where: { id: f.existente.id },
            data: { name: f.name, ...(f.existente._count.lines === 0 ? { kind: f.kind, postable: f.postable } : {}) },
          });
        } else {
          const nueva = await tx.ledgerAccount.create({
            data: { companyId, code: f.code, name: f.name, kind: f.kind, postable: f.postable },
            select: { id: true },
          });
          idPorCodigo.set(clave(f.code), nueva.id);
          creadas++;
        }
      }
      for (const f of filasCuenta) {
        if (!f.parentCode) continue;
        const hijaId = idPorCodigo.get(clave(f.code));
        const padreId = idPorCodigo.get(clave(f.parentCode));
        if (hijaId && padreId) await tx.ledgerAccount.update({ where: { id: hijaId }, data: { parentId: padreId } });
      }

      let contactosTocados = 0;
      for (const c of filasContacto) {
        const datos = {
          name: c.name,
          taxId: c.taxId,
          phone: c.phone,
          email: c.email,
          address: c.address,
          isCustomer: c.isCustomer,
          isSupplier: c.isSupplier,
          isEmployee: c.isEmployee,
          notes: c.notes,
        };
        if (c.id) await tx.businessContact.update({ where: { id: c.id }, data: datos });
        else {
          const nuevo = await tx.businessContact.create({ data: { companyId, ...datos }, select: { id: true, name: true } });
          contactoPorNombre.set(clave(nuevo.name), nuevo.id);
        }
        contactosTocados++;
      }

      // El correlativo se lee una vez y se sigue contando: dos asientos del mismo archivo
      // no pueden quedarse con el mismo número.
      const ultimo = await tx.journalEntry.findFirst({ where: { companyId }, orderBy: { number: 'desc' }, select: { number: true } });
      let numero = ultimo?.number ?? 0;
      for (const a of grupos.values()) {
        numero++;
        await tx.journalEntry.create({
          data: {
            companyId,
            number: numero,
            date: a.date,
            description: a.description,
            reference: a.reference,
            source: 'IMPORT',
            createdByUserId: userId ?? null,
            lines: {
              createMany: {
                data: a.lineas.map((l) => ({
                  accountId: idPorCodigo.get(clave(l.accountCode))!,
                  debit: d(l.debit),
                  credit: d(l.credit),
                  detail: l.detail,
                  contactId: l.contactName ? (contactoPorNombre.get(clave(l.contactName)) ?? null) : null,
                })),
              },
            },
          },
        });
      }

      return {
        cuentas: creadas,
        cuentasActualizadas: filasCuenta.length - creadas,
        contactos: contactosTocados,
        asientos: grupos.size,
        errors: [] as ErrorFila[],
      };
    });
  },
};
