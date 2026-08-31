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
