import type { ReactNode } from 'react';

export interface SettingsCategoryDef {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
}

export function CategoryNav({
  categories,
  active,
  onChange,
}: {
  categories: SettingsCategoryDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <>
      {/* Pastillas con scroll horizontal en celular — mismo patrón que la pantalla real. */}
      <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-5 px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-current={active === c.id ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
              active === c.id
                ? 'border-brand-950 bg-brand-950 text-white'
                : 'border-brand-950/10 bg-white text-brand-950/65 hover:bg-brand-950/[0.03]'
            }`}
          >
            {c.icon}
            {c.title}
          </button>
        ))}
      </nav>

      {/* Riel lateral fijo en escritorio. */}
      <aside className="hidden shrink-0 lg:block lg:w-64 lg:sticky lg:top-8">
        <nav className="flex flex-col gap-0.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              aria-current={active === c.id ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                active === c.id ? 'bg-brand-950 text-white' : 'text-brand-950/70 hover:bg-brand-950/[0.04]'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  active === c.id ? 'bg-white/15 text-white' : 'bg-brand-500/10 text-brand-500'
                }`}
              >
                {c.icon}
              </span>
              <span className={active === c.id ? 'font-medium' : 'font-light'}>{c.title}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
