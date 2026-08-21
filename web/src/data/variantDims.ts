/**
 * Qué significan las dos variantes de un producto (dim1/dim2) según su CATEGORÍA, no solo según
 * el rubro del local. Cada rubro trae un par de dimensiones por defecto en shopRubros.ts (ej.
 * joyería = Material × Talla), pero un mismo local vende cosas que no encajan ahí: una joyería
 * que también vende carteras no las mide en "Material" — las mide en Talla/Color, como cualquier
 * tienda de accesorios. Esta tabla resuelve las dimensiones correctas por palabras clave de la
 * categoría, sin importar de qué rubro venga el local, y si nada matchea cae al par por defecto
 * del rubro.
 */

export interface VariantDims {
  dim1: string;
  dim1Example: string;
  dim2: string | null;
  dim2Example?: string;
}

interface DimRule {
  keywords: string[];
  dims: VariantDims;
}

/** Sin tildes, minúsculas — para que "Cartera"/"carteras"/"Bolsos" matcheen igual. */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// El orden importa: se usa la primera regla cuyo keyword aparezca en la categoría. Van de lo más
// específico a lo más genérico para que, por ejemplo, "Bolsos" no caiga en una regla de ropa.
const DIM_RULES: DimRule[] = [
  {
    keywords: ['bolso', 'cartera', 'maletin', 'mochila', 'morral', 'bandolera'],
    dims: { dim1: 'Color', dim1Example: 'Negro', dim2: 'Tamaño', dim2Example: 'Mediano' },
  },
  {
    keywords: ['calzado', 'zapato', 'zapatilla', 'sandalia', 'bota', 'tenis', 'tacon', 'chancla'],
    dims: { dim1: 'Talla', dim1Example: '40', dim2: 'Color', dim2Example: 'Negro' },
  },
  {
    keywords: [
      'ropa', 'camisa', 'camiseta', 'franela', 'pantalon', 'vestido', 'falda', 'chaqueta',
      'blusa', 'short', 'sueter', 'abrigo', 'uniforme', 'pijama', 'traje de bano',
    ],
    dims: { dim1: 'Talla', dim1Example: 'M', dim2: 'Color', dim2Example: 'Negro' },
  },
  {
    keywords: ['anillo', 'arete', 'cadena', 'dije', 'pulsera', 'collar', 'gargantilla', 'reloj', 'joya'],
    dims: { dim1: 'Material', dim1Example: 'Oro 18k', dim2: 'Talla', dim2Example: '7' },
  },
  {
    keywords: ['perfume', 'fragancia', 'colonia'],
    dims: { dim1: 'Presentación', dim1Example: '50ml', dim2: 'Fragancia', dim2Example: 'Floral' },
  },
  {
    keywords: ['nevera', 'lavadora', 'aire acondicionado', 'microondas', 'licuadora', 'freidora', 'electrodomestico'],
    dims: { dim1: 'Capacidad', dim1Example: '18 pies', dim2: 'Color', dim2Example: 'Blanco' },
  },
  {
    keywords: ['telefono', 'celular', 'tablet', 'smartphone', 'smartwatch'],
    dims: { dim1: 'Modelo', dim1Example: '128GB', dim2: 'Color', dim2Example: 'Negro' },
  },
  {
    keywords: ['mueble', 'colchon', 'sofa', 'cama'],
    dims: { dim1: 'Tamaño', dim1Example: 'Queen', dim2: 'Color', dim2Example: 'Gris' },
  },
  {
    keywords: ['cortina', 'sabana', 'textil', 'decoracion', 'mantel'],
    dims: { dim1: 'Tamaño', dim1Example: 'Matrimonial', dim2: 'Color', dim2Example: 'Beige' },
  },
  {
    keywords: ['libro', 'cuaderno', 'escolar', 'escritura', 'boligrafo', 'marcador', 'oficina'],
    dims: { dim1: 'Presentación', dim1Example: '100 hojas', dim2: null },
  },
  {
    keywords: ['carne', 'pescado', 'pollo', 'cerdo', 'carniceria', 'pescaderia'],
    dims: { dim1: 'Corte', dim1Example: 'Molida', dim2: 'Presentación', dim2Example: '1kg' },
  },
  {
    keywords: ['fruta', 'verdura', 'vegetal', 'hortaliza'],
    dims: { dim1: 'Presentación', dim1Example: 'Kg', dim2: null },
  },
  {
    keywords: ['mascota', 'perro', 'gato', 'veterinari'],
    dims: { dim1: 'Presentación', dim1Example: '10kg', dim2: null },
  },
  {
    // Una manguera se distingue por la presión que aguanta, no por su medida: el diámetro ya va
    // en el nombre del producto y lo que cambia entre variantes es el PSI (y con él el precio).
    keywords: ['manguera'],
    dims: { dim1: 'Presión', dim1Example: '90 PSI', dim2: null },
  },
  {
    keywords: ['tornillo', 'tuerca', 'tuberia', 'pintura', 'ferreteria', 'plomeria', 'electricidad', 'griferia'],
    dims: { dim1: 'Medida', dim1Example: '1/2 pulgada', dim2: null },
  },
  {
    keywords: ['lente', 'gafas', 'optica'],
    dims: { dim1: 'Modelo', dim1Example: 'Aviador', dim2: 'Color', dim2Example: 'Negro' },
  },
  {
    keywords: ['deportivo', 'balon', 'pelota', 'gimnasio'],
    dims: { dim1: 'Talla', dim1Example: 'M', dim2: 'Color', dim2Example: 'Azul' },
  },
  {
    keywords: ['bebida', 'snack', 'abarrote', 'enlatado'],
    dims: { dim1: 'Presentación', dim1Example: '1kg', dim2: 'Marca', dim2Example: 'Mary' },
  },
];

/**
 * Dimensiones efectivas para un producto: las de la categoría si matchea alguna regla, si no las
 * del rubro. `category` puede venir vacía (producto recién creado sin categoría todavía) — en ese
 * caso cae directo al default del rubro.
 */
export function resolveVariantDims(
  rubro: { dim1: string; dim1Example: string; dim2: string | null; dim2Example?: string },
  category: string,
): VariantDims {
  if (category.trim()) {
    const norm = normalize(category);
    for (const rule of DIM_RULES) {
      if (rule.keywords.some((k) => norm.includes(k))) return rule.dims;
    }
  }
  return { dim1: rubro.dim1, dim1Example: rubro.dim1Example, dim2: rubro.dim2, dim2Example: rubro.dim2Example };
}
