import { useEffect, useState } from 'react';
import { BookOpen, Receipt, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { MetricCard } from './MetricCard';
import { CATEGORY_LABELS, DOCUMENT_TYPE_LABELS, type ExpenseCategory, type ExpenseDocumentType } from './ExpenseFormDialog';
import { PAYMENT_LABELS } from './PaymentDialog';
import type { PaymentMethod } from '@/types';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

interface PurchaseRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: ExpenseCategory | null;
  documentType: ExpenseDocumentType | null;
  referenceNumber: string | null;
  supplier: { id: string; name: string; taxId: string | null } | null;
  expenseDate: string | null;
  createdAt: string;
}

interface SaleRow {
  id: string;
  orderNumber: number;
  channel: string;
  paymentMethod: string | null;
  subtotalBase: string;
  ivaBase: string;
  totalBase: string;
  totalBs: string;
  customerName: string | null;
  createdAt: string;
}

interface SalesResult {
  total: number;
  pageSize: number;
  totalBase: string;
  totalBs: string;
  orders: SaleRow[];
}

/**
 * Libros de compras y de ventas: el resumen fiscal del período — cada compra con su proveedor/
 * RIF/nº de factura/tipo de documento y cada venta con su desglose de IVA — filtrado por fecha
 * y resumido por categoría. Compartido por los tres verticales.
 */
