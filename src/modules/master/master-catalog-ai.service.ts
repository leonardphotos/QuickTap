import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { cellNumber, cellText, detectHeaderRow, normalizeHeader, resolveColumns } from '../../utils/excel-import';
import crypto from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { UPLOADS_DIR } from '../../middlewares/upload.middleware';
import { badRequest, notFound, HttpError } from '../../utils/http-error';
import { round2, toDecimal } from '../../utils/money';
import { resolveInventoryScopeById } from '../inventory/inventory-scope';
import { buildCostGraph, recomputeDependentCosts, resolveCostPerBaseUnit } from '../inventory/costing';
import { claveNombre as clave } from '../../utils/nombre-clave';

/**
 * Carga asistida de catálogo (panel maestro): el equipo de QuickTap monta la carta de un
 * cliente nuevo a partir de fotos, y la IA propone la receta y los insumos de cada plato.
 *
 * El cliente recibe el trabajo hecho salvo las cantidades exactas, que son lo único que la IA
 * no puede saber mirando una foto: cuántos gramos de carne lleva ESA hamburguesa en ESE local.
 *
 * Es herramienta INTERNA — va bajo platformAuthGuard, nunca bajo un guard de tenant. Y no
 * escribe nada hasta `confirmar`: `analizar` solo devuelve una propuesta para revisar, mismo
 * camino de previsualizar → confirmar que ya usa la importación de OlaClick.
 */

const PRODUCTS_DIR = path.join(UPLOADS_DIR, 'products');
fs.mkdirSync(PRODUCTS_DIR, { recursive: true });

const SERVICIO_CAIDO =
  'El servicio de IA no responde. Revisa que ai-photo-service esté corriendo en el VPS (puerto 8100).';

/** Unidades del inventario. La IA solo puede devolver estas tres. */
const UNIDADES = new Set(['kg', 'lt', 'unidad']);

/** Tipos de empaque de InventoryItem.packagingType. */
const TIPOS_EMPAQUE = new Set(['ENVASE', 'CAJA', 'BOLSA']);

export interface IngredientePropuesto {
  nombre: string;
  unidad: string;
  cantidad: number;
  /** El insumo ya existe en el inventario del cliente y solo se vincula. */
  yaExiste: boolean;
}

export interface AnalisisPlato {
  plato: string;
  descripcion: string;
  photoUrl: string;
  ingredientes: IngredientePropuesto[];
}

/** Un plato leído de la carta (foto del menú o planilla del cliente). Todavía sin ficha técnica. */
export interface ProductoLeido {
  nombre: string;
  categoria: string;
  precio: number;
  descripcion: string;
}

export interface PreparacionPropuesta {
  nombre: string;
  unidad: string;
  /** Cuánto rinde UNA tanda, en `unidad`. */
  rendimiento: number;
  /** Cuánto usa este plato de la preparación, en `unidad`. */
  cantidad: number;
  /** Ingredientes de la tanda entera, no de una porción. */
  insumos: IngredientePropuesto[];
  yaExiste: boolean;
}

/** Ficha técnica propuesta para un plato: lo que va directo y lo que se prepara aparte. */
export interface FichaPropuesta {
  nombre: string;
  insumos: IngredientePropuesto[];
  preparaciones: PreparacionPropuesta[];
}


async function restauranteOThrow(restaurantId: string) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true, name: true } });
  if (!r) throw notFound('Ese restaurante no existe.');
  return r;
}

/** Guarda unos bytes de imagen en /uploads/products con nombre impredecible. */
function guardarFoto(buffer: Buffer, ext: string): string {
  const filename = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(PRODUCTS_DIR, filename), buffer);
  return `/uploads/products/${filename}`;
}

async function llamarServicioIA(endpoint: string, file: Express.Multer.File, campos: Record<string, string> = {}) {
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
  for (const [k, v] of Object.entries(campos)) form.append(k, v);

  let response: Response;
  try {
    response = await fetch(`${env.aiPhotoServiceUrl}/${endpoint}`, { method: 'POST', body: form });
  } catch {
    throw new HttpError(503, SERVICIO_CAIDO);
  }
  if (!response.ok) {
    // El microservicio contesta {"detail": "..."} — se pasa tal cual porque sus mensajes ya
    // están en cristiano ("GEMINI_API_KEY no está configurada", "Formato no soportado").
    let detalle = 'El servicio de IA no pudo procesar la foto.';
    try {
      const cuerpo = (await response.json()) as { detail?: string };
      if (cuerpo?.detail) detalle = cuerpo.detail;
    } catch {
      /* respuesta sin JSON: se queda el mensaje genérico */
    }
    throw new HttpError(502, detalle);
  }
  return response;
}

/**
 * Aplana un .xlsx a texto plano para mandárselo a la IA.
 *
 * No hay plantilla ni columnas fijas a propósito: el archivo llega como lo mandó el cliente
 * (a veces con el logo en las primeras filas, o los precios en la tercera columna, o dos hojas).
 * Se vuelca todo tal cual y la IA deduce qué es cada cosa; el operador revisa antes de escribir.
 */
async function hojaATexto(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const lineas: string[] = [];
  workbook.eachSheet((sheet) => {
    lineas.push(`### Hoja: ${sheet.name}`);
    sheet.eachRow((row) => {
      const celdas: string[] = [];
      // `cell.text` y no `cell.value`: value devuelve el objeto crudo de exceljs para las celdas
      // con fórmula, con fórmula compartida, con error (#REF!) o con texto enriquecido, y
      // varias de esas formas no traen el campo que se estaba leyendo — la hoja llegaba a la IA
      // sembrada de "[object Object]" justo en las columnas de existencia y de costo. `text` es
      // exactamente lo que muestra Excel en pantalla, que es lo que hay que transcribir.
      row.eachCell({ includeEmpty: true }, (cell) => celdas.push(String(cell.text ?? '').trim()));
      // Las filas vacías (separadores visuales de la hoja) no aportan nada y gastan contexto.
      if (celdas.some((c) => c !== '')) lineas.push(celdas.join(' | ').replace(/(\s*\|\s*)+$/, ''));
    });
  });
  return lineas.join('\n');
}

/**
 * Cuánto texto de hoja se le manda a la IA por llamada.
 *
 * Muy por debajo del tope del microservicio: no es un límite técnico sino de calidad — pasado
 * cierto tamaño el modelo empieza a saltarse filas del final. Node parte el archivo y junta las
 * respuestas, así que el operador nunca ve un "la lista es demasiado larga": sube el archivo
 * como lo tiene y espera un poco más.
 */
const CARACTERES_POR_LOTE = 45000;

/** Parte el texto en trozos que no superen `tope`, siempre cortando entre filas. */
function partirEnTrozos(texto: string, tope = CARACTERES_POR_LOTE): string[] {
  const lineas = texto.split('\n');
  const trozos: string[] = [];
  let actual: string[] = [];
  let largo = 0;
  for (const linea of lineas) {
    // Una sola fila más larga que el tope no se puede partir sin romperla: se manda igual y el
    // microservicio decide. En una hoja de inventario no pasa nunca.
    if (largo + linea.length + 1 > tope && actual.length > 0) {
      trozos.push(actual.join('\n'));
      actual = [];
      largo = 0;
    }
    actual.push(linea);
    largo += linea.length + 1;
  }
  if (actual.length > 0) trozos.push(actual.join('\n'));
  return trozos;
}

/**
 * Colapsa una hoja de inventario dejando una fila por producto.
 *
 * Los inventarios reales vienen con una hoja por semana y los mismos insumos repetidos en
 * todas: el de Wokbox trae 2.710 filas que son 171 productos contados 18 veces. Mandar eso a la
 * IA es pagar dieciocho veces por el mismo dato y encima llegar a un tamaño en el que empieza a
 * saltarse filas.
 *
 * De cada producto se conserva la fila con MÁS celdas llenas, que es la que más probablemente
 * traiga unidad y costo — las semanas en que no se compró ese insumo dejan media fila vacía.
 */
function compactarInventario(texto: string): { texto: string; filas: number; productos: number } {
  const mejor = new Map<string, { linea: string; puntaje: number }>();
  const orden: string[] = [];
  let filas = 0;
  for (const linea of texto.split('\n')) {
    if (linea.startsWith('### Hoja:')) continue;
    filas += 1;
    const celdas = linea.split(' | ');
    const primera = celdas.find((c) => c.trim() !== '') ?? '';
    const k = clave(primera);
    if (!k) continue;
    const puntaje = celdas.filter((c) => c.trim() !== '').length;
    const previo = mejor.get(k);
    if (!previo) {
      mejor.set(k, { linea, puntaje });
      orden.push(k);
    } else if (puntaje > previo.puntaje) {
      mejor.set(k, { linea, puntaje });
    }
  }
  return { texto: orden.map((k) => mejor.get(k)!.linea).join('\n'), filas, productos: orden.length };
}

