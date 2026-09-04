import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { badRequest, notFound } from '../../utils/http-error';
import { detectHeaderRow, normalizeHeader, resolveColumns, cellText, cellNumber, cellDate } from '../../utils/excel-import';
import { claveNombre as clave } from '../../utils/nombre-clave';

/**
 * Buzón de archivos del cliente (panel maestro).
 *
 * Un restaurante que se muda a QuickTap no manda "el Excel de insumos": manda una carpeta con
 * todo lo que tiene — el inventario, la carta, el recetario, la lista de clientes, el libro de
 * compras del contador — con nombres como "Copia de FINAL2 (recuperado).xlsx". Pedirle al
 * operador que abra cada uno para saber qué es, y después subirlo por la pestaña correcta, es
 * el trabajo aburrido que hace que la migración de un cliente tome una tarde.
 *
 * Acá se sueltan todos juntos y el sistema dice qué es cada cual. La identificación es
 * DETERMINISTA: se puntúa cada hoja contra la forma conocida de cada tipo de documento (qué
 * columnas trae y cuáles son obligatorias), y gana la que más encaje. La IA no participa —
 * reconocer que una hoja con "PRODUCTO | UND | EXISTENCIA | COSTO" es un inventario no
 * requiere un modelo, y un modelo puede equivocarse y mandar la lista de clientes al
 * inventario. Solo se le pregunta cuando ninguna forma encaja, y ahí su respuesta se muestra
 * como sugerencia para que el operador decida.
 */

/** Los tipos de documento que se reconocen. */
export type TipoArchivo =
  | 'insumos'
  | 'productos'
  | 'recetas'
  | 'clientes'
  | 'proveedores'
  | 'compras'
  | 'ventas'
  | 'desconocido';

interface Forma {
  tipo: TipoArchivo;
  /**
   * Palabras que suelen estar en el nombre del archivo o de la hoja.
   *
   * Pesan mucho porque una lista de clientes y una de proveedores traen las mismas columnas
   * (nombre, teléfono, documento) y por columnas solas son indistinguibles — pero el archivo
   * se llama "BASE DE DATOS CLIENTES.xlsx", que es exactamente como lo resolvería una persona.
   */
  palabras: string[];
  /** Sin al menos una de estas columnas, no es este documento. */
  obligatorias: string[];
  /** Suman confianza pero no deciden. */
  spec: Record<string, string[]>;
  /** Se carga hoy, o solo se identifica. */
  soportado: boolean;
  etiqueta: string;
  queHace: string;
}

const NOMBRE = ['nombre', 'producto', 'insumo', 'descripcion', 'descripción', 'articulo', 'artículo', 'item', 'plato', 'cliente', 'proveedor', 'razon social', 'razón social'];

/**
 * Las formas conocidas, en orden de especificidad.
 *
 * El orden importa: un libro de compras y una lista de proveedores comparten la columna del
 * RIF, pero solo el libro trae número de factura y base imponible. Se evalúan todas y gana la
 * de mayor puntaje, así que las formas más específicas tienen que declarar las columnas que
 * las distinguen de las genéricas.
 */
