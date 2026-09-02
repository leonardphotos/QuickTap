import { useEffect, useState } from 'react';
import { ChevronDown, DollarSign, Plus, Receipt, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import { hasFeature, type FeatureFlag } from '@/utils/subscription';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from '@/components/admin/InlinePanel';
import { AdminSectionNav } from '@/components/admin/AdminSectionNav';
import { PlanUpgradeNotice } from '@/components/admin/PlanUpgradeNotice';
import { MetricCard } from '@/components/admin/MetricCard';
import { BreakEvenCard } from '@/components/admin/BreakEvenCard';
import { FiscalBooksSection } from '@/components/admin/FiscalBooksSection';
import { BankAccountsSection } from '@/components/admin/BankAccountsSection';
import { AccountingHub } from '@/components/admin/AccountingHub';
import { CrmHub } from '@/components/admin/crm/CrmHub';
import { DishTimesSection } from '@/components/admin/DishTimesSection';
import { PurchasesHub } from '@/components/admin/purchases/PurchasesHub';
import { CostStructureHub } from '@/components/admin/cost-structure/CostStructureHub';
import {
  OrderHistorySection,
  OrderDetailRow,
  CHANNEL_ROW_LABELS,
  RANGE_LABELS,
  type Range,
  type Channel,
  type HistoryResult,
} from '@/components/admin/OrderHistorySection';
import ExpensesPage from '@/pages/admin/ExpensesPage';
import { CashSessionPanel } from '@/components/admin/CashSessionControl';
import { ReportPickerForm, ReportResult } from '@/components/admin/ReportDialog';
import { PAYMENT_LABELS as ALL_PAYMENT_LABELS } from '@/components/admin/PaymentDialog';
import { IncomeForm, INCOME_CATEGORY_LABELS, type IncomeCategory } from '@/components/admin/IncomeFormDialog';
import type { ReportData } from '@/components/admin/ReportReceipt';
import type { PaymentMethod as AnyPaymentMethod } from '@/types';

/**
 * Pestañas de Administración y el flag de plan que las habilita. `null` = va en Administración
 * básica (Plan Pro); las demás son del Plan Elite (contabilidad avanzada / CRM / cuentas por
 * cobrar). Con el flag apagado la pestaña se sigue viendo pero abre el aviso de mejora de plan —
 * así el dueño sabe qué gana con Elite en vez de no enterarse de que existe.
 */
const ALL_TABS = [
  { id: 'summary', label: 'Resumen', feature: null },
  { id: 'stats', label: 'Estadísticas', feature: null },
  // Cuánto tarda cada plato, cocina y sala por separado.
  { id: 'dishTimes', label: 'Tiempos por plato', feature: null },
  { id: 'history', label: 'Historial de pedidos', feature: 'accounting' },
  { id: 'products', label: 'Productos', feature: null },
  { id: 'margin', label: 'Margen de utilidad', feature: 'accounting' },
  // Calculadora de estructura de costo por producto (material + % fijos y variables) y sus estadísticas.
  { id: 'costStructure', label: 'Estructura de costo', feature: 'accounting' },
  // Gastos vive acá (ya no en el menú lateral); Cotizaciones está dentro de Compras.
  { id: 'expenses', label: 'Gastos', feature: null },
  { id: 'purchases', label: 'Compras', feature: null },
  // Clientes con segmentos + promociones personalizadas con código canjeable.
  { id: 'crm', label: 'CRM', feature: 'crm' },
  { id: 'payments', label: 'Métodos de pago', feature: null },
  { id: 'ledger', label: 'Contabilidad', feature: 'accounting' },
  // Proveedores ya no vive acá: es una pestaña de Compras (evita el duplicado).
  { id: 'books', label: 'Libros fiscales', feature: 'accounting' },
  { id: 'banks', label: 'Cuentas bancarias', feature: 'accounting' },
] as const satisfies readonly { id: string; label: string; feature: FeatureFlag | null }[];
type TabId = (typeof ALL_TABS)[number]['id'];

/** Administración: resumen, historial de pedidos, propinas y reporte de productos. Planes Pro/Premium.
 * Menú propio (`AdminSectionNav`, sidebar en escritorio) + todo desplegado en línea, sin ventanas
 * flotantes (`InlinePanel` en vez de `Dialog` para abrir/cerrar caja, reportes, ingresos y detalle). */
export default function AdministrationPage() {
  const { restaurant } = useAuth();
  const TABS = ALL_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    locked: t.feature != null && !hasFeature(restaurant, t.feature),
  }));
  const [tab, setTab] = useState<TabId>('summary');
  const [showReport, setShowReport] = useState(false);
  const activeTab = ALL_TABS.find((t) => t.id === tab)!;
  const tabLocked = activeTab.feature != null && !hasFeature(restaurant, activeTab.feature);


  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Administración</h1>
          <p className="text-sm text-brand-950/60 font-light mt-1">Ventas, pedidos, propinas y productos de tu restaurante.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CashSessionPanel />
          <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setShowReport((s) => !s)}>
            Generar reporte
          </TextureButton>
        </div>
      </div>

      {showReport && <ReportPanel onClose={() => setShowReport(false)} />}

      <div className="lg:flex lg:flex-row lg:gap-6">
        <AdminSectionNav items={TABS} activeId={tab} onChange={(id) => setTab(id as TabId)} />
        <div className="mt-5 lg:mt-0 min-w-0 flex-1">
          {tabLocked && <PlanUpgradeNotice feature={activeTab.label} />}
          {!tabLocked && tab === 'summary' && <SummaryTab />}
          {!tabLocked && tab === 'stats' && <StatsTab />}
          {!tabLocked && tab === 'dishTimes' && <DishTimesSection />}
          {!tabLocked && tab === 'history' && <HistoryTab />}
          {!tabLocked && tab === 'products' && <ProductsTab />}
          {!tabLocked && tab === 'margin' && <MarginTab />}
          {!tabLocked && tab === 'costStructure' && <CostStructureHub />}
          {!tabLocked && tab === 'expenses' && <ExpensesPage embedded />}
          {!tabLocked && tab === 'purchases' && <PurchasesHub />}
          {!tabLocked && tab === 'crm' && <CrmHub />}
          {!tabLocked && tab === 'payments' && <PaymentsTab />}
          {!tabLocked && tab === 'ledger' && <AccountingHub sections={['ledger', 'income', 'balance', 'cost', 'hr']} />}
          {!tabLocked && tab === 'books' && <FiscalBooksSection />}
          {!tabLocked && tab === 'banks' && <BankAccountsSection symbol={restaurant?.currencySymbol ?? '$'} />}
        </div>
      </div>
    </div>
  );
}

