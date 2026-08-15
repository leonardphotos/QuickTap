import { useEffect, useState } from 'react';
import { ChevronDown, Clock, DollarSign, Plus, Receipt, Trash2, TrendingUp, Wallet } from 'lucide-react';
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
import { PayablesSection } from '@/components/admin/PayablesSection';
import { SuppliersSection } from '@/components/admin/SuppliersSection';
import { FiscalBooksSection } from '@/components/admin/FiscalBooksSection';
import { BankAccountsSection } from '@/components/admin/BankAccountsSection';
import { MovementsLedgerSection } from '@/components/admin/MovementsLedgerSection';
import { CrmHub } from '@/components/admin/crm/CrmHub';
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
  { id: 'history', label: 'Historial de pedidos', feature: 'accounting' },
  { id: 'products', label: 'Productos', feature: null },
  { id: 'margin', label: 'Margen de utilidad', feature: 'accounting' },
  { id: 'delivery', label: 'Delivery', feature: null },
  // Clientes con segmentos + promociones personalizadas con código canjeable.
  { id: 'crm', label: 'CRM', feature: 'crm' },
  { id: 'payments', label: 'Métodos de pago', feature: null },
  // Cuentas por pagar a PROVEEDORES (gastos a crédito + órdenes de pago) — no confundir con
  // la pestaña "Cuentas por pagar" de abajo, que son los CLIENTES que deben al restaurante.
  { id: 'paymentOrders', label: 'Órdenes de pago', feature: 'accounting' },
  { id: 'ledger', label: 'Contabilidad', feature: 'accounting' },
  { id: 'suppliers', label: 'Proveedores', feature: 'accounting' },
  { id: 'books', label: 'Libros fiscales', feature: 'accounting' },
  { id: 'banks', label: 'Cuentas bancarias', feature: 'accounting' },
  { id: 'payable', label: 'Cuentas por pagar', feature: 'accountsPayable' },
] as const satisfies readonly { id: string; label: string; feature: FeatureFlag | null }[];
type TabId = (typeof ALL_TABS)[number]['id'];

/** Administración: resumen, historial de pedidos, propinas y reporte de productos. Planes Pro/Premium.
 * Menú propio (`AdminSectionNav`, sidebar en escritorio) + todo desplegado en línea, sin ventanas
 * flotantes (`InlinePanel` en vez de `Dialog` para abrir/cerrar caja, reportes, ingresos y detalle). */
export default function AdministrationPage() {
  const { restaurant } = useAuth();
  const canAccountsPayable = hasFeature(restaurant, 'accountsPayable');
  const [payableCount, setPayableCount] = useState<number | null>(null);
  const TABS = ALL_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    badge: t.id === 'payable' && canAccountsPayable ? (payableCount ?? undefined) : undefined,
    locked: t.feature != null && !hasFeature(restaurant, t.feature),
  }));
  const [tab, setTab] = useState<TabId>('summary');
  const [showReport, setShowReport] = useState(false);
  const activeTab = ALL_TABS.find((t) => t.id === tab)!;
  const tabLocked = activeTab.feature != null && !hasFeature(restaurant, activeTab.feature);

  useEffect(() => {
    if (!canAccountsPayable) return;
    api
      .get('/orders/live')
      .then((res) => setPayableCount((res.data.data as { awaitingPayment: boolean }[]).filter((o) => o.awaitingPayment).length))
      .catch(() => setPayableCount(null));
  }, [canAccountsPayable]);

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
          {!tabLocked && tab === 'history' && <HistoryTab />}
          {!tabLocked && tab === 'products' && <ProductsTab />}
          {!tabLocked && tab === 'margin' && <MarginTab />}
          {!tabLocked && tab === 'delivery' && <DeliveryTab />}
          {!tabLocked && tab === 'crm' && <CrmHub />}
          {!tabLocked && tab === 'payments' && <PaymentsTab />}
          {!tabLocked && tab === 'paymentOrders' && <PayablesSection />}
          {!tabLocked && tab === 'ledger' && <MovementsLedgerSection />}
          {!tabLocked && tab === 'suppliers' && <SuppliersSection />}
          {!tabLocked && tab === 'books' && <FiscalBooksSection />}
          {!tabLocked && tab === 'banks' && <BankAccountsSection symbol={restaurant?.currencySymbol ?? '$'} />}
          {!tabLocked && tab === 'payable' && <PayableTab />}
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
  ordersCount: number;
  totalBase: string;
  totalBs: string;
  previousTotalBase: string;
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

