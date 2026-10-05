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
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-border bg-card text-muted-foreground hover:bg-[#f3f9fd]'
            }`}
          >
            {c.icon}
            {c.title}
          </button>
        ))}
      </nav>

      {/* Riel lateral fijo en escritorio. */}
      <aside className="hidden shrink-0 rounded-3xl border border-border bg-card p-3 lg:block lg:w-64 lg:sticky lg:top-8">
        <nav className="flex flex-col gap-0.5">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(c.id)}
              aria-current={active === c.id ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                active === c.id ? 'bg-[#eaf6fd] text-brand-500' : 'text-[#5d685e] hover:bg-[#f3f9fd] hover:text-brand-950'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  active === c.id ? 'bg-white text-brand-500' : 'bg-accent text-brand-500'
                }`}
              >
                {c.icon}
              </span>
              <span className="font-medium">{c.title}</span>
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
