import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
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
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v === null || v === undefined) celdas.push('');
        else if (typeof v === 'object' && 'text' in v) celdas.push(String((v as { text: unknown }).text ?? '').trim());
        else if (typeof v === 'object' && 'result' in v) celdas.push(String((v as { result: unknown }).result ?? '').trim());
        else if (v instanceof Date) celdas.push(v.toISOString().slice(0, 10));
        else celdas.push(String(v).trim());
      });
      // Las filas vacías (separadores visuales de la hoja) no aportan nada y gastan contexto.
      if (celdas.some((c) => c !== '')) lineas.push(celdas.join(' | ').replace(/(\s*\|\s*)+$/, ''));
    });
  });
  return lineas.join('\n');
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
}

function numeroPositivo(valor: unknown, porDefecto = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
}

/**
 * Aplana el archivo del cliente a texto y se lo manda al microservicio.
 *
 * Mismo camino para la carta y para la lista de insumos: si es .xlsx lo aplana exceljs acá
 * (el microservicio no sabe de Excel a propósito), y si es foto va la imagen tal cual.
 */
async function leerArchivoConIA(endpoint: string, file: Express.Multer.File, errorVacio: string) {
  const esExcel =
    file.mimetype.includes('spreadsheet') ||
    file.mimetype.includes('excel') ||
    file.originalname.toLowerCase().endsWith('.xlsx');

  if (!esExcel) return llamarServicioIA(endpoint, file);

  const texto = await hojaATexto(file.buffer);
  if (!texto.trim()) throw badRequest(errorVacio);
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

/** Cuántos nombres nuevos se le pasan a la IA por llamada al cruzarlos con el inventario. */
const NOMBRES_POR_LOTE = 60;

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

    const esExcel =
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel') ||
      file.originalname.toLowerCase().endsWith('.xlsx');

    let response: Response;
    if (esExcel) {
      // La hoja se aplana a texto acá y no en Python: exceljs ya está en el backend, y así el
      // microservicio de IA sigue siendo solo "entra contenido, sale JSON" sin saber de Excel.
      const texto = await hojaATexto(file.buffer);
      if (!texto.trim()) throw badRequest('La hoja está vacía o no se pudo leer.');
      const form = new FormData();
      form.append('texto', texto);
      try {
        response = await fetch(`${env.aiPhotoServiceUrl}/leer-carta`, { method: 'POST', body: form });
      } catch {
        throw new HttpError(503, SERVICIO_CAIDO);
      }
      if (!response.ok) {
        let detalle = 'El servicio de IA no pudo leer la lista.';
        try {
          const body = (await response.json()) as { detail?: string };
          if (body?.detail) detalle = body.detail;
        } catch {
          /* respuesta sin JSON */
        }
        throw new HttpError(502, detalle);
      }
    } else {
      response = await llamarServicioIA('leer-carta', file);
    }

    const datos = (await response.json()) as { productos?: ProductoLeido[] };
    const productos: ProductoLeido[] = [];
    for (const p of datos.productos ?? []) {
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
  async leerInsumos(restaurantId: string, file: Express.Multer.File): Promise<InsumoLeido[]> {
    await restauranteOThrow(restaurantId);
    const inventarioDe = await resolveInventoryScopeById(restaurantId);

    const response = await leerArchivoConIA('leer-insumos', file, 'La hoja está vacía o no se pudo leer.');
    const datos = (await response.json()) as {
      insumos?: { nombre: string; unidad: string; cantidad: number; costoUnitario: number; minimo: number; categoria: string }[];
    };

    const leidos: InsumoLeido[] = [];
    const vistos = new Set<string>();
    for (const i of datos.insumos ?? []) {
      const nombre = String(i?.nombre ?? '').trim();
      if (!nombre || !UNIDADES.has(i?.unidad)) continue;
      // La misma compra repetida en dos filas de la hoja no puede volver dos veces: al
      // confirmar se pisarían entre ellas y el operador no vería cuál quedó.
      if (vistos.has(clave(nombre))) continue;
      vistos.add(clave(nombre));
      leidos.push({
        nombre,
        unidad: i.unidad,
        cantidad: numeroPositivo(i?.cantidad),
        costoUnitario: numeroPositivo(i?.costoUnitario),
        minimo: numeroPositivo(i?.minimo),
        categoria: String(i?.categoria ?? '').trim(),
        vinculadoA: null,
        vinculoPor: null,
        usadoEn: 0,
      });
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
      for (let i = 0; i < sueltos.length; i += NOMBRES_POR_LOTE) {
        const lote = sueltos.slice(i, i + NOMBRES_POR_LOTE);
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
      }
    }

    // Cuántas líneas de costo se recostean por cada vínculo: es lo que el operador necesita
    // ver para entender que cargar ese precio le enciende el costo a N recetas.
    const vinculados = leidos.map((f) => f.vinculadoA?.id).filter((x): x is string => !!x);
    if (vinculados.length > 0) {
      const [enRecetas, enPreparaciones] = await Promise.all([
        prisma.recipeIngredient.groupBy({
          by: ['inventoryItemId'],
          where: { restaurantId, inventoryItemId: { in: vinculados } },
          _count: { _all: true },
        }),
        prisma.preparationIngredient.groupBy({
          by: ['inventoryItemId'],
          where: { restaurantId, inventoryItemId: { in: vinculados } },
          _count: { _all: true },
        }),
      ]);
      const usos = new Map<string, number>();
      for (const g of [...enRecetas, ...enPreparaciones]) {
        if (!g.inventoryItemId) continue;
        usos.set(g.inventoryItemId, (usos.get(g.inventoryItemId) ?? 0) + g._count._all);
      }
      for (const fila of leidos) {
        if (fila.vinculadoA) fila.usadoEn = usos.get(fila.vinculadoA.id) ?? 0;
      }
    }

    return leidos;
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
      lineasRecosteadas: 0,
    };

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

      const destinoId =
        fila.inventoryItemId && propios.has(fila.inventoryItemId) ? fila.inventoryItemId : porClave.get(clave(nombre));

      if (destinoId) {
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
          },
        });
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
          },
        });
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

    const response = await leerArchivoConIA('leer-recetas', file, 'La hoja está vacía o no se pudo leer.');
    const datos = (await response.json()) as {
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

    // A qué plato de la carta corresponde cada ficha leída. Lo que no calza con ningún plato
    // se devuelve igual con productId nulo: puede ser un plato que todavía no está cargado.
    const productos = await prisma.product.findMany({
      where: { restaurantId },
      select: { id: true, name: true, _count: { select: { recipeIngredients: true } } },
    });
    const porClave = new Map(productos.map((p) => [clave(p.name), p]));

    const salida = [];
    for (const ficha of datos.platos ?? []) {
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
};