/** Botón "Generar reporte" de la cabecera: elige área + período, genera, y muestra el PDF a
 * descargar — dentro de un InlinePanel propio (antes era `ReportDialog`, ventana flotante). */
function ReportPanel({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<{ data: ReportData; dateLabel: string } | null>(null);

  return (
    <InlinePanel title={report ? 'Reporte generado' : 'Generar reporte'} onClose={onClose}>
      {report ? (
        <ReportResult report={report.data} dateLabel={report.dateLabel} area={report.data.kind} />
      ) : (
        <ReportPickerForm onGenerated={(data, dateLabel) => setReport({ data, dateLabel })} />
      )}
    </InlinePanel>
  );
}

interface MovementRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  incomeCategory: IncomeCategory | null;
  paymentMethod: AnyPaymentMethod | null;
  createdByName: string | null;
  createdAt: string;
}

interface MovementResult {
  totalIncome: string;
  totalExpense: string;
  net: string;
  totalIncomeBs: string;
  totalExpenseBs: string;
  netBs: string;
  movements: MovementRow[];
}

function SummaryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('day');
  const [date, setDate] = useState(''); // "YYYY-MM-DD"; si está seteado, manda a un lado los pills de rango
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [movements, setMovements] = useState<MovementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMovementDialog, setShowMovementDialog] = useState(false);
  // Buscador por número de referencia (Pago Móvil/Zelle/etc.) para ubicar un cobro puntual
  // dentro del período elegido — filtra lo que ya está cargado en pantalla, sin ir al servidor.
  const [search, setSearch] = useState('');
  const searchLower = search.trim().toLowerCase();

  const periodLabel = date ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_LABELS[range];

  function loadMovements() {
    api
      .get('/movements', { params: { range, date: date || undefined } })
      .then((res) => setMovements(res.data.data))
      .catch(() => setMovements(null));
  }

  useEffect(() => {
    api
      .get('/orders/history', { params: { range, date: date || undefined, pageSize: 100 } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el resumen.'));
    loadMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, date]);

  async function removeMovement(id: string) {
    await api.delete(`/movements/${id}`);
    loadMovements();
  }

  const filteredOrders = !searchLower
    ? result?.orders
    : result?.orders.filter(
        (o) =>
          String(o.orderNumber).includes(searchLower) ||
          o.payments.some((p) => p.referenceNumber?.toLowerCase().includes(searchLower)),
      );
  const filteredMovements = !searchLower
    ? movements?.movements
    : movements?.movements.filter((m) => m.description.toLowerCase().includes(searchLower));

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      {/* Punto de equilibrio: vive dentro de Resumen, no como pestaña aparte. */}
      <BreakEvenCard fetchUrl="/products/breakeven" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                setDate('');
              }}
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                !date && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
              }`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border-none ${
              date ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </div>
        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto !text-emerald-600"
          onClick={() => setShowMovementDialog(true)}
        >
          <Plus className="h-3.5 w-3.5" /> Añadir ingreso
        </TextureButton>
      </div>

      {result && movements && (
        <BalanceCard
          salesBase={result.totalBase}
          salesBs={result.totalBs}
          incomeBase={movements.totalIncome}
          incomeBs={movements.totalIncomeBs}
          expenseBase={movements.totalExpense}
          expenseBs={movements.totalExpenseBs}
          symbol={symbol}
          periodLabel={periodLabel}
        />
      )}

      {result && (
        <div className="grid sm:grid-cols-3 gap-4">
          <MetricCard icon={Wallet} title="En bolívares" value={formatBsAbsolute(result.totalBs)} />
          <MetricCard icon={DollarSign} title={`En ${symbol}`} value={formatBase(result.totalBase, symbol)} />
          <MetricCard icon={Receipt} title={`Pedidos · ${periodLabel}`} value={String(result.total)} />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <p className="text-sm font-medium text-brand-950/70">Detalle de ventas · {periodLabel}</p>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número de referencia…"
            className="text-sm border border-brand-950/15 rounded-full px-3.5 py-1.5 w-full sm:w-64"
          />
        </div>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
          <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
            <span className="flex-1">Pedido</span>
            <span className="w-32">Fecha</span>
            <span className="w-20 text-right">Total</span>
            <span className="w-4" />
          </div>
          <div className="divide-y divide-brand-950/[0.06] max-h-[36rem] overflow-y-auto">
            {filteredOrders?.length === 0 && (
              <p className="p-5 text-sm text-brand-950/40 font-light">
                {searchLower ? 'Ninguna venta coincide con esa referencia.' : 'Sin ventas en este período.'}
              </p>
            )}
            {filteredOrders?.map((o) => (
              <OrderDetailRow key={o.id} order={o} symbol={symbol} />
            ))}
          </div>
        </div>
        {result && !searchLower && result.total > result.pageSize && (
          <p className="text-xs text-brand-950/40 mt-2 text-center">
            Mostrando los {result.pageSize} pedidos más recientes de {result.total}.
          </p>
        )}
      </div>

      {movements && movements.movements.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <p className="text-sm font-medium text-brand-950/70">Movimientos · {periodLabel}</p>
            <p className="text-xs text-brand-950/50 text-right">
              +{formatBase(movements.totalIncome, symbol)} · −{formatBase(movements.totalExpense, symbol)}
              <br />
              Egresos: {formatBsAbsolute(movements.totalExpenseBs)} · {formatBase(movements.totalExpense, symbol)}
            </p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
          <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
            <span className="flex-1">Descripción</span>
            <span className="w-40">Fecha</span>
            <span className="w-24 text-right">Monto</span>
            <span className="w-6" />
          </div>
          <div className="divide-y divide-brand-950/[0.06]">
            {filteredMovements?.length === 0 && (
              <p className="p-5 text-sm text-brand-950/40 font-light">Ningún movimiento coincide con esa búsqueda.</p>
            )}
            {filteredMovements?.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-950 truncate">
                    {m.description}
                    {m.incomeCategory && <span className="text-brand-950/40"> · {INCOME_CATEGORY_LABELS[m.incomeCategory]}</span>}
                    {m.paymentMethod && <span className="text-brand-950/40"> · {ALL_PAYMENT_LABELS[m.paymentMethod]}</span>}
                  </p>
                  <p className="text-xs text-brand-950/40">
                    {new Date(m.createdAt).toLocaleString('es-VE')}
                    {m.createdByName && ` · ${m.createdByName}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-sm font-semibold ${m.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {m.type === 'INCOME' ? '+' : '−'}
                    {formatBase(m.amountBase, symbol)}
                  </span>
                  <button
                    onClick={() => removeMovement(m.id)}
                    className="text-brand-950/30 hover:text-red-500"
                    aria-label="Eliminar movimiento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}

      {showMovementDialog && (
        <InlinePanel title="Añadir ingreso" onClose={() => setShowMovementDialog(false)}>
          <IncomeForm
            onCreated={() => {
              setShowMovementDialog(false);
              loadMovements();
            }}
          />
        </InlinePanel>
      )}
    </div>
  );
}

