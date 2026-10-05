import {
  Bike,
  Boxes,
  Building2,
  CalendarDays,
  ChefHat,
  CircleDollarSign,
  ClipboardList,
  Grid2x2,
  LayoutDashboard,
  Plus,
  QrCode,
  Settings,
  UtensilsCrossed,
} from 'lucide-react';
import { restaurant } from './data';

type NavItem = { label: string; icon: typeof ChefHat; badge?: number; alert?: boolean; active?: boolean };

// Propuesta: agrupar las ~12 secciones en tres bloques con intención (operar el turno,
// mantener el catálogo, mirar el negocio) en vez de una sola lista larga.
const groups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Turno',
    items: [
      { label: 'Resumen', icon: LayoutDashboard, active: true },
      { label: 'Comandas', icon: ClipboardList, badge: 6 },
      { label: 'Cocina', icon: ChefHat, badge: 2 },
      { label: 'Órdenes de Mesa', icon: Grid2x2 },
      { label: 'Delivery', icon: Bike, badge: 2 },
      { label: 'Reservas', icon: CalendarDays, badge: 2, alert: true },
    ],
  },
  {
    title: 'Catálogo',
    items: [
      { label: 'Productos', icon: UtensilsCrossed },
      { label: 'Mesas / QR', icon: QrCode },
      { label: 'Inventario', icon: Boxes, badge: 3, alert: true },
    ],
  },
  {
    title: 'Negocio',
    items: [
      { label: 'Administración', icon: CircleDollarSign },
      { label: 'Sucursales', icon: Building2 },
    ],
  },
];

export function ProposalSidebar() {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[248px] lg:flex-col bg-gradient-to-b from-brand-950 to-brand-900 px-3.5 py-5">
      <div className="mb-6 flex items-center gap-3 px-2">
        <img src="/logo/icono.png" alt="" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-1" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-white">{restaurant.name}</p>
          <p className="truncate text-[11px] text-white/45">{restaurant.plan}</p>
        </div>
      </div>

      <button
        type="button"
        className="mb-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-6px_rgba(16,185,129,0.45)] transition-colors hover:bg-emerald-600"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Crear pedido
        <kbd className="ml-1 rounded-md bg-white/20 px-1.5 py-0.5 font-sans text-[10px] font-medium">N</kbd>
      </button>

      <nav aria-label="Secciones del panel" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/35">{group.title}</p>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.label}>
                  <a
                    href="#"
                    aria-current={item.active ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ${
                      item.active ? 'bg-brand-500/20 text-white' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <item.icon className={`h-[17px] w-[17px] shrink-0 ${item.active ? 'text-sky-300' : 'opacity-80'}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`min-w-5 rounded-full px-1.5 py-px text-center text-[10.5px] font-semibold tabular-nums ${
                          item.alert ? 'bg-red-500 text-white' : 'bg-white/10 text-white/80'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-3 py-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
          {restaurant.user.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{restaurant.user}</p>
          <p className="truncate text-[11px] text-white/45">{restaurant.role}</p>
        </div>
        <a href="#" aria-label="Ajustes" className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white">
          <Settings className="h-4 w-4" />
        </a>
      </div>
    </aside>
  );
}
