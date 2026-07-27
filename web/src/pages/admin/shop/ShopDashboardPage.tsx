import type { AuthRestaurant } from '@/context/AuthContext';
import { CalendarClock, ShieldAlert } from 'lucide-react';
import { shopMoneyFormatters } from './shopFormat';
import {
  daysUntilExpiry,
  isExpiringSoon,
  isLast30Days,
  isToday,
  productStatus,
  productStock,
  saleProfit,
  type ShopSession,
} from './shopSession';

interface Props {
  session: ShopSession;
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
  canSeeMoney: boolean;
}

function marginClass(pct: number): string {
  if (pct < 20) return 'text-red-600';
  if (pct < 40) return 'text-amber-600';
  return 'text-emerald-600';
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
      <p className="text-sm font-medium text-brand-950/50">{label}</p>
      <p className="text-[24px] font-bold text-brand-950 tracking-tight mt-1.5">{value}</p>
      {sub && <p className="text-xs font-medium text-brand-950/40 mt-1">{sub}</p>}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { ok: 'Disponible', warn: 'Stock bajo', danger: 'Agotado' };
const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

export default function ShopDashboardPage({ session, restaurant, canSeeMoney }: Props) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const { products, sales, purchases, returnSale } = session;

  const active = sales.filter((s) => !s.returned);
  const todaySales = active.filter((s) => isToday(s.time));
  const monthSales = active.filter((s) => isLast30Days(s.time));

  const ventasHoy = todaySales.reduce((a, s) => a + s.total, 0);
  const utilidadHoy = todaySales.reduce((a, s) => a + saleProfit(s), 0);
  const margenHoy = ventasHoy > 0 ? (utilidadHoy / ventasHoy) * 100 : 0;
  const ticketProm = todaySales.length ? ventasHoy / todaySales.length : 0;
  const ventasMes = monthSales.reduce((a, s) => a + s.total, 0);
  const utilidadMes = monthSales.reduce((a, s) => a + saleProfit(s), 0);
  const alertProducts = products.filter((p) => productStatus(p) !== 'ok');
  const expiringProducts = [...products]
    .filter((p) => isExpiringSoon(p))
    .sort((a, b) => (daysUntilExpiry(a) ?? 0) - (daysUntilExpiry(b) ?? 0));

  const qtyByName: Record<string, number> = {};
  todaySales.forEach((s) => s.items.forEach((it) => { qtyByName[it.name] = (qtyByName[it.name] || 0) + it.qty; }));
  const topProducts = Object.entries(qtyByName).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const recentSales = [...sales].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 8);
  const recentPurchases = [...purchases].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 6);

  const byMargin = canSeeMoney
    ? [...products]
        .map((p) => {
          const unitProfit = p.price - p.cost;
          const pct = p.price > 0 ? (unitProfit / p.price) * 100 : 0;
          return { p, unitProfit, pct };
        })
        .sort((a, b) => b.pct - a.pct)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="Ventas de hoy" value={money(ventasHoy)} sub={moneyBs(ventasHoy)} />
        {canSeeMoney && <Metric label="Utilidad de hoy" value={money(utilidadHoy)} sub={moneyBs(utilidadHoy)} />}
        {canSeeMoney && <Metric label="Margen de hoy" value={`${margenHoy.toFixed(1)}%`} />}
        <Metric label="Ventas registradas hoy" value={String(todaySales.length)} />
        <Metric label="Ticket promedio" value={money(ticketProm)} sub={moneyBs(ticketProm)} />
        <Metric label="Ventas (últimos 30 días)" value={money(ventasMes)} sub={moneyBs(ventasMes)} />
        {canSeeMoney && <Metric label="Utilidad (últimos 30 días)" value={money(utilidadMes)} sub={moneyBs(utilidadMes)} />}
        <Metric label="Alertas de stock" value={String(alertProducts.length)} />
        <Metric label="Próximos a vencer" value={String(expiringProducts.length)} />
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-[1.4] min-w-0 w-full rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
          <h3 className="text-[15px] font-bold text-brand-950 mb-3.5">Margen de utilidad por producto</h3>
          {!canSeeMoney ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-brand-950/40">
              <ShieldAlert className="h-7 w-7 opacity-50" />
              <span className="text-sm">Los márgenes y costos son visibles solo para Dueño/Administrador.</span>
            </div>
          ) : (
            <div className="max-h-[430px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] font-bold uppercase text-brand-950/40 text-left">
                    <th className="pb-2">Producto</th>
                    <th className="pb-2">Precio</th>
                    <th className="pb-2">Costo</th>
                    <th className="pb-2">Utilidad/u</th>
                    <th className="pb-2">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {byMargin.map(({ p, unitProfit, pct }) => (
                    <tr key={p.id} className="border-t border-brand-950/[0.05]">
                      <td className="py-2.5 pr-2">{p.name}</td>
                      <td className="py-2.5 pr-2">{money(p.price)}</td>
                      <td className="py-2.5 pr-2">{money(p.cost)}</td>
                      <td className="py-2.5 pr-2">{money(unitProfit)}</td>
                      <td className={`py-2.5 font-bold ${marginClass(pct)}`}>{pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
            <h3 className="text-[15px] font-bold text-brand-950 mb-3.5">Productos más vendidos hoy</h3>
            {topProducts.length === 0 ? (
              <p className="text-sm text-brand-950/40 text-center py-6">Sin ventas todavía hoy.</p>
            ) : (
              <div className="flex flex-col">
                {topProducts.map(([name, qty], i) => (
                  <div key={name} className="flex items-center justify-between gap-2 py-2 border-b border-brand-950/[0.05] last:border-b-0">
                    <span className="text-sm text-brand-950">{i + 1}. {name}</span>
                    <span className="text-sm font-bold text-brand-950">{qty} und.</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
            <h3 className="text-[15px] font-bold text-brand-950 mb-3.5">Alertas de stock</h3>
            {alertProducts.length === 0 ? (
              <p className="text-sm text-brand-950/40 text-center py-6">Todo el stock está en orden.</p>
            ) : (
              <div className="flex flex-col">
                {alertProducts.map((p) => {
                  const status = productStatus(p);
                  const isWeight = p.variants.some((v) => v.soldByWeight);
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-brand-950/[0.05] last:border-b-0">
                      <span className="text-sm text-brand-950">{p.name}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>
                        {STATUS_LABEL[status]} · {isWeight ? `${productStock(p).toFixed(1)} Kg` : productStock(p)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
            <h3 className="text-[15px] font-bold text-brand-950 mb-3.5 flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4 text-amber-500" /> Próximos a vencer
            </h3>
            {expiringProducts.length === 0 ? (
              <p className="text-sm text-brand-950/40 text-center py-6">Sin productos por vencer en los próximos 30 días.</p>
            ) : (
              <div className="flex flex-col">
                {expiringProducts.map((p) => {
                  const days = daysUntilExpiry(p) ?? 0;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-brand-950/[0.05] last:border-b-0">
                      <span className="text-sm text-brand-950">{p.name}</span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${days < 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {days < 0 ? `Venció hace ${Math.abs(days)}d` : days === 0 ? 'Vence hoy' : `Vence en ${days}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
        <h3 className="text-[15px] font-bold text-brand-950 mb-3.5">Ventas recientes</h3>
        {recentSales.length === 0 ? (
          <p className="text-sm text-brand-950/40 text-center py-6">Sin ventas todavía.</p>
        ) : (
          <div className="flex flex-col">
            {recentSales.map((s) => (
              <div key={s.id} className={`flex items-center justify-between gap-3 py-2.5 border-b border-brand-950/[0.05] last:border-b-0 ${s.returned ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className={`text-sm font-medium text-brand-950 truncate ${s.returned ? 'line-through' : ''}`}>
                    {s.items.map((it) => `${it.qty}x ${it.name}`).join(', ')}
                    {s.customerName ? ` · ${s.customerName}` : ''}
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {s.time.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })} ·{' '}
                    {s.time.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
                    {s.paymentMethod ? ` · ${s.paymentMethod}` : ''}
                    {s.creditTerms ? ' · Fiado' : ''}
                    {s.returned ? ' · Devuelta' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-sm font-bold text-brand-500">{money(s.total)}</span>
                  {!s.returned && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('¿Registrar la devolución de esta venta? Se repondrá el stock.')) returnSale(s.id);
                      }}
                      className="text-[11.5px] font-semibold text-brand-950/60 border border-brand-950/15 rounded-full px-2.5 py-1 hover:bg-brand-950/5"
                    >
                      Devolver
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
        <h3 className="text-[15px] font-bold text-brand-950 mb-3.5">Compras a proveedores recientes</h3>
        {recentPurchases.length === 0 ? (
          <p className="text-sm text-brand-950/40 text-center py-6">Sin compras registradas.</p>
        ) : (
          <div className="flex flex-col">
            {recentPurchases.map((pu) => (
              <div key={pu.id} className="flex items-center justify-between gap-3 py-2.5 border-b border-brand-950/[0.05] last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-950 truncate">
                    {pu.qty}x {pu.productName}{pu.v1 ? ` (${pu.v1}${pu.v2 ? ' · ' + pu.v2 : ''})` : ''}
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {pu.supplier} · {pu.time.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <span className="text-sm font-bold text-brand-950 shrink-0">{money(pu.qty * pu.cost)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
