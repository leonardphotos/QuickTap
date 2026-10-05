import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext.shared';
import type { PaymentMethod } from '@/types';
import { formatBase,formatBsAbsolute } from '@/utils/format';
import { AlertTriangle,BookOpen,Download,LoaderCircle,Printer,Receipt,ShieldCheck,Wallet } from 'lucide-react';
import { useEffect,useState } from 'react';
import { CATEGORY_LABELS,DOCUMENT_TYPE_LABELS,type ExpenseCategory,type ExpenseDocumentType } from './ExpenseFormDialog.shared';
import { MetricCard } from './MetricCard';
import { PAYMENT_LABELS } from './PaymentDialog.shared';

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
  taxableBase?: string | null;
  ivaBase?: string | null;
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
  saleRecognizedAt: string | null;
}

interface SalesResult {
  total: number;
  pageSize: number;
  totalBase: string;
  totalBs: string;
  totalIvaBase: string;
  orders: SaleRow[];
}

interface FiscalZStatus {
  pending: boolean;
  blocked?: boolean;
  phase?: string;
  last: {
    event: 'FISCAL_Z_REQUESTED' | 'FISCAL_Z_PRINTED' | 'FISCAL_Z_FAILED' | 'FISCAL_Z_UNKNOWN';
    detail: Record<string, unknown> | null;
    createdAt: string;
    actorName: string | null;
  } | null;
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
  const [downloading, setDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [fiscalZOpen, setFiscalZOpen] = useState(false);
  const [fiscalZSending, setFiscalZSending] = useState(false);
  const [fiscalZError, setFiscalZError] = useState<string | null>(null);
  const [fiscalZStatus, setFiscalZStatus] = useState<FiscalZStatus | null>(null);

  async function loadFiscalZStatus() {
    try {
      const res = await api.get('/orders/fiscal/z-report');
      setFiscalZStatus(res.data.data);
    } catch {
      // El estado es informativo: un fallo al consultarlo no debe impedir ver
      // ni exportar los libros fiscales.
    }
  }

  useEffect(() => {
    if (only === 'compras') return;
    void loadFiscalZStatus();
  }, [only]);

  useEffect(() => {
    if (!fiscalZStatus?.pending && !fiscalZStatus?.blocked) return;
    const timer = window.setInterval(() => void loadFiscalZStatus(), 3000);
    return () => window.clearInterval(timer);
  }, [fiscalZStatus?.pending, fiscalZStatus?.blocked]);

  async function requestFiscalZ() {
    setFiscalZSending(true);
    setFiscalZError(null);
    try {
      await api.post('/orders/fiscal/z-report');
      setFiscalZStatus((current) => ({ pending: true, phase: 'WAITING', last: current?.last ?? null }));
      setFiscalZOpen(false);
    } catch (err: any) {
      setFiscalZError(err.response?.data?.error ?? 'No se pudo enviar la solicitud a la Estación de Impresión.');
    } finally {
      setFiscalZSending(false);
    }
  }

  /** Descarga el libro que se está viendo, con el mismo período que muestra la pantalla.
   * `fiscal` (solo ventas): la versión SENIAT — fecha, RIF, cliente, base, IVA y total en Bs. */
  async function exportBook(format: 'full' | 'fiscal' = 'full') {
    setDownloading(true);
    setExportError(null);
    try {
      const path = book === 'compras' ? '/movements/export/purchase-book' : '/movements/export/sales-book';
      const res = await api.get(path, {
        params: { range, date: date || undefined, ...(format === 'fiscal' ? { format: 'fiscal' } : {}) },
        responseType: 'blob',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(res.data);
      const bookLabel = book === 'compras' ? 'Libro de compras' : format === 'fiscal' ? 'Libro de ventas (fiscal)' : 'Libro de ventas';
      link.download = `${bookLabel} - ${(restaurant?.name ?? 'QuickTap').replace(/[\\/:*?"<>|]/g, '').trim()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setExportError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {book === 'ventas' && (
            <>
              <TextureButton
                variant="success"
                size="sm"
                className="!w-auto"
                disabled={Boolean(fiscalZStatus?.pending || fiscalZStatus?.blocked)}
                onClick={() => {
                  setFiscalZError(null);
                  setFiscalZOpen(true);
                }}
                title="Cierra la jornada directamente en la impresora fiscal"
              >
                {fiscalZStatus?.pending ? (
                  <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Printer className="mr-1 h-3.5 w-3.5" />
                )}
                {fiscalZStatus?.pending ? fiscalZStatus.phase === 'WAITING' ? 'Esperando estación…' : 'Procesando Z…' : 'Generar Z fiscal'}
              </TextureButton>
              <TextureButton
                variant="secondary"
                size="sm"
                className="!w-auto"
                disabled={downloading}
                onClick={() => exportBook('fiscal')}
                title="Solo fecha, RIF, cliente, base imponible, IVA y total en Bs (formato SENIAT)"
              >
                <Download className="mr-1 h-3.5 w-3.5" /> {downloading ? 'Generando…' : 'Exportar fiscal'}
              </TextureButton>
            </>
          )}
          <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={downloading} onClick={() => exportBook('full')}>
            <Download className="mr-1 h-3.5 w-3.5" /> {downloading ? 'Generando…' : book === 'ventas' ? 'Exportar completo' : 'Exportar Excel'}
          </TextureButton>
        </div>
      </div>

      {exportError && <p className="text-red-600 text-base">{exportError}</p>}

      {book === 'ventas' && fiscalZStatus?.pending && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-500/20 bg-brand-500/[0.06] px-3 py-2 text-sm text-brand-950/70">
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-brand-500" />
          {fiscalZStatus.phase === 'WAITING' ? 'Esperando que la estación reciba el cierre (máximo 60 segundos).' : 'La estación recibió el trabajo y está esperando la confirmación de la impresora fiscal.'}
        </div>
      )}
      {book === 'ventas' && fiscalZStatus?.phase === 'NOT_RECEIVED' && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900 text-base">La estación no recibió el cierre a tiempo. Cierra y abre la Estación de Impresión y revisa si hay una impresión pendiente antes de volver a solicitarlo.</p>}
      {book === 'ventas' && fiscalZStatus?.blocked && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900 text-base">No se pudo confirmar el resultado del cierre. Revisa el papel y contacta a soporte; no se enviará otro Z automáticamente.</p>}
      {book === 'ventas' && !fiscalZStatus?.pending && fiscalZStatus?.last?.event === 'FISCAL_Z_PRINTED' && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-sm text-emerald-800">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Último Z confirmado
          {fiscalZStatus.last.detail?.numeroReporte ? ` · #${String(fiscalZStatus.last.detail.numeroReporte)}` : ''}
          {fiscalZStatus.last.detail?.ventasDelDia != null
            ? ` · ${formatBsAbsolute(String(fiscalZStatus.last.detail.ventasDelDia))}`
            : ''}
          {' · '}{new Date(fiscalZStatus.last.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
        </div>
      )}
      {book === 'ventas' && !fiscalZStatus?.pending &&
        (fiscalZStatus?.last?.event === 'FISCAL_Z_FAILED' || fiscalZStatus?.last?.event === 'FISCAL_Z_UNKNOWN') && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {fiscalZStatus.last.event === 'FISCAL_Z_UNKNOWN'
                ? 'La impresora no confirmó el resultado. Revisa el papel antes de intentar otro cierre.'
                : String(fiscalZStatus.last.detail?.error ?? 'La impresora no pudo generar el Reporte Z.')}
            </span>
          </div>
        )}

      {book === 'compras' ? (
        <PurchasesBook symbol={symbol} range={range} date={date} periodLabel={periodLabel} />
      ) : restaurant?.businessType === 'SHOP' ? (
        <ShopSalesBook symbol={symbol} range={range} date={date} periodLabel={periodLabel} />
      ) : (
        <SalesBook symbol={symbol} range={range} date={date} periodLabel={periodLabel} />
      )}

      <Dialog open={fiscalZOpen} onOpenChange={(open) => !fiscalZSending && setFiscalZOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <DialogTitle>Generar Reporte Z fiscal</DialogTitle>
            <DialogDescription>
              Este cierre se imprime directamente en la máquina fiscal y finaliza sus acumulados del día en bolívares. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-brand-950/[0.04] px-4 py-3 text-sm leading-relaxed text-brand-950/65">
            Verifica que la Estación de Impresión 1.9.3 esté abierta en la PC Windows, que la impresora HKA/Aclas tenga papel y que no exista un documento fiscal pendiente. QuickTap comprobará que el RIF de la máquina coincida con el restaurante.
          </div>
          {fiscalZError && <p className="text-red-600 text-base">{fiscalZError}</p>}
          <DialogFooter className="flex-col-reverse sm:flex-row">
            <TextureButton variant="secondary" className="!w-auto" disabled={fiscalZSending} onClick={() => setFiscalZOpen(false)}>
              Cancelar
            </TextureButton>
            <TextureButton variant="success" className="!w-auto" disabled={fiscalZSending} onClick={requestFiscalZ}>
              {fiscalZSending ? <LoaderCircle className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />}
              {fiscalZSending ? 'Enviando…' : 'Sí, generar Reporte Z'}
            </TextureButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  returnedAt: string | null;
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

  if (error) return <p className="text-red-600 text-base">{error}</p>;

  const { from, to } = rangeWindow(range, date);
  const inWindow = (value: string) => {
    const t = new Date(value);
    return (!from || t >= from) && (!to || t < to);
  };
  const rows = (sales ?? [])
    .flatMap((sale) => {
      const activity: Array<ShopSaleRow & { entryId: string; isReturn: boolean; entryTime: string; amount: number }> = [];
      if (inWindow(sale.time)) {
        activity.push({ ...sale, entryId: sale.id, isReturn: false, entryTime: sale.time, amount: sale.total });
      }
      if (sale.returnedAt && inWindow(sale.returnedAt)) {
        activity.push({
          ...sale,
          entryId: `${sale.id}:return`,
          isReturn: true,
          entryTime: sale.returnedAt,
          amount: -sale.total,
        });
      }
      return activity;
    })
    .sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());
  const total = rows.reduce((acc, row) => acc + row.amount, 0);
  const saleRows = rows.filter((row) => !row.isReturn);
  const credit = saleRows.filter((sale) => sale.creditTerms).length;
  const returns = rows.filter((row) => row.isReturn).length;

  return (
    <>
      <div className="grid sm:grid-cols-3 gap-4">
        <MetricCard icon={Wallet} title={`Total ventas · ${periodLabel}`} value={formatBase(total, symbol)} />
        <MetricCard
          icon={Receipt}
          title="Ventas"
          value={String(saleRows.length)}
          caption={[credit > 0 ? `${credit} fiadas` : '', returns > 0 ? `${returns} devoluciones` : ''].filter(Boolean).join(' · ') || undefined}
        />
        <MetricCard icon={BookOpen} title="Ticket promedio" value={saleRows.length ? formatBase(total / saleRows.length, symbol) : '—'} />
      </div>

      <div className={`${card} overflow-x-auto`}>
        <div className="flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40 min-w-[560px]">
          <span className="w-32 shrink-0">Fecha</span>
          <span className="flex-1">Cliente</span>
          <span className="w-28 shrink-0">Método</span>
          <span className="w-24 shrink-0 text-right">Total</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows.length === 0 && <p className="p-5 text-brand-950/40 font-light text-base">Sin ventas en este período.</p>}
          {rows.map((s) => (
            <div key={s.entryId} className="flex items-center gap-3 px-5 py-2.5 text-sm min-w-[560px]">
              <span className="w-32 shrink-0 text-xs text-brand-950/50">
                {new Date(s.entryTime).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              <span className="min-w-0 flex-1 truncate text-brand-950/70">
                {s.customerName ?? 'Mostrador'}
                {s.isReturn && <span className="text-red-600"> · Devolución</span>}
                {s.creditTerms && <span className="text-amber-600"> · Fiada</span>}
              </span>
              <span className="w-28 shrink-0 truncate text-xs text-brand-950/60">
                {s.paymentMethod ? (PAYMENT_LABELS[s.paymentMethod as PaymentMethod] ?? s.paymentMethod) : '—'}
              </span>
              <span className={`w-24 shrink-0 text-right font-semibold ${s.isReturn ? 'text-red-600' : 'text-brand-950'}`}>
                {formatBase(s.amount, symbol)}
              </span>
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

  if (error) return <p className="text-red-600 text-base">{error}</p>;

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
          <span className="w-16 shrink-0 text-right">IVA</span>
          <span className="w-20 shrink-0 text-right">Monto</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && <p className="p-5 text-brand-950/40 font-light text-base">Sin compras en este período.</p>}
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
              <span className="w-16 shrink-0 text-right text-xs text-brand-950/60">{r.ivaBase != null ? formatBase(r.ivaBase, symbol) : '—'}</span>
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

  if (error) return <p className="text-red-600 text-base">{error}</p>;

  const ivaTotal = Number(result?.totalIvaBase ?? 0);
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
          title="IVA del período"
          value={formatBase(ivaTotal, symbol)}
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
          {result?.orders.length === 0 && <p className="p-5 text-brand-950/40 font-light text-base">Sin ventas en este período.</p>}
          {result?.orders.map((o) => (
            <div key={o.id} className="flex items-center gap-3 px-5 py-2.5 text-sm min-w-[680px]">
              <span className="w-24 shrink-0 text-xs text-brand-950/50">
                {new Date(o.saleRecognizedAt ?? o.createdAt).toLocaleDateString('es-VE')}
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
        <p className="text-brand-950/40 text-center -mt-2 text-xs">
          Mostrando las {result!.pageSize} ventas más recientes de {result!.total} — los totales de arriba sí cubren todo el período.
        </p>
      )}
    </>
  );
}