/** Balance final del período: ventas + ingresos manuales, menos egresos (Gastos), en Bs y en $.
 * Ej: ingresos $100 (Bs a tasa BCV) − egreso de proveedor 80.000 Bs → balance en rojo si queda negativo. */
function BalanceCard({
  salesBase,
  salesBs,
  incomeBase,
  incomeBs,
  expenseBase,
  expenseBs,
  symbol,
  periodLabel,
}: {
  salesBase: string;
  salesBs: string;
  incomeBase: string;
  incomeBs: string;
  expenseBase: string;
  expenseBs: string;
  symbol: string;
  periodLabel: string;
}) {
  const ingresosBase = Number(salesBase) + Number(incomeBase);
  const ingresosBs = Number(salesBs) + Number(incomeBs);
  const egresosBase = Number(expenseBase);
  const egresosBs = Number(expenseBs);
  const balanceBase = ingresosBase - egresosBase;
  const balanceBs = ingresosBs - egresosBs;
  const negative = balanceBase < 0;

  return (
    <MetricCard
      icon={Wallet}
      title={`Balance · ${periodLabel}`}
      rows={[
        { label: 'Ingresos', amount: `${formatBsAbsolute(String(ingresosBs))} · ${formatBase(ingresosBase, symbol)}`, tone: 'success' },
        { label: 'Egresos', amount: `${formatBsAbsolute(String(egresosBs))} · ${formatBase(egresosBase, symbol)}`, tone: 'danger' },
        {
          label: 'Balance final',
          amount: `${formatBsAbsolute(String(balanceBs))} · ${formatBase(balanceBase, symbol)}`,
          tone: negative ? 'danger' : undefined,
        },
      ]}
    />
  );
}

// -----------------------------------------------------------------------------
//  Estadísticas: semana/mes vs. período anterior + ventas por usuario
// -----------------------------------------------------------------------------

interface SalesStatsUserRow {
  userId: string;
  name: string;
  count: number;
  totalBase: string;
}

interface SalesStats {
  range: 'week' | 'month';
  custom: boolean;
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  avgTicketBase: string;
  avgTicketBs: string;
  previousAvgTicketBase: string;
  totalTipBase: string;
  previousTotalBase: string;
  previousOrdersCount: number;
  changePercent: string | null;
  byUser: SalesStatsUserRow[];
}

