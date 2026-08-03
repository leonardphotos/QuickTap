import { z } from 'zod';

export const createModifierCategorySchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(150),
  isRequired: z.boolean().optional().default(false),
  allowMultiple: z.boolean().optional().default(false),
  // Límite de selecciones totales (permite repetir la misma opción). null/omitido = sin límite.
  maxSelections: z.coerce.number().int().positive().nullable().optional(),
  // Mínimo de selecciones totales. null/omitido = usa el default (1 si isRequired, 0 si no).
  minSelections: z.coerce.number().int().min(0).nullable().optional(),
  priority: z.coerce.number().int().optional().default(0),
});

export const updateModifierCategorySchema = createModifierCategorySchema.partial();

export const reorderModifiersSchema = z.object({
  modifierIds: z.array(z.string().min(1)).min(1),
});

export const updateProductLinkSchema = z.object({
  maxSelectionsOverride: z.coerce.number().int().positive().nullable().optional(),
});

export const createModifierSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio.').max(120),
  priceBase: z.coerce.number().nonnegative().optional().default(0),
  costBase: z.coerce.number().nonnegative().optional(),
  discountBase: z.coerce.number().nonnegative().optional(),
  isAvailable: z.boolean().optional().default(true),
  // Tope de repetición de este modificador puntual, independiente del límite de la categoría.
  maxQuantity: z.coerce.number().int().positive().nullable().optional(),
  // Código interno opcional (back-office). Nunca se expone en el menú público.
  sku: z.string().max(60).nullable().optional(),
  priority: z.coerce.number().int().optional().default(0),
  // Vínculo con inventario: insumo que consume este modificador al venderse.
  // `inventoryQuantity` llega YA convertida a la unidad base del insumo
  // (kg/lt/unidad) — el formulario permite cargarla en gr/ml y la convierte.
  // null en cualquiera de las dos = sin vínculo (no descuenta nada).
  inventoryItemId: z.string().min(1).nullable().optional(),
  inventoryQuantity: z.coerce.number().positive().nullable().optional(),
});

export const updateModifierSchema = createModifierSchema.partial();

export const associateProductSchema = z.object({
  productId: z.string().min(1),
});

// Precio propio de un modificador para una variante puntual (ej. "Extra queso" en Pizza
// Grande vs. Pequeña). Un PUT por variante = "guardar/reemplazar este override"; DELETE = "volver
// a usar el priceBase de siempre para esa variante".
export const setModifierVariantPriceSchema = z.object({
  priceBase: z.coerce.number().nonnegative(),
});

export type CreateModifierCategoryInput = z.infer<typeof createModifierCategorySchema>;
export type UpdateModifierCategoryInput = z.infer<typeof updateModifierCategorySchema>;
export type CreateModifierInput = z.infer<typeof createModifierSchema>;
export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;
export type AssociateProductInput = z.infer<typeof associateProductSchema>;
export type UpdateProductLinkInput = z.infer<typeof updateProductLinkSchema>;
export type ReorderModifiersInput = z.infer<typeof reorderModifiersSchema>;
export type SetModifierVariantPriceInput = z.infer<typeof setModifierVariantPriceSchema>;
