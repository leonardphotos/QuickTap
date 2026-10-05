import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { groupOrderItems } from '@/utils/groupOrderItems';
import { formatBase, formatModifierLabel } from '@/utils/format';
import type { LiveOrderItem } from './LiveOrdersPanel.shared';

export function GroupedOrderItems({ items, symbol, renderItem }: {
  items: LiveOrderItem[]; symbol: string; renderItem: (item: LiveOrderItem) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const reducedMotion = useReducedMotion();
  const transition = { duration: reducedMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] as const };
  return <ul className="space-y-1 mt-2 divide-y divide-brand-950/[0.06]">
    <AnimatePresence initial={false}>
      {groupOrderItems(items).map(group => {
        const item = group.items[0];
        const open = expanded.has(group.key);
        return <motion.li key={group.key} layout={reducedMotion ? false : 'position'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition} className="py-2">
          {group.items.length === 1 ? <ul>{renderItem(item)}</ul> : <>
            <button type="button" aria-expanded={open} onClick={() => setExpanded(previous => {
              const next = new Set(previous); if (open) next.delete(group.key); else next.add(group.key); return next;
            })} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-brand-950/[0.03] focus-visible:outline-2 focus-visible:outline-brand-500">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-brand-950">{item.productName}{item.variantName ? ` (${item.variantName})` : ''}</span>
                {item.modifiers.length > 0 && <span className="block text-xs text-brand-950/60">{item.modifiers.map(formatModifierLabel).join(', ')}</span>}
                {item.note && <span className="block text-xs text-brand-950/60">{item.note}</span>}
                <span className="block text-xs text-brand-950/50">{formatBase(item.unitPrice, symbol)} c/u · {item.deliveredAt ? '✓ Entregado' : 'Sin entregar'}</span>
                <span className="block text-[11px] text-brand-500">{open ? 'Ocultar detalle' : 'Toca para editar o ver detalle'}</span>
              </span>
              <span className="rounded-lg bg-brand-950/[0.05] px-2.5 py-1 text-sm font-bold tabular-nums">× {group.quantity}</span>
              <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-brand-950/50 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {open && <motion.div key="lines" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition} className="overflow-hidden">
                <p className="px-2 py-2 text-brand-950/50 text-xs">Selecciona la línea que quieres modificar.</p>
                <ul className="ml-2 border-l-2 border-brand-950/10 pl-3 divide-y divide-brand-950/[0.06]">{group.items.map(renderItem)}</ul>
              </motion.div>}
            </AnimatePresence>
          </>}
        </motion.li>;
      })}
    </AnimatePresence>
  </ul>;
}