interface UserSaleItem {
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

interface UserSalePayment {
  method: string;
  referenceNumber: string | null;
  amountBase: string;
  discountBase: string | null;
  createdAt: string;
}

interface UserSale {
  id: string;
  orderNumber: number;
  channel: Channel;
  status: string;
  paymentMethod: string | null;
  totalBase: string;
  totalBs: string;
  currency: string;
  customerName: string | null;
  table: string | null;
  createdAt: string;
  items: UserSaleItem[];
  payments: UserSalePayment[];
}

const STATS_RANGE_LABELS = { week: 'Esta semana', month: 'Este mes' } as const;
const STATS_PREVIOUS_LABELS = { week: 'la semana pasada', month: 'el mes pasado' } as const;

/** Etiqueta del tramo desde–hasta elegido a mano en Estadísticas. */
function describePeriod(from: string, to: string): string {
  const fmt = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-VE');
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  if (from) return `desde ${fmt(from)}`;
  return `hasta ${fmt(to)}`;
}

/** Variación del ticket promedio contra el período anterior, ya formateada con signo. */
function ticketChange(stats: SalesStats): string {
  const prev = Number(stats.previousAvgTicketBase);
  const diff = ((Number(stats.avgTicketBase) - prev) / prev) * 100;
  return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
}

/** Ventas por usuario/período: 3 vistas en línea, nunca superpuestas — `stats` (tarjetas + lista
 * por usuario), `allSales` (todas las ventas del período) y `saleDetail` (comanda + pagos de una
 * venta). Antes `allSales` y `saleDetail` eran diálogos flotantes que podían estar abiertos los
 * DOS a la vez (uno tapaba al otro); ahora es una sola vista visible, y "← Volver" desde el
 * detalle regresa a `allSales` o a `stats` según de dónde vino la venta seleccionada. */
function StatsTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [userSales, setUserSales] = useState<UserSale[] | null>(null);
  const [loadingSales, setLoadingSales] = useState(false);
  const [view, setView] = useState<'stats' | 'allSales' | 'saleDetail'>('stats');
  const [selectedSale, setSelectedSale] = useState<UserSale | null>(null);
  const [saleDetailFrom, setSaleDetailFrom] = useState<'stats' | 'allSales'>('stats');
  const [allSales, setAllSales] = useState<UserSale[] | null>(null);
  const [loadingAllSales, setLoadingAllSales] = useState(false);

  // Un tramo desde–hasta manda sobre el preset semana/mes; el backend lo aplica igual
  // al drill-down por usuario para que las dos vistas hablen del mismo período.
  const statsParams = { range, from: from || undefined, to: to || undefined };
  const periodLabel = from || to ? describePeriod(from, to) : STATS_RANGE_LABELS[range];
  // Con un tramo a mano el backend compara contra la misma cantidad de días justo antes.
  const previousLabel = from || to ? 'el período anterior' : STATS_PREVIOUS_LABELS[range];