const FORMAS: Forma[] = [
  {
    tipo: 'compras',
    palabras: ['compra', 'compras', 'proveedores pagados'],
    etiqueta: 'Libro de compras',
    queHace: 'Gastos y facturas de proveedores.',
    soportado: false,
    obligatorias: ['numeroFactura', 'baseImponible'],
    spec: {
      numeroFactura: ['numero de factura', 'número de factura', 'nro factura', 'n° factura', 'factura', 'nro. factura', 'documento'],
      baseImponible: ['base imponible', 'base', 'monto exento', 'subtotal'],
      iva: ['iva', 'i.v.a.', 'impuesto', 'alicuota', 'alícuota'],
      rif: ['rif', 'rif proveedor', 'cedula', 'cédula', 'nit'],
      fecha: ['fecha', 'fecha factura', 'fecha de emision', 'fecha de emisión'],
      total: ['total', 'total factura', 'monto total'],
      proveedor: ['proveedor', 'razon social', 'razón social', 'nombre del proveedor'],
    },
  },
  {
    tipo: 'ventas',
    palabras: ['venta', 'ventas', 'facturacion', 'facturación', 'facturas emitidas'],
    etiqueta: 'Libro de ventas',
    queHace: 'Facturación emitida a sus clientes.',
    soportado: false,
    obligatorias: ['numeroFactura', 'baseImponible'],
    spec: {
      numeroFactura: ['numero de factura', 'número de factura', 'nro factura', 'factura', 'documento', 'control'],
      baseImponible: ['base imponible', 'base', 'subtotal'],
      iva: ['iva', 'i.v.a.', 'debito fiscal', 'débito fiscal', 'impuesto'],
      cliente: ['cliente', 'razon social', 'razón social', 'nombre del cliente'],
      fecha: ['fecha', 'fecha factura', 'fecha de emision', 'fecha de emisión'],
      total: ['total', 'total factura', 'monto total'],
    },
  },
  {
    tipo: 'recetas',
    palabras: ['receta', 'recetas', 'recetario', 'ficha tecnica', 'ficha técnica', 'fichas'],
    etiqueta: 'Recetario',
    queHace: 'Qué lleva cada plato y cuánto.',
    soportado: true,
    obligatorias: ['plato', 'ingrediente'],
    spec: {
      plato: ['plato', 'receta', 'preparacion', 'preparación', 'producto final', 'nombre del plato'],
      ingrediente: ['ingrediente', 'insumo', 'materia prima', 'componente'],
      cantidad: ['cantidad', 'cant', 'porcion', 'porción', 'gramaje', 'peso'],
      unidad: ['unidad', 'und', 'um', 'medida'],
      rendimiento: ['rendimiento', 'rinde', 'porciones'],
    },
  },
  {
    tipo: 'insumos',
    palabras: ['insumo', 'insumos', 'inventario', 'materia prima', 'almacen', 'almacén', 'stock'],
    etiqueta: 'Inventario de insumos',
    queHace: 'Materia prima con su existencia y su costo.',
    soportado: true,
    obligatorias: ['name'],
    spec: {
      quantity: ['existencia', 'existencias', 'stock final', 'cantidad final', 'cantidad', 'stock', 'inventario final'],
      name: ['producto', 'insumo', 'nombre', 'descripcion', 'descripción', 'articulo', 'artículo', 'item', 'material'],
      unit: ['und', 'unidad', 'unidad de medida', 'medida', 'um', 'u/m'],
      price: ['costo unitario', 'costo', 'precio unitario', 'costo por unidad'],
      minQuantity: ['cantidad minima', 'cantidad mínima', 'stock minimo', 'stock mínimo', 'minimo', 'mínimo'],
      entrada: ['entrada', 'entradas', 'compras', 'ingreso'],
      salida: ['salida', 'salidas', 'consumo', 'egreso'],
    },
  },
  {
    tipo: 'productos',
    palabras: ['carta', 'menu', 'menú', 'producto', 'productos', 'platos', 'lista de precios'],
    etiqueta: 'Carta / lista de productos',
    queHace: 'Los platos que vende, con su precio.',
    soportado: true,
    obligatorias: ['name', 'price'],
    spec: {
      name: ['nombre', 'producto', 'plato', 'item', 'articulo', 'artículo', 'descripcion', 'descripción'],
      price: ['precio de venta', 'precio', 'pvp', 'venta', 'precio unitario'],
      category: ['categoria', 'categoría', 'rubro', 'grupo', 'seccion', 'sección', 'familia'],
      description: ['descripcion', 'descripción', 'detalle', 'ingredientes'],
      sku: ['sku', 'codigo', 'código', 'cod'],
    },
  },
  {
    tipo: 'clientes',
    palabras: ['cliente', 'clientes', 'base de datos de clientes', 'crm', 'comensales'],
    etiqueta: 'Lista de clientes',
    queHace: 'Sus clientes, para el CRM y el delivery.',
    soportado: true,
    obligatorias: ['name', 'phone'],
    spec: {
      name: ['nombre', 'nombre y apellido', 'cliente', 'nombre del cliente', 'razon social', 'razón social'],
      phone: ['telefono', 'teléfono', 'celular', 'movil', 'móvil', 'whatsapp', 'contacto', 'numero', 'número'],
      idNumber: ['cedula', 'cédula', 'ci', 'documento', 'rif', 'identificacion', 'identificación'],
      email: ['email', 'correo', 'correo electronico', 'correo electrónico', 'e-mail'],
      address: ['direccion', 'dirección', 'domicilio'],
      birthday: ['cumpleanos', 'cumpleaños', 'fecha de nacimiento', 'nacimiento'],
      notes: ['notas', 'observaciones', 'comentarios'],
    },
  },
  {
    tipo: 'proveedores',
    palabras: ['proveedor', 'proveedores', 'suplidor', 'suplidores'],
    etiqueta: 'Lista de proveedores',
    queHace: 'A quién le compra.',
    soportado: true,
    obligatorias: ['name'],
    spec: {
      name: ['proveedor', 'nombre del proveedor', 'razon social', 'razón social', 'nombre', 'empresa'],
      taxId: ['rif', 'nit', 'cedula', 'cédula', 'documento'],
      phone: ['telefono', 'teléfono', 'celular', 'contacto', 'whatsapp'],
    },
  },
];

