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

const modifierBaseSchema = z.object({
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
  // Vínculo con inventario: insumo O preparación que consume este modificador al venderse
  // (nunca ambos). `inventoryQuantity` llega YA convertida a la unidad base del insumo/
  // preparación (kg/lt/unidad) — el formulario permite cargarla en gr/ml y la convierte.
  // Sin insumo/preparación, o sin cantidad = sin vínculo (no descuenta nada).
  inventoryItemId: z.string().min(1).nullable().optional(),
  preparationId: z.string().min(1).nullable().optional(),
  inventoryQuantity: z.coerce.number().positive().nullable().optional(),
});

const noDoubleLink = (v: { inventoryItemId?: string | null; preparationId?: string | null }) =>
  !(v.inventoryItemId && v.preparationId);
const NO_DOUBLE_LINK_MESSAGE = { message: 'Elige un insumo o una preparación, no ambos.' };

export const createModifierSchema = modifierBaseSchema.refine(noDoubleLink, NO_DOUBLE_LINK_MESSAGE);

export const updateModifierSchema = modifierBaseSchema.partial().refine(noDoubleLink, NO_DOUBLE_LINK_MESSAGE);

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
