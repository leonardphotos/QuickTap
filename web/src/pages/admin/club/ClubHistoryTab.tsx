import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { CATEGORY_LABELS } from '@/components/admin/ExpenseFormDialog';
import { INCOME_CATEGORY_LABELS } from '@/components/admin/IncomeFormDialog';
import { PAYMENT_METHOD_LABELS } from '@/components/admin/CashSessionReceipt';
import { Cell, ClubBadge, ClubEyebrow, ClubMetric, ClubPanel, ClubRow, ClubTable, PlainCell, type ClubColumn } from './ClubTable';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';

const RANGE_LABELS: Record<Range, string> = {
  day: 'Hoy',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  all: 'Todo',
};

interface MovementRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  incomeCategory: keyof typeof INCOME_CATEGORY_LABELS | null;
  paymentMethod: keyof typeof PAYMENT_METHOD_LABELS | null;
  category: keyof typeof CATEGORY_LABELS | null;
  supplier: { id: string; name: string } | null;
  createdByName: string | null;
  createdAt: string;
  isCredit: boolean;
  creditPaidAt: string | null;
}

interface MovementsResponse {
  totalIncome: string;
  totalExpense: string;
  net: string;
  movements: MovementRow[];
}

const COLS: ClubColumn[] = [
  { key: 'fecha', label: 'Fecha', width: '108px' },
  { key: 'desc', label: 'Descripción', width: 'minmax(0,1.8fr)' },
  { key: 'origen', label: 'Categoría / método', width: 'minmax(0,1.2fr)' },
  { key: 'tipo', label: 'Tipo', width: '100px' },
  { key: 'monto', label: 'Monto', width: '110px', align: 'right' },
  { key: 'accion', label: '', width: '48px', align: 'right' },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Historial administrativo: todo movimiento manual de dinero (ingresos y gastos),
 * de cualquier fecha — no solo el mes en curso, que era lo único que se podía ver
 * antes en el resumen de Administración. Reservas, ventas de tienda y cobros de
 * academia ya tienen su propio historial en Canchas/Tienda/Academia; esto es
 * específicamente el libro de movimientos manuales.
 */
export default function ClubHistoryTab({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const symbol = restaurant.currencySymbol ?? '$';
  const money = (n: string | number) => formatBase(n, symbol);

  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');
  const [data, setData] = useState<MovementsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const periodLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString('es-VE') : RANGE_LABELS[range];

  function load() {
    api
      .get('/movements', { params: { range, date: date || undefined } })
      .then((r) => setData(r.data.data))
      .catch(() => setError('No pudimos cargar el historial.'));
  }

  useEffect(load, [range, date]);

  async function removeMovement(id: string) {
    setBusyId(id);
    try {
      await api.delete(`/movements/${id}`);
      load();
    } catch {
      setError('No se pudo borrar el movimiento.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ClubEyebrow>Historial administrativo</ClubEyebrow>

      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRange(r);
              setDate('');
            }}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              !date && range === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50 hover:text-brand-950'
            }`}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={`rounded-full border-none px-3 py-1.5 text-[12px] font-semibold ${
            date ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
          }`}
        />
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-2.5 lg:gap-3">
          <ClubMetric value={money(data.totalIncome)} label="Ingresos" hint={periodLabel} tone="brand" />
          <ClubMetric value={money(data.totalExpense)} label="Egresos" hint={periodLabel} />
          <ClubMetric
            value={money(data.net)}
            label="Neto"
            hint={periodLabel}
            tone={Number(data.net) < 0 ? 'amber' : 'default'}
          />
        </div>
      )}

      <ClubPanel
        title="Movimientos"
        description="Ingresos y gastos manuales cargados desde Administración — no incluye reservas, ventas de tienda ni cobros de academia, que tienen su propio historial en cada vertical."
      >
        <ClubTable columns={COLS} rows={data?.movements.length ?? 0} empty={`Sin movimientos · ${periodLabel}.`}>
          {(data?.movements ?? []).map((m) => (
            <ClubRow
              key={m.id}
              cells={[
                <PlainCell key="f" className="tabular-nums">
                  {fmtDate(m.createdAt)}
                </PlainCell>,
                <>
                  <Cell>{m.description}</Cell>
                  {(m.supplier || m.createdByName) && (
                    <span className="mt-0.5 block truncate text-[11.5px] font-light text-brand-950/50">
                      {[m.supplier?.name, m.createdByName].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </>,
                <PlainCell key="o">
                  {m.type === 'INCOME'
                    ? (m.incomeCategory && INCOME_CATEGORY_LABELS[m.incomeCategory]) || '—'
                    : (m.category && CATEGORY_LABELS[m.category]) || '—'}
                  {m.paymentMethod && ` · ${PAYMENT_METHOD_LABELS[m.paymentMethod] ?? m.paymentMethod}`}
                </PlainCell>,
                <ClubBadge key="t" tone={m.type === 'INCOME' ? 'emerald' : 'red'}>
                  {m.type === 'INCOME' ? 'Ingreso' : 'Gasto'}
                </ClubBadge>,
                <span
                  key="m"
                  className={`block truncate text-right text-[13px] font-semibold tabular-nums ${
                    m.type === 'INCOME' ? 'text-emerald-600' : 'text-brand-950'
                  }`}
                >
                  {m.type === 'INCOME' ? '+' : '−'}
                  {money(m.amountBase)}
                </span>,
                <button
                  key="x"
                  type="button"
                  disabled={busyId === m.id}
                  onClick={() => removeMovement(m.id)}
                  aria-label="Borrar movimiento"
                  title="Borrar movimiento"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-brand-950/30 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>,
              ]}
            />
          ))}
        </ClubTable>
      </ClubPanel>
    </div>
  );
}
