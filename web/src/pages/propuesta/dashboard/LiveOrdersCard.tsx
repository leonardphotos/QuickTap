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

// Semáforo de tiempo: en hora pico lo que más importa es cuánto lleva esperando cada pedido.
function minutesTone(minutes: number) {
  if (minutes >= 20) return 'text-red-600';
  if (minutes >= 12) return 'text-amber-700';
  return 'text-muted-foreground';
}

/** Propuesta: reemplaza la lista "Pedidos de hoy" por los pedidos abiertos, agrupados por estado. */
export function LiveOrdersCard() {
  return (
    <Panel title="Pedidos en vivo" subtitle={`${liveOrders.length} abiertos ahora · se actualiza solo`} action="Ver pedidos">
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {statuses.map((s) => {
          const count = liveOrders.filter((o) => o.status === s).length;
          return (
            <div key={s} className="rounded-2xl bg-muted px-3 py-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${statusMeta[s].dot}`} />
                {statusMeta[s].label}
              </p>
              <p className="mt-1 text-2xl font-semibold leading-none tabular-nums">{count}</p>
            </div>
          );
        })}
      </div>

      <ul className="-mx-2 flex flex-col">
        {liveOrders.map((o) => {
          const Icon = channelIcon[o.channel];
          return (
            <li key={o.id}>
              <a href="#" className="flex min-h-14 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-[#f3f9fd]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-brand-500">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="tabular-nums">{o.code}</span>
                    <span className={`rounded-full px-2 py-px text-[11px] font-medium ${statusMeta[o.status].chip}`}>
                      {statusMeta[o.status].label.replace(/s$/, '')}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.where} · {o.items} {o.items === 1 ? 'ítem' : 'ítems'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatUsd(o.totalUsd)}</p>
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