/** Igual que `llamarServicioIA` pero con cuerpo JSON — las fichas técnicas no llevan archivo. */
async function llamarServicioIAJson(endpoint: string, cuerpo: unknown) {
  let response: Response;
  try {
    response = await fetch(`${env.aiPhotoServiceUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch {
    throw new HttpError(503, SERVICIO_CAIDO);
  }
  if (!response.ok) {
    let detalle = 'El servicio de IA no pudo procesar la solicitud.';
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) detalle = body.detail;
    } catch {
      /* respuesta sin JSON */
    }
    throw new HttpError(502, detalle);
  }
  return response;
}

/** Qué insumos y preparaciones YA tiene el cliente, por clave de nombre. */
async function loQueYaTiene(restaurantId: string) {
  const inventarioDe = await resolveInventoryScopeById(restaurantId);
  const [insumos, preparaciones] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { restaurantId: inventarioDe }, select: { name: true } }),
    prisma.preparation.findMany({ where: { restaurantId }, select: { name: true } }),
  ]);
  return {
    insumos: new Set(insumos.map((i) => clave(i.name))),
    preparaciones: new Set(preparaciones.map((p) => clave(p.name))),
  };
}

function marcarInsumos(
  crudos: { nombre: string; unidad: string; cantidad: number }[] | undefined,
  existentes: Set<string>,
): IngredientePropuesto[] {
  const salida: IngredientePropuesto[] = [];
  for (const ing of crudos ?? []) {
    const nombre = String(ing?.nombre ?? '').trim();
    const cantidad = Number(ing?.cantidad);
    if (!nombre || !UNIDADES.has(ing?.unidad) || !Number.isFinite(cantidad) || cantidad <= 0) continue;
    salida.push({ nombre, unidad: ing.unidad, cantidad, yaExiste: existentes.has(clave(nombre)) });
  }
  return salida;
}

/**
 * Cuántos platos se le piden a la IA por llamada.
 *
 * Ni uno por uno (una carta de 80 platos serían 80 viajes y varios minutos de espera) ni todos
 * de golpe: pasado cierto tamaño el modelo empieza a devolver fichas cada vez más pobres para
 * los últimos platos de la lista. Doce es el punto donde la respuesta sigue siendo detallada.
 */
const PLATOS_POR_LOTE = 12;

/* ---------------------------------------------------------------------------------------
 * Carga por partes en un cliente que YA está montado
 *
 * La carga de carta completa sirve para un cliente nuevo. Un cliente que ya opera necesita
 * lo contrario: cargarle SOLO la pieza que le falta sin pisar lo que ya tiene. Son tres
 * piezas independientes y el orden natural entre ellas es insumos → recetas → productos,
 * porque una receta no se puede costear sin insumos.
 *
 * El caso que manda: el cliente ya tiene sus recetas armadas y sus insumos en cero. Al
 * cargarle la lista real de insumos, cada uno se VINCULA con el que ya existía (por nombre,
 * y lo que no calza por nombre lo cruza la IA) y `recomputeDependentCosts` vuelve a costear
 * todas las recetas que lo usaban. Nadie rehace ninguna receta: se les enciende el costo.
 * ------------------------------------------------------------------------------------- */

/** Un insumo leído de la lista del cliente, ya cruzado contra lo que tiene cargado. */
export interface InsumoLeido {
  nombre: string;
  unidad: string;
  cantidad: number;
  /** Costo de UNA unidad (1 kg / 1 lt / 1 unidad), en la moneda base del cliente. */
  costoUnitario: number;
  minimo: number;
  categoria: string;
  /** El insumo que ya existe y con el que se va a vincular. Null = se creará uno nuevo. */
  vinculadoA: { id: string; nombre: string; costoActual: number } | null;
  /** Cómo se decidió el vínculo: por nombre idéntico, o porque la IA los reconoció iguales. */
  vinculoPor: 'nombre' | 'ia' | null;
  /** Cuántas líneas de receta y de preparación se recostean si se carga este insumo. */
  usadoEn: number;
  /** En qué platos se usa directo, y en qué preparaciones. Es lo que hace revisable el vínculo:
   *  ver que "Aceite" cae en catorce platos obliga a mirarlo dos veces antes de aprobarlo. */
  enPlatos: string[];
  enPreparaciones: string[];
  /** Lo que decía la hoja antes de convertir ("8000 gramos"), para que el operador lo vea. */
  enLaHoja: string;
  /**
   * Empaque: lo que se va con el pedido del cliente. Va a la ventana de empaques del
   * inventario (InventoryItem.packagingType) en vez de quedar como un insumo suelto, y desde
   * ahí se puede vincular a un plato para cobrarlo y descontarlo al vender para llevar.
   */
  tipoEmpaque: '' | 'ENVASE' | 'CAJA' | 'BOLSA';
}

function numeroPositivo(valor: unknown, porDefecto = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

/** Redondea a `decimales` sin arrastrar la basura del punto flotante (0.15000000000000002). */
function redondear(valor: number, decimales: number): number {
  if (!Number.isFinite(valor)) return 0;
  const f = 10 ** decimales;
  return Math.round(valor * f) / f;
}

/**
 * Cómo escribe cada unidad una hoja de inventario de verdad, y por cuánto hay que multiplicar
 * para llevarla a la unidad base del sistema (kg / lt / unidad).
 *
 * La conversión la hace Node y NO la IA a propósito. Es una división por mil, o sea la clase
 * de cuenta en la que un modelo se equivoca de vez en cuando sin avisar — y equivocarse acá no
 * se nota al revisar: "Arroz 8000" pasa como bueno de un vistazo, entra al inventario como
 * ocho mil KILOS de arroz, y el costo por kilo queda mil veces mal en todas las recetas que lo
 * usan. El modelo transcribe ("8000" y "gramos") y la aritmética la hace código.
 */
const CONVERSION_UNIDAD: Record<string, { unidad: string; factor: number }> = {
  // Peso
  kg: { unidad: 'kg', factor: 1 },
  kgs: { unidad: 'kg', factor: 1 },
  k: { unidad: 'kg', factor: 1 },
  kilo: { unidad: 'kg', factor: 1 },
  kilos: { unidad: 'kg', factor: 1 },
  kilogramo: { unidad: 'kg', factor: 1 },
  kilogramos: { unidad: 'kg', factor: 1 },
  g: { unidad: 'kg', factor: 0.001 },
  gr: { unidad: 'kg', factor: 0.001 },
  grs: { unidad: 'kg', factor: 0.001 },
  gramo: { unidad: 'kg', factor: 0.001 },
  gramos: { unidad: 'kg', factor: 0.001 },
  // Volumen
  lt: { unidad: 'lt', factor: 1 },
  lts: { unidad: 'lt', factor: 1 },
  l: { unidad: 'lt', factor: 1 },
  litro: { unidad: 'lt', factor: 1 },
  litros: { unidad: 'lt', factor: 1 },
  ml: { unidad: 'lt', factor: 0.001 },
  mls: { unidad: 'lt', factor: 0.001 },
  mililitro: { unidad: 'lt', factor: 0.001 },
  mililitros: { unidad: 'lt', factor: 0.001 },
  cc: { unidad: 'lt', factor: 0.001 },
  // Conteo
  u: { unidad: 'unidad', factor: 1 },
  un: { unidad: 'unidad', factor: 1 },
  ud: { unidad: 'unidad', factor: 1 },
  uds: { unidad: 'unidad', factor: 1 },
  und: { unidad: 'unidad', factor: 1 },
  unid: { unidad: 'unidad', factor: 1 },
  unidad: { unidad: 'unidad', factor: 1 },
  unidades: { unidad: 'unidad', factor: 1 },
  pza: { unidad: 'unidad', factor: 1 },
  pzas: { unidad: 'unidad', factor: 1 },
  pieza: { unidad: 'unidad', factor: 1 },
  piezas: { unidad: 'unidad', factor: 1 },
};

/**
 * Lleva una fila de la hoja a la unidad base del sistema.
 *
 * Lo que la hoja llama "paquete", "caja", "cunete" o "cartón" no tiene conversión posible —no
 * hay cuántos kilos trae un cunete— así que cada bulto vale uno y manda la unidad que propuso
 * la IA. Igual cuando la fila no dice unidad.
 */
function aUnidadBase(unidadArchivo: string, respaldo: string) {
  const conversion = CONVERSION_UNIDAD[clave(unidadArchivo).replace(/[.\s]/g, '')];
  if (conversion) return conversion;
  return { unidad: UNIDADES.has(respaldo) ? respaldo : 'unidad', factor: 1 };
}

/** Manda un trozo de texto plano al microservicio y devuelve la respuesta. */
async function mandarTextoALaIA(endpoint: string, texto: string) {
  const form = new FormData();
  form.append('texto', texto);
  let response: Response;
  try {
    response = await fetch(`${env.aiPhotoServiceUrl}/${endpoint}`, { method: 'POST', body: form });
  } catch {
    throw new HttpError(503, SERVICIO_CAIDO);
  }
  if (!response.ok) {
    let detalle = 'El servicio de IA no pudo leer el archivo.';
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) detalle = body.detail;
    } catch {
      /* respuesta sin JSON */
    }
    throw new HttpError(502, detalle);
  }
  return response;
}

/**
 * Lee el archivo del cliente —foto o .xlsx— y devuelve las filas que reconoció la IA.
 *
 * Si es una foto va la imagen tal cual. Si es una hoja la aplana exceljs acá (el microservicio
 * no sabe de Excel a propósito), y si es larga la parte en trozos y junta las respuestas: el
 * archivo del cliente llega como lo tiene, con dieciocho hojas si hace falta, y no hay ningún
 * "cárgala por partes" que el operador tenga que resolver a mano recortando el Excel.
 *
 * `compactar` es solo para inventarios: deja una fila por producto antes de partir (ver
 * compactarInventario). No se usa en cartas ni recetarios, donde una línea repetida puede ser
 * un tamaño distinto del mismo plato o el mismo insumo en otra receta.
 */
async function leerListaConIA<T>(
  endpoint: string,
  file: Express.Multer.File,
  campo: string,
  opciones: { errorVacio: string; compactar?: boolean },
): Promise<{ filas: T[]; compactado: { filas: number; productos: number } | null; lotes: number }> {
  const esExcel =
    file.mimetype.includes('spreadsheet') ||
    file.mimetype.includes('excel') ||
    file.originalname.toLowerCase().endsWith('.xlsx');

  const extraer = async (response: Response) => {
    const datos = (await response.json()) as Record<string, unknown>;
    return (Array.isArray(datos[campo]) ? (datos[campo] as T[]) : []) as T[];
  };

  if (!esExcel) {
    return { filas: await extraer(await llamarServicioIA(endpoint, file)), compactado: null, lotes: 1 };
  }

  let texto = await hojaATexto(file.buffer);
  if (!texto.trim()) throw badRequest(opciones.errorVacio);

  let compactado: { filas: number; productos: number } | null = null;
  if (opciones.compactar) {
    const r = compactarInventario(texto);
    if (r.texto.trim()) {
      texto = r.texto;
      compactado = { filas: r.filas, productos: r.productos };
    }
  }

  const trozos = partirEnTrozos(texto);
  const filas: T[] = [];
  for (const trozo of trozos) {
    filas.push(...(await extraer(await mandarTextoALaIA(endpoint, trozo))));
  }
  return { filas, compactado, lotes: trozos.length };
}

/* ---------------------------------------------------------------------------------------
 * Lectura de la hoja SIN IA
 *
 * Una hoja de inventario con encabezados reconocibles no necesita un modelo: dice
 * "PRODUCTO | UND | EXISTENCIA | COSTO" en la primera fila y el resto es leer celdas. Pedirle
 * eso a la IA costaba dos tercios del gasto de toda la carga y, peor, PERDÍA FILAS — de 171
 * productos devolvía 155 en una corrida y 158 en otra, y no hay forma de saber cuáles faltan.
 * El código no pierde ninguna, nunca, y tarda medio segundo.
 *
 * La IA se queda con lo que no está escrito en ninguna celda: en qué rubro va cada insumo y
 * cuál es un empaque (ver `clasificar-insumos`), más el cruce contra lo que el cliente ya
 * tiene. Y con la hoja entera cuando esta lectura no puede — una foto de la factura, o una
 * planilla sin encabezados que reconocer.
 * ------------------------------------------------------------------------------------- */

/** Sinónimos de encabezado de una hoja de inventario. Mismo criterio que inventory-import. */
const COLUMNAS_INVENTARIO = {
  // "existencia" primero: una hoja de control semanal trae varias columnas de cantidad
  // (inicial, entrada, salida, existencia) y la que vale es con la que se quedó el local.
  quantity: ['existencia', 'existencias', 'stock final', 'cantidad final', 'cantidad', 'stock', 'inventario final'],
  name: ['producto', 'insumo', 'nombre', 'descripcion', 'descripción', 'articulo', 'artículo', 'item', 'material'],
  unit: ['und', 'unidad', 'unidad de medida', 'medida', 'um', 'u/m', 'presentacion', 'presentación'],
  price: ['costo unitario', 'precio unitario', 'costo', 'precio', 'costo por unidad', 'valor unitario'],
  minQuantity: ['cantidad minima', 'cantidad mínima', 'stock minimo', 'stock mínimo', 'minimo', 'mínimo', 'punto de reposicion'],
  category: ['categoria', 'categoría', 'rubro', 'grupo', 'familia', 'linea', 'línea'],
} as const;

type ClaveColumna = keyof typeof COLUMNAS_INVENTARIO;

/** Una fila de inventario leída de la hoja, todavía en las unidades que usa el cliente. */
interface FilaHoja {
  nombre: string;
  unidadArchivo: string;
  cantidadArchivo: number;
  costoArchivo: number;
  minimoArchivo: number;
  categoria: string;
  /** Cuántas celdas venían llenas: decide cuál gana cuando el insumo se repite entre hojas. */
  completitud: number;
}

/** Filas que no son un insumo aunque estén en medio de la tabla. */
const FILAS_BASURA = new Set([
  'total',
  'totales',
  'total general',
  'subtotal',
  'suma',
  'observaciones',
  'nota',
  'notas',
]);

/**
 * Lee una hoja de inventario con código. Devuelve null si no se puede confiar en la lectura,
 * y entonces la carga cae al camino de siempre (mandarle la hoja entera a la IA).
 *
 * Se exige encontrar la columna del NOMBRE y al menos una más: con solo nombres no hay
 * inventario que cargar, y adivinar el resto sería exactamente el error que este camino
 * intenta evitar.
 */
async function leerInventarioDeHoja(
  buffer: Buffer,
): Promise<{ filas: FilaHoja[]; hojas: number; filasLeidas: number } | null> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const spec = COLUMNAS_INVENTARIO as unknown as Record<ClaveColumna, string[]>;
  const alias = new Set(spec.name.map((a) => normalizeHeader(a)));
  const porNombre = new Map<string, FilaHoja>();
  const orden: string[] = [];
  let hojasLeidas = 0;
  let filasLeidas = 0;

  for (const sheet of workbook.worksheets) {
    const headerRow = detectHeaderRow(sheet, spec);
    const { columns } = resolveColumns(sheet, spec, headerRow);
    if (!columns.name || Object.keys(columns).length < 2) continue;
    hojasLeidas += 1;

    sheet.eachRow((row, numero) => {
      if (numero <= headerRow) return;
      const nombre = cellText(row, columns.name);
      if (!nombre) return;
      const k = clave(nombre);
      // Una hoja de control semanal repite el encabezado en cada bloque, y cierra con la fila
      // de totales. Ninguna de las dos es un insumo.
      if (alias.has(normalizeHeader(nombre)) || FILAS_BASURA.has(k)) return;
      filasLeidas += 1;

      const cantidad = cellNumber(row, columns.quantity);
      const costo = cellNumber(row, columns.price);
      const minimo = cellNumber(row, columns.minQuantity);
      const unidad = cellText(row, columns.unit);
      const categoria = cellText(row, columns.category);

      const fila: FilaHoja = {
        nombre,
        unidadArchivo: unidad,
        cantidadArchivo: numeroPositivo(cantidad),
        costoArchivo: numeroPositivo(costo),
        minimoArchivo: numeroPositivo(minimo),
        categoria,
        completitud: [cantidad, costo, minimo, unidad || undefined, categoria || undefined].filter(
          (v) => v !== undefined && v !== null,
        ).length,
      };

      // El mismo insumo aparece en las 18 hojas semanales. Gana la fila más completa —la
      // semana en que sí se compró trae unidad y costo, las otras dejan media fila vacía— y
      // se rellenan de las demás los datos que a esa le falten.
      const previo = porNombre.get(k);
      if (!previo) {
        porNombre.set(k, fila);
        orden.push(k);
        return;
      }
      const gana = fila.completitud > previo.completitud ? fila : previo;
      const pierde = gana === fila ? previo : fila;
      if (gana.costoArchivo <= 0 && pierde.costoArchivo > 0) gana.costoArchivo = pierde.costoArchivo;
      if (gana.cantidadArchivo <= 0 && pierde.cantidadArchivo > 0) gana.cantidadArchivo = pierde.cantidadArchivo;
      if (gana.minimoArchivo <= 0 && pierde.minimoArchivo > 0) gana.minimoArchivo = pierde.minimoArchivo;
      if (!gana.unidadArchivo && pierde.unidadArchivo) gana.unidadArchivo = pierde.unidadArchivo;
      if (!gana.categoria && pierde.categoria) gana.categoria = pierde.categoria;
      porNombre.set(k, gana);
    });
  }

  if (hojasLeidas === 0 || orden.length === 0) return null;
  return { filas: orden.map((k) => porNombre.get(k)!), hojas: hojasLeidas, filasLeidas };
}

/**
 * Le pregunta a la IA lo único que la hoja no dice: rubro, unidad (cuando la celda vino
 * vacía) y si es un empaque. Va sobre nombres pelados, así que cuesta una fracción de lo que
 * costaba mandarle la hoja entera a transcribir.
 */
async function clasificarInsumos(filas: FilaHoja[]) {
  const clasificacion = new Map<string, { categoria: string; unidad: string; tipoEmpaque: string }>();
  for (let i = 0; i < filas.length; i += INSUMOS_POR_LOTE_CLASIFICACION) {
    const lote = filas.slice(i, i + INSUMOS_POR_LOTE_CLASIFICACION);
    try {
      const res = await llamarServicioIAJson('clasificar-insumos', {
        insumos: lote.map((f) => ({ nombre: f.nombre, unidad: f.unidadArchivo })),
      });
      const { insumos } = (await res.json()) as {
        insumos?: { nombre: string; categoria: string; unidad: string; tipoEmpaque: string }[];
      };
      for (const c of insumos ?? []) clasificacion.set(clave(c.nombre), c);
    } catch {
      // Sin clasificación los insumos entran igual, sin rubro y sin marca de empaque: son dos
      // cosas que el operador arregla en la pantalla. Perder la lectura entera de una hoja que
      // ya está bien leída por no poder clasificarla sería mucho peor.
    }
  }
  return clasificacion;
}

/** Cuántos nombres se clasifican por llamada. */
const INSUMOS_POR_LOTE_CLASIFICACION = 100;

/** Cuántos nombres nuevos se le pasan a la IA por llamada al cruzarlos con el inventario. */
const NOMBRES_POR_LOTE = 60;

/** Cuántos platos se le pasan por llamada al elegirles empaque. Más chico que el cruce de
 * nombres porque acá el modelo tiene que razonar sobre cada plato, no solo emparejar texto. */
const PLATOS_POR_LOTE_EMPAQUE = 40;

export const masterCatalogAiService = {
  /**
   * Las categorías que el cliente YA tiene, para colgar los platos nuevos de las suyas en vez
   * de inventarle una carta paralela: un local que ya tiene "Hamburguesas" no necesita que le
   * aparezca "General" al lado con lo mismo adentro.
   */
  async categorias(restaurantId: string) {
    await restauranteOThrow(restaurantId);
    return prisma.category.findMany({
      where: { restaurantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Lee una carta completa y devuelve la lista de platos. NO escribe en la base.
   *
   * Entra una FOTO del menú impreso o un EXCEL del cliente tal como lo mandó — no hay
   * plantilla que llenar: la IA deduce qué columna es el nombre, cuál el precio y cuál la
   * categoría. Es transcripción, no creación; las fichas técnicas son el paso siguiente.
   */
  async leerCarta(restaurantId: string, file: Express.Multer.File): Promise<ProductoLeido[]> {
    await restauranteOThrow(restaurantId);

    // La hoja se aplana a texto en el backend y no en Python: exceljs ya está acá, y así el
    // microservicio de IA sigue siendo solo "entra contenido, sale JSON" sin saber de Excel.
    // Una carta larga se parte en trozos y las respuestas se juntan (ver leerListaConIA).
    const lectura = await leerListaConIA<ProductoLeido>('leer-carta', file, 'productos', {
      errorVacio: 'La hoja está vacía o no se pudo leer.',
    });

    const productos: ProductoLeido[] = [];
    for (const p of lectura.filas) {
      const nombre = String(p?.nombre ?? '').trim();
      if (!nombre) continue;
      const precio = Number(p?.precio);
      productos.push({
        nombre,
        categoria: String(p?.categoria ?? '').trim() || 'General',
        precio: Number.isFinite(precio) && precio > 0 ? round2(toDecimal(precio)).toNumber() : 0,
        descripcion: String(p?.descripcion ?? '').trim(),
      });
    }
    if (productos.length === 0) {
      throw badRequest('No se reconoció ningún plato. Prueba con una foto más nítida o revisa la hoja.');
    }
    return productos;
  },

  /**
   * Ficha técnica de cada plato: insumos directos y preparaciones (bases que se hacen aparte).
   *
   * Va por lotes contra la IA (ver PLATOS_POR_LOTE) y marca lo que el cliente YA tiene en su
   * inventario, para que el operador vincule en vez de duplicar — un local que ya tiene "Queso"
   * no necesita que le aparezca "queso cheddar" al lado con lo mismo adentro.
   */
  async fichas(
    restaurantId: string,
    platos: { nombre: string; descripcion?: string }[],
  ): Promise<FichaPropuesta[]> {
    await restauranteOThrow(restaurantId);
    const existentes = await loQueYaTiene(restaurantId);

    const fichas: FichaPropuesta[] = [];
    for (let i = 0; i < platos.length; i += PLATOS_POR_LOTE) {
      const lote = platos.slice(i, i + PLATOS_POR_LOTE);
      const res = await llamarServicioIAJson('fichas-tecnicas', { platos: lote });
      const datos = (await res.json()) as {
        platos?: {
          nombre: string;
          insumos?: { nombre: string; unidad: string; cantidad: number }[];
          preparaciones?: {
            nombre: string;
            unidad: string;
            rendimiento: number;
            cantidad: number;
            insumos?: { nombre: string; unidad: string; cantidad: number }[];
          }[];
        }[];
      };

      for (const ficha of datos.platos ?? []) {
        const nombre = String(ficha?.nombre ?? '').trim();
        if (!nombre) continue;
        const preparaciones: PreparacionPropuesta[] = [];
        for (const prep of ficha.preparaciones ?? []) {
          const prepNombre = String(prep?.nombre ?? '').trim();
          const rendimiento = Number(prep?.rendimiento);
          const cantidad = Number(prep?.cantidad);
          const insumos = marcarInsumos(prep?.insumos, existentes.insumos);
          if (!prepNombre || !UNIDADES.has(prep?.unidad)) continue;
          if (!Number.isFinite(rendimiento) || rendimiento <= 0) continue;
          if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
          // Sin ingredientes la preparación no se puede costear: sería una base vacía.
          if (insumos.length === 0) continue;
          preparaciones.push({
            nombre: prepNombre,
            unidad: prep.unidad,
            rendimiento,
            cantidad,
            insumos,
            yaExiste: existentes.preparaciones.has(clave(prepNombre)),
          });
        }
        fichas.push({
          nombre,
          insumos: marcarInsumos(ficha.insumos, existentes.insumos),
          preparaciones,
        });
      }
    }
    return fichas;
  },

  /**
   * Mira la foto y propone plato + descripción + ingredientes. NO escribe en la base.
   *
   * `mejorarFoto` pasa además la imagen por el retoque de Gemini. Va aparte porque es la
   * llamada cara (genera una imagen nueva) y no siempre hace falta: si el cliente ya mandó
   * fotos buenas, se analiza y se guarda la original.
   */
  async analizar(
    restaurantId: string,
    file: Express.Multer.File,
    opciones: { nombre?: string; mejorarFoto?: boolean },
  ): Promise<AnalisisPlato> {
    await restauranteOThrow(restaurantId);

    const analisis = (await (
      await llamarServicioIA('analizar-plato', file, { nombre: opciones.nombre?.trim() ?? '' })
    ).json()) as { plato?: string; descripcion?: string; ingredientes?: { nombre: string; unidad: string; cantidad: number }[] };

    // La foto que se guarda: la mejorada si se pidió, la original si no.
    let photoUrl: string;
    if (opciones.mejorarFoto) {
      const res = await llamarServicioIA('enhance-image', file);
      photoUrl = guardarFoto(Buffer.from(await res.arrayBuffer()), '.jpg');
    } else {
      const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
      photoUrl = guardarFoto(file.buffer, ext);
    }

    // Qué insumos ya tiene el cliente: lo que ya existe se vincula en vez de duplicarse, y
    // se le muestra al operador para que no ande creando "Queso" y "queso cheddar" aparte.
    const inventarioDe = await resolveInventoryScopeById(restaurantId);
    const existentes = new Set(
      (await prisma.inventoryItem.findMany({ where: { restaurantId: inventarioDe }, select: { name: true } })).map((i) =>
        clave(i.name),
      ),
    );

    const ingredientes: IngredientePropuesto[] = [];
    for (const ing of analisis.ingredientes ?? []) {
      const nombre = String(ing?.nombre ?? '').trim();
      const cantidad = Number(ing?.cantidad);
      if (!nombre || !UNIDADES.has(ing?.unidad) || !Number.isFinite(cantidad) || cantidad <= 0) continue;
      ingredientes.push({ nombre, unidad: ing.unidad, cantidad, yaExiste: existentes.has(clave(nombre)) });
    }

    return {
      plato: (analisis.plato ?? opciones.nombre ?? '').trim(),
      descripcion: (analisis.descripcion ?? '').trim(),
      photoUrl,
      ingredientes,
    };
  },

  /**
   * Escribe en el catálogo del cliente lo que el operador dejó aprobado.
   *
   * Todo es crear-o-actualizar POR NOMBRE dentro de ese restaurante, así que reconfirmar el
   * mismo plato corregido no duplica la carta. Los insumos nuevos entran SIN costo a
   * propósito: el precio de compra es del cliente y ponerle uno inventado sería peor que
   * dejarlo vacío — la receta mostraría un costo falso en vez de un cero evidente.
   */
  async confirmar(
    restaurantId: string,
    productos: {
      nombre: string;
      categoria: string;
      precio: number;
      descripcion?: string;
      photoUrl?: string;
      ingredientes: { nombre: string; unidad: string; cantidad: number }[];
      /** Bases que se preparan aparte (salsas, masas, caldos) y que este plato consume. */
      preparaciones?: {
        nombre: string;
        unidad: string;
        /** Cuánto rinde una tanda, en `unidad`. */
        rendimiento: number;
        /** Cuánto usa este plato, en `unidad`. */
        cantidad: number;
        /** Ingredientes de la TANDA entera. */
        insumos: { nombre: string; unidad: string; cantidad: number }[];
      }[];
      tamanos?: { nombre: string; precio: number }[];
      modificadores?: {
        nombre: string;
        obligatorio: boolean;
        permiteVarias: boolean;
        /** Nombres de los tamaños en los que aplica. Vacío = en todos. */
        tamanos: string[];
        opciones: { nombre: string; precio: number }[];
      }[];
    }[],
  ) {
    await restauranteOThrow(restaurantId);
    if (productos.length === 0) throw badRequest('No hay productos que cargar.');

    const inventarioDe = await resolveInventoryScopeById(restaurantId);
    const resultado = {
      productosCreados: 0,
      productosActualizados: 0,
      insumosCreados: [] as string[],
      preparacionesCreadas: [] as string[],
      lineasReceta: 0,
      tamanosCreados: 0,
      gruposCreados: 0,
    };

    // Índices por nombre normalizado, para no consultar la base por cada línea.
    const categorias = new Map<string, string>();
    for (const c of await prisma.category.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
      categorias.set(clave(c.name), c.id);
    }
    const insumos = new Map<string, string>();
    for (const i of await prisma.inventoryItem.findMany({ where: { restaurantId: inventarioDe }, select: { id: true, name: true } })) {
      insumos.set(clave(i.name), i.id);
    }
    // Las preparaciones se comparten entre platos: si tres pastas llevan la misma boloñesa,
    // tiene que existir UNA sola y que las tres apunten a ella.
    const preparaciones = new Map<string, string>();
    for (const pr of await prisma.preparation.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
      preparaciones.set(clave(pr.name), pr.id);
    }

    for (const p of productos) {
      const nombre = p.nombre.trim();
      if (!nombre) continue;

      // Categoría: se crea si el operador escribió una que no existe.
      const nombreCat = (p.categoria || 'General').trim();
      let categoryId = categorias.get(clave(nombreCat));
      if (!categoryId) {
        const cat = await prisma.category.create({ data: { restaurantId, name: nombreCat } });
        categoryId = cat.id;
        categorias.set(clave(nombreCat), cat.id);
      }

      const datosProducto = {
        name: nombre,
        categoryId,
        price: toDecimal(p.precio || 0),
        description: p.descripcion?.trim() || null,
        ...(p.photoUrl ? { photoUrl: p.photoUrl } : {}),
        // Con receta armada, el costo del plato sale de ella y no de un número a mano.
        costSource: 'RECIPE' as const,
        pricingMode: (p.tamanos?.length ? 'VARIANTS' : 'SIMPLE') as 'VARIANTS' | 'SIMPLE',
      };

      const existente = await prisma.product.findFirst({
        where: { restaurantId, name: { equals: nombre, mode: 'insensitive' } },
        select: { id: true },
      });
      let productId: string;
      if (existente) {
        await prisma.product.update({ where: { id: existente.id }, data: datosProducto });
        productId = existente.id;
        resultado.productosActualizados += 1;
      } else {
        const creado = await prisma.product.create({ data: { restaurantId, ...datosProducto } });
        productId = creado.id;
        resultado.productosCreados += 1;
      }

      // --- Tamaños ---------------------------------------------------------------------
      // Se crean o actualizan por nombre. No se borran los que el producto ya tuviera: un
      // tamaño viejo puede estar referenciado por pedidos y recetas, y esto es una carga
      // asistida, no una migración que deba dejar el plato idéntico a la propuesta.
      const variantePorNombre = new Map<string, string>();
      for (const v of await prisma.productVariant.findMany({ where: { productId }, select: { id: true, name: true } })) {
        variantePorNombre.set(clave(v.name), v.id);
      }
      for (const t of p.tamanos ?? []) {
        const nombreT = t.nombre.trim();
        if (!nombreT) continue;
        const existenteId = variantePorNombre.get(clave(nombreT));
        if (existenteId) {
          await prisma.productVariant.update({ where: { id: existenteId }, data: { priceBase: toDecimal(t.precio || 0) } });
        } else {
          const creada = await prisma.productVariant.create({
            data: { restaurantId, productId, name: nombreT, priceBase: toDecimal(t.precio || 0) },
          });
          variantePorNombre.set(clave(nombreT), creada.id);
          resultado.tamanosCreados += 1;
        }
      }

      // --- Modificadores ----------------------------------------------------------------
      // Los grupos son del RESTAURANTE, no del plato: se reusa el que ya exista con ese nombre
      // (así "Extras" es uno solo en toda la carta) y solo se le agregan las opciones que le
      // falten. Al plato se le engancha el vínculo, con los tamaños en los que aplica.
      for (const g of p.modificadores ?? []) {
        const nombreG = g.nombre.trim();
        if (!nombreG) continue;
        let grupo = await prisma.modifierCategory.findFirst({
          where: { restaurantId, name: { equals: nombreG, mode: 'insensitive' } },
          select: { id: true },
        });
        if (!grupo) {
          grupo = await prisma.modifierCategory.create({
            data: { restaurantId, name: nombreG, isRequired: g.obligatorio, allowMultiple: g.permiteVarias },
            select: { id: true },
          });
          resultado.gruposCreados += 1;
        }
        const opcionesExistentes = new Set(
          (
            await prisma.modifier.findMany({ where: { categoryId: grupo.id }, select: { name: true } })
          ).map((m) => clave(m.name)),
        );
        for (const o of g.opciones) {
          const nombreO = o.nombre.trim();
          if (!nombreO || opcionesExistentes.has(clave(nombreO))) continue;
          await prisma.modifier.create({
            data: { restaurantId, categoryId: grupo.id, name: nombreO, priceBase: toDecimal(o.precio || 0) },
          });
          opcionesExistentes.add(clave(nombreO));
        }
        // Los tamaños llegan por NOMBRE porque cuando el operador armó esto todavía no existían
        // sus ids. Un nombre que no corresponde a ningún tamaño se ignora en vez de romper.
        const variantIds = g.tamanos.map((n) => variantePorNombre.get(clave(n))).filter((x): x is string => !!x);
        await prisma.productModifierCategory.upsert({
          where: { productId_modifierCategoryId: { productId, modifierCategoryId: grupo.id } },
          create: { productId, modifierCategoryId: grupo.id, variantIds },
          update: { variantIds },
        });
      }

      // Insumos que falten — los del plato Y los de sus preparaciones. Sin costo y sin stock:
      // el precio de compra es del cliente, y uno inventado daría un costo de receta falso.
      const todosLosInsumos = [...p.ingredientes, ...(p.preparaciones ?? []).flatMap((pr) => pr.insumos)];
      for (const ing of todosLosInsumos) {
        const nombreIng = ing.nombre.trim();
        if (!nombreIng || !UNIDADES.has(ing.unidad)) continue;
        if (insumos.has(clave(nombreIng))) continue;
        const creado = await prisma.inventoryItem.create({
          data: { restaurantId: inventarioDe, name: nombreIng, unit: ing.unidad, quantity: 0, minQuantity: 0 },
        });
        insumos.set(clave(nombreIng), creado.id);
        resultado.insumosCreados.push(creado.name);
      }

      // Las líneas de receta se rehacen: si el operador quitó un ingrediente al revisar, no
      // puede quedar colgado de una carga anterior.
      await prisma.recipeIngredient.deleteMany({ where: { restaurantId, productId } });

      // El costo de cada línea se congela igual que en el panel: el grafo se reconstruye
      // DESPUÉS de crear los insumos, para que los recién creados existan en él.
      // Grafo con los insumos ya creados: las líneas de la preparación congelan su costo igual
      // que en el panel (ver preparation.service.ts#addIngredient). Los insumos nuevos entran
      // en cero, así que el costo arranca en cero hasta que el cliente cargue sus precios.
      const grafoInsumos = await buildCostGraph(prisma, restaurantId);

      // Preparaciones: se crean (o se reutilizan por nombre) ANTES del grafo final, para que
      // ya existan cuando se calcule lo que cuesta cada línea de la receta.
      for (const prep of p.preparaciones ?? []) {
        const nombrePrep = prep.nombre.trim();
        if (!nombrePrep || !UNIDADES.has(prep.unidad)) continue;
        const rendimiento = Number(prep.rendimiento);
        if (!Number.isFinite(rendimiento) || rendimiento <= 0) continue;

        let preparationId = preparaciones.get(clave(nombrePrep));
        if (!preparationId) {
          const creada = await prisma.preparation.create({
            data: { restaurantId, name: nombrePrep, unit: prep.unidad, yieldQuantity: toDecimal(rendimiento) },
          });
          preparationId = creada.id;
          preparaciones.set(clave(nombrePrep), creada.id);
          resultado.preparacionesCreadas.push(creada.name);
        }

        // Los ingredientes de la preparación se rehacen igual que los de la receta: si el
        // operador quitó uno al revisar, no puede quedar colgado de una carga anterior.
        await prisma.preparationIngredient.deleteMany({ where: { preparationId } });
        for (const ing of prep.insumos) {
          const inventoryItemId = insumos.get(clave(ing.nombre.trim()));
          const cantidad = Number(ing.cantidad);
          if (!inventoryItemId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
          const costoLinea = resolveCostPerBaseUnit(grafoInsumos, { inventoryItemId })
            .mul(cantidad)
            .toDecimalPlaces(4);
          await prisma.preparationIngredient.create({
            data: { restaurantId, preparationId, inventoryItemId, quantity: toDecimal(cantidad), costBase: costoLinea },
          });
        }
      }

      // El costo de cada línea se congela igual que en el panel: el grafo se reconstruye
      // DESPUÉS de crear insumos y preparaciones, para que los recién creados existan en él.
      const grafo = await buildCostGraph(prisma, restaurantId);
      for (const ing of p.ingredientes) {
        const inventoryItemId = insumos.get(clave(ing.nombre.trim()));
        const cantidad = Number(ing.cantidad);
        if (!inventoryItemId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
        const costo = round2(resolveCostPerBaseUnit(grafo, { inventoryItemId }).mul(cantidad));
        await prisma.recipeIngredient.create({
          data: { restaurantId, productId, inventoryItemId, quantity: toDecimal(cantidad), costBase: costo },
        });
        resultado.lineasReceta += 1;
      }
      for (const prep of p.preparaciones ?? []) {
        const preparationId = preparaciones.get(clave(prep.nombre.trim()));
        const cantidad = Number(prep.cantidad);
        if (!preparationId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
        const costo = round2(resolveCostPerBaseUnit(grafo, { preparationId }).mul(cantidad));
        await prisma.recipeIngredient.create({
          data: { restaurantId, productId, preparationId, quantity: toDecimal(cantidad), costBase: costo },
        });
        resultado.lineasReceta += 1;
      }
    }

    return resultado;
  },

  /* ------------------------------------------------------------------------------------
   * Carga por partes en un cliente ya montado
   * ---------------------------------------------------------------------------------- */

  /**
   * Radiografía del cliente: qué tiene y qué le falta, para saber por dónde entrar.
   *
   * El orden natural es insumos → recetas → productos, porque una receta no se puede
   * costear sin insumos. Devuelve además las dos listas con las que se trabaja:
   * los platos que todavía no tienen receta y los insumos que están sin costo (que son
   * los que hacen que una receta ya armada muestre costo cero).
   */
  async estado(restaurantId: string) {
    await restauranteOThrow(restaurantId);
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    const [productos, insumos, preparaciones, usoEnRecetas, usoEnPreparaciones] = await Promise.all([
      prisma.product.findMany({
        where: { restaurantId },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          category: { select: { name: true } },
          _count: { select: { recipeIngredients: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.inventoryItem.findMany({
        where: { restaurantId: inventarioDe, locationScope: 'LOCAL' },
        select: { id: true, name: true, unit: true, quantity: true, pricePerUnitBase: true },
        orderBy: { name: 'asc' },
      }),
      prisma.preparation.count({ where: { restaurantId } }),
      prisma.recipeIngredient.groupBy({
        by: ['inventoryItemId'],
        where: { restaurantId, inventoryItemId: { not: null } },
        _count: { _all: true },
      }),
      prisma.preparationIngredient.groupBy({
        by: ['inventoryItemId'],
        where: { restaurantId, inventoryItemId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    // Cuántas líneas de costo depende de cada insumo: es lo que mide el impacto real de
    // cargarle su precio, y lo que ordena la lista de "sin costo" por lo que más urge.
    const usos = new Map<string, number>();
    for (const g of [...usoEnRecetas, ...usoEnPreparaciones]) {
      if (!g.inventoryItemId) continue;
      usos.set(g.inventoryItemId, (usos.get(g.inventoryItemId) ?? 0) + g._count._all);
    }

    const sinReceta = productos.filter((p) => p._count.recipeIngredients === 0);
    const sinCosto = insumos.filter((i) => !i.pricePerUnitBase || Number(i.pricePerUnitBase) <= 0);

    return {
      resumen: {
        productos: productos.length,
        productosConReceta: productos.length - sinReceta.length,
        productosSinReceta: sinReceta.length,
        insumos: insumos.length,
        insumosSinCosto: sinCosto.length,
        preparaciones,
      },
      productosSinReceta: sinReceta.map((p) => ({
        id: p.id,
        nombre: p.name,
        categoria: p.category?.name ?? '',
        descripcion: p.description ?? '',
        precio: Number(p.price),
      })),
      // La lista completa y no solo los que faltan: el panel la usa además para que el
      // operador reasigne a mano un vínculo que el cruce automático puso donde no era.
      insumos: insumos
        .map((i) => ({
          id: i.id,
          nombre: i.name,
          unidad: i.unit,
          cantidad: Number(i.quantity),
          costo: Number(i.pricePerUnitBase ?? 0),
          usadoEn: usos.get(i.id) ?? 0,
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  },

  /**
   * Lee la lista de insumos del cliente (su inventario, su hoja de compras, la factura del
   * proveedor) y la cruza contra lo que ya tiene cargado. NO escribe en la base.
   *
   * El cruce va en dos pasadas: primero por nombre normalizado, que es exacto y gratis, y lo
   * que queda suelto se le pasa a la IA para que reconozca "Mozzarella" y "Queso mozzarella
   * rallado" como el mismo queso. Cada fila vuelve diciendo con qué se vinculó y en cuántas
   * líneas de receta pega, para que el operador vea el impacto antes de confirmar.
   */
  async leerInsumos(
    restaurantId: string,
    file: Express.Multer.File,
  ): Promise<{
    insumos: InsumoLeido[];
    lectura: { filas: number; productos: number; lotes: number; porCodigo: boolean };
  }> {
    await restauranteOThrow(restaurantId);
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    const esExcel =
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.toLowerCase().endsWith('.xlsx');

    // Camino rápido: la hoja tiene encabezados que se reconocen, así que la lee el código y a
    // la IA solo se le pregunta el rubro y los empaques. Si no se puede confiar en esa
    // lectura, `leerInventarioDeHoja` devuelve null y se cae al camino de siempre.
    const hoja = esExcel ? await leerInventarioDeHoja(file.buffer) : null;
    let lectura: {
      filas: {
        nombre: string;
        unidadArchivo: string;
        cantidadArchivo: number;
        costoArchivo: number;
        minimoArchivo: number;
        unidad: string;
        categoria: string;
        esEmpaque: boolean;
        tipoEmpaque: string;
      }[];
      compactado: { filas: number; productos: number } | null;
      lotes: number;
      porCodigo: boolean;
    };

    if (hoja) {
      const clasificacion = await clasificarInsumos(hoja.filas);
      lectura = {
        filas: hoja.filas.map((f) => {
          const c = clasificacion.get(clave(f.nombre));
          return {
            nombre: f.nombre,
            unidadArchivo: f.unidadArchivo,
            cantidadArchivo: f.cantidadArchivo,
            costoArchivo: f.costoArchivo,
            minimoArchivo: f.minimoArchivo,
            // La unidad que decide la IA es solo el respaldo para cuando la celda vino vacía:
            // aUnidadBase usa siempre la del archivo si la reconoce.
            unidad: c?.unidad || 'unidad',
            // El rubro de la hoja manda sobre el que deduce la IA: si el cliente ya archivó
            // sus insumos, esa es su clasificación y no hay por qué inventarle otra.
            categoria: f.categoria || c?.categoria || '',
            esEmpaque: !!c?.tipoEmpaque,
            tipoEmpaque: c?.tipoEmpaque ?? '',
          };
        }),
        compactado: { filas: hoja.filasLeidas, productos: hoja.filas.length },
        lotes: Math.ceil(hoja.filas.length / INSUMOS_POR_LOTE_CLASIFICACION),
        porCodigo: true,
      };
    } else {
      const conIA = await leerListaConIA<{
        nombre: string;
        unidadArchivo: string;
        cantidadArchivo: number;
        costoArchivo: number;
        minimoArchivo: number;
        unidad: string;
        categoria: string;
        esEmpaque: boolean;
        tipoEmpaque: string;
      }>('leer-insumos', file, 'insumos', { errorVacio: 'La hoja está vacía o no se pudo leer.', compactar: true });
      lectura = { ...conIA, porCodigo: false };
    }

    const leidos: InsumoLeido[] = [];
    const porNombreLeido = new Map<string, InsumoLeido>();
    for (const i of lectura.filas) {
      const nombre = String(i?.nombre ?? '').trim();
      if (!nombre) continue;

      // La IA transcribe ("8000", "gramos") y acá se convierte: 8000 gramos son 8 kg, y un
      // costo de 0.0045 por gramo son 4.50 por kg. Dividir la cantidad y multiplicar el costo
      // por el mismo factor mantiene el valor total del stock igual.
      const unidadArchivo = String(i?.unidadArchivo ?? '').trim();
      const { unidad, factor } = aUnidadBase(unidadArchivo, String(i?.unidad ?? ''));
      const cantidadArchivo = numeroPositivo(i?.cantidadArchivo);
      const costoArchivo = numeroPositivo(i?.costoArchivo);
      const minimoArchivo = numeroPositivo(i?.minimoArchivo);

      const fila = {
        nombre,
        unidad,
        cantidad: redondear(cantidadArchivo * factor, 4),
        costoUnitario: redondear(costoArchivo / factor, 4),
        minimo: redondear(minimoArchivo * factor, 4),
        categoria: String(i?.categoria ?? '').trim(),
        vinculadoA: null,
        vinculoPor: null,
        usadoEn: 0,
        enPlatos: [],
        enPreparaciones: [],
        // Solo se muestra cuando hubo conversión de verdad: "8000 gramos" al lado de "8 kg"
        // deja ver de un golpe si la IA leyó bien la unidad. Si no se convirtió nada, el dato
        // es ruido — sería repetir la misma cifra dos veces.
        enLaHoja: factor !== 1 && unidadArchivo ? `${cantidadArchivo} ${unidadArchivo}` : '',
        // Solo se toma el tipo si la IA además lo marcó como empaque: un tipo suelto sin la
        // marca es ruido del modelo, y mandar a la ventana de empaques algo que no lo es
        // ensucia el picker con el que después se vincula el envase de cada plato.
        tipoEmpaque: (i?.esEmpaque && TIPOS_EMPAQUE.has(i?.tipoEmpaque) ? i.tipoEmpaque : '') as InsumoLeido['tipoEmpaque'],
      } satisfies InsumoLeido;

      // El mismo insumo puede volver en dos trozos distintos del archivo (o repetido en la
      // hoja). Se queda uno solo, quedándose con el dato que SÍ vino: una hoja donde el costo
      // aparece en una semana y la existencia en otra tiene que terminar en una fila completa,
      // no en la primera a medias. Dos filas iguales al confirmar se pisarían entre ellas y el
      // operador no vería cuál quedó.
      const previo = porNombreLeido.get(clave(nombre));
      if (!previo) {
        porNombreLeido.set(clave(nombre), fila);
        leidos.push(fila);
        continue;
      }
      if (previo.costoUnitario <= 0 && fila.costoUnitario > 0) previo.costoUnitario = fila.costoUnitario;
      if (previo.cantidad <= 0 && fila.cantidad > 0) {
        previo.cantidad = fila.cantidad;
        previo.enLaHoja = fila.enLaHoja;
      }
      if (previo.minimo <= 0 && fila.minimo > 0) previo.minimo = fila.minimo;
      if (!previo.categoria && fila.categoria) previo.categoria = fila.categoria;
      if (!previo.tipoEmpaque && fila.tipoEmpaque) previo.tipoEmpaque = fila.tipoEmpaque;
    }
    if (leidos.length === 0) {
      throw badRequest('No se reconoció ningún insumo. Prueba con una foto más nítida o revisa la hoja.');
    }

    const existentes = await prisma.inventoryItem.findMany({
      where: { restaurantId: inventarioDe, locationScope: 'LOCAL' },
      select: { id: true, name: true, pricePerUnitBase: true },
    });
    const porClave = new Map(existentes.map((e) => [clave(e.name), e]));

    // Pasada 1: nombre idéntico salvo acentos, mayúsculas y espacios de más.
    for (const fila of leidos) {
      const igual = porClave.get(clave(fila.nombre));
      if (igual) {
        fila.vinculadoA = { id: igual.id, nombre: igual.name, costoActual: Number(igual.pricePerUnitBase ?? 0) };
        fila.vinculoPor = 'nombre';
      }
    }

    // Pasada 2: los que quedaron sueltos, a la IA. Solo tiene sentido si el cliente ya tiene
    // inventario cargado — si está vacío no hay nada con qué cruzar y se ahorra la llamada.
    const sueltos = leidos.filter((f) => !f.vinculadoA);
    if (sueltos.length > 0 && existentes.length > 0) {
      const porNombre = new Map(existentes.map((e) => [e.name, e]));
      const lotes: InsumoLeido[][] = [];
      for (let i = 0; i < sueltos.length; i += NOMBRES_POR_LOTE) lotes.push(sueltos.slice(i, i + NOMBRES_POR_LOTE));

      // En paralelo y no una tras otra: cada tanda es una consulta independiente (mismos
      // existentes, nombres nuevos distintos) y encadenarlas le sumaba medio minuto de espera
      // al operador por cada 60 insumos. Con 150 insumos eran tres tandas en fila.
      await Promise.all(
        lotes.map(async (lote) => {
          try {
            const res = await llamarServicioIAJson('vincular-insumos', {
              nuevos: lote.map((f) => f.nombre),
              existentes: existentes.map((e) => e.name),
            });
            const { pares } = (await res.json()) as { pares?: { nuevo: string; existente: string }[] };
            const equivalencia = new Map((pares ?? []).map((p) => [p.nuevo, p.existente]));
            for (const fila of lote) {
              const destino = porNombre.get(equivalencia.get(fila.nombre) ?? '');
              if (!destino) continue;
              fila.vinculadoA = { id: destino.id, nombre: destino.name, costoActual: Number(destino.pricePerUnitBase ?? 0) };
              fila.vinculoPor = 'ia';
            }
          } catch {
            // El cruce fino es una ayuda, no un requisito: si la IA falla, esas filas quedan
            // como insumos nuevos y el operador las vincula a mano. Perder la lectura entera
            // por esto sería mucho peor que revisar unas cuantas líneas.
          }
        }),
      );
    }

    // Dos filas distintas no pueden terminar apuntando al MISMO insumo: al confirmar, la
    // segunda pisaría a la primera en silencio y el operador nunca vería cuál quedó. Pasa de
    // verdad — la IA manda "Aceite de soya" y "Aceite de palma" al "Aceite" genérico que el
    // cliente tiene cargado. Se queda el vínculo más confiable (nombre idéntico le gana al
    // cruce de la IA) y los demás vuelven a "insumo nuevo", que es reversible de un clic; lo
    // otro le mete un costo equivocado a las recetas y no se ve.
    const ocupado = new Map<string, InsumoLeido>();
    for (const fila of leidos) {
      if (!fila.vinculadoA) continue;
      const previo = ocupado.get(fila.vinculadoA.id);
      if (!previo) {
        ocupado.set(fila.vinculadoA.id, fila);
        continue;
      }
      const pierde = previo.vinculoPor === 'nombre' || fila.vinculoPor !== 'nombre' ? fila : previo;
      if (pierde === previo) ocupado.set(fila.vinculadoA.id, fila);
      pierde.vinculadoA = null;
      pierde.vinculoPor = null;
    }

    // Cuántas líneas de costo se recostean por cada vínculo: es lo que el operador necesita
    // ver para entender que cargar ese precio le enciende el costo a N recetas.
    // Dónde se usa cada insumo vinculado: cuántas líneas se recostean y, sobre todo, EN QUÉ.
    // El número solo dice el tamaño del cambio; los nombres son los que dejan revisar el
    // vínculo — ver "Aceite" cayendo en catorce platos obliga a mirarlo antes de aprobarlo.
    const vinculados = leidos.map((f) => f.vinculadoA?.id).filter((x): x is string => !!x);
    if (vinculados.length > 0) {
      const [enRecetas, enPreparaciones] = await Promise.all([
        prisma.recipeIngredient.findMany({
          where: { restaurantId, inventoryItemId: { in: vinculados } },
          select: { inventoryItemId: true, product: { select: { name: true } } },
        }),
        prisma.preparationIngredient.findMany({
          where: { restaurantId, inventoryItemId: { in: vinculados } },
          select: { inventoryItemId: true, preparation: { select: { name: true } } },
        }),
      ]);
      const platos = new Map<string, Set<string>>();
      const preparaciones = new Map<string, Set<string>>();
      const sumar = (mapa: Map<string, Set<string>>, id: string | null, nombre: string | undefined) => {
        if (!id || !nombre) return;
        if (!mapa.has(id)) mapa.set(id, new Set());
        mapa.get(id)!.add(nombre);
      };
      for (const l of enRecetas) sumar(platos, l.inventoryItemId, l.product?.name);
      for (const l of enPreparaciones) sumar(preparaciones, l.inventoryItemId, l.preparation?.name);

      for (const fila of leidos) {
        if (!fila.vinculadoA) continue;
        fila.enPlatos = [...(platos.get(fila.vinculadoA.id) ?? [])].sort();
        fila.enPreparaciones = [...(preparaciones.get(fila.vinculadoA.id) ?? [])].sort();
        fila.usadoEn = enRecetas.filter((l) => l.inventoryItemId === fila.vinculadoA!.id).length +
          enPreparaciones.filter((l) => l.inventoryItemId === fila.vinculadoA!.id).length;
      }
    }

    return {
      insumos: leidos,
      // Para que el operador entienda qué pasó con un archivo grande en vez de ver 171 filas
      // salidas de un Excel de 2.888 y preguntarse qué se perdió.
      lectura: {
        filas: lectura.compactado?.filas ?? leidos.length,
        productos: lectura.compactado?.productos ?? leidos.length,
        lotes: lectura.lotes,
        // Por dónde entró: leída con código (rápida y sin perder filas) o transcrita por la IA.
        porCodigo: lectura.porCodigo,
      },
    };
  },

  /**
   * Escribe los insumos que el operador dejó aprobados y vuelve a costear lo que dependía
   * de ellos. Esta es la pieza que "conecta los insumos con las recetas ya creadas".
   *
   * Los que traen `inventoryItemId` se ACTUALIZAN (precio, existencia, mínimo, categoría) y
   * los demás se crean. La unidad de un insumo que ya existe no se toca a propósito: las
   * cantidades de sus recetas están expresadas en esa unidad, y cambiarla acá reinterpretaría
   * en silencio cada gramo ya cargado. Se avisa el desacuerdo en vez de resolverlo solo.
   */
  async confirmarInsumos(
    restaurantId: string,
    insumos: {
      nombre: string;
      unidad: string;
      cantidad: number;
      costoUnitario: number;
      minimo: number;
      categoria?: string;
      /** No vacío = va a la ventana de empaques del inventario (InventoryItem.packagingType). */
      tipoEmpaque?: string;
      /** Insumo existente con el que se vincula. Vacío = se crea uno nuevo. */
      inventoryItemId?: string;
    }[],
  ) {
    await restauranteOThrow(restaurantId);
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    // Los ids que llegan del cliente se validan contra el inventario de ESTE restaurante:
    // es una herramienta que escribe en cualquier tenant según la URL, y un id de otro
    // restaurante colado en el cuerpo no puede terminar actualizado acá.
    const propios = new Set(
      (
        await prisma.inventoryItem.findMany({
          where: { restaurantId: inventarioDe, locationScope: 'LOCAL' },
          select: { id: true },
        })
      ).map((i) => i.id),
    );

    const categorias = new Map<string, string>();
    for (const c of await prisma.inventoryCategory.findMany({
      where: { restaurantId: inventarioDe },
      select: { id: true, name: true },
    })) {
      categorias.set(clave(c.name), c.id);
    }
    async function categoriaId(nombre: string | undefined): Promise<string | undefined> {
      const limpio = (nombre ?? '').trim();
      if (!limpio) return undefined;
      const existente = categorias.get(clave(limpio));
      if (existente) return existente;
      const creada = await prisma.inventoryCategory.create({ data: { restaurantId: inventarioDe, name: limpio } });
      categorias.set(clave(limpio), creada.id);
      return creada.id;
    }

    const resultado = {
      creados: 0,
      actualizados: 0,
      conCosto: 0,
      unidadEnConflicto: [] as string[],
      /** Cuántos quedaron marcados como empaque (van a la ventana de empaques del inventario). */
      empaques: 0,
      /** Filas que apuntaban a un insumo que otra fila ya se había llevado: se crearon aparte. */
      vinculosRepetidos: [] as string[],
      lineasRecosteadas: 0,
    };

    // Un insumo existente lo escribe UNA sola fila: dos filas sobre el mismo se pisarían y
    // el operador vería solo el resultado de la última sin saber que perdió la otra.
    const yaEscritos = new Set<string>();

    // Los nombres que ya existen se resuelven acá y no fila por fila, para que dos filas de
    // la misma hoja que apuntan al mismo nombre no creen dos insumos iguales.
    const porClave = new Map<string, string>();
    for (const i of await prisma.inventoryItem.findMany({
      where: { restaurantId: inventarioDe, locationScope: 'LOCAL' },
      select: { id: true, name: true, unit: true },
    })) {
      porClave.set(clave(i.name), i.id);
    }

    for (const fila of insumos) {
      const nombre = fila.nombre.trim();
      if (!nombre || !UNIDADES.has(fila.unidad)) continue;
      const costo = numeroPositivo(fila.costoUnitario);
      const categoryId = await categoriaId(fila.categoria);
      // Marcar el insumo como empaque es lo que lo hace aparecer en la ventana de empaques y
      // en el picker con el que se le pone envase a un plato. Nunca se DESMARCA desde acá: si
      // el cliente ya lo tenía como empaque y esta hoja no lo dice, manda lo que él configuró.
      const packagingType = TIPOS_EMPAQUE.has(fila.tipoEmpaque ?? '') ? fila.tipoEmpaque : undefined;

      // El id que llega puede repetirse entre filas (el operador eligió el mismo insumo dos
      // veces en los selectores). El primero se lo lleva; los siguientes se crean aparte con
      // su propio nombre en vez de pisar lo que acaba de escribir la fila anterior.
      const pedido =
        fila.inventoryItemId && propios.has(fila.inventoryItemId) ? fila.inventoryItemId : porClave.get(clave(nombre));
      const destinoId = pedido && !yaEscritos.has(pedido) ? pedido : undefined;
      if (pedido && !destinoId) resultado.vinculosRepetidos.push(nombre);

      if (destinoId) {
        yaEscritos.add(destinoId);
        const actual = await prisma.inventoryItem.findUnique({
          where: { id: destinoId },
          select: { name: true, unit: true },
        });
        if (actual && actual.unit !== fila.unidad) resultado.unidadEnConflicto.push(`${actual.name} (${actual.unit})`);
        await prisma.inventoryItem.update({
          where: { id: destinoId },
          data: {
            quantity: toDecimal(numeroPositivo(fila.cantidad)),
            minQuantity: toDecimal(numeroPositivo(fila.minimo)),
            // Un costo en cero no pisa el que el insumo ya tenía: la lista puede venir sin
            // precios y borrar los buenos sería peor que no cargar nada.
            ...(costo > 0 ? { pricePerUnitBase: toDecimal(costo).toDecimalPlaces(4) } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(packagingType ? { packagingType } : {}),
          },
        });
        if (packagingType) resultado.empaques += 1;
        resultado.actualizados += 1;
      } else {
        const creado = await prisma.inventoryItem.create({
          data: {
            restaurantId: inventarioDe,
            name: nombre,
            unit: fila.unidad,
            quantity: toDecimal(numeroPositivo(fila.cantidad)),
            minQuantity: toDecimal(numeroPositivo(fila.minimo)),
            ...(costo > 0 ? { pricePerUnitBase: toDecimal(costo).toDecimalPlaces(4) } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(packagingType ? { packagingType } : {}),
          },
        });
        if (packagingType) resultado.empaques += 1;
        porClave.set(clave(nombre), creado.id);
        propios.add(creado.id);
        resultado.creados += 1;
      }
      if (costo > 0) resultado.conCosto += 1;
    }

    // Y acá está lo que hace que esto valga la pena: las recetas que ya existían y costaban
    // cero porque sus insumos no tenían precio quedan costeadas, sin tocar ni una receta.
    const antes = await prisma.recipeIngredient.findMany({ where: { restaurantId }, select: { id: true, costBase: true } });
    await prisma.$transaction(async (tx) => {
      await recomputeDependentCosts(tx, restaurantId);
    });
    const despues = await prisma.recipeIngredient.findMany({ where: { restaurantId }, select: { id: true, costBase: true } });
    const previo = new Map(antes.map((l) => [l.id, l.costBase.toString()]));
    resultado.lineasRecosteadas = despues.filter((l) => previo.get(l.id) !== l.costBase.toString()).length;

    return resultado;
  },

  /**
   * Fichas técnicas para platos que el cliente YA tiene en su carta.
   *
   * Mismo motor que `fichas` pero entrando por productos existentes en vez de por una carta
   * recién leída: es el camino del cliente que ya vende pero no tiene inventario armado.
   * Devuelve el `productId` junto a la ficha para que al confirmar se escriba en ESE plato y
   * no en uno nuevo con el mismo nombre.
   */
  async fichasDeCatalogo(restaurantId: string, productIds: string[]) {
    await restauranteOThrow(restaurantId);
    const productos = await prisma.product.findMany({
      where: { restaurantId, id: { in: productIds } },
      select: { id: true, name: true, description: true, _count: { select: { recipeIngredients: true } } },
    });
    if (productos.length === 0) throw badRequest('Ninguno de esos platos existe en la carta de este cliente.');

    const fichas = await this.fichas(
      restaurantId,
      productos.map((p) => ({ nombre: p.name, descripcion: p.description ?? undefined })),
    );

    // La IA devuelve el nombre que se le pasó pero puede cambiarle acentos o mayúsculas: el
    // cruce va por clave de nombre para no perder la ficha por una tilde.
    const porNombre = new Map(fichas.map((f) => [clave(f.nombre), f]));
    return productos.map((p) => {
      const ficha = porNombre.get(clave(p.name));
      return {
        productId: p.id,
        nombre: p.name,
        yaTeniaReceta: p._count.recipeIngredients > 0,
        insumos: ficha?.insumos ?? [],
        preparaciones: ficha?.preparaciones ?? [],
      };
    });
  },

  /**
   * Lee el recetario propio del cliente (sus fichas técnicas en foto o en hoja de cálculo) y
   * lo cruza contra su carta y su inventario. NO escribe en la base.
   *
   * Se diferencia de `fichasDeCatalogo` en de dónde salen los números: acá los dicta el
   * documento del cliente, allá los estima la IA. Cuando el cliente tiene su recetario, este
   * es siempre el camino bueno — son sus gramos de verdad, no una aproximación.
   */
  async leerRecetas(restaurantId: string, file: Express.Multer.File) {
    await restauranteOThrow(restaurantId);
    const existentes = await loQueYaTiene(restaurantId);

    const lectura = await leerListaConIA<{
      nombre: string;
      insumos?: { nombre: string; unidad: string; cantidad: number }[];
      preparaciones?: {
        nombre: string;
        unidad: string;
        rendimiento: number;
        cantidad: number;
        insumos?: { nombre: string; unidad: string; cantidad: number }[];
      }[];
    }>('leer-recetas', file, 'platos', { errorVacio: 'La hoja está vacía o no se pudo leer.' });

    // A qué plato de la carta corresponde cada ficha leída. Lo que no calza con ningún plato
    // se devuelve igual con productId nulo: puede ser un plato que todavía no está cargado.
    const productos = await prisma.product.findMany({
      where: { restaurantId },
      select: { id: true, name: true, _count: { select: { recipeIngredients: true } } },
    });
    const porClave = new Map(productos.map((p) => [clave(p.name), p]));

    const salida = [];
    for (const ficha of lectura.filas) {
      const nombre = String(ficha?.nombre ?? '').trim();
      if (!nombre) continue;
      const producto = porClave.get(clave(nombre));
      const preparaciones: PreparacionPropuesta[] = [];
      for (const prep of ficha.preparaciones ?? []) {
        const prepNombre = String(prep?.nombre ?? '').trim();
        const rendimiento = Number(prep?.rendimiento);
        const cantidad = Number(prep?.cantidad);
        const insumos = marcarInsumos(prep?.insumos, existentes.insumos);
        if (!prepNombre || !UNIDADES.has(prep?.unidad)) continue;
        if (!Number.isFinite(rendimiento) || rendimiento <= 0) continue;
        if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
        if (insumos.length === 0) continue;
        preparaciones.push({
          nombre: prepNombre,
          unidad: prep.unidad,
          rendimiento,
          cantidad,
          insumos,
          yaExiste: existentes.preparaciones.has(clave(prepNombre)),
        });
      }
      salida.push({
        productId: producto?.id ?? null,
        nombre,
        yaTeniaReceta: (producto?._count.recipeIngredients ?? 0) > 0,
        insumos: marcarInsumos(ficha.insumos, existentes.insumos),
        preparaciones,
      });
    }
    if (salida.length === 0) throw badRequest('No se reconoció ninguna receta. Revisa el archivo.');
    return salida;
  },

  /**
   * Escribe SOLO recetas sobre platos que ya existen. No toca nombre, precio, categoría ni
   * foto del producto — es la diferencia con `confirmar`, que monta la carta de cero: acá el
   * cliente ya está vendiendo y pisarle un precio con el de una propuesta sería un desastre.
   *
   * Un plato que ya tenía receta se salta salvo que el operador pida reemplazarla, para que
   * una carga masiva no borre en silencio el trabajo que el cliente ya hizo.
   */
  async confirmarRecetas(
    restaurantId: string,
    recetas: {
      productId?: string;
      nombre: string;
      insumos: { nombre: string; unidad: string; cantidad: number }[];
      preparaciones?: {
        nombre: string;
        unidad: string;
        rendimiento: number;
        cantidad: number;
        insumos: { nombre: string; unidad: string; cantidad: number }[];
      }[];
    }[],
    reemplazarExistentes: boolean,
  ) {
    await restauranteOThrow(restaurantId);
    if (recetas.length === 0) throw badRequest('No hay recetas que cargar.');
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    const resultado = {
      recetasCargadas: 0,
      lineasReceta: 0,
      insumosCreados: [] as string[],
      preparacionesCreadas: [] as string[],
      salteados: [] as string[],
      sinPlato: [] as string[],
    };

    const insumos = new Map<string, string>();
    for (const i of await prisma.inventoryItem.findMany({
      where: { restaurantId: inventarioDe, locationScope: 'LOCAL' },
      select: { id: true, name: true },
    })) {
      insumos.set(clave(i.name), i.id);
    }
    const preparaciones = new Map<string, string>();
    for (const pr of await prisma.preparation.findMany({ where: { restaurantId }, select: { id: true, name: true } })) {
      preparaciones.set(clave(pr.name), pr.id);
    }

    for (const receta of recetas) {
      const nombre = receta.nombre.trim();
      // El id manda; el nombre es el respaldo para las fichas leídas de un recetario, donde
      // el operador nunca eligió un plato de una lista.
      const producto = receta.productId
        ? await prisma.product.findFirst({ where: { id: receta.productId, restaurantId }, select: { id: true } })
        : await prisma.product.findFirst({
            where: { restaurantId, name: { equals: nombre, mode: 'insensitive' } },
            select: { id: true },
          });
      if (!producto) {
        resultado.sinPlato.push(nombre);
        continue;
      }

      const yaTiene = await prisma.recipeIngredient.count({ where: { restaurantId, productId: producto.id } });
      if (yaTiene > 0 && !reemplazarExistentes) {
        resultado.salteados.push(nombre);
        continue;
      }

      // Insumos que falten — los del plato Y los de sus preparaciones. Sin costo: el precio
      // de compra es del cliente y uno inventado daría un costo de receta falso.
      const todos = [...receta.insumos, ...(receta.preparaciones ?? []).flatMap((pr) => pr.insumos)];
      for (const ing of todos) {
        const nombreIng = ing.nombre.trim();
        if (!nombreIng || !UNIDADES.has(ing.unidad) || insumos.has(clave(nombreIng))) continue;
        const creado = await prisma.inventoryItem.create({
          data: { restaurantId: inventarioDe, name: nombreIng, unit: ing.unidad, quantity: 0, minQuantity: 0 },
        });
        insumos.set(clave(nombreIng), creado.id);
        resultado.insumosCreados.push(creado.name);
      }

      await prisma.recipeIngredient.deleteMany({ where: { restaurantId, productId: producto.id } });

      const grafoInsumos = await buildCostGraph(prisma, restaurantId);
      for (const prep of receta.preparaciones ?? []) {
        const nombrePrep = prep.nombre.trim();
        if (!nombrePrep || !UNIDADES.has(prep.unidad)) continue;
        const rendimiento = Number(prep.rendimiento);
        if (!Number.isFinite(rendimiento) || rendimiento <= 0) continue;

        let preparationId = preparaciones.get(clave(nombrePrep));
        if (!preparationId) {
          const creada = await prisma.preparation.create({
            data: { restaurantId, name: nombrePrep, unit: prep.unidad, yieldQuantity: toDecimal(rendimiento) },
          });
          preparationId = creada.id;
          preparaciones.set(clave(nombrePrep), creada.id);
          resultado.preparacionesCreadas.push(creada.name);
        }

        await prisma.preparationIngredient.deleteMany({ where: { preparationId } });
        for (const ing of prep.insumos) {
          const inventoryItemId = insumos.get(clave(ing.nombre.trim()));
          const cantidad = Number(ing.cantidad);
          if (!inventoryItemId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
          const costoLinea = resolveCostPerBaseUnit(grafoInsumos, { inventoryItemId }).mul(cantidad).toDecimalPlaces(4);
          await prisma.preparationIngredient.create({
            data: { restaurantId, preparationId, inventoryItemId, quantity: toDecimal(cantidad), costBase: costoLinea },
          });
        }
      }

      const grafo = await buildCostGraph(prisma, restaurantId);
      let lineas = 0;
      for (const ing of receta.insumos) {
        const inventoryItemId = insumos.get(clave(ing.nombre.trim()));
        const cantidad = Number(ing.cantidad);
        if (!inventoryItemId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
        const costo = round2(resolveCostPerBaseUnit(grafo, { inventoryItemId }).mul(cantidad));
        await prisma.recipeIngredient.create({
          data: { restaurantId, productId: producto.id, inventoryItemId, quantity: toDecimal(cantidad), costBase: costo },
        });
        lineas += 1;
      }
      for (const prep of receta.preparaciones ?? []) {
        const preparationId = preparaciones.get(clave(prep.nombre.trim()));
        const cantidad = Number(prep.cantidad);
        if (!preparationId || !Number.isFinite(cantidad) || cantidad <= 0) continue;
        const costo = round2(resolveCostPerBaseUnit(grafo, { preparationId }).mul(cantidad));
        await prisma.recipeIngredient.create({
          data: { restaurantId, productId: producto.id, preparationId, quantity: toDecimal(cantidad), costBase: costo },
        });
        lineas += 1;
      }

      // El plato pasa a costearse por receta solo si de verdad quedó una: si todas las líneas
      // se cayeron, dejarlo en RECIPE le mostraría al cliente un costo de cero.
      if (lineas > 0) {
        await prisma.product.update({ where: { id: producto.id }, data: { costSource: 'RECIPE' } });
        resultado.recetasCargadas += 1;
        resultado.lineasReceta += lineas;
      }
    }

    return resultado;
  },

  /**
   * Qué empaque le toca a cada plato. NO escribe en la base.
   *
   * Vincular el envase a un plato es lo que hace que el sistema lo COBRE y lo DESCUENTE solo
   * al vender para llevar (ver computeEnvaseFee y deductPackagingStock en order.service). Sin
   * el vínculo, el restaurante regala el empaque en cada pedido de delivery y su stock de
   * envases no baja nunca aunque se estén gastando.
   *
   * Solo mira los empaques que el cliente YA tiene marcados como tales en su inventario, así
   * que el camino natural es cargarle primero los insumos (los empaques quedan marcados) y
   * después venir acá.
   */
  async empaquesPropuestos(restaurantId: string, productIds?: string[]) {
    await restauranteOThrow(restaurantId);
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    const empaques = await prisma.inventoryItem.findMany({
      where: { restaurantId: inventarioDe, locationScope: 'LOCAL', packagingType: { not: null } },
      select: { id: true, name: true, packagingType: true, quantity: true, salePriceBase: true },
      orderBy: { name: 'asc' },
    });
    const productos = await prisma.product.findMany({
      where: { restaurantId, ...(productIds?.length ? { id: { in: productIds } } : {}) },
      select: {
        id: true,
        name: true,
        packagingMode: true,
        packagingItemId: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    if (productos.length === 0) throw badRequest('Este cliente no tiene platos en la carta.');
    if (empaques.length === 0) {
      throw badRequest(
        'Este cliente no tiene empaques cargados. Súbele primero su lista de insumos: los envases, cajas y bolsas quedan marcados como empaque solos.',
      );
    }

    const porNombre = new Map(empaques.map((e) => [e.name, e]));
    const propuesta = new Map<string, string>();
    // Se le pasa el plato con su categoría: "Sopa de miso (Entradas)" le dice mucho más al
    // modelo sobre en qué sale despachado que el nombre suelto.
    const etiquetas = new Map(
      productos.map((p) => [p.id, p.category?.name ? `${p.name} (${p.category.name})` : p.name]),
    );
    const lista = [...etiquetas.values()];

    for (let i = 0; i < lista.length; i += PLATOS_POR_LOTE_EMPAQUE) {
      const lote = lista.slice(i, i + PLATOS_POR_LOTE_EMPAQUE);
      try {
        const res = await llamarServicioIAJson('vincular-empaques', {
          platos: lote,
          empaques: empaques.map((e) => e.name),
        });
        const { pares } = (await res.json()) as { pares?: { plato: string; empaque: string }[] };
        for (const par of pares ?? []) propuesta.set(par.plato, par.empaque);
      } catch {
        // La propuesta es una ayuda, no un requisito: si la IA falla, el operador ve la lista
        // igual y elige el empaque a mano. Perder la pantalla entera por esto sería peor.
      }
    }

    return {
      empaques: empaques.map((e) => ({
        id: e.id,
        nombre: e.name,
        tipo: e.packagingType,
        cantidad: Number(e.quantity),
        precioVenta: e.salePriceBase == null ? null : Number(e.salePriceBase),
      })),
      productos: productos.map((p) => {
        const sugerido = porNombre.get(propuesta.get(etiquetas.get(p.id)!) ?? '');
        return {
          productId: p.id,
          nombre: p.name,
          categoria: p.category?.name ?? '',
          // Lo que ya tiene configurado, para no proponerle cambiar algo que él dejó puesto.
          actual:
            p.packagingMode === 'INVENTORY' && p.packagingItemId
              ? p.packagingItemId
              : p.packagingMode === 'FIXED'
                ? 'FIJO'
                : '',
          sugerido: sugerido?.id ?? '',
        };
      }),
    };
  },

  /**
   * Deja puesto el empaque de cada plato: modo "por inventario" apuntando a ese insumo.
   *
   * Un plato con el empaque en blanco se deja como está en vez de desvincularlo — esta
   * pantalla es para PONER empaques, y que una carga masiva le apague el envase a un plato que
   * el cliente ya tenía configurado sería una sorpresa cara: dejaría de cobrarlo sin avisar.
   * Para quitarlo está la ficha del producto.
   */
  async confirmarEmpaques(restaurantId: string, asignaciones: { productId: string; inventoryItemId: string }[]) {
    await restauranteOThrow(restaurantId);
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    // Los ids llegan del cliente: se validan contra ESTE restaurante antes de escribir, que es
    // una herramienta que apunta a cualquier tenant según la URL.
    const empaques = new Set(
      (
        await prisma.inventoryItem.findMany({
          where: { restaurantId: inventarioDe, locationScope: 'LOCAL', packagingType: { not: null } },
          select: { id: true },
        })
      ).map((e) => e.id),
    );
    const productos = new Set(
      (await prisma.product.findMany({ where: { restaurantId }, select: { id: true } })).map((p) => p.id),
    );

    const resultado = { vinculados: 0, sinPrecioDeVenta: [] as string[] };
    for (const a of asignaciones) {
      if (!a.inventoryItemId) continue;
      if (!productos.has(a.productId) || !empaques.has(a.inventoryItemId)) continue;
      await prisma.product.update({
        where: { id: a.productId },
        data: { packagingMode: 'INVENTORY', packagingItemId: a.inventoryItemId, packagingFeeBase: null },
      });
      resultado.vinculados += 1;
    }

    // Un empaque sin precio de venta se descuenta del stock pero no se le cobra al cliente:
    // es el estado en que quedan los empaques recién cargados desde una hoja, que trae el
    // costo de compra y no lo que el restaurante decide cobrar. Se avisa en vez de inventarlo.
    const usados = [...new Set(asignaciones.map((a) => a.inventoryItemId).filter(Boolean))];
    if (usados.length > 0) {
      const sinPrecio = await prisma.inventoryItem.findMany({
        where: { id: { in: usados }, OR: [{ salePriceBase: null }, { salePriceBase: 0 }] },
        select: { name: true },
      });
      resultado.sinPrecioDeVenta = sinPrecio.map((e) => e.name);
    }

    return resultado;
  },
};
