import type { LucideIcon } from 'lucide-react';

export interface AdminSectionNavItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** Cantidad a mostrar en un globo ámbar (ej. cuentas por pagar pendientes). */
  badge?: number;
}

interface AdminSectionNavProps {
  items: AdminSectionNavItem[];
  activeId: string;
  onChange: (id: string) => void;
}

/**
 * El "menú de administración" propio de cada vertical: en escritorio es un sidebar vertical
 * real (más claro/liviano que el AdminSidebar oscuro de la app, para leerse como un nivel
 * anidado y no competirle); en móvil/tablet vertical cae a la cápsula de píldoras con scroll
 * horizontal seguro (mismo patrón ya usado en ClubAdminPage — el wrapper de overflow va
 * APARTE de la píldora, si no el overflow-x-auto nunca se activa sobre un contenedor de
 * ancho automático y termina desbordando la página de lado).
 */
export function AdminSectionNav({ items, activeId, onChange }: AdminSectionNavProps) {
  return (
    <>
      <nav className="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 gap-1">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active ? 'bg-brand-500/10 text-brand-600' : 'text-brand-950/60 hover:bg-brand-950/[0.05] hover:text-brand-950'
              }`}
            >
              {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
              <span className="truncate flex-1 text-left">{item.label}</span>
              {!!item.badge && (
                <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="lg:hidden -mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                  active ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
                }`}
              >
                {item.label}
                {!!item.badge && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
