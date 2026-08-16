import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { CATEGORY_LABELS } from '@/components/admin/ExpenseFormDialog';

type Range = 'month' | 'year' | 'week' | 'day' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Esta semana', month: 'Este mes', year: 'Este año', all: 'Histórico' };
const TAX_KEY = 'qt-islr-rate';

interface IncomeStatement {
  period: { label: string };
  ordersCount: number;
  revenue: { sales: string; serviceCharge: string; total: string };
  costOfSales: { amount: string; basis: 'PRODUCT_COST' | 'SUPPLIES'; suppliesPurchases: string; productCost: string };
  grossProfit: { amount: string; marginPercent: string | null };
  operatingExpenses: {
    personnel: string;
    selling: string;
    administrative: string;
    administrativeBreakdown: { category: string; amountBase: string }[];
    total: string;
  };
  operatingResult: { amount: string; marginPercent: string | null };
  otherIncome: string;
  resultBeforeTax: string;
  incomeTax: { ratePercent: number; amount: string };
  netResult: { amount: string; marginPercent: string | null };
  memo: { ivaCollected: string; tipsCollected: string; debtCollections: string; ivaEnabled: boolean };
}

interface BalanceSheet {
  asOf: string;
  exchangeRateBs: string | null;
  assets: {
    current: {
      cash: { amount: string; accounts: { id: string; name: string; currency: 'BASE' | 'BS'; balance: string; balanceBase: string; kind: string }[] };
      receivables: { amount: string; ordersCount: number };
      inventory: string;
      ivaReceivable: string;
      total: string;
    };
    nonCurrent: { total: string; note: string };
    total: string;
  };
  liabilities: {
    current: { payables: { amount: string; count: number }; ivaPayable: string; incomeTaxPayable: { amount: string; ratePercent: number }; total: string };
    nonCurrent: { total: string };
    total: string;
  };
  equity: { periodResult: string; retained: string; total: string };
  checks: { balanced: boolean };
}

function useTaxRate() {
  const [rate, setRate] = useState(() => localStorage.getItem(TAX_KEY) ?? '34');
  const update = (v: string) => {
    setRate(v);
    localStorage.setItem(TAX_KEY, v);
  };
  return [rate, update] as const;
}

/**
 * Estado de resultados con la estructura de las NIIF (NIC 1, gastos por función): ingresos
 * ordinarios → costo de ventas → utilidad bruta → gastos de personal / ventas / administración
 * → resultado operativo → otros ingresos → resultado antes de ISLR → ISLR estimado → neto.
 * Todo sale de lo que ya registra QuickTap; el backend documenta cada criterio.
 */