  useEffect(() => {
    api
      .get('/orders/reports/sales-stats', { params: statsParams })
      .then((res) => setStats(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las estadísticas.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, from, to]);

  function toggleUser(userId: string) {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setUserSales(null);
      return;
    }
    setExpandedUserId(userId);
    setUserSales(null);
    setLoadingSales(true);
    api
      .get(`/orders/reports/sales-stats/user/${userId}`, { params: statsParams })
      .then((res) => setUserSales(res.data.data))
      .finally(() => setLoadingSales(false));
  }

  function openAllSales() {
    setView('allSales');
    setAllSales(null);
    setLoadingAllSales(true);
    api
      .get('/orders/reports/sales-stats/user/ALL', { params: statsParams })
      .then((res) => setAllSales(res.data.data))
      .finally(() => setLoadingAllSales(false));
  }

  function openSaleDetail(sale: UserSale, cameFrom: 'stats' | 'allSales') {
    setSelectedSale(sale);
    setSaleDetailFrom(cameFrom);
    setView('saleDetail');
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  if (view === 'saleDetail' && selectedSale) {
    return (
      <SaleDetailPanel
        sale={selectedSale}
        symbol={symbol}
        onClose={() => {
          setSelectedSale(null);
          setView(saleDetailFrom);
        }}
      />
    );
  }

  if (view === 'allSales') {
    return (
      <SalesListPanel
        title={`Ventas · ${periodLabel}`}
        sales={allSales}
        loading={loadingAllSales}
        symbol={symbol}
        onSelectSale={(sale) => openSaleDetail(sale, 'allSales')}
        onClose={() => setView('stats')}
      />
    );
  }

  const changeUp = stats?.changePercent != null && Number(stats.changePercent) >= 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['week', 'month'] as const).map((r) => (
          <button
            key={r}
            onClick={() => {
              setRange(r);
              setFrom('');
              setTo('');
            }}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              !from && !to && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {STATS_RANGE_LABELS[r]}
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-brand-950/50">
          Desde
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${
              from || to ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-brand-950/50">
          Hasta
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`rounded-full border-none px-2.5 py-1 text-xs font-medium ${
              from || to ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          />
        </label>
        {(from || to) && (
          <button
            onClick={() => {
              setFrom('');
              setTo('');
            }}
            className="text-xs font-medium text-brand-950/50 underline"
          >
            Limpiar fechas
          </button>
        )}
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={Wallet}
            title={`Ventas · ${periodLabel}`}
            value={formatBsAbsolute(stats.totalBs)}
            caption={formatBase(stats.totalBase, symbol)}
            onClick={openAllSales}
          />
          <MetricCard icon={Receipt} title={`Pedidos · ${periodLabel}`} value={String(stats.ordersCount)} onClick={openAllSales} />
          <MetricCard
            icon={Receipt}
            title="Ticket promedio"
            value={formatBase(stats.avgTicketBase, symbol)}
            caption={formatBsAbsolute(stats.avgTicketBs)}
            trend={
              Number(stats.previousAvgTicketBase) > 0
                ? `${ticketChange(stats)} vs. ${previousLabel} (${formatBase(stats.previousAvgTicketBase, symbol)})`
                : undefined
            }
          />
          {stats.changePercent == null ? (
            <MetricCard icon={TrendingUp} title="Cambio" caption={`Sin datos de ${previousLabel}.`} value="—" />
          ) : (
            <MetricCard
              icon={TrendingUp}
              title="Cambio"
              value={`${changeUp ? '+' : ''}${stats.changePercent}%`}
              valueTone={changeUp ? 'success' : 'danger'}
              trend={`vs. ${previousLabel} (${formatBase(stats.previousTotalBase, symbol)})`}
            />
          )}
        </div>
      )}

      {/* Margen de utilidad del mismo período, con "Ver más" para el detalle por producto. */}
      <MarginSummaryCard range={range} from={from} to={to} periodLabel={periodLabel} />

      {/* Con qué pagaron en el mismo período — el detalle completo sigue en la pestaña Métodos de pago. */}
      <PaymentMethodsSummaryCard range={range} from={from} to={to} periodLabel={periodLabel} />


      <div>
        <p className="text-sm font-medium text-brand-950/70 mb-3">Ventas por usuario · {stats ? STATS_RANGE_LABELS[stats.range] : ''}</p>
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
          {stats?.byUser.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este período.</p>}
          {stats?.byUser.map((u) => {
            const expanded = expandedUserId === u.userId;
            return (
              <div key={u.userId}>
                <button
                  onClick={() => toggleUser(u.userId)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-brand-950/[0.02]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown className={`h-4 w-4 text-brand-950/30 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    <p className="text-sm font-medium text-brand-950 truncate">{u.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-brand-950">{formatBase(u.totalBase, symbol)}</p>
                    <p className="text-xs text-brand-950/50 font-light">{u.count} pedido{u.count === 1 ? '' : 's'}</p>
                  </div>
                </button>
                {expanded && (
                  <div className="px-5 pb-3 pl-11 space-y-1">
                    {loadingSales && <p className="text-xs text-brand-950/40 font-light py-2">Cargando ventas…</p>}
                    {!loadingSales && userSales?.length === 0 && (
                      <p className="text-xs text-brand-950/40 font-light py-2">Sin ventas registradas.</p>
                    )}
                    {!loadingSales &&
                      userSales?.map((sale) => (
                        <button
                          key={sale.id}
                          onClick={() => openSaleDetail(sale, 'stats')}
                          className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs hover:bg-brand-950/[0.04]"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-brand-950">
                              #{sale.orderNumber} · {sale.table ? sale.table : CHANNEL_ROW_LABELS[sale.channel]}
                            </p>
                            <p className="text-brand-950/40">
                              {new Date(sale.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          <p className="font-semibold text-brand-950 shrink-0">{formatBase(sale.totalBase, symbol)}</p>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Margen de utilidad dentro de Estadísticas: el total del período (ingreso, costo de lo
 * vendido y utilidad) más los productos que más margen dejan. Arranca mostrando los 5
 * primeros y "Ver más" despliega el resto sin salir de la pestaña.
 */
function MarginSummaryCard({
  range,
  from,
  to,
  periodLabel,
}: {
  range: 'week' | 'month';
  from: string;
  to: string;
  periodLabel: string;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [summary, setSummary] = useState<MarginSummary | null>(null);
  const [rows, setRows] = useState<MarginRow[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/products/margin', { params: { range, from: from || undefined, to: to || undefined } })
      .then((res) => {
        setSummary(res.data.data.summary);
        setRows(res.data.data.rows);
        setExpanded(false);
      })
      .catch((err) => setError(err.response?.data?.error ?? null));
  }, [range, from, to]);

  // Sin plan de contabilidad el endpoint responde 403: la pestaña Margen ya muestra el
  // aviso de mejora, así que aquí simplemente no se dibuja el bloque.
  if (error || !summary) return null;

  const visible = expanded ? (rows ?? []) : (rows ?? []).slice(0, 5);
  const negative = Number(summary.marginBase) < 0;

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-brand-950/70">Margen de utilidad · {periodLabel}</p>
        <p className="text-xs font-light text-brand-950/45">Ingreso − costo de lo vendido</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-light text-brand-950/45">Ingresos</p>
          <p className="text-lg font-semibold text-brand-950">{formatBase(summary.revenueBase, symbol)}</p>
        </div>
        <div>
          <p className="text-xs font-light text-brand-950/45">Costo de lo vendido</p>
          <p className="text-lg font-semibold text-brand-950">{formatBase(summary.costBase, symbol)}</p>
        </div>
        <div>
          <p className="text-xs font-light text-brand-950/45">Utilidad</p>
          <p className={`text-lg font-semibold ${negative ? 'text-red-600' : 'text-emerald-600'}`}>
            {formatBase(summary.marginBase, symbol)}{' '}
            <span className="text-xs font-normal text-brand-950/45">{summary.marginPercent}%</span>
          </p>
        </div>
      </div>

      {visible.length > 0 && (
        <div className="mt-4 divide-y divide-brand-950/[0.06] border-t border-brand-950/[0.06]">
          {visible.map((r) => (
            <div key={`${r.id ?? 'x'}-${r.name}`} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-950">{r.name}</p>
                <p className="text-xs text-brand-950/40">
                  {r.quantity} vendidos · Ingreso {formatBase(r.revenueBase, symbol)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-semibold ${Number(r.marginBase) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatBase(r.marginBase, symbol)}
                </p>
                <p className="text-xs font-light text-brand-950/50">{r.marginPercent}% margen</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(rows?.length ?? 0) > 5 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-semibold text-brand-500 hover:underline"
        >
          {expanded ? 'Ver menos' : `Ver más (${(rows?.length ?? 0) - 5} productos)`}
        </button>
      )}
      {rows?.length === 0 && <p className="mt-3 text-sm font-light text-brand-950/40">Sin ventas en este período.</p>}
    </div>
  );
}

/**
 * Con qué pagaron en el período, dentro de Estadísticas: cada método con su monto, su
 * cantidad de pedidos y su peso sobre el total cobrado. El drill-down pedido por pedido
 * sigue viviendo en la pestaña "Métodos de pago".
 */
function PaymentMethodsSummaryCard({
  range,
  from,
  to,
  periodLabel,
}: {
  range: 'week' | 'month';
  from: string;
  to: string;
  periodLabel: string;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [rows, setRows] = useState<PaymentStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/payment-methods', { params: { range, from: from || undefined, to: to || undefined } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? null));
  }, [range, from, to]);

  if (error || !rows) return null;

  const total = rows.reduce((acc, r) => acc + Number(r.totalBase), 0);

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-brand-950/70">Métodos de pago · {periodLabel}</p>
        <p className="text-xs font-light text-brand-950/45">Con qué te pagaron</p>
      </div>

      {rows.length === 0 && <p className="text-sm font-light text-brand-950/40">Sin cobros en este período.</p>}

      <div className="space-y-3">
        {rows.map((r) => {
          const share = total > 0 ? (Number(r.totalBase) / total) * 100 : 0;
          return (
            <div key={r.method}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-brand-950">
                  {PAYMENT_METHOD_LABELS[r.method] ?? r.method}
                  <span className="ml-1.5 text-xs font-normal text-brand-950/40">
                    {r.count} pedido{r.count === 1 ? '' : 's'}
                  </span>
                </p>
                <p className="text-sm font-semibold text-brand-950">
                  {formatBase(r.totalBase, symbol)} <span className="text-xs font-normal text-brand-950/40">{share.toFixed(1)}%</span>
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-brand-950/[0.06]">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Lista de todas las ventas del período (tarjetas "Ventas"/"Pedidos" de Estadísticas): cada fila abre el detalle completo. */
function SalesListPanel({
  title,
  sales,
  loading,
  symbol,
  onSelectSale,
  onClose,
}: {
  title: string;
  sales: UserSale[] | null;
  loading: boolean;
  symbol: string;
  onSelectSale: (sale: UserSale) => void;
  onClose: () => void;
}) {
  return (
    <InlinePanel title={title} onClose={onClose} closeLabel="← Volver">
      <div className="max-h-[60vh] overflow-y-auto space-y-1">
        {loading && <p className="text-sm text-brand-950/40 font-light py-2">Cargando ventas…</p>}
        {!loading && sales?.length === 0 && <p className="text-sm text-brand-950/40 font-light py-2">Sin ventas en este período.</p>}
        {!loading &&
          sales?.map((sale) => (
            <button
              key={sale.id}
              onClick={() => onSelectSale(sale)}
              className="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-950/[0.04]"
            >
              <div className="min-w-0">
                <p className="font-medium text-brand-950">
                  #{sale.orderNumber} · {sale.table ? sale.table : CHANNEL_ROW_LABELS[sale.channel]}
                </p>
                <p className="text-xs text-brand-950/40">
                  {new Date(sale.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                </p>
              </div>
              <p className="font-semibold text-brand-950 shrink-0">{formatBase(sale.totalBase, symbol)}</p>
            </button>
          ))}
      </div>
    </InlinePanel>
  );
}

/** Detalle de una venta del drill-down "Ventas por usuario": comanda completa + pagos con método/referencia. */
function SaleDetailPanel({ sale, symbol, onClose }: { sale: UserSale; symbol: string; onClose: () => void }) {
  return (
    <InlinePanel
      title={`Pedido #${sale.orderNumber} · ${sale.table ? sale.table : CHANNEL_ROW_LABELS[sale.channel]}`}
      onClose={onClose}
      closeLabel="← Volver"
    >
      <div className="space-y-4">
        <p className="text-xs text-brand-950/50 font-light">
          {new Date(sale.createdAt).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })}
          {sale.customerName && ` · ${sale.customerName}`}
        </p>

        <div>
          <p className="text-xs font-medium text-brand-950/60 mb-1.5">Comanda</p>
          <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
            {sale.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <p className="text-brand-950/80">
                  {item.quantity}× {item.productName}
                </p>
                <p className="font-medium text-brand-950 shrink-0">{formatBase(item.lineTotal, symbol)}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 px-1 pt-2 text-sm font-semibold text-brand-950">
            <p>Total</p>
            <p>
              {formatBase(sale.totalBase, symbol)} · {formatBsAbsolute(sale.totalBs)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-brand-950/60 mb-1.5">Pago{sale.payments.length === 1 ? '' : 's'}</p>
          {sale.payments.length === 0 ? (
            <p className="text-xs text-brand-950/40 font-light">
              Sin pago registrado{sale.paymentMethod ? ` (método: ${ALL_PAYMENT_LABELS[sale.paymentMethod as AnyPaymentMethod] ?? sale.paymentMethod})` : ''}.
            </p>
          ) : (
            <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
              {sale.payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-brand-950">{ALL_PAYMENT_LABELS[p.method as AnyPaymentMethod] ?? p.method}</p>
                    {p.referenceNumber && <p className="text-xs text-brand-950/40 truncate">Ref: {p.referenceNumber}</p>}
                    {Number(p.discountBase ?? 0) > 0 && (
                      <p className="text-xs text-brand-950/40">Descuento: {formatBase(p.discountBase!, symbol)}</p>
                    )}
                  </div>
                  <p className="font-semibold text-brand-950 shrink-0">{formatBase(p.amountBase, symbol)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </InlinePanel>
  );
}

// -----------------------------------------------------------------------------
//  Historial de pedidos + propinas
// -----------------------------------------------------------------------------

/** Panel con el listado detallado de pedidos que cumplen un filtro (drill-down desde Productos / Métodos de pago). */
function OrdersListPanel({
  title,
  params,
  highlightProductId,
  onClose,
}: {
  title: string;
  params: Record<string, string | number | undefined>;
  highlightProductId?: string | null;
  onClose: () => void;
}) {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/history', { params: { ...params, pageSize: 100 } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el detalle.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <InlinePanel title={title} onClose={onClose}>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-brand-950/10 p-3">
              <p className="text-lg font-semibold text-brand-950">{formatBase(result.totalBase, symbol)}</p>
              <p className="text-xs text-brand-950/50 font-light">
                {result.total} pedido{result.total === 1 ? '' : 's'}
              </p>
            </div>
            <div className="rounded-xl border border-brand-950/10 p-3">
              <p className="text-lg font-semibold text-brand-950">{formatBsAbsolute(result.totalBs)}</p>
              <p className="text-xs text-brand-950/50 font-light">En bolívares</p>
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/[0.06] max-h-96 overflow-y-auto">
          {result?.orders.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin movimientos.</p>}
          {result?.orders.map((o) => (
            <OrderDetailRow key={o.id} order={o} symbol={symbol} highlightProductId={highlightProductId} />
          ))}
        </div>
      </div>
    </InlinePanel>
  );
}

function HistoryTab() {
  return <OrderHistorySection />;
}

// -----------------------------------------------------------------------------
//  Reporte de productos
// -----------------------------------------------------------------------------

interface ProductReportRow {
  productId: string | null;
  name: string;
  quantity: number;
  revenueBase: string;
}

function ProductsTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<ProductReportRow[] | null>(null);
  const [order, setOrder] = useState<'desc' | 'asc'>('desc');
  const [error, setError] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<{ productId: string; name: string } | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/products', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el reporte.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const sorted = rows ? [...rows].sort((a, b) => (order === 'desc' ? b.quantity - a.quantity : a.quantity - b.quantity)) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <span className="w-px h-4 bg-brand-950/10 mx-1" />
        <button
          onClick={() => setOrder('desc')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${order === 'desc' ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
        >
          Más vendidos
        </button>
        <button
          onClick={() => setOrder('asc')}
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${order === 'asc' ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
        >
          Menos vendidos
        </button>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
        <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="w-5" />
          <span className="flex-1">Producto</span>
          <span className="w-24 text-right">Vendidos</span>
          <span className="w-20 text-right">Ingresos</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
        {sorted?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este rango.</p>}
        {sorted?.map((r, i) => (
          <div key={`${r.productId ?? 'x'}-${r.name}`} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs text-brand-950/30 font-medium w-5 shrink-0">{i + 1}</span>
              <p className="text-sm font-medium text-brand-950 truncate">{r.name}</p>
            </div>
            <div className="flex items-center gap-4 shrink-0 text-right">
              {r.productId ? (
                <button
                  onClick={() => setDetailProduct({ productId: r.productId!, name: r.name })}
                  className="text-sm text-brand-500 hover:text-brand-400 font-medium underline decoration-dotted underline-offset-2"
                >
                  {r.quantity} vendidos
                </button>
              ) : (
                <span className="text-sm text-brand-950/70">{r.quantity} vendidos</span>
              )}
              <span className="text-sm font-medium text-brand-950 w-20">{formatBase(r.revenueBase, symbol)}</span>
            </div>
          </div>
        ))}
        </div>
      </div>

      {detailProduct && (
        <OrdersListPanel
          title={`${detailProduct.name} · ${RANGE_LABELS[range]}`}
          params={{ productId: detailProduct.productId, range }}
          highlightProductId={detailProduct.productId}
          onClose={() => setDetailProduct(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Margen de utilidad: precio vs. costo (manual o desde receta) por producto
// -----------------------------------------------------------------------------

interface MarginSummary {
  revenueBase: string;
  costBase: string;
  marginBase: string;
  marginPercent: string;
}

interface MarginRow {
  id: string | null;
  name: string;
  categoryName: string;
  quantity: number;
  revenueBase: string;
  costBase: string;
  marginBase: string;
  marginPercent: string;
}

/** Margen de utilidad TOTAL de lo vendido en el período (no todo el catálogo) — día, semana,
 * mes, año o fecha exacta, mismo patrón de filtro que Resumen. */
function MarginTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState<MarginSummary | null>(null);
  const [rows, setRows] = useState<MarginRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const periodLabel = date ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_LABELS[range];

  useEffect(() => {
    api
      .get('/products/margin', { params: { range, date: date || undefined } })
      .then((res) => {
        setSummary(res.data.data.summary);
        setRows(res.data.data.rows);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el margen de utilidad.'));
  }, [range, date]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => {
              setRange(r);
              setDate('');
            }}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              !date && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border-none ${
            date ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
          }`}
        />
      </div>

      {summary && (
        <div className="grid sm:grid-cols-3 gap-4">
          <MetricCard icon={Wallet} title={`Ingresos · ${periodLabel}`} value={formatBase(summary.revenueBase, symbol)} />
          <MetricCard icon={Receipt} title="Costo de lo vendido" value={formatBase(summary.costBase, symbol)} />
          <MetricCard
            icon={TrendingUp}
            title="Margen de utilidad total"
            value={formatBase(summary.marginBase, symbol)}
            valueTone={Number(summary.marginBase) < 0 ? 'danger' : 'success'}
            trend={`${summary.marginPercent}% margen`}
          />
        </div>
      )}

      <p className="text-sm text-brand-950/60 font-light">
        Margen = ingreso − costo de lo vendido en el período. El costo viene del campo "Costo" del producto, o de su
        receta armada en Inventario → Recetas si eligió "Desde receta".
      </p>
      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
        <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="flex-1">Producto</span>
          <span className="w-52 text-right">Margen</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este período.</p>}
        {rows?.map((r) => (
          <div key={`${r.id ?? 'x'}-${r.name}`} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-brand-950 truncate">{r.name}</p>
              <p className="text-xs text-brand-950/40">
                {r.categoryName} · {r.quantity} vendidos · Ingreso {formatBase(r.revenueBase, symbol)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-sm font-semibold ${Number(r.marginBase) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {formatBase(r.marginBase, symbol)}
              </p>
              <p className={`text-xs font-light ${Number(r.marginBase) < 0 ? 'text-red-500' : 'text-brand-950/50'}`}>
                {r.marginPercent}% margen ·{' '}
                <span className={foodCostClass(r.marginPercent)}>{foodCostPercent(r.marginPercent)}% food cost</span>
              </p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

/** Food cost % = 100 − margen %, por definición (margen = precio − costo). Sin backend
 * nuevo: se deriva directo del mismo marginPercent que ya devuelve /products/margin. */
function foodCostPercent(marginPercent: string): string {
  return (100 - Number(marginPercent)).toFixed(1);
}
function foodCostClass(marginPercent: string): string {
  const fc = 100 - Number(marginPercent);
  return fc <= 35 ? 'text-emerald-600 font-medium ' : fc <= 45 ? 'text-amber-600 font-medium ' : 'text-red-600 font-medium ';
}

// -----------------------------------------------------------------------------
//  Métodos de pago: movimiento por método
// -----------------------------------------------------------------------------

interface PaymentStatsRow {
  method: string;
  count: number;
  totalBase: string;
  totalBs: string;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Punto de Venta',
  BINANCE: 'Binance',
  PAYPAL: 'PayPal',
  TRANSFER: 'Transferencia',
  // Solo aparece en datos viejos: hoy el método de pago es obligatorio al cobrar y al
  // registrar un gasto (salvo compras a crédito, que se saldan después).
  SIN_METODO: 'Sin registrar',
};

function PaymentsTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<PaymentStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailMethod, setDetailMethod] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/payment-methods', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento por método de pago.'));
  }, [range]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
        <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="flex-1">Método</span>
          <span className="w-32 text-right">Pedidos / Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin pedidos en este rango.</p>}
        {rows?.map((r) =>
          r.method === 'SIN_METODO' ? (
            <div key={r.method} className="flex items-center justify-between gap-3 px-5 py-4">
              <p className="font-medium text-brand-950">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</p>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
                <p className="text-xs text-brand-950/50 font-light">{r.count} pedidos</p>
              </div>
            </div>
          ) : (
            <button
              key={r.method}
              onClick={() => setDetailMethod(r.method)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-brand-950/[0.02] transition-colors"
            >
              <p className="font-medium text-brand-950">{PAYMENT_METHOD_LABELS[r.method] ?? r.method}</p>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-brand-950">{formatBase(r.totalBase, symbol)}</p>
                <p className="text-xs text-brand-950/50 font-light">{r.count} pedidos</p>
              </div>
            </button>
          ),
        )}
        </div>
      </div>

      {detailMethod && (
        <OrdersListPanel
          title={`${PAYMENT_METHOD_LABELS[detailMethod] ?? detailMethod} · ${RANGE_LABELS[range]}`}
          params={{ paymentMethod: detailMethod, range }}
          onClose={() => setDetailMethod(null)}
        />
      )}
    </div>
  );
}

