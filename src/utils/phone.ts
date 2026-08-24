/**
 * Comparación de teléfonos entre módulos.
 *
 * Un mismo número se guarda de formas distintas según quién lo cargó ("0424-4572008",
 * "4244572008", "+584244572008"), así que para saber si dos registros son de la misma persona
 * hay que normalizarlos antes de compararlos.
 *
 * Se comparan los ÚLTIMOS 10 dígitos, que ya incluyen el código de operadora (424, 414…). No
 * 7: esa cola es solo el número de abonado, y 0414-4572008 y 0424-4572008 son dos personas
 * distintas que la comparten — compararlas por 7 haría que una viera las compras de la otra.
 */
export function telefonoCanonico(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '').slice(-10);
}

/**
 * Prefijo barato para acotar la búsqueda en SQL antes de comparar en memoria.
 *
 * Prisma no puede normalizar dígitos dentro del WHERE, así que se filtra por los últimos 7
 * (tolerante al formato con que se haya guardado) y la coincidencia real se decide después
 * con telefonoCanonico. Nunca se usa solo para decidir identidad.
 */
export function colaParaBuscar(valor: string | null | undefined): string {
  return telefonoCanonico(valor).slice(-7);
}
