import { z } from 'zod';

const UNIDAD = z.enum(['kg', 'lt', 'unidad']);

/** POST /master/catalog-ai/:restaurantId/analizar — campos que acompañan a la foto. */
export const analizarPlatoSchema = z.object({
  nombre: z.string().max(120).optional(),
  // Llega como texto porque el cuerpo es multipart, no JSON.
  mejorarFoto: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v === true || v === 'true' || v === '1'),
});

export const confirmarCatalogoSchema = z.object({
  productos: z
    .array(
      z.object({
        nombre: z.string().min(1, 'Cada producto necesita un nombre.').max(120),
        categoria: z.string().min(1).max(120),
        precio: z.coerce.number().nonnegative(),
        descripcion: z.string().max(500).optional(),
        photoUrl: z.string().max(300).optional(),
        ingredientes: z
          .array(
            z.object({
              nombre: z.string().min(1).max(120),
              unidad: UNIDAD,
              cantidad: z.coerce.number().positive(),
            }),
          )
          .default([]),
        // Bases que se preparan aparte (salsas, masas, caldos). `rendimiento` es lo que da una
        // tanda y `insumos` son los de ESA tanda; `cantidad` es lo que consume este plato.
        preparaciones: z
          .array(
            z.object({
              nombre: z.string().min(1).max(120),
              unidad: UNIDAD,
              rendimiento: z.coerce.number().positive(),
              cantidad: z.coerce.number().positive(),
              insumos: z
                .array(
                  z.object({
                    nombre: z.string().min(1).max(120),
                    unidad: UNIDAD,
                    cantidad: z.coerce.number().positive(),
                  }),
                )
                .min(1, 'Una preparación sin ingredientes no se puede costear.'),
            }),
          )
          .max(20)
          .default([]),
        // Tamaños del plato (Pequeña/Mediana/Grande). Si van, el producto pasa a "por variantes"
        // y `precio` queda solo como referencia.
        tamanos: z
          .array(z.object({ nombre: z.string().min(1).max(60), precio: z.coerce.number().nonnegative() }))
          .max(12)
          .default([]),
        // Grupos de modificadores del plato. `tamanos` dentro de cada grupo son NOMBRES de los
        // tamaños de arriba (no ids: todavía no existen cuando el operador arma esto);
        // vacío = el grupo va en todos.
        modificadores: z
          .array(
            z.object({
              nombre: z.string().min(1).max(120),
              obligatorio: z.boolean().default(false),
              permiteVarias: z.boolean().default(false),
              tamanos: z.array(z.string().min(1).max(60)).default([]),
              opciones: z
                .array(z.object({ nombre: z.string().min(1).max(120), precio: z.coerce.number().default(0) }))
                .max(50)
                .default([]),
            }),
          )
          .max(20)
          .default([]),
      }),
    )
    .min(1, 'No hay productos que cargar.')
    // Tope de cordura: es una carga manual revisada plato por plato, no una importación masiva.
    .max(200, 'Carga como máximo 200 productos a la vez.'),
});

/** POST /master/catalog-ai/:restaurantId/fichas — los platos a los que armarles la ficha. */
export const fichasSchema = z.object({
  platos: z
    .array(
      z.object({
        nombre: z.string().min(1, 'Cada plato necesita un nombre.').max(120),
        descripcion: z.string().max(300).optional(),
      }),
    )
    .min(1, 'Manda al menos un plato.')
    // Techo alto pero finito: son varias llamadas a la IA en cadena y cada una cuesta.
    .max(200, 'Arma las fichas de como máximo 200 platos a la vez.'),
});

/* --------------------------------------------------------------------------------------
 * Carga por partes en un cliente ya montado
 * ------------------------------------------------------------------------------------ */

/** POST /master/catalog-ai/:restaurantId/confirmar-insumos */
export const confirmarInsumosSchema = z.object({
  insumos: z
    .array(
      z.object({
        nombre: z.string().min(1, 'Cada insumo necesita un nombre.').max(120),
        unidad: UNIDAD,
        cantidad: z.coerce.number().nonnegative().default(0),
        // Costo de UNA unidad (1 kg / 1 lt / 1 unidad). Cero = no se toca el que ya tenía.
        costoUnitario: z.coerce.number().nonnegative().default(0),
        minimo: z.coerce.number().nonnegative().default(0),
        categoria: z.string().max(120).optional(),
        // Insumo existente con el que se vincula (el que propuso el cruce, o el que el
        // operador eligió a mano). Vacío = se crea uno nuevo.
        inventoryItemId: z.string().min(1).optional(),
      }),
    )
    .min(1, 'No hay insumos que cargar.')
    .max(500, 'Carga como máximo 500 insumos a la vez.'),
});

/** POST /master/catalog-ai/:restaurantId/fichas-catalogo — platos que el cliente YA tiene. */
export const fichasCatalogoSchema = z.object({
  productIds: z
    .array(z.string().min(1))
    .min(1, 'Elige al menos un plato.')
    .max(200, 'Arma las fichas de como máximo 200 platos a la vez.'),
});

const lineaInsumo = z.object({
  nombre: z.string().min(1).max(120),
  unidad: UNIDAD,
  cantidad: z.coerce.number().positive(),
});

/** POST /master/catalog-ai/:restaurantId/confirmar-recetas — solo recetas, sin tocar el plato. */
export const confirmarRecetasSchema = z.object({
  recetas: z
    .array(
      z.object({
        productId: z.string().min(1).optional(),
        nombre: z.string().min(1, 'Cada receta necesita el nombre del plato.').max(120),
        insumos: z.array(lineaInsumo).default([]),
        preparaciones: z
          .array(
            z.object({
              nombre: z.string().min(1).max(120),
              unidad: UNIDAD,
              rendimiento: z.coerce.number().positive(),
              cantidad: z.coerce.number().positive(),
              insumos: z.array(lineaInsumo).min(1, 'Una preparación sin ingredientes no se puede costear.'),
            }),
          )
          .max(20)
          .default([]),
      }),
    )
    .min(1, 'No hay recetas que cargar.')
    .max(200, 'Carga como máximo 200 recetas a la vez.'),
  // Un plato que ya tiene receta se salta salvo que se pida explícitamente reemplazarla: una
  // carga masiva no puede borrar en silencio el trabajo que el cliente ya hizo.
  reemplazarExistentes: z.boolean().default(false),
});
