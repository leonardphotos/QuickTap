export type ToolEvent = 'calculation_completed' | 'ingredient_added' | 'result_shared' | 'quicktap_cta' | 'trial_start' | 'diagnostic_cta';
/** Sin nombres, precios ni receta; entrega de mejor esfuerzo, sin bloquear la herramienta. */
export function trackToolEvent(event: ToolEvent) {
  const body = JSON.stringify({ tool: 'recipe-cost', event });
  try {
    if (navigator.sendBeacon?.('/api/v1/public/tools/events', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/v1/public/tools/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch { /* La medición nunca bloquea los cálculos. */ }
}
