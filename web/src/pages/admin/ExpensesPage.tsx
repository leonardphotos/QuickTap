import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard } from '@/components/ui/texture-card';
import { ExpenseFormDialog, CATEGORY_LABELS, type ExpenseCategory } from '@/components/admin/ExpenseFormDialog';

type Range = 'day' | 'week' | 'month' | 'year';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año' };

interface MovementRow {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  amountBase: string;
  description: string;
  category: ExpenseCategory | null;
  supplier: { id: string; name: string } | null;
  inventoryItem: { id: string; name: string } | null;
  inventoryQuantity: string | null;
  isCredit: boolean;
  creditPaidAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface MovementResult {
  totalIncome: string;
  totalExpense: string;
  net: string;
  movements: MovementRow[];
}

export default function ExpensesPage() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [range, setRange] = useState<Range>('month');
  const [result, setResult] = useState<MovementResult | null>(null);
  const [pending, setPending] = useState<MovementRow[]>([]);
  const [showFormDialog, setShowFormDialog] = useState(false);

  function load() {
    api.get('/movements', { params: { range } }).then((res) => setResult(res.data.data));
    api.get('/movements', { params: { onlyPendingCredit: true } }).then((res) => setPending(res.data.data.movements));
  }

  useEffect(load, [range]);

  async function markPaid(id: string) {
    await api.patch(`/movements/${id}/mark-paid`);
    load();
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Gastos</h1>
        <TextureButton variant="brand" size="default" className="!w-auto px-4 flex items-center gap-1.5" onClick={() => setShowFormDialog(true)}>
          <Plus className="h-4 w-4" /> Agregar gasto
        </TextureButton>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['day', 'week', 'month', 'year'] as Range[]).map((r) => (
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

      {result && (
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
            <p className="text-2xl font-semibold text-emerald-600">{formatBase(result.totalIncome, symbol)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Ingresos · {RANGE_LABELS[range]}</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
            <p className="text-2xl font-semibold text-red-600">{formatBase(result.totalExpense, symbol)}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Egresos · {RANGE_LABELS[range]}</p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
            <p className={`text-2xl font-semibold ${Number(result.net) < 0 ? 'text-red-600' : 'text-brand-950'}`}>
              {formatBase(result.net, symbol)}
            </p>
            <p className="text-xs text-brand-950/50 font-light mt-1">Balance · {RANGE_LABELS[range]}</p>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-3">Pendientes con proveedores</p>
          <TextureCard>
            <ul className="divide-y divide-brand-950/10">
              {pending.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-brand-950 truncate">
                      {m.description} {m.supplier && <span className="text-brand-950/50 font-normal">· {m.supplier.name}</span>}
                    </p>
                    <p className="text-xs text-brand-950/40">{new Date(m.createdAt).toLocaleDateString('es-VE')}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-semibold text-red-600">{formatBase(m.amountBase, symbol)}</span>
                    <TextureButton variant="secondary" size="sm" className="!w-auto px-3" onClick={() => markPaid(m.id)}>
                      Marcar pagado
                    </TextureButton>
                  </div>
                </li>
              ))}
            </ul>
          </TextureCard>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-brand-950/70 mb-3">Movimientos · {RANGE_LABELS[range]}</p>
        <TextureCard>
          <ul className="divide-y divide-brand-950/10">
            {result?.movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 truncate">{m.description}</p>
                  <p className="text-xs text-brand-950/40 truncate">
                    {m.category && CATEGORY_LABELS[m.category]}
                    {m.supplier && ` · ${m.supplier.name}`}
                    {m.isCredit && (m.creditPaidAt ? ' · Crédito pagado' : ' · A crédito')}
                    {' · '}
                    {new Date(m.createdAt).toLocaleDateString('es-VE')}
                  </p>
                </div>
                <span className={`font-semibold shrink-0 ${m.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {m.type === 'INCOME' ? '+' : '−'}
                  {formatBase(m.amountBase, symbol)}
                </span>
              </li>
            ))}
            {result?.movements.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-950/40 text-sm font-light">Sin movimientos en este período.</li>
            )}
          </ul>
        </TextureCard>
      </div>

      {showFormDialog && (
        <ExpenseFormDialog
          onClose={() => setShowFormDialog(false)}
          onCreated={() => {
            setShowFormDialog(false);
            load();
          }}
        />
      )}
    </div>
  );
}
