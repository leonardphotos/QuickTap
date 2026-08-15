import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, TrendingDown, TrendingUp, Upload, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { MetricCard } from './MetricCard';
import { CATEGORY_LABELS, DOCUMENT_TYPE_LABELS, type ExpenseCategory, type ExpenseDocumentType } from './ExpenseFormDialog';
import { INCOME_CATEGORY_LABELS, type IncomeCategory } from './IncomeFormDialog';
import { PAYMENT_LABELS } from './PaymentDialog';
import type { PaymentMethod } from '@/types';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';

interface LedgerRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: ExpenseCategory | null;
  incomeCategory: IncomeCategory | null;
  documentType: ExpenseDocumentType | null;
  paymentMethod: PaymentMethod | null;
  supplier: { id: string; name: string } | null;
  referenceNumber: string | null;
  isRecurring: boolean;
  expenseDate: string | null;
  createdAt: string;
  createdByName: string | null;
}

interface LedgerResult {
  totalIncome: string;
  totalExpense: string;
  net: string;
  totalIncomeBs: string;
  totalExpenseBs: string;
  netBs: string;
  movements: LedgerRow[];
}

interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}

async function downloadBlob(url: string, params: Record<string, string | undefined>, filename: string) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const objectUrl = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Contabilidad: TODOS los ingresos y egresos en un solo libro, con filtro por categoría y
 * fecha, exportación a Excel y carga del historial financiero previo por Excel (para seguir
 * el historial de antes de QuickTap). Compartido por los tres verticales.
 */
