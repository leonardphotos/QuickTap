import { ArrowUpRight, Bike, Boxes, ChefHat, CircleDollarSign, Plus, Receipt, Settings, ShoppingCart, Sparkles, UtensilsCrossed } from 'lucide-react';
import { kpis } from './data';
import { formatUsd } from './format';

// Igual que dashboardQuickActionLinks(): toma los módulos del menú (sin Resumen) más Gastos
// y Compras. La propuesta los recorta a los más usados y deja "Ver todos" para el resto.
const ACTIONS = [
  { label: 'Abrir cuenta de mesa', icon: Plus },
  { label: 'Cocina', icon: ChefHat },
  { label: 'Repartos', icon: Bike },
  { label: 'Productos', icon: UtensilsCrossed },
  { label: 'Inventario', icon: Boxes },
  { label: 'Administración', icon: CircleDollarSign },
  { label: 'Gastos', icon: Receipt },
  { label: 'Compras', icon: ShoppingCart },
  { label: 'Ajustes', icon: Settings },
];

export function QuickActionsCard() {
  const tips = kpis.find((k) => k.id === 'tips')!;
  return (
    <section className="min-w-0 rounded-3xl border border-border bg-card p-6 shadow-[0_8px_30px_#20272004]">
      <h2 className="text-[17px] font-semibold tracking-tight">Acciones rápidas</h2>
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-accent p-[18px]">
        <Sparkles className="h-[22px] w-[22px] text-brand-500" aria-hidden="true" />
        <span className="text-[13px]">Propinas de hoy</span>
        <span className="ml-auto text-xs text-muted-foreground">{tips.hint}</span>
        <strong className="w-full text-[25px] font-semibold tabular-nums">{formatUsd(tips.valueUsd)}</strong>
      </div>
      <ul className="mt-3">
        {ACTIONS.map(({ label, icon: Icon }) => (
          <li key={label}>
            <a href="#" className="flex min-h-[52px] items-center gap-3 rounded-xl border-b border-border px-1 text-[13px] transition-colors last:border-0 hover:bg-[#f3f9fd] hover:text-brand-500">
              <span className="rounded-xl bg-accent p-2 text-brand-500"><Icon className="h-5 w-5" /></span>
              {label}
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
