import fs from 'fs';
import path from 'path';
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

      // Insumos que falten. Sin costo y sin stock: son datos del cliente.
      for (const ing of p.ingredientes) {
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
    }

    return resultado;
  },
};
