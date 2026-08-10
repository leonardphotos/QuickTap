import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Categoría colapsable de una pantalla de Ajustes: título + ícono, con su
 * contenido colapsado/expandido según `open` — la propia cabecera también es
 * clickeable, además de cualquier menú de salto rápido que apunte a su `id`
 * (ver `ajustes-${id}`, usado por `scrollIntoView`). Compartido entre Ajustes
 * de restaurante, Club y Locales: mismo patrón de "agrupar y colapsar" en los
 * tres verticales, para que cambiar de uno a otro no se sienta distinto.
 *
 * La animación de "desplegado fluido" usa el truco de CSS grid-template-rows
 * 0fr → 1fr (en vez de max-height/JS), que anima limpio sin medir el alto del
 * contenido.
 */
export function SettingsCategory({
  id,
  title,
  icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="mb-3 last:mb-0" id={`ajustes-${id}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className={`w-full flex items-center gap-2.5 text-left rounded-2xl px-4 py-3.5 transition-colors ${
          open ? 'bg-brand-500/[0.06]' : 'hover:bg-brand-950/[0.03]'
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
          {icon}
        </span>
        <span className="text-base font-semibold text-brand-950 flex-1">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-brand-950/40 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out-strong ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`grid grid-cols-1 lg:grid-cols-2 gap-5 items-start px-1 pt-4 pb-2 transition-opacity duration-300 ${
              open ? 'opacity-100 delay-100' : 'opacity-0'
            }`}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Tarjeta que ocupa las dos columnas de la grilla (mapas, selector de colores, tablas anchas). */
export function FullWidth({ children }: { children: ReactNode }) {
  return <div className="lg:col-span-2">{children}</div>;
}

/** Estado + helpers de la categoría abierta. Vacío = todas cerradas al entrar
 * a Ajustes; el staff abre la que necesite en vez de que decida por ellos. */
export function scrollToSettingsCategory(id: string): void {
  requestAnimationFrame(() => {
    document.getElementById(`ajustes-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
