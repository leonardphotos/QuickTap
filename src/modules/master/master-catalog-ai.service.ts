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
import { buildCostGraph, resolveCostPerBaseUnit } from '../inventory/costing';
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
};