/** Ventas por usuario/período: 3 vistas en línea, nunca superpuestas — `stats` (tarjetas + lista
 * por usuario), `allSales` (todas las ventas del período) y `saleDetail` (comanda + pagos de una
 * venta). Antes `allSales` y `saleDetail` eran diálogos flotantes que podían estar abiertos los
 * DOS a la vez (uno tapaba al otro); ahora es una sola vista visible, y "← Volver" desde el
 * detalle regresa a `allSales` o a `stats` según de dónde vino la venta seleccionada. */
function StatsTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<'week' | 'month'>('week');
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

  useEffect(() => {
    api
      .get('/orders/reports/sales-stats', { params: { range } })
      .then((res) => setStats(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las estadísticas.'));
  }, [range]);

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
      .get(`/orders/reports/sales-stats/user/${userId}`, { params: { range } })
      .then((res) => setUserSales(res.data.data))
      .finally(() => setLoadingSales(false));
  }

  function openAllSales() {
    setView('allSales');
    setAllSales(null);
    setLoadingAllSales(true);
    api
      .get('/orders/reports/sales-stats/user/ALL', { params: { range } })
      .then((res) => setAllSales(res.data.data))
      .finally(() => setLoadingAllSales(false));
  }

  function openSaleDetail(sale: UserSale, from: 'stats' | 'allSales') {
    setSelectedSale(sale);
    setSaleDetailFrom(from);
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
        title={`Ventas · ${stats ? STATS_RANGE_LABELS[stats.range] : ''}`}
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
      <div className="flex flex-wrap gap-2">
        {(['week', 'month'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {STATS_RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {stats && (
        <div className="grid sm:grid-cols-3 gap-4">
          <MetricCard
            icon={Wallet}
            title={`Ventas · ${STATS_RANGE_LABELS[stats.range]}`}
            value={formatBsAbsolute(stats.totalBs)}
            caption={formatBase(stats.totalBase, symbol)}
            onClick={openAllSales}
          />
          <MetricCard
            icon={Receipt}
            title={`Pedidos · ${STATS_RANGE_LABELS[stats.range]}`}
            value={String(stats.ordersCount)}
            onClick={openAllSales}
          />
          {stats.changePercent == null ? (
            <MetricCard icon={TrendingUp} title="Cambio" caption={`Sin datos de ${STATS_PREVIOUS_LABELS[stats.range]}.`} value="—" />
          ) : (
            <MetricCard
              icon={TrendingUp}
              title="Cambio"
              value={`${changeUp ? '+' : ''}${stats.changePercent}%`}
              valueTone={changeUp ? 'success' : 'danger'}
              trend={`vs. ${STATS_PREVIOUS_LABELS[stats.range]} (${formatBase(stats.previousTotalBase, symbol)})`}
            />
          )}
        </div>
      )}

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
                              #{sale.orderNumber} · {sale.table ? `Mesa ${sale.table}` : CHANNEL_ROW_LABELS[sale.channel]}
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
                  #{sale.orderNumber} · {sale.table ? `Mesa ${sale.table}` : CHANNEL_ROW_LABELS[sale.channel]}
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
      title={`Pedido #${sale.orderNumber} · ${sale.table ? `Mesa ${sale.table}` : CHANNEL_ROW_LABELS[sale.channel]}`}
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

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
type Channel = 'DINE_IN' | 'DELIVERY' | 'PICKUP' | 'BAR';
type PaymentMethod = 'MOBILE_PAYMENT' | 'ZELLE' | 'CASH' | 'CARD';

const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };
const CHANNEL_ROW_LABELS: Record<Channel, string> = { DINE_IN: 'Mesa', DELIVERY: 'Delivery', PICKUP: 'Pickup', BAR: 'Barra' };
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  MOBILE_PAYMENT: 'Pago Móvil',
  ZELLE: 'Zelle',
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
};

interface HistoryOrderItem {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

interface HistoryOrderPayment {
  method: string;
  referenceNumber: string | null;
  amountBase: string;
  discountBase: string | null;
  createdAt: string;
}

interface HistoryOrder {
  id: string;
  orderNumber: number;
  channel: Channel;
  status: string;
  paymentMethod: PaymentMethod | null;
  subtotalBase: string;
  serviceChargeBase: string;
  ivaBase: string;
  deliveryFeeBase: string;
  totalBase: string;
  totalBs: string;
  tipBase: string;
  currency: string;
  customerName: string | null;
  placedByName: string | null;
  table: string | null;
  createdAt: string;
  items: HistoryOrderItem[];
  payments: HistoryOrderPayment[];
}

interface HistoryResult {
  total: number;
  page: number;
  pageSize: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
  orders: HistoryOrder[];
}

/** Fila expandible de una venta: resumen + detalle completo (productos, IVA, servicio, envío). */
function OrderDetailRow({
  order,
  symbol,
  highlightProductId,
}: {
  order: HistoryOrder;
  symbol: string;
  highlightProductId?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const highlightItem = highlightProductId ? order.items.find((i) => i.productId === highlightProductId) : null;

  return (
    <div className="px-5 py-3">
      <button onClick={() => setExpanded((e) => !e)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-950">
            #{order.orderNumber}
            {order.customerName && <span className="font-normal text-brand-950/60"> · {order.customerName}</span>}
          </p>
          <p className="text-xs text-brand-950/40">
            {CHANNEL_ROW_LABELS[order.channel]}
            {order.table && ` ${order.table}`} · {new Date(order.createdAt).toLocaleString('es-VE')}
            {highlightItem && ` · ${highlightItem.quantity}x`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-brand-950">{formatBase(order.totalBase, symbol)}</span>
          <ChevronDown className={`h-4 w-4 text-brand-950/30 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 border-t border-brand-950/10 pt-3">
          <ul className="space-y-1">
            {order.items.map((it, idx) => (
              <li
                key={idx}
                className={`flex justify-between gap-2 text-xs ${
                  it.productId && it.productId === highlightProductId ? 'text-brand-500 font-medium' : 'text-brand-950/70'
                }`}
              >
                <span className="truncate">
                  {it.quantity}x {it.productName} · {formatBase(it.unitPrice, symbol)} c/u
                </span>
                <span className="shrink-0">{formatBase(it.lineTotal, symbol)}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-brand-950/60 space-y-1 pt-2 border-t border-brand-950/10">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatBase(order.subtotalBase, symbol)}</span>
            </div>
            {Number(order.serviceChargeBase) > 0 && (
              <div className="flex justify-between">
                <span>Servicio</span>
                <span>{formatBase(order.serviceChargeBase, symbol)}</span>
              </div>
            )}
            {Number(order.ivaBase) > 0 && (
              <div className="flex justify-between">
                <span>IVA</span>
                <span>{formatBase(order.ivaBase, symbol)}</span>
              </div>
            )}
            {Number(order.deliveryFeeBase) > 0 && (
              <div className="flex justify-between">
                <span>Envío</span>
                <span>{formatBase(order.deliveryFeeBase, symbol)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-brand-950">
              <span>Total</span>
              <span>{formatBase(order.totalBase, symbol)}</span>
            </div>
            <div className="flex justify-between">
              <span>Equivalente en Bs</span>
              <span>{formatBsAbsolute(order.totalBs)}</span>
            </div>
          </div>
          {order.payments.length > 0 ? (
            <div className="pt-1 space-y-1">
              {order.payments.map((p, i) => (
                <p key={i} className="text-xs text-brand-950/50">
                  {ALL_PAYMENT_LABELS[p.method as AnyPaymentMethod] ?? p.method}
                  {p.referenceNumber && ` · Ref: ${p.referenceNumber}`}
                  {order.payments.length > 1 && ` · ${formatBase(p.amountBase, symbol)}`}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-brand-950/40">
              {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod : 'Sin método de pago registrado'}
            </p>
          )}
          {order.placedByName && <p className="text-xs text-brand-950/40">Mesero: {order.placedByName}</p>}
        </div>
      )}
    </div>
  );
}

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
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('day');
  const [channel, setChannel] = useState<Channel | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [placedBy, setPlacedBy] = useState<'staff' | 'customer' | ''>('');
  const [waiterId, setWaiterId] = useState('');
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTip, setEditingTip] = useState<string | null>(null);
  const [tipDraft, setTipDraft] = useState('');

  useEffect(() => {
    api.get('/orders/waiters').then((res) => setWaiters(res.data.data));
  }, []);

  function load() {
    api
      .get('/orders/history', {
        params: {
          range,
          channel: channel || undefined,
          paymentMethod: paymentMethod || undefined,
          placedBy: placedBy || undefined,
          placedByUserId: waiterId || undefined,
          page,
        },
      })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el historial.'));
  }

  useEffect(load, [range, channel, paymentMethod, placedBy, waiterId, page]);
  useEffect(() => setPage(1), [range, channel, paymentMethod, placedBy, waiterId]);

  async function saveTip(orderId: string) {
    try {
      await api.patch(`/orders/${orderId}/tip`, { tipBase: Number(tipDraft) || 0 });
      setEditingTip(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar la propina.');
    }
  }

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

      <div className="flex flex-wrap gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel | '')} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
          <option value="">Todos los canales</option>
          <option value="DINE_IN">En mesa</option>
          <option value="BAR">Barra</option>
          <option value="DELIVERY">Delivery</option>
          <option value="PICKUP">Pickup</option>
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
          <option value="">Todos los métodos de pago</option>
          {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((p) => (
            <option key={p} value={p}>
              {PAYMENT_LABELS[p]}
            </option>
          ))}
        </select>
        {(channel === 'DINE_IN' || channel === '') && (
          <select value={placedBy} onChange={(e) => setPlacedBy(e.target.value as 'staff' | 'customer' | '')} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
            <option value="">Mesa: cliente o mesero</option>
            <option value="customer">Solo pedido por el cliente</option>
            <option value="staff">Solo cargado por un mesero</option>
          </select>
        )}
        {waiters.length > 0 && (
          <select value={waiterId} onChange={(e) => setWaiterId(e.target.value)} className="text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5">
            <option value="">Mesero: todos</option>
            {waiters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {result && (
        <div className="grid sm:grid-cols-4 gap-4">
          <MetricCard icon={Wallet} title="Ingresos en Bs" value={formatBsAbsolute(result.totalBs)} />
          <MetricCard icon={DollarSign} title={`Ingresos en ${symbol}`} value={formatBase(result.totalBase, symbol)} />
          <MetricCard icon={Receipt} title="Propinas" value={formatBase(result.totalTipBase, symbol)} />
          <MetricCard icon={Receipt} title="Pedidos" value={String(result.total)} />
        </div>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-x-auto">
        <div className="flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40 min-w-[560px]">
          <span className="w-16 shrink-0">Pedido</span>
          <span className="w-24 shrink-0">Canal</span>
          <span className="w-28 shrink-0">Mesero / Pago</span>
          <span className="w-28 shrink-0">Total</span>
          <span className="w-28 shrink-0">Propina</span>
          <span className="flex-1 text-right">Fecha</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
        {result?.orders.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin pedidos en este filtro.</p>}
        {result?.orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm min-w-[560px]">
            <div className="w-16 shrink-0 font-medium text-brand-950">#{o.orderNumber}</div>
            <div className="w-24 shrink-0 text-brand-950/60">{CHANNEL_ROW_LABELS[o.channel]}</div>
            <div className="w-28 shrink-0 text-brand-950/60">
              {o.channel === 'DINE_IN' ? (o.placedByName ? `Mesero: ${o.placedByName}` : 'Cliente') : (o.paymentMethod ? PAYMENT_LABELS[o.paymentMethod] : '—')}
            </div>
            <div className="w-28 shrink-0 text-brand-950">{formatBsAbsolute(o.totalBs)}</div>
            <div className="w-28 shrink-0">
              {editingTip === o.id ? (
                <div className="flex items-center gap-1">
                  <input
                    autoFocus
                    value={tipDraft}
                    onChange={(e) => setTipDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="w-16 border border-brand-950/15 rounded px-1.5 py-0.5 text-xs"
                  />
                  <button onClick={() => saveTip(o.id)} className="text-xs text-brand-500 font-medium">
                    Guardar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingTip(o.id);
                    setTipDraft(o.tipBase);
                  }}
                  className="text-brand-950/60 hover:text-brand-500"
                >
                  {formatBase(o.tipBase, symbol)} ✎
                </button>
              )}
            </div>
            <div className="flex-1 text-right text-xs text-brand-950/40">{new Date(o.createdAt).toLocaleString('es-VE')}</div>
          </div>
        ))}
        </div>
      </div>

      {result && result.total > result.pageSize && (
        <div className="flex items-center justify-center gap-3">
          <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </TextureButton>
          <span className="text-xs text-brand-950/50">
            Página {result.page} de {Math.ceil(result.total / result.pageSize)}
          </span>
          <TextureButton
            variant="minimal"
            size="sm"
            className="!w-auto"
            disabled={page >= Math.ceil(result.total / result.pageSize)}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </TextureButton>
        </div>
      )}
    </div>
  );
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
//  Delivery: movimiento por repartidor
// -----------------------------------------------------------------------------

interface CourierStatsRow {
  courierId: string;
  name: string;
  whatsappPhone: string;
  isActive: boolean;
  deliveries: number;
  totalBase: string;
  totalBs: string;
  totalTipBase: string;
}

function DeliveryTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [rows, setRows] = useState<CourierStatsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/reports/couriers', { params: { range } })
      .then((res) => setRows(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el movimiento de delivery.'));
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
          <span className="flex-1">Repartidor</span>
          <span className="w-40 text-right">Entregas / Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
        {rows?.length === 0 && (
          <p className="p-5 text-sm text-brand-950/40 font-light">
            Agrega repartidores en Ajustes → Equipo de Delivery para ver su movimiento aquí.
          </p>
        )}
        {rows?.map((r) => (
          <div key={r.courierId} className="flex items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium text-brand-950 flex items-center gap-1.5">
                {r.name}
                {!r.isActive && <span className="text-xs text-brand-950/40 font-light">(inactivo)</span>}
              </p>
              <p className="text-xs text-brand-950/40 font-light">{r.whatsappPhone}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-brand-950">{r.deliveries} entregas</p>
              <p className="text-xs text-brand-950/50 font-light">
                {formatBase(r.totalBase, symbol)}
                {Number(r.totalTipBase) > 0 && ` · propinas ${formatBase(r.totalTipBase, symbol)}`}
              </p>
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
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
  SIN_METODO: 'Sin especificar',
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

// -----------------------------------------------------------------------------
//  Cuentas por pagar: cuentas abiertas marcadas con el botón del reloj en Pedidos
// -----------------------------------------------------------------------------

interface PayableOrder {
  id: string;
  orderNumber: number;
  channel: Channel;
  customerName: string | null;
  totalBase: string;
  totalBs: string;
  currency: string;
  createdAt: string;
}

function PayableTab() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [orders, setOrders] = useState<PayableOrder[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get('/orders/live')
      .then((res) => setOrders((res.data.data as (PayableOrder & { awaitingPayment: boolean })[]).filter((o) => o.awaitingPayment)))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar las cuentas por pagar.'));
  }

  useEffect(load, []);

  async function markPaid(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/orders/${id}/status`, { status: 'SERVED' });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo marcar como pagado.');
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <MetricCard
        icon={Clock}
        title="Cuentas por pagar"
        value={String(orders?.length ?? 0)}
        caption="cuentas abiertas esperando pago"
        highlighted={!!orders?.length}
      />
      <p className="text-sm text-brand-950/60 font-light">
        Cuentas abiertas marcadas con el botón del reloj en Pedidos, esperando a que el cliente pague.
      </p>
      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm overflow-hidden">
        <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="flex-1">Pedido</span>
          <span className="w-28">Total</span>
          <span className="w-32 text-right">Acción</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {orders?.length === 0 && (
            <p className="p-5 text-sm text-brand-950/40 font-light">No hay cuentas pendientes por pagar.</p>
          )}
          {orders?.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 truncate">
                    #{o.orderNumber}
                    {o.customerName && <span className="font-normal text-brand-950/60"> · {o.customerName}</span>}
                  </p>
                  <p className="text-xs text-brand-950/40 font-light">
                    {CHANNEL_ROW_LABELS[o.channel]} · {new Date(o.createdAt).toLocaleString('es-VE')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-semibold text-brand-950">{formatBase(o.totalBase, symbol)}</span>
                <TextureButton
                  variant="brand"
                  size="sm"
                  className="!w-auto"
                  disabled={busyId === o.id}
                  onClick={() => markPaid(o.id)}
                >
                  Marcar pagado
                </TextureButton>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
