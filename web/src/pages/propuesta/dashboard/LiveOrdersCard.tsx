import { Bike, MessageCircle, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { liveOrders, statusMeta, type OrderChannel, type OrderStatus } from './data';
import { formatUsd } from './format';
import { Panel } from './Panel';

const channelIcon: Record<OrderChannel, typeof Bike> = {
  table: UtensilsCrossed,
  delivery: Bike,
  whatsapp: MessageCircle,
  takeaway: ShoppingBag,
};

const statuses: OrderStatus[] = ['new', 'kitchen', 'ready', 'onTheWay'];

// Semáforo de tiempo: el número que más importa en hora pico es cuánto lleva esperando cada pedido.
function minutesTone(minutes: number) {
  if (minutes >= 20) return 'text-red-600';
  if (minutes >= 12) return 'text-amber-700';
  return 'text-brand-950/45';
}

export function LiveOrdersCard() {
  return (
    <Panel title="Pedidos en vivo" subtitle={`${liveOrders.length} abiertos ahora`} action="Comandas">
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {statuses.map((s) => {
          const count = liveOrders.filter((o) => o.status === s).length;
          return (
            <div key={s} className="rounded-xl bg-brand-950/[0.03] px-2 py-2 text-center">
              <p className="text-lg font-bold leading-none tabular-nums text-brand-950">{count}</p>
              <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-medium text-brand-950/55">
                <span className={`h-1.5 w-1.5 rounded-full ${statusMeta[s].dot}`} />
                {statusMeta[s].label}
              </p>
            </div>
          );
        })}
      </div>

      <ul className="-mx-2 flex flex-col">
        {liveOrders.map((o) => {
          const Icon = channelIcon[o.channel];
          return (
            <li key={o.id}>
              <a href="#" className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-brand-950/[0.03]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-950/[0.05] text-brand-950/65">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-brand-950">
                    <span className="tabular-nums">{o.code}</span>
                    <span className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${statusMeta[o.status].chip}`}>
                      {statusMeta[o.status].label.replace(/s$/, '')}
                    </span>
                  </p>
                  <p className="truncate text-xs text-brand-950/50">
                    {o.where} · {o.items} {o.items === 1 ? 'ítem' : 'ítems'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-brand-950">{formatUsd(o.totalUsd)}</p>
                  <p className={`text-xs font-medium tabular-nums ${minutesTone(o.minutes)}`}>{o.minutes} min</p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
