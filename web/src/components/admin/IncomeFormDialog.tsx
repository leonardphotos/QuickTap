import { useState } from 'react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { PAYMENT_LABELS } from './PaymentDialog';
import type { PaymentMethod } from '@/types';

export type IncomeCategory = 'TIP' | 'DEBT' | 'OTHER';

export const INCOME_CATEGORY_LABELS: Record<IncomeCategory, string> = {
  TIP: 'Propina',
  DEBT: 'Deuda',
  OTHER: 'Otro',
};

const INCOME_METHODS: PaymentMethod[] = ['CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'];

/** Cuerpo de "Añadir ingreso" — propina, cobro de una deuda pendiente u otro ingreso manual,
 * con su método de pago — sin cáscara de diálogo. `IncomeFormDialog` (ventana flotante, usada
 * en el Dashboard y en Canchas → Historial) y Administración → Resumen (panel en línea) son
 * los dos consumidores, para que todo ingreso manual quede siempre registrado igual sin
 * importar desde dónde se cargue. */
export function IncomeForm({ onCreated }: { onCreated: () => void }) {
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<'BASE' | 'BS'>('BASE');
  const [category, setCategory] = useState<IncomeCategory>('TIP');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const amountBase = Number(amount);
    if (!amountBase || amountBase <= 0) {
      setError('Escribe un monto válido.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/movements', {
        type: 'INCOME',
        amountBase,
        amountCurrency,
        description: description.trim() || INCOME_CATEGORY_LABELS[category],
        incomeCategory: category,
        paymentMethod: method,
      });
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar el ingreso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Tipo de ingreso</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(INCOME_CATEGORY_LABELS) as IncomeCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                category === c ? 'bg-emerald-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {INCOME_CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Método de pago</p>
        <div className="flex flex-wrap gap-1.5">
          {INCOME_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                method === m ? 'bg-emerald-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Monto</p>
          <input
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Moneda</p>
          <select
            value={amountCurrency}
            onChange={(e) => setAmountCurrency(e.target.value as 'BASE' | 'BS')}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          >
            <option value="BASE">$</option>
            <option value="BS">Bs</option>
          </select>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Descripción (opcional)</p>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={INCOME_CATEGORY_LABELS[category]}
          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
        {saving ? 'Guardando…' : 'Guardar ingreso'}
      </TextureButton>
    </div>
  );
}

/** Ventana flotante — usada fuera de Administración (Dashboard "Ventas de hoy", Canchas →
 * Historial). Dentro de Administración se usa `IncomeForm` directo dentro de un InlinePanel. */
export function IncomeFormDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Añadir ingreso</DialogTitle>
        </DialogHeader>
        <IncomeForm onCreated={onCreated} />
      </DialogContent>
    </Dialog>
  );
}