export function IncomeStatementSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [range, setRange] = useState<Range>('month');
  const [taxRate, setTaxRate] = useTaxRate();
  const [data, setData] = useState<IncomeStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    api
      .get('/accounting/income-statement', { params: { range, taxRate: Number(taxRate) || 0 } })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el estado de resultados.'));
  }, [range, taxRate]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const m = (v: string) => formatBase(v, symbol);
  const neg = (v: string) => Number(v) < 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['month', 'year', 'week', 'day', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'}`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-brand-950/60">
          ISLR estimado
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            className="w-16 rounded-lg border border-brand-950/15 px-2 py-1 text-right text-sm font-semibold text-brand-950"
          />
          %
        </label>
      </div>

      {!data ? (
        <p className="text-sm font-light text-brand-950/40">Calculando…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
          <div className="border-b border-brand-950/[0.06] px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-950/40">Estado de resultados · NIIF (por función)</p>
            <p className="text-lg font-semibold text-brand-950">{restaurant?.name}</p>
            <p className="text-xs text-brand-950/50">
              {data.period.label} · {data.ordersCount} pedido{data.ordersCount === 1 ? '' : 's'} · cifras en {symbol}
            </p>
          </div>
          <dl className="divide-y divide-brand-950/[0.05] text-sm">
            <Line label="Ingresos de actividades ordinarias" value={m(data.revenue.total)} strong />
            <Line label="Ventas (base imponible, sin IVA)" value={m(data.revenue.sales)} sub />
            {Number(data.revenue.serviceCharge) > 0 && <Line label="Recargo por servicio" value={m(data.revenue.serviceCharge)} sub />}
            <Line
              label="Costo de ventas"
              hint={data.costOfSales.basis === 'PRODUCT_COST' ? 'Costo vivo de lo vendido (receta / costo del producto)' : 'Compras de insumos del período (no hay costos cargados en los productos)'}
              value={`(${m(data.costOfSales.amount)})`}
            />
            <Line label="Utilidad bruta" value={m(data.grossProfit.amount)} pctLabel={data.grossProfit.marginPercent} strong tone={neg(data.grossProfit.amount) ? 'danger' : undefined} />
            <Line label="Gastos de personal (Desarrollo Humano)" value={`(${m(data.operatingExpenses.personnel)})`} />
            <Line label="Gastos de ventas y distribución" value={`(${m(data.operatingExpenses.selling)})`} />
            <Line
              label="Gastos de administración"
              value={`(${m(data.operatingExpenses.administrative)})`}
              onToggle={data.operatingExpenses.administrativeBreakdown.length > 0 ? () => setShowAdmin((s) => !s) : undefined}
              toggled={showAdmin}
            />
            {showAdmin &&
              data.operatingExpenses.administrativeBreakdown.map((b) => (
                <Line key={b.category} label={CATEGORY_LABELS[b.category as keyof typeof CATEGORY_LABELS] ?? b.category} value={m(b.amountBase)} sub />
              ))}
            <Line label="Resultado de operación" value={m(data.operatingResult.amount)} pctLabel={data.operatingResult.marginPercent} strong tone={neg(data.operatingResult.amount) ? 'danger' : 'success'} />
            <Line label="Otros ingresos" value={m(data.otherIncome)} />
            <Line label="Resultado antes de impuesto sobre la renta" value={m(data.resultBeforeTax)} strong tone={neg(data.resultBeforeTax) ? 'danger' : undefined} />
            <Line label={`Impuesto sobre la renta estimado (${data.incomeTax.ratePercent}%)`} value={`(${m(data.incomeTax.amount)})`} />
            <Line label="Resultado neto del período" value={m(data.netResult.amount)} pctLabel={data.netResult.marginPercent} strong big tone={neg(data.netResult.amount) ? 'danger' : 'success'} />
          </dl>
          <div className="border-t border-brand-950/[0.06] bg-brand-50/40 px-5 py-3 text-[11px] text-brand-950/55">
            <p className="mb-1 flex items-center gap-1 font-medium text-brand-950/70">
              <Info className="h-3 w-3" /> Memorando (no son ingresos del negocio)
            </p>
            <p>
              IVA cobrado {m(data.memo.ivaCollected)} (pasivo) · Propinas {m(data.memo.tipsCollected)} (del personal) · Cobros de deudas {m(data.memo.debtCollections)}{' '}
              (la venta ya se reconoció) · Compras de insumos {m(data.costOfSales.suppliesPurchases)}
              {data.costOfSales.basis === 'PRODUCT_COST' ? ' (van a inventario, no a gastos)' : ''}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Estado de situación financiera (NIC 1): activos corrientes / no corrientes, pasivos
 * corrientes / no corrientes y patrimonio, a la fecha de hoy. Efectivo = cuentas bancarias
 * (las de Bs a la tasa vigente); cuentas por cobrar = pedidos/fiados sin cobrar; inventario al
 * costo; cuentas por pagar = compras a crédito sin pagar; IVA del mes (débito − crédito);
 * ISLR estimado del ejercicio. El patrimonio es el residual (activo − pasivo).
 */
export function BalanceSheetSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [taxRate] = useTaxRate();
  const [data, setData] = useState<BalanceSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);

  useEffect(() => {
    api
      .get('/accounting/balance-sheet', { params: { taxRate: Number(taxRate) || 0 } })
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el estado de situación financiera.'));
  }, [taxRate]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm font-light text-brand-950/40">Calculando…</p>;

  const m = (v: string) => formatBase(v, symbol);
  const a = data.assets;
  const l = data.liabilities;

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-950/10 bg-white shadow-sm">
      <div className="border-b border-brand-950/[0.06] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-950/40">Estado de situación financiera · NIIF</p>
        <p className="text-lg font-semibold text-brand-950">{restaurant?.name}</p>
        <p className="text-xs text-brand-950/50">
          Al {new Date(data.asOf).toLocaleDateString('es-VE', { dateStyle: 'long' })} · cifras en {symbol}
          {data.exchangeRateBs && ` · tasa Bs ${data.exchangeRateBs}`}
        </p>
      </div>

      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-brand-950/[0.06]">
        <dl className="divide-y divide-brand-950/[0.05] text-sm">
          <Header label="Activo" />
          <Line label="Activo corriente" value={m(a.current.total)} strong />
          <Line
            label="Efectivo y equivalentes de efectivo"
            value={m(a.current.cash.amount)}
            sub
            onToggle={a.current.cash.accounts.length > 0 ? () => setShowAccounts((s) => !s) : undefined}
            toggled={showAccounts}
          />
          {showAccounts &&
            a.current.cash.accounts.map((acc) => (
              <Line
                key={acc.id}
                label={`${acc.name}${acc.kind === 'VAULT' ? ' (bóveda)' : acc.kind === 'PETTY_CASH' ? ' (caja chica)' : ''}${acc.currency === 'BS' ? ` · Bs ${Number(acc.balance).toLocaleString('es-VE', { minimumFractionDigits: 2 })}` : ''}`}
                value={m(acc.balanceBase)}
                sub
                deeper
              />
            ))}
          <Line label={`Cuentas por cobrar comerciales${a.current.receivables.ordersCount ? ` (${a.current.receivables.ordersCount})` : ''}`} value={m(a.current.receivables.amount)} sub />
          <Line label="Inventarios (al costo)" value={m(a.current.inventory)} sub />
          {Number(a.current.ivaReceivable) > 0 && <Line label="IVA crédito fiscal a favor" value={m(a.current.ivaReceivable)} sub />}
          <Line label="Activo no corriente" value={m(a.nonCurrent.total)} strong hint={a.nonCurrent.note} />
          <Line label="Total activo" value={m(a.total)} strong big />
        </dl>
        <dl className="divide-y divide-brand-950/[0.05] text-sm">
          <Header label="Pasivo y patrimonio" />
          <Line label="Pasivo corriente" value={m(l.current.total)} strong />
          <Line label={`Cuentas por pagar comerciales${l.current.payables.count ? ` (${l.current.payables.count})` : ''}`} value={m(l.current.payables.amount)} sub />
          <Line label="IVA por pagar (débito − crédito del mes)" value={m(l.current.ivaPayable)} sub />
          <Line label={`Impuesto sobre la renta estimado (${l.current.incomeTaxPayable.ratePercent}% del ejercicio)`} value={m(l.current.incomeTaxPayable.amount)} sub />
          <Line label="Pasivo no corriente" value={m(l.nonCurrent.total)} strong />
          <Line label="Total pasivo" value={m(l.total)} strong />
          <Line label="Patrimonio" value={m(data.equity.total)} strong tone={Number(data.equity.total) < 0 ? 'danger' : undefined} />
          <Line label="Resultado del ejercicio (año en curso)" value={m(data.equity.periodResult)} sub tone={Number(data.equity.periodResult) < 0 ? 'danger' : 'success'} />
          <Line label="Capital y resultados acumulados" value={m(data.equity.retained)} sub />
          <Line label="Total pasivo y patrimonio" value={m(String(Number(l.total) + Number(data.equity.total)))} strong big />
        </dl>
      </div>
      <div className="border-t border-brand-950/[0.06] bg-brand-50/40 px-5 py-3 text-[11px] text-brand-950/55">
        <p className="flex items-center gap-1">
          <Info className="h-3 w-3" />
          {data.checks.balanced ? 'Activo = Pasivo + Patrimonio ✓' : 'Descuadre de redondeo'} · Estado de gestión: no incluye activos fijos ni depreciación (no se registran en QuickTap). El patrimonio es el residual.
        </p>
      </div>
    </div>
  );
}

function Header({ label }: { label: string }) {
  return (
    <div className="bg-brand-950/[0.03] px-5 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-950/50">{label}</p>
    </div>
  );
}

function Line({
  label,
  value,
  pctLabel,
  hint,
  strong,
  big,
  sub,
  deeper,
  tone,
  onToggle,
  toggled,
}: {
  label: string;
  value: string;
  pctLabel?: string | null;
  hint?: string;
  strong?: boolean;
  big?: boolean;
  sub?: boolean;
  deeper?: boolean;
  tone?: 'success' | 'danger';
  onToggle?: () => void;
  toggled?: boolean;
}) {
  const color = tone === 'danger' ? 'text-red-600' : tone === 'success' ? 'text-emerald-600' : 'text-brand-950';
  const content = (
    <>
      <dt className={`min-w-0 ${sub ? (deeper ? 'pl-10' : 'pl-5') : ''} ${strong ? 'font-semibold text-brand-950' : sub ? 'text-brand-950/60' : 'text-brand-950/80'}`}>
        <span className="block truncate">{label}</span>
        {hint && <span className="block text-[11px] font-light text-brand-950/40">{hint}</span>}
      </dt>
      <dd className={`flex shrink-0 items-baseline gap-2 tabular-nums ${strong ? `font-semibold ${color}` : sub ? 'text-brand-950/70' : 'text-brand-950'} ${big ? 'text-base' : ''}`}>
        {pctLabel != null && <span className="text-[11px] font-normal text-brand-950/40">{pctLabel}%</span>}
        <span>{value}</span>
      </dd>
    </>
  );
  if (onToggle) {
    return (
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-brand-950/[0.02]" aria-expanded={toggled}>
        {content}
      </button>
    );
  }
  return <div className="flex items-center justify-between gap-3 px-5 py-2.5">{content}</div>;
}