export function MovementsLedgerSection() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');
  const [result, setResult] = useState<LedgerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .get('/movements', { params: { range, date: date || undefined, category: category || undefined } })
      .then((res) => setResult(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la contabilidad.'));
  }

  useEffect(load, [range, date, category]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodLabel = date ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_LABELS[range];
  const rows = result?.movements.filter((m) => typeFilter === 'ALL' || m.type === typeFilter) ?? [];

  // Estadísticas de gastos por categoría del período filtrado. Se calculan sobre lo ya
  // cargado (mismos filtros de fecha/categoría) — no hay otra consulta que desincronizar.
  const expenseByCategory = (() => {
    const acc = new Map<string, { label: string; total: number; count: number }>();
    for (const m of result?.movements ?? []) {
      if (m.type !== 'EXPENSE') continue;
      const key = m.category ?? 'SIN';
      const label = m.category ? CATEGORY_LABELS[m.category] : 'Sin categoría';
      const prev = acc.get(key) ?? { label, total: 0, count: 0 };
      prev.total += Number(m.amountBase);
      prev.count += 1;
      acc.set(key, prev);
    }
    return [...acc.values()].sort((a, b) => b.total - a.total);
  })();
  const expenseTotal = expenseByCategory.reduce((s, c) => s + c.total, 0);

  async function exportExcel() {
    setBusy(true);
    setError(null);
    try {
      await downloadBlob(
        '/movements/export',
        { range, date: date || undefined, category: category || undefined },
        `contabilidad-${periodLabel.replace(/\//g, '-')}.xlsx`,
      );
    } catch {
      setError('No se pudo exportar el Excel.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setBusy(true);
    setError(null);
    try {
      await downloadBlob('/movements/import-template', {}, 'plantilla-contabilidad.xlsx');
    } catch {
      setError('No se pudo descargar la plantilla.');
    } finally {
      setBusy(false);
    }
  }

  async function importExcel(file: File) {
    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/movements/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportResult(res.data.data);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo importar el archivo.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <TextureButton variant="secondary" size="sm" className="!w-auto disabled:opacity-50" disabled={busy} onClick={downloadTemplate}>
          <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Plantilla
        </TextureButton>
        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto disabled:opacity-50"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="mr-1 h-3.5 w-3.5" /> Importar Excel
        </TextureButton>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importExcel(f);
          }}
        />
        <TextureButton variant="brand" size="sm" className="!w-auto disabled:opacity-50" disabled={busy} onClick={exportExcel}>
          <Download className="mr-1 h-3.5 w-3.5" /> Exportar Excel
        </TextureButton>
      </div>

      {importResult && (
        <div className={`rounded-2xl border p-4 ${importResult.errors.length ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'}`}>
          <p className="text-sm font-medium text-brand-950">
            {importResult.created} movimiento{importResult.created === 1 ? '' : 's'} importado{importResult.created === 1 ? '' : 's'}
            {importResult.errors.length > 0 && ` · ${importResult.errors.length} fila${importResult.errors.length === 1 ? '' : 's'} con error`}
          </p>
          {importResult.errors.slice(0, 5).map((e) => (
            <p key={e.row} className="mt-0.5 text-xs text-brand-950/60 font-light">
              Fila {e.row}: {e.message}
            </p>
          ))}
          {importResult.errors.length > 5 && (
            <p className="mt-0.5 text-xs text-brand-950/40 font-light">…y {importResult.errors.length - 5} más.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {(
            [
              ['ALL', 'Todos'],
              ['INCOME', 'Ingresos'],
              ['EXPENSE', 'Egresos'],
            ] as ['ALL' | 'INCOME' | 'EXPENSE', string][]
          ).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                typeFilter === t ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
          className="text-xs font-medium border border-brand-950/15 rounded-full px-2.5 py-1.5 text-brand-950/60"
        >
          <option value="">Todas las categorías</option>
          {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <span className="w-px h-4 bg-brand-950/10 mx-1" />
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid sm:grid-cols-3 gap-4">
          <MetricCard
            icon={TrendingUp}
            title={`Ingresos · ${periodLabel}`}
            value={formatBase(result.totalIncome, symbol)}
            valueTone="success"
            caption={formatBsAbsolute(result.totalIncomeBs)}
          />
          <MetricCard
            icon={TrendingDown}
            title={`Egresos · ${periodLabel}`}
            value={formatBase(result.totalExpense, symbol)}
            valueTone="danger"
            caption={formatBsAbsolute(result.totalExpenseBs)}
          />
          <MetricCard
            icon={Wallet}
            title="Balance"
            value={formatBase(result.net, symbol)}
            valueTone={Number(result.net) < 0 ? 'danger' : undefined}
            caption={formatBsAbsolute(result.netBs)}
          />
        </div>
      )}

      {/* Estadísticas de gastos por categoría: dónde se está yendo la plata del período.
          Se oculta si el filtro está en "Ingresos" — ahí no aporta nada. */}
      {typeFilter !== 'INCOME' && expenseByCategory.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[14px] font-bold text-brand-950">Gastos por categoría · {periodLabel}</h2>
          <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
            {expenseByCategory.map((c) => {
              const pct = expenseTotal > 0 ? (c.total / expenseTotal) * 100 : 0;
              return (
                <div key={c.label} className="p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-[14px] font-medium text-brand-950">{c.label}</span>
                    <span className="shrink-0 text-[14px] font-bold text-brand-950">{formatBase(c.total, symbol)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-950/[0.06]">
                      <div className="h-full rounded-full bg-red-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-[11px] font-light text-brand-950/40">
                      {Math.round(pct)}% · {c.count} gasto{c.count === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className={`${card} overflow-x-auto`}>
        <div className="flex items-center gap-3 px-5 py-2 border-b border-brand-950/[0.06] text-[11px] font-medium uppercase tracking-wide text-brand-950/40 min-w-[680px]">
          <span className="w-20 shrink-0">Fecha</span>
          <span className="flex-1">Descripción</span>
          <span className="w-36 shrink-0">Categoría</span>
          <span className="w-24 shrink-0">Método</span>
          <span className="w-24 shrink-0 text-right">Monto</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {rows.length === 0 && <p className="p-5 text-sm text-brand-950/40 font-light">Sin movimientos en este filtro.</p>}
          {rows.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm min-w-[680px]">
              <span className="w-20 shrink-0 text-xs text-brand-950/50">
                {new Date(m.expenseDate ?? m.createdAt).toLocaleDateString('es-VE')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-brand-950">{m.description}</span>
                <span className="block truncate text-xs text-brand-950/40 font-light">
                  {m.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                  {m.supplier && ` · ${m.supplier.name}`}
                  {m.referenceNumber && ` · Ref. ${m.referenceNumber}`}
                  {m.documentType && ` · ${DOCUMENT_TYPE_LABELS[m.documentType]}`}
                  {m.isRecurring && ' · Recurrente'}
                  {m.createdByName && ` · ${m.createdByName}`}
                </span>
              </span>
              <span className="w-36 shrink-0 truncate text-xs text-brand-950/60">
                {m.type === 'INCOME'
                  ? (m.incomeCategory ? INCOME_CATEGORY_LABELS[m.incomeCategory] : '—')
                  : (m.category ? CATEGORY_LABELS[m.category] : '—')}
              </span>
              <span className="w-24 shrink-0 truncate text-xs text-brand-950/60">
                {m.paymentMethod ? PAYMENT_LABELS[m.paymentMethod] : '—'}
              </span>
              <span
                className={`w-24 shrink-0 text-right font-semibold ${m.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {m.type === 'INCOME' ? '+' : '−'}
                {formatBase(m.amountBase, symbol)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
