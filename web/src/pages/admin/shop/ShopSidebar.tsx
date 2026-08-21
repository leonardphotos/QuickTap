import { Lock, Menu, PanelLeftClose, Plus, Share2 } from 'lucide-react';
import { ROLE_LABELS } from '@/utils/roles';
import type { ShopScreen } from './ShopLayout';

/**
 * Menú lateral del panel de locales comerciales.
 *
 * Espeja al de restaurantes (AdminSidebar) para que un dueño con los dos tipos de negocio no
 * tenga que aprender dos interfaces. La diferencia de fondo: restaurantes navega por rutas y
 * acá se cambia de pantalla por estado, así que en vez de <Link> son botones.
 *
 * Solo se monta en pantallas anchas; en celular y tablet vertical sigue mandando el dock
 * flotante de abajo, que es lo que se alcanza con el pulgar.
 */

export interface ShopSidebarTab {
  id: ShopScreen;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  locked?: boolean;
}

interface Props {
  tabs: ShopSidebarTab[];
  screen: ShopScreen;
  onSelect: (s: ShopScreen) => void;
  businessName: string;
  logoUrl?: string | null;
  planLabel: string | null;
  userName: string;
  userRole: string;
  onHide: () => void;
  hidden: boolean;
  onShare: () => void;
  onOpenMenu: () => void;
  /** Abre el pedido nuevo. null cuando el rol no puede vender. */
  onCreateOrder: (() => void) | null;
}

export function ShopSidebar({
  tabs,
  screen,
  onSelect,
  businessName,
  logoUrl,
  planLabel,
  userName,
  userRole,
  onHide,
  hidden,
  onShare,
  onOpenMenu,
  onCreateOrder,
}: Props) {
  return (
    <aside
      // Siempre montada; oculta se desliza fuera con transform para poder animarla, e `inert`
      // la saca del tab order mientras no se ve.
      inert={hidden || undefined}
      className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-[264px] overflow-y-auto bg-gradient-to-b from-brand-950 to-brand-900 px-4 py-6 transition-transform duration-300 ease-out motion-reduce:transition-none ${
        hidden ? '-translate-x-full' : 'translate-x-0'
      }`}
    >
      <div className="mb-7 flex min-w-0 shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect('admin')}
          className="flex min-w-0 flex-1 items-center gap-3 px-2 text-left"
        >
          <img src={logoUrl || '/logo/icono.png'} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          <span className="truncate text-[17px] font-semibold tracking-tight text-white">{businessName}</span>
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-label="Ocultar menú lateral"
          title="Ocultar menú lateral"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          <PanelLeftClose className="h-[18px] w-[18px]" />
        </button>
      </div>

      {onCreateOrder && (
        <button
          type="button"
          onClick={onCreateOrder}
          className="mb-4 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-[14.5px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)] transition-colors hover:bg-emerald-600"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} /> Crear pedido
        </button>
      )}

      <nav className="flex flex-1 flex-col gap-0.5">
        {tabs.map((t) => {
          const active = screen === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-medium transition-colors ${
                active ? 'bg-brand-500/20 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <t.icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-sky-300' : 'opacity-80'}`} />
              <span className={`truncate ${t.locked ? 'opacity-60' : ''}`}>{t.label}</span>
              {t.locked && <Lock className="ml-auto h-3 w-3 shrink-0 text-white/35" />}
            </button>
          );
        })}
      </nav>

      <div className="mt-2 flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onShare}
          aria-label="Compartir enlace de la tienda"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-white/[0.12]"
        >
          <Share2 className="h-4 w-4 text-white/70" />
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] transition-colors hover:bg-white/[0.12]"
        >
          <Menu className="h-4 w-4 text-white/70" />
        </button>
      </div>

      <div className="mt-3 flex min-w-0 shrink-0 items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{userName}</p>
          <p className="truncate text-xs text-white/50">
            {ROLE_LABELS[userRole as keyof typeof ROLE_LABELS] ?? userRole}
            {planLabel ? ` · ${planLabel}` : ''}
          </p>
        </div>
      </div>
    </aside>
  );
}