/** Cuántas columnas del spec tiene que reconocer una hoja para no descartarla. */
const MINIMO_COLUMNAS = 2;

export interface HojaDetectada {
  hoja: string;
  tipo: TipoArchivo;
  etiqueta: string;
  queHace: string;
  soportado: boolean;
  /** 0–100. Cuánto encaja la hoja con la forma que ganó. */
  confianza: number;
  columnas: string[];
  filas: number;
  /** Por qué se decidió eso, en una línea que el operador pueda contrastar. */
  motivo: string;
  /** Primeras filas tal cual, para que el operador confirme de un vistazo. */
  muestra: string[][];
}

export interface ArchivoDetectado {
  archivo: string;
  hojas: HojaDetectada[];
  /** El tipo del archivo entero: el de su hoja más confiable. */
  tipo: TipoArchivo;
  etiqueta: string;
  soportado: boolean;
  error?: string;
}

/**
 * Puntúa una hoja contra una forma. Devuelve null si ni siquiera tiene sus columnas clave.
 *
 * El puntaje cuenta columnas EN ABSOLUTO y no como proporción de la forma. Con proporción, la
 * lista de clientes se detectaba como proveedores: "proveedores" define tres columnas y las
 * tres encajaban (100%), mientras "clientes" define siete y encajaban cinco (71%) — o sea, la
 * forma más pobre ganaba justamente por ser pobre. Reconocer cinco columnas de un documento
 * es más evidencia que reconocer tres, no menos.
 */
function puntuar(
  sheet: ExcelJS.Worksheet,
  forma: Forma,
  nombreArchivo: string,
): { puntaje: number; confianza: number; columnas: string[] } | null {
  const spec = forma.spec as Record<string, string[]>;
  const headerRow = detectHeaderRow(sheet, spec);
  const { columns, headers } = resolveColumns(sheet, spec, headerRow);
  const encontradas = Object.keys(columns);
  if (encontradas.length < MINIMO_COLUMNAS) return null;
  // Las obligatorias son las que distinguen este documento de los demás: un libro de compras
  // sin número de factura es una lista de proveedores, no un libro de compras.
  if (!forma.obligatorias.every((k) => columns[k as keyof typeof columns])) return null;

  const texto = normalizeHeader(`${nombreArchivo} ${sheet.name}`);
  const porNombre = forma.palabras.some((p) => texto.includes(normalizeHeader(p)));

  const puntaje = encontradas.length + forma.obligatorias.length * 2 + (porNombre ? 4 : 0);
  const techo = Object.keys(spec).length + forma.obligatorias.length * 2 + 4;
  return {
    puntaje,
    confianza: Math.min(100, Math.round((puntaje / techo) * 100)),
    columnas: encontradas.map((k) => headers[(columns[k as keyof typeof columns] as number) - 1] || k).filter(Boolean),
  };
}

