/**
 * Clave de comparación de un nombre: sin acentos, sin mayúsculas, sin espacios de más.
 *
 * Es lo que decide si "Queso Cheddar", "queso cheddar" y "Queso  Cheddar" son el mismo insumo
 * al cargar un catálogo. Vive acá y no dentro de un importador porque ya la necesitan dos
 * caminos distintos de carga (el Excel de catálogo y la carga asistida del panel maestro), y
 * dos copias que se separen significan que uno de los dos empieza a duplicar insumos.
 */
export function claveNombre(texto: string): string {
  return texto
    .normalize('NFD')
    // Marcas diacríticas combinantes (U+0300–U+036F): la "´" que queda suelta tras NFD.
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
