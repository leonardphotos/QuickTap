import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import {
  CalendarClock,
  Calculator,
  Landmark,
  Plus,
  ShieldAlert,
  X,
  DollarSign,
  TrendingUp,
  Percent,
  Receipt as ReceiptIcon,
  Ticket,
  CalendarRange,
  PackageX,
  Wallet,
  Clock,
  Pencil,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { ShopScreen } from './ShopLayout';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { CATEGORY_LABELS, ExpenseFormDialog, type ExpenseCategory } from '@/components/admin/ExpenseFormDialog';
import { BreakEvenCard } from '@/components/admin/BreakEvenCard';

/** Gasto del local tal como lo devuelve GET /movements (solo los campos que se pintan acá). */
interface ShopExpense {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: ExpenseCategory | null;
  supplier: { id: string; name: string } | null;
  isCredit: boolean;
  creditPaidAt: string | null;
  createdAt: string;
  expenseDate: string | null;
  referenceNumber: string | null;
  receiptImageUrl: string | null;
  spentByName: string | null;
  paymentMethod: string | null;
}
import { shopMoneyFormatters } from './shopFormat';
import {
  daysUntilExpiry,
  isExpiringSoon,
  isLast30Days,
  isToday,
  productStatus,
  productStock,
  saleProfit,
  type Sale,
  type ShopSession,
} from './shopSession';

interface Props {
  session: ShopSession;
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
  canSeeMoney: boolean;
  userName: string;
  onNavigate: (screen: ShopScreen) => void;
}

function marginClass(pct: number): string {
  if (pct < 20) return 'text-red-600';
  if (pct < 40) return 'text-amber-600';
  return 'text-emerald-600';
}

const METRIC_COLORS: Record<string, string> = {
  brand: 'bg-brand-500/10 text-brand-600',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  sky: 'bg-sky-100 text-sky-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
};

function Metric({
  label,
  value,
  sub,
  icon: Icon,
  color = 'brand',
}: {
  label: string;
  value: string;
  sub?: string | null;
  icon: LucideIcon;
  color?: keyof typeof METRIC_COLORS;
}) {
  return (
    <div className="rounded-3xl border border-brand-950/[0.06] bg-white shadow-sm p-4">
      <span className={`h-9 w-9 rounded-xl flex items-center justify-center ${METRIC_COLORS[color]}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="text-[13px] font-medium text-brand-950/45 mt-3">{label}</p>
      <p className="text-[21px] font-bold text-brand-950 tracking-tight mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[11px] font-medium text-brand-950/35 mt-0.5">{sub}</p>}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

const STATUS_LABEL: Record<string, string> = { ok: 'Disponible', warn: 'Stock bajo', danger: 'Agotado' };
const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  warn: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

/** Métodos que el cliente paga en bolívares (Pago Móvil, Punto de Venta, Efectivo Bs) — el resto
 * (Efectivo $, Zelle, Binance, etc.) se cobra en dólares. Determina en qué moneda se muestra el
 * monto de una venta en vez de mostrar siempre $ con Bs como referencia. */
const BS_PAYMENT_METHODS = new Set(['Pago Móvil', 'Punto de Venta', 'Efectivo Bs']);

function groupIncomeByMethod(sales: Sale[]): { method: string; count: number; total: number }[] {
  const byMethod: Record<string, { count: number; total: number }> = {};
  sales.forEach((s) => {
    const key = s.paymentMethod ?? 'Sin especificar';
    if (!byMethod[key]) byMethod[key] = { count: 0, total: 0 };
    byMethod[key].count += 1;
    byMethod[key].total += s.total;
  });
  return Object.entries(byMethod)
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.total - a.total);
}

export default function ShopDashboardPage({ session, restaurant, canSeeMoney, userName, onNavigate }: Props) {
  const { money, moneyBs } = shopMoneyFormatters(restaurant);
  const { products, sales, purchases, returnSale, providers } = session;
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  // Corregir un gasto ya cargado (monto mal tipeado, categoría equivocada) sin tener que
  // borrarlo y volver a escribirlo entero.
  const [editingExpense, setEditingExpense] = useState<ShopExpense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<ShopExpense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState(false);
  const [showIncomeByMethod, setShowIncomeByMethod] = useState(false);
  // Buscador de "Ventas recientes" por número de referencia — con texto, busca en TODAS las
  // ventas (no solo las últimas 8) para poder ubicar un cobro puntual.
  const [salesSearch, setSalesSearch] = useState('');
  // Gastos del local (Movement type=EXPENSE). Sin esto el egreso se guardaba pero no aparecía
  // en ningún lado del panel: quedaba registrado a ciegas.
  const [expenses, setExpenses] = useState<ShopExpense[]>([]);
  const [gastosMes, setGastosMes] = useState(0);

  function loadExpenses() {
    api
      .get('/movements', { params: { range: 'month' } })
      .then((res) => {
        const data = res.data.data;
        setExpenses((data.movements ?? []).filter((m: ShopExpense) => m.type === 'EXPENSE'));
        setGastosMes(Number(data.totalExpense ?? 0));
      })
      .catch(() => {
        setExpenses([]);
        setGastosMes(0);
      });
  }

  useEffect(loadExpenses, []);
  // Nombres del equipo, para poder rotular el reporte por profesional (las ventas solo guardan el id).
  // Las ventas solo guardan el id del profesional; el nombre sale del equipo cargado en la sesión.
  const providerNames = Object.fromEntries(providers.map((p) => [p.id, p.name]));

  /** Bs para Pago Móvil/Punto/Efectivo Bs, $ para el resto (Efectivo $, Zelle, Binance, etc.) —
   * en vez de mostrar siempre el total en $ con Bs de referencia. */
  function saleAmount(s: Sale): string {
    if (s.paymentMethod && BS_PAYMENT_METHODS.has(s.paymentMethod)) return moneyBs(s.total) ?? money(s.total);
    return money(s.total);
  }

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

  /**
   * Cuánto hizo cada profesional (barbero/estilista) en los últimos 30 días: lo que facturó, la
   * comisión que le toca y lo que queda para el local. La comisión sale del % congelado en cada
   * línea al momento de vender, no del % actual del usuario — así lo ya liquidado no se mueve si
   * después le cambian el porcentaje.
   */
  const byProvider = (() => {
    const acc = new Map<string, { name: string; billed: number; commission: number; services: number }>();
    for (const sale of monthSales) {
      for (const it of sale.items) {
        if (!it.staffUserId) continue;
        const entry = acc.get(it.staffUserId) ?? { name: providerNames[it.staffUserId] ?? 'Profesional', billed: 0, commission: 0, services: 0 };
        entry.billed += it.price * it.qty;
        entry.commission += it.commissionBase ?? 0;
        entry.services += it.qty;
        acc.set(it.staffUserId, entry);
      }
    }
    return [...acc.values()].sort((a, b) => b.billed - a.billed);
  })();

  const salesSearchLower = salesSearch.trim().toLowerCase();
  const sortedSales = [...sales].sort((a, b) => b.time.getTime() - a.time.getTime());
  // Con búsqueda activa se filtran TODAS las ventas (no solo las últimas 8) por número de
  // referencia o nombre del cliente, para poder ubicar un cobro puntual.
  const recentSales = salesSearchLower
    ? sortedSales.filter(
        (s) =>
          s.paymentMeta?.reference?.toLowerCase().includes(salesSearchLower) ||
          s.customerName?.toLowerCase().includes(salesSearchLower),
      )
    : sortedSales.slice(0, 8);
  const recentPurchases = [...purchases].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 6);

  const incomeByMethodToday = groupIncomeByMethod(todaySales);
  const incomeByMethodMonth = groupIncomeByMethod(monthSales);

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
      <div>
        <h1 className="text-[20px] font-bold text-brand-950 tracking-tight">{greeting()}, {userName.split(' ')[0]}</h1>
        <p className="text-[13px] text-brand-950/45 mt-0.5">
          {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {canSeeMoney && <BreakEvenCard fetchUrl="/shop/breakeven" />}

      {/* Atajos del día a día: aunque el menú lateral ya lleva a todo, estas dos son las que
          más se abren desde el mostrador y merecen estar en el punto de partida. */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate('administracion')}
          className="flex items-center gap-2.5 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-4 py-3.5 text-left transition-colors hover:border-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <Calculator className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-brand-950">Administración</span>
            <span className="block text-[11px] font-light text-brand-950/45">Gastos, compras y más</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('cuentas')}
          className="flex items-center gap-2.5 rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm px-4 py-3.5 text-left transition-colors hover:border-brand-400"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Landmark className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-brand-950">Abrir cuenta</span>
            <span className="block text-[11px] font-light text-brand-950/45">Clientes que deben</span>
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Metric label="Ventas de hoy" value={money(ventasHoy)} sub={moneyBs(ventasHoy)} icon={DollarSign} color="brand" />
        {canSeeMoney && (
          <Metric label="Utilidad de hoy" value={money(utilidadHoy)} sub={moneyBs(utilidadHoy)} icon={TrendingUp} color="emerald" />
        )}
        {canSeeMoney && <Metric label="Margen de hoy" value={`${margenHoy.toFixed(1)}%`} icon={Percent} color="violet" />}
        <Metric label="Ventas registradas hoy" value={String(todaySales.length)} icon={ReceiptIcon} color="sky" />
        <Metric label="Ticket promedio" value={money(ticketProm)} sub={moneyBs(ticketProm)} icon={Ticket} color="brand" />
        <Metric label="Ventas (últimos 30 días)" value={money(ventasMes)} sub={moneyBs(ventasMes)} icon={CalendarRange} color="sky" />
        {canSeeMoney && (
          <Metric label="Utilidad (últimos 30 días)" value={money(utilidadMes)} sub={moneyBs(utilidadMes)} icon={TrendingUp} color="emerald" />
        )}
        {canSeeMoney && (
          <Metric label="Gastos (últimos 30 días)" value={money(gastosMes)} sub={moneyBs(gastosMes)} icon={Wallet} color="amber" />
        )}
        <Metric label="Alertas de stock" value={String(alertProducts.length)} icon={PackageX} color="amber" />
        <Metric label="Próximos a vencer" value={String(expiringProducts.length)} icon={Clock} color="rose" />
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

          {byProvider.length > 0 && (
            <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
              <h3 className="text-[15px] font-bold text-brand-950">Por profesional (30 días)</h3>
              <p className="text-xs text-brand-950/45 mb-3.5">Lo que factura cada uno y cuánto le toca de comisión.</p>
              <div className="flex flex-col">
                {byProvider.map((b) => (
                  <div key={b.name} className="py-2.5 border-b border-brand-950/[0.05] last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-brand-950">{b.name}</span>
                      <span className="text-sm font-bold text-brand-950">{money(b.billed)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-[11.5px] text-brand-950/45">{b.services} servicios</span>
                      {canSeeMoney && b.commission > 0 && (
                        <span className="text-[11.5px] text-brand-950/45">
                          para él {money(b.commission)} · para el local {money(b.billed - b.commission)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
          <h3 className="text-[15px] font-bold text-brand-950">Ventas recientes</h3>
          <div className="flex gap-2 flex-wrap">
            <input
              type="search"
              value={salesSearch}
              onChange={(e) => setSalesSearch(e.target.value)}
              placeholder="Buscar por referencia…"
              className="text-sm border border-brand-950/15 rounded-full px-3.5 py-1.5 w-48"
            />
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto flex items-center gap-1.5"
              onClick={() => setShowIncomeByMethod(true)}
            >
              <Landmark className="h-3.5 w-3.5" /> Ingresos por método
            </TextureButton>
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto flex items-center gap-1.5 !text-amber-600"
              onClick={() => setShowExpenseDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Añadir egreso
            </TextureButton>
          </div>
        </div>
        {recentSales.length === 0 ? (
          <p className="text-sm text-brand-950/40 text-center py-6">
            {salesSearchLower ? 'Ninguna venta coincide con esa referencia.' : 'Sin ventas todavía.'}
          </p>
        ) : (
          <div className="flex flex-col">
            {recentSales.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => setSelectedSale(s)}
                className={`flex items-center justify-between gap-3 py-2.5 border-b border-brand-950/[0.05] last:border-b-0 w-full text-left hover:bg-brand-950/[0.02] transition-colors ${s.returned ? 'opacity-50' : ''}`}
              >
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
                    {/* Quién cobró — clave apenas hay más de un usuario con acceso a la caja. */}
                    {s.soldByUserName ? ` · ${s.soldByUserName}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-brand-500 shrink-0">{saleAmount(s)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {canSeeMoney && (
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-3.5">
            <h3 className="text-[15px] font-bold text-brand-950">Gastos de los últimos 30 días</h3>
            <TextureButton
              variant="secondary"
              size="sm"
              className="!w-auto flex items-center gap-1.5 !text-amber-600"
              onClick={() => setShowExpenseDialog(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Añadir gasto
            </TextureButton>
          </div>
          {expenses.length === 0 ? (
            <p className="text-sm text-brand-950/40 text-center py-6">Sin gastos registrados.</p>
          ) : (
            <div className="flex flex-col">
              {expenses.slice(0, 10).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-2.5 border-b border-brand-950/[0.05] last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-950 truncate">
                      {m.description}
                      {m.category ? <span className="text-brand-950/50"> · {CATEGORY_LABELS[m.category]}</span> : ''}
                    </p>
                    <p className="text-xs text-brand-950/40 truncate">
                      {new Date(m.expenseDate ?? m.createdAt).toLocaleDateString('es-VE', {
                        day: '2-digit',
                        month: 'short',
                      })}
                      {m.spentByName ? ` · ${m.spentByName}` : ''}
                      {m.supplier ? ` · ${m.supplier.name}` : ''}
                      {m.referenceNumber ? ` · Ref. ${m.referenceNumber}` : ''}
                      {m.isCredit && !m.creditPaidAt ? ' · a crédito' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.receiptImageUrl && (
                      <a
                        href={m.receiptImageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-brand-500 hover:text-brand-600"
                      >
                        Recibo
                      </a>
                    )}
                    <span className="text-sm font-bold text-amber-600">−{money(Number(m.amountBase))}</span>
                    <button
                      type="button"
                      onClick={() => setEditingExpense(m)}
                      title="Editar gasto"
                      className="text-brand-950/30 hover:text-brand-500"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseToDelete(m)}
                      title="Eliminar gasto"
                      className="text-brand-950/30 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      <Dialog open={!!selectedSale} onOpenChange={(o) => !o && setSelectedSale(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de la venta</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                {selectedSale.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3.5 py-2 text-sm">
                    <span className="text-brand-950/80">
                      {it.qty}x {it.name}
                      {it.v1 ? ` (${it.v1}${it.v2 ? ' · ' + it.v2 : ''})` : ''}
                    </span>
                    <span className="font-semibold text-brand-950">{money(it.price * it.qty)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-brand-950/50">Total</span>
                <span className="text-base font-bold text-brand-500">{saleAmount(selectedSale)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-brand-950/50 text-xs">Fecha</p>
                  <p className="font-medium text-brand-950">
                    {selectedSale.time.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })} ·{' '}
                    {selectedSale.time.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <div>
                  <p className="text-brand-950/50 text-xs">Método de pago</p>
                  <p className="font-medium text-brand-950">{selectedSale.paymentMethod ?? '—'}</p>
                </div>
                {selectedSale.soldByUserName && (
                  <div>
                    <p className="text-brand-950/50 text-xs">Vendedor</p>
                    <p className="font-medium text-brand-950">{selectedSale.soldByUserName}</p>
                  </div>
                )}
                {selectedSale.customerName && (
                  <div>
                    <p className="text-brand-950/50 text-xs">Cliente</p>
                    <p className="font-medium text-brand-950">{selectedSale.customerName}</p>
                  </div>
                )}
                {selectedSale.customerPhone && (
                  <div>
                    <p className="text-brand-950/50 text-xs">Teléfono</p>
                    <p className="font-medium text-brand-950">{selectedSale.customerPhone}</p>
                  </div>
                )}
                {selectedSale.creditTerms && (
                  <div>
                    <p className="text-brand-950/50 text-xs">Fiado</p>
                    <p className="font-medium text-brand-950">
                      {selectedSale.creditTerms === 'FULL' ? 'Pago completo pendiente' : `Abonó ${money(selectedSale.amountPaidNow ?? 0)}`}
                    </p>
                  </div>
                )}
              </div>

              {selectedSale.paymentMeta?.reference && (
                <div>
                  <p className="text-brand-950/50 text-xs">Número de referencia</p>
                  <p className="font-semibold text-brand-950">{selectedSale.paymentMeta.reference}</p>
                </div>
              )}

              {selectedSale.paymentMeta?.proofImageUrl ? (
                <div>
                  <p className="text-brand-950/50 text-xs mb-1.5">Comprobante de pago</p>
                  <img
                    src={selectedSale.paymentMeta.proofImageUrl}
                    alt="Comprobante de pago"
                    className="w-full max-w-[280px] rounded-xl border border-brand-950/10 object-contain"
                  />
                </div>
              ) : (
                selectedSale.paymentMeta?.hasProof && (
                  <p className="text-[12px] text-brand-950/40">Se adjuntó un comprobante, pero no quedó guardada la imagen.</p>
                )
              )}

              {!selectedSale.returned && (
                <TextureButton
                  variant="minimal"
                  size="sm"
                  className="!w-auto"
                  onClick={() => {
                    if (window.confirm('¿Registrar la devolución de esta venta? Se repondrá el stock.')) {
                      returnSale(selectedSale.id);
                      setSelectedSale(null);
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Devolver esta venta
                </TextureButton>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {(showExpenseDialog || editingExpense) && (
        <ExpenseFormDialog
          expense={editingExpense ?? undefined}
          onClose={() => {
            setShowExpenseDialog(false);
            setEditingExpense(null);
          }}
          onCreated={() => {
            setShowExpenseDialog(false);
            setEditingExpense(null);
            loadExpenses(); // el cambio tiene que verse de una vez en la lista y en el total
          }}
        />
      )}

      {/* ---------- Eliminar gasto ---------- */}
      <Dialog open={!!expenseToDelete} onOpenChange={(o) => !o && setExpenseToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar gasto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-brand-950">
            ¿Borrar <span className="font-semibold">{expenseToDelete?.description}</span> por{' '}
            {expenseToDelete ? money(Number(expenseToDelete.amountBase)) : ''}? Deja de contar en los totales del período.
          </p>
          <DialogFooter>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setExpenseToDelete(null)}>
              Cancelar
            </TextureButton>
            <TextureButton
              variant="destructive"
              size="default"
              className="!w-auto"
              disabled={deletingExpense}
              onClick={async () => {
                if (!expenseToDelete) return;
                setDeletingExpense(true);
                try {
                  await api.delete(`/movements/${expenseToDelete.id}`);
                  setExpenseToDelete(null);
                  loadExpenses();
                } finally {
                  setDeletingExpense(false);
                }
              }}
            >
              {deletingExpense ? 'Borrando…' : 'Eliminar'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showIncomeByMethod} onOpenChange={setShowIncomeByMethod}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ingresos por método de pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-bold uppercase text-brand-950/40 mb-2">Hoy</p>
              {incomeByMethodToday.length === 0 ? (
                <p className="text-sm text-brand-950/40 text-center py-4">Sin ventas todavía hoy.</p>
              ) : (
                <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                  {incomeByMethodToday.map((row) => (
                    <div key={row.method} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <div>
                        <p className="font-medium text-brand-950">{row.method}</p>
                        <p className="text-[11px] text-brand-950/40">{row.count} venta{row.count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="font-bold text-brand-500">
                        {BS_PAYMENT_METHODS.has(row.method) ? moneyBs(row.total) ?? money(row.total) : money(row.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase text-brand-950/40 mb-2">Últimos 30 días</p>
              {incomeByMethodMonth.length === 0 ? (
                <p className="text-sm text-brand-950/40 text-center py-4">Sin ventas en este período.</p>
              ) : (
                <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
                  {incomeByMethodMonth.map((row) => (
                    <div key={row.method} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                      <div>
                        <p className="font-medium text-brand-950">{row.method}</p>
                        <p className="text-[11px] text-brand-950/40">{row.count} venta{row.count !== 1 ? 's' : ''}</p>
                      </div>
                      <span className="font-bold text-brand-950">
                        {BS_PAYMENT_METHODS.has(row.method) ? moneyBs(row.total) ?? money(row.total) : money(row.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