/** Cuántas filas con datos tiene la hoja por debajo de su encabezado. */
function contarFilas(sheet: ExcelJS.Worksheet, headerRow: number, columnaNombre: number | undefined): number {
  let n = 0;
  const aliasNombre = new Set(NOMBRE.map(normalizeHeader));
  sheet.eachRow((row, numero) => {
    if (numero <= headerRow) return;
    const texto = columnaNombre ? cellText(row, columnaNombre) : String(row.getCell(1).value ?? '').trim();
    if (!texto || aliasNombre.has(normalizeHeader(texto))) return;
    n += 1;
  });
  return n;
}

/** Las primeras filas de la hoja, en crudo, para mostrarlas. */
function muestraDe(sheet: ExcelJS.Worksheet, filas = 4): string[][] {
  const salida: string[][] = [];
  sheet.eachRow((row) => {
    if (salida.length >= filas) return;
    const celdas: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => celdas.push(String(cell.text ?? '').trim().slice(0, 40)));
    if (celdas.some((c) => c !== '')) salida.push(celdas.slice(0, 10));
  });
  return salida;
}

export const masterInboxService = {
  /**
   * Identifica qué es cada archivo que soltó el operador. NO escribe nada.
   *
   * Se mira hoja por hoja y no archivo por archivo, porque un libro de Excel de un restaurante
   * casi nunca trae una sola cosa: el mismo archivo tiene la carta en una pestaña y el
   * inventario en otra. El tipo del archivo es el de su hoja más confiable, pero se devuelven
   * todas para que el operador vea lo que hay adentro.
   */
  async clasificar(restaurantId: string, files: Express.Multer.File[]): Promise<ArchivoDetectado[]> {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!r) throw notFound('Ese restaurante no existe.');
    if (files.length === 0) throw badRequest('Sube al menos un archivo.');

    const salida: ArchivoDetectado[] = [];
    for (const file of files) {
      const nombreArchivo = file.originalname;
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);

        const hojas: HojaDetectada[] = [];
        for (const sheet of workbook.worksheets) {
          let mejor: { forma: Forma; puntaje: number; confianza: number; columnas: string[] } | null = null;
          for (const forma of FORMAS) {
            const p = puntuar(sheet, forma, nombreArchivo);
            if (p && (!mejor || p.puntaje > mejor.puntaje)) mejor = { forma, ...p };
          }

          if (!mejor) {
            hojas.push({
              hoja: sheet.name,
              tipo: 'desconocido',
              etiqueta: 'No se reconoce',
              queHace: '',
              soportado: false,
              confianza: 0,
              columnas: [],
              filas: 0,
              motivo: 'No se encontraron encabezados que se parezcan a ningún documento conocido.',
              muestra: muestraDe(sheet),
            });
            continue;
          }

          const spec = mejor.forma.spec as Record<string, string[]>;
          const headerRow = detectHeaderRow(sheet, spec);
          const { columns } = resolveColumns(sheet, spec, headerRow);
          hojas.push({
            hoja: sheet.name,
            tipo: mejor.forma.tipo,
            etiqueta: mejor.forma.etiqueta,
            queHace: mejor.forma.queHace,
            soportado: mejor.forma.soportado,
            confianza: mejor.confianza,
            columnas: mejor.columnas,
            filas: contarFilas(sheet, headerRow, columns.name as number | undefined),
            motivo: `Trae ${mejor.columnas.slice(0, 5).join(', ')}${mejor.columnas.length > 5 ? '…' : ''}.`,
            muestra: muestraDe(sheet),
          });
        }

        // El tipo del archivo lo decide la hoja con más filas entre las de mayor confianza: un
        // libro con la carta en una pestaña y tres hojas sueltas de notas es "la carta".
        const utiles = hojas.filter((h) => h.tipo !== 'desconocido');
        const principal = [...utiles].sort((a, b) => b.confianza - a.confianza || b.filas - a.filas)[0];
        salida.push({
          archivo: nombreArchivo,
          hojas,
          tipo: principal?.tipo ?? 'desconocido',
          etiqueta: principal?.etiqueta ?? 'No se reconoce',
          soportado: principal?.soportado ?? false,
        });
      } catch {
        salida.push({
          archivo: nombreArchivo,
          hojas: [],
          tipo: 'desconocido',
          etiqueta: 'No se pudo abrir',
          soportado: false,
          error: 'No se pudo leer el archivo. ¿Es un .xlsx de verdad? Los .xls viejos y los .csv hay que reguardarlos como .xlsx.',
        });
      }
    }
    return salida;
  },

  /**
   * Lee una hoja de clientes. NO escribe nada.
   *
   * El teléfono es la llave: `Customer` se identifica por teléfono dentro del restaurante (es
   * lo que usa el checkout para reconocer a quien ya pidió antes), así que una fila sin
   * teléfono no se puede cargar sin crear un cliente que nunca se va a volver a encontrar.
   */
  async leerClientes(restaurantId: string, file: Express.Multer.File, hoja?: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = hoja ? workbook.getWorksheet(hoja) : workbook.worksheets[0];
    if (!sheet) throw badRequest('No se encontró esa hoja en el archivo.');

    const forma = FORMAS.find((f) => f.tipo === 'clientes')!;
    const spec = forma.spec as Record<string, string[]>;
    const headerRow = detectHeaderRow(sheet, spec);
    const { columns } = resolveColumns(sheet, spec, headerRow);
    if (!columns.name || !columns.phone) {
      throw badRequest('Esa hoja no tiene columnas de nombre y teléfono, así que no se puede cargar como lista de clientes.');
    }

    const existentes = new Set(
      (await prisma.customer.findMany({ where: { restaurantId }, select: { phone: true } })).map((c) => soloDigitos(c.phone)),
    );

    const filas: { nombre: string; telefono: string; cedula: string; email: string; direccion: string; cumpleanos: string; notas: string; yaExiste: boolean }[] = [];
    const vistos = new Set<string>();
    sheet.eachRow((row, numero) => {
      if (numero <= headerRow) return;
      const nombre = cellText(row, columns.name);
      const telefono = soloDigitos(cellText(row, columns.phone));
      if (!nombre || !telefono) return;
      // El mismo teléfono dos veces en la hoja es la misma persona: cargar las dos crearía un
      // duplicado que después el checkout no sabe cuál elegir.
      if (vistos.has(telefono)) return;
      vistos.add(telefono);
      filas.push({
        nombre,
        telefono,
        cedula: cellText(row, columns.idNumber),
        email: cellText(row, columns.email),
        direccion: cellText(row, columns.address),
        cumpleanos: cellDate(row, columns.birthday) ?? '',
        notas: cellText(row, columns.notes),
        yaExiste: existentes.has(telefono),
      });
    });

    if (filas.length === 0) throw badRequest('No se reconoció ningún cliente con nombre y teléfono en esa hoja.');
    return filas;
  },

  /** Lee una hoja de proveedores. NO escribe nada. */
  async leerProveedores(restaurantId: string, file: Express.Multer.File, hoja?: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
    const sheet = hoja ? workbook.getWorksheet(hoja) : workbook.worksheets[0];
    if (!sheet) throw badRequest('No se encontró esa hoja en el archivo.');

    const forma = FORMAS.find((f) => f.tipo === 'proveedores')!;
    const spec = forma.spec as Record<string, string[]>;
    const headerRow = detectHeaderRow(sheet, spec);
    const { columns } = resolveColumns(sheet, spec, headerRow);
    if (!columns.name) throw badRequest('Esa hoja no tiene una columna de nombre, así que no se puede cargar como lista de proveedores.');

    const existentes = new Set(
      (await prisma.supplier.findMany({ where: { restaurantId }, select: { name: true } })).map((s) => clave(s.name)),
    );

    const filas: { nombre: string; rif: string; telefono: string; yaExiste: boolean }[] = [];
    const vistos = new Set<string>();
    sheet.eachRow((row, numero) => {
      if (numero <= headerRow) return;
      const nombre = cellText(row, columns.name);
      if (!nombre || vistos.has(clave(nombre))) return;
      vistos.add(clave(nombre));
      filas.push({
        nombre,
        rif: cellText(row, columns.taxId),
        telefono: soloDigitos(cellText(row, columns.phone)),
        yaExiste: existentes.has(clave(nombre)),
      });
    });

    if (filas.length === 0) throw badRequest('No se reconoció ningún proveedor en esa hoja.');
    return filas;
  },

  /** Escribe los clientes aprobados. Los que ya existen (mismo teléfono) se actualizan. */
  async confirmarClientes(
    restaurantId: string,
    clientes: { nombre: string; telefono: string; cedula?: string; email?: string; direccion?: string; cumpleanos?: string; notas?: string }[],
  ) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!r) throw notFound('Ese restaurante no existe.');

    const porTelefono = new Map(
      (await prisma.customer.findMany({ where: { restaurantId }, select: { id: true, phone: true } })).map((c) => [
        soloDigitos(c.phone),
        c.id,
      ]),
    );

    const resultado = { creados: 0, actualizados: 0 };
    for (const c of clientes) {
      const telefono = soloDigitos(c.telefono);
      const nombre = c.nombre.trim();
      if (!nombre || !telefono) continue;
      const datos = {
        name: nombre,
        phone: telefono,
        idNumber: c.cedula?.trim() || null,
        email: c.email?.trim() || null,
        address: c.direccion?.trim() || null,
        // La fecha viaja como "YYYY-MM-DD" y se guarda al mediodía UTC: guardarla a medianoche
        // la muestra un día antes en Venezuela (UTC-4).
        birthday: c.cumpleanos ? new Date(`${c.cumpleanos}T12:00:00.000Z`) : null,
        notes: c.notas?.trim() || null,
      };
      const existente = porTelefono.get(telefono);
      if (existente) {
        await prisma.customer.update({ where: { id: existente }, data: datos });
        resultado.actualizados += 1;
      } else {
        const creado = await prisma.customer.create({ data: { restaurantId, ...datos } });
        porTelefono.set(telefono, creado.id);
        resultado.creados += 1;
      }
    }
    return resultado;
  },

  /** Escribe los proveedores aprobados. Se reconocen por nombre dentro del restaurante. */
  async confirmarProveedores(restaurantId: string, proveedores: { nombre: string; rif?: string; telefono?: string }[]) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!r) throw notFound('Ese restaurante no existe.');

    const porNombre = new Map(
      (await prisma.supplier.findMany({ where: { restaurantId }, select: { id: true, name: true } })).map((s) => [
        clave(s.name),
        s.id,
      ]),
    );

    const resultado = { creados: 0, actualizados: 0 };
    for (const p of proveedores) {
      const nombre = p.nombre.trim();
      if (!nombre) continue;
      const datos = { name: nombre, taxId: p.rif?.trim() || null, phone: soloDigitos(p.telefono ?? '') || null };
      const existente = porNombre.get(clave(nombre));
      if (existente) {
        await prisma.supplier.update({ where: { id: existente }, data: datos });
        resultado.actualizados += 1;
      } else {
        const creado = await prisma.supplier.create({ data: { restaurantId, ...datos } });
        porNombre.set(clave(nombre), creado.id);
        resultado.creados += 1;
      }
    }
    return resultado;
  },
};

/** Un teléfono se compara por sus dígitos: "0414-1234567" y "04141234567" son el mismo. */
function soloDigitos(texto: string): string {
  return (texto ?? '').replace(/\D/g, '');
}
