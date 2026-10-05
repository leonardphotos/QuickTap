

/** Estado + helpers de la categoría abierta. Vacío = todas cerradas al entrar
 * a Ajustes; el staff abre la que necesite en vez de que decida por ellos. */
export function scrollToSettingsCategory(id: string): void {
  requestAnimationFrame(() => {
    document.getElementById(`ajustes-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
