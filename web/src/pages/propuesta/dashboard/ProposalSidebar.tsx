import {
  Bike,
  Boxes,
  Building2,
  CalendarDays,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  FileBarChart,
  Grid2x2,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  Plus,
  QrCode,
  Settings,
  Share2,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import { restaurant } from './data';
import { useState } from 'react';

type NavItem = { label: string; icon: typeof ChefHat; href?: string; badge?: number; alert?: boolean };

// Mismo orden y nombres que visibleNavLinks() para un Dueño con Administración, Inventario
// y Sucursales. La propuesta solo añade contadores en vivo junto a cada módulo.
const NAV: NavItem[] = [
  { label: 'Resumen', icon: LayoutDashboard, href: '/propuesta/dashboard' },
  { label: 'Pedidos', icon: ClipboardList, badge: 6, href: '/propuesta/pedidos' },
  { label: 'Cocina', icon: ChefHat, badge: 2 },
  { label: 'Mesas', icon: Grid2x2 },
  { label: 'Repartos', icon: Bike, badge: 2 },
  { label: 'Productos', icon: UtensilsCrossed },
  { label: 'Mesas / QR', icon: QrCode },
  { label: 'Reservas', icon: CalendarDays, badge: 2, alert: true },
  { label: 'Administración', icon: CircleDollarSign },
  { label: 'Menú interno', icon: UtensilsCrossed },
  { label: 'Inventario', icon: Boxes, badge: 3, alert: true },
  { label: 'Sucursales', icon: Building2 },
  { label: 'Asistente', icon: Sparkles },
  { label: 'Ajustes', icon: Settings, href: '/propuesta/ajustes' },
];

export function ProposalSidebar({ active = 'Resumen' }: { active?: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-collapsed={collapsed ? 'true' : 'false'}
      className={`proposal-sidebar hidden overflow-y-auto border-r border-border bg-card px-4 py-6 lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:flex-col ${collapsed ? 'is-collapsed lg:w-[76px] lg:px-3' : 'lg:w-[264px]'}`}
    >
      <div className="mb-7 flex min-w-0 shrink-0 items-center gap-2">
        <a href="/propuesta/dashboard" className="flex min-w-0 flex-1 items-center gap-3 px-2">
          <img src="/logo/icono.png" alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          <span className="sidebar-label truncate text-[17px] font-semibold tracking-tight text-brand-950">{restaurant.name}</span>
        </a>
        <button
          type="button"
          aria-label={collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral'}
          onClick={() => setCollapsed((value) => !value)}
          className="sidebar-collapse-button flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-brand-950"
        >
          <PanelLeftClose className="h-[18px] w-[18px]" />
        </button>
      </div>

      <a
        href="/propuesta/pedido"
        className="mb-4 flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-[14.5px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(5,165,245,0.45)] transition-[filter,transform] hover:brightness-95 active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} /> Crear pedido
        <kbd className="sidebar-label ml-1 rounded-md bg-white/25 px-1.5 py-0.5 font-sans text-[10px] font-medium">N</kbd>
      </a>

      <nav aria-label="Menú del restaurante" className="flex flex-1 flex-col">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const isActive = item.label === active;
            return (
              <li key={item.label}>
                <a
                  href={item.href ?? '#'}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3.5 text-[14.5px] font-medium transition-colors ${
                    isActive ? 'bg-[#eaf6fd] text-brand-500' : 'text-[#5d685e] hover:bg-[#f3f9fd] hover:text-brand-950'
                  }`}
                >
                  <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? '' : 'opacity-80'}`} />
                  <span className="sidebar-label flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums ${
                        item.alert ? 'bg-red-500 text-white' : 'bg-accent text-brand-500'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        className="mt-4 flex min-h-10 shrink-0 items-center gap-3 rounded-xl border border-border px-3.5 text-[14px] font-medium text-brand-950 transition-colors hover:bg-[#f3f9fd]"
      >
        <FileBarChart className="h-[18px] w-[18px] shrink-0 text-brand-500" /><span className="sidebar-label">Reportes con IA</span>
      </button>

      <div className="mt-3 flex shrink-0 items-center gap-2">
        <button type="button" aria-label="Compartir enlace del menú" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-brand-950">
          <Share2 className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Abrir menú" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-brand-950">
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex min-w-0 shrink-0 items-center gap-2.5 rounded-2xl bg-muted px-3 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
          {restaurant.user.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-brand-950">{restaurant.user}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="sidebar-label">{restaurant.role} · {restaurant.plan}</span>
          </p>
        </div>
      </div>
    </aside>
  );
}
