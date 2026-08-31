import type { ReactNode } from 'react';

/** Pastilla de filtro reutilizable (Inventario, recetas). */
export function FilterPill({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: 'amber';
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? tone === 'amber'
            ? 'bg-amber-500 text-white'
            : 'bg-brand-500 text-white'
          : tone === 'amber'
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
      }`}
    >
      {children}
    </button>
  );
}