export function FiscalBooksSection({ only }: { only?: 'compras' | 'ventas' } = {}) {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [book, setBook] = useState<'compras' | 'ventas'>(only ?? 'compras');
  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');

  const periodLabel = date ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_LABELS[range];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Con `only` (ej. el módulo Compras muestra solo el libro de compras) no hay conmutador. */}
        {!only && (
        <div className="flex items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {(['compras', 'ventas'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBook(b)}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                book === b ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {b === 'compras' ? 'Libro de compras' : 'Libro de ventas'}
            </button>
          ))}
        </div>
        )}
        {!only && <span className="w-px h-4 bg-brand-950/10 mx-1" />}
        {(['day', 'week', 'month', 'year', 'all'] as Range[]).map((r) => (
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

      {book === 'compras' ? (
        <PurchasesBook symbol={symbol} range={range} date={date} periodLabel={periodLabel} />
      ) : restaurant?.businessType === 'SHOP' ? (
        <ShopSalesBook symbol={symbol} range={range} date={date} periodLabel={periodLabel} />
      ) : (
        <SalesBook symbol={symbol} range={range} date={date} periodLabel={periodLabel} />
      )}
    </div>
  );
}

/** Ventana de fechas local (medianoche a medianoche) para filtrar en el cliente lo que el
 * backend de Locales devuelve completo (/shop/state trae todas las ventas). */
function rangeWindow(range: Range, date: string): { from: Date | null; to: Date | null } {
  if (date) {
    const from = new Date(`${date}T00:00:00`);
    return { from, to: new Date(from.getTime() + 86400000) };
  }
  if (range === 'all') return { from: null, to: null };
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  if (range === 'week') from.setDate(from.getDate() - from.getDay() + 1); // lunes
  if (range === 'month') from.setDate(1);
  if (range === 'year') {
    from.setMonth(0);
    from.setDate(1);
  }
  return { from, to: null };
}

interface ShopSaleRow {
  id: string;
  total: number;
  time: string;
  customerName: string | null;
  paymentMethod: string | null;
  returned: boolean;
  creditTerms: string | null;
}

/** Libro de ventas de Locales: sale del POS propio (ShopSale), no del sistema de pedidos. */
function ShopSalesBook({ symbol, range, date, periodLabel }: { symbol: string; range: Range; date: string; periodLabel: string }) {
  const [sales, setSales] = useState<ShopSaleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/shop/state')
      .then((res) => setSales(res.data.data.sales))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el libro de ventas.'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const { from, to } = rangeWindow(range, date);
  const rows = (sales ?? []).filter((s) => {
    if (s.returned) return false;
    const t = new Date(s.time);
    if (from && t < from) return false;
    if (to && t >= to) return false;
    return true;
  });
  const total = rows.reduce((acc, s) => acc + s.total, 0);
  const credit = rows.filter((s) => s.creditTerms).length;

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-4">
        <MetricCard icon={Wallet} title={`Total ventas · ${periodLabel}`} value={formatBase(total, symbol)} />
        <MetricCard icon={Receipt} title="Ventas" value={String(rows.length)} caption={credit > 0 ? `${credit} fiadas` : undefined} />
        <MetricCard icon={BookOpen} title="Ticket promedio" value={rows.length ? formatBase(total / rows.length, symbol) : '—'} />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <div className="flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40 min-w-[560px]">
          <span className="w-32 shrink-0">Fecha</span>
          <span className="flex-1">Cliente</span>
          <span className="w-28 shrink-0">Método</span>
          <span className="w-24 shrink-0 text-right">Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este período.</p>}
          {rows.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm min-w-[560px]">
              <span className="w-32 shrink-0 text-xs text-brand-950/50">
                {new Date(s.time).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className="min-w-0 flex-1 truncate text-brand-950/70">
                {s.customerName ?? 'Mostrador'}
                {s.creditTerms && <span className="text-amber-600"> · Fiada</span>}
              </span>
              <span className="w-28 shrink-0 truncate text-xs text-brand-950/60">
                {s.paymentMethod ? (PAYMENT_LABELS[s.paymentMethod as PaymentMethod] ?? s.paymentMethod) : '—'}
              </span>
              <span className="w-24 shrink-0 text-right font-semibold text-brand-950">{formatBase(s.total, symbol)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PurchasesBook({ symbol, range, date, periodLabel }: { symbol: string; range: Range; date: string; periodLabel: string }) {
  const [rows, setRows] = useState<PurchaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/movements', { params: { range, date: date || undefined } })
      .then((res) => setRows((res.data.data.movements as PurchaseRow[]).filter((m) => m.type === 'EXPENSE')))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el libro de compras.'));
  }, [range, date]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  const total = rows?.reduce((acc, r) => acc + Number(r.amountBase), 0) ?? 0;
  const fiscal = rows?.filter((r) => r.documentType === 'FISCAL_INVOICE').length ?? 0;
  const byCategory = new Map<string, number>();
  for (const r of rows ?? []) {
    const key = r.category ? CATEGORY_LABELS[r.category] : 'Sin categoría';
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(r.amountBase));
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-4">
        <MetricCard icon={Wallet} title={`Total compras · ${periodLabel}`} value={formatBase(total, symbol)} />
        <MetricCard icon={Receipt} title="Compras registradas" value={String(rows?.length ?? 0)} caption={`${fiscal} con factura fiscal`} />
        <MetricCard
          icon={BookOpen}
          title="Por categoría"
          rows={categories.slice(0, 4).map(([label, amount]) => ({ label, amount: formatBase(amount, symbol) }))}
          caption={categories.length === 0 ? 'Sin compras en el período.' : undefined}
          value={categories.length === 0 ? '—' : undefined}
        />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <div className="flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40 min-w-[720px]">
          <span className="w-20 shrink-0">Fecha</span>
          <span className="flex-1">Proveedor / Descripción</span>
          <span className="w-28 shrink-0">Nº factura</span>
          <span className="w-28 shrink-0">Tipo doc.</span>
          <span className="w-36 shrink-0">Categoría</span>
          <span className="w-20 shrink-0 text-right">Monto</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin compras en este período.</p>}
          {rows?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm min-w-[720px]">
              <span className="w-20 shrink-0 text-xs text-brand-950/50">
                {new Date(r.expenseDate ?? r.createdAt).toLocaleDateString('es-VE')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-brand-950">{r.supplier?.name ?? r.description}</span>
                <span className="block truncate text-xs text-brand-950/40 font-light">
                  {r.supplier ? r.description : 'Sin proveedor'}
                  {r.supplier?.taxId && ` · RIF: ${r.supplier.taxId}`}
                </span>
              </span>
              <span className="w-28 shrink-0 text-xs text-brand-950/60">{r.referenceNumber ?? '—'}</span>
              <span className="w-28 shrink-0 text-xs text-brand-950/60">
                {r.documentType ? DOCUMENT_TYPE_LABELS[r.documentType] : '—'}
              </span>
              <span className="w-36 shrink-0 truncate text-xs text-brand-950/60">
                {r.category ? CATEGORY_LABELS[r.category] : '—'}
              </span>
              <span className="w-20 shrink-0 text-right font-semibold text-brand-950">{formatBase(r.amountBase, symbol)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SalesBook({ symbol, range, date, periodLabel }: { symbol: string; range: Range; date: string; periodLabel: string }) {
  const [result, setResult] = useState<SalesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/orders/history', { params: { range, date: date || undefined, pageSize: 100 } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el libro de ventas.'));
  }, [range, date]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  // IVA del período sumado sobre lo mostrado — si hay más de 100 ventas, la nota de abajo lo aclara.
  const ivaShown = result?.orders.reduce((acc, o) => acc + Number(o.ivaBase), 0) ?? 0;
  const truncated = !!result && result.total > result.pageSize;

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-4">
        <MetricCard
          icon={Wallet}
          title={`Total ventas · ${periodLabel}`}
          value={result ? formatBase(result.totalBase, symbol) : '—'}
          caption={result ? formatBsAbsolute(result.totalBs) : undefined}
        />
        <MetricCard icon={Receipt} title="Ventas" value={String(result?.total ?? 0)} />
        <MetricCard
          icon={BookOpen}
          title={truncated ? 'IVA (últimas 100 ventas)' : 'IVA del período'}
          value={formatBase(ivaShown, symbol)}
        />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <div className="flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40 min-w-[680px]">
          <span className="w-24 shrink-0">Fecha</span>
          <span className="w-16 shrink-0">Nº</span>
          <span className="flex-1">Cliente</span>
          <span className="w-24 shrink-0">Método</span>
          <span className="w-20 shrink-0 text-right">Subtotal</span>
          <span className="w-16 shrink-0 text-right">IVA</span>
          <span className="w-20 shrink-0 text-right">Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {result?.orders.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin ventas en este período.</p>}
          {result?.orders.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-sm min-w-[680px]">
              <span className="w-24 shrink-0 text-xs text-brand-950/50">
                {new Date(o.createdAt).toLocaleDateString('es-VE')}
              </span>
              <span className="w-16 shrink-0 font-medium text-brand-950">#{o.orderNumber}</span>
              <span className="min-w-0 flex-1 truncate text-brand-950/70">{o.customerName ?? '—'}</span>
              <span className="w-24 shrink-0 truncate text-xs text-brand-950/60">
                {o.paymentMethod ? (PAYMENT_LABELS[o.paymentMethod as PaymentMethod] ?? o.paymentMethod) : '—'}
              </span>
              <span className="w-20 shrink-0 text-right text-brand-950/70">{formatBase(o.subtotalBase, symbol)}</span>
              <span className="w-16 shrink-0 text-right text-brand-950/70">{formatBase(o.ivaBase, symbol)}</span>
              <span className="w-20 shrink-0 text-right font-semibold text-brand-950">{formatBase(o.totalBase, symbol)}</span>
            </div>
          ))}
        </div>
      </div>
      {truncated && (
        <p className="text-xs text-brand-950/40 text-center -mt-2">
          Mostrando las {result!.pageSize} ventas más recientes de {result!.total} — los totales de arriba sí cubren todo el período.
        </p>
      )}
    </>
  );
}
