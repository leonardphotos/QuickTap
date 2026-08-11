import { useCallback, useEffect, useState } from 'react';
import { Plus, UserMinus, Wallet } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from './clubStyle';

interface Payment {
  id: string;
  amountBase: string;
  periodLabel: string | null;
  paidAt: string;
  paymentMethod: string | null;
}

interface Employee {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  salaryBase: string | null;
  active: boolean;
  paidLast30: string;
  payments: Payment[];
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Efectivo Bs' },
  { value: 'CASH_USD', label: 'Efectivo $' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'ZELLE', label: 'Zelle' },
];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));
const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

/**
 * Nómina: el personal y lo que se le paga.
 *
 * Cada pago registra además el gasto correspondiente (categoría Nómina), para que pese en el
 * balance y en el arqueo de caja — si no, el club se vería más rentable de lo que es.
 */
export default function ClubPayrollPage({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Employee | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    api
      .get('/payroll')
      .then((r) => setEmployees(r.data.data))
      .catch(() => setError('No pudimos cargar la nómina.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function deactivate(e: Employee) {
    setError(null);
    try {
      await api.delete(`/payroll/${e.id}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo quitar de la nómina.');
    }
  }

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando nómina…</p>;

  const monthTotal = employees.reduce((acc, e) => acc + Number(e.paidLast30), 0);

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className={card}>
          <p className="text-[22px] font-bold leading-tight text-brand-950">{employees.length}</p>
          <p className="text-[13px] font-semibold text-brand-950/70">En nómina</p>
        </div>
        <div className={card}>
          <p className="text-[22px] font-bold leading-tight text-brand-950">{formatBase(monthTotal, symbol)}</p>
          <p className="text-[13px] font-semibold text-brand-950/70">Pagado</p>
          <p className="text-[11px] font-light text-brand-950/40">últimos 30 días</p>
        </div>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-brand-950">Personal</p>
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Agregar
          </TextureButton>
        </div>

        {employees.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">
            Todavía no tienes a nadie en la nómina.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {employees.map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-950">{e.name}</p>
                    <p className="text-xs font-light text-brand-950/50">
                      {e.position || 'Sin cargo'}
                      {e.salaryBase && ` · sueldo ${formatBase(e.salaryBase, symbol)}`}
                      {e.phone && ` · ${e.phone}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-brand-950">{formatBase(e.paidLast30, symbol)}</p>
                    <p className="text-[11px] font-light text-brand-950/40">últimos 30 días</p>
                  </div>
                </div>

                {e.payments.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {e.payments.slice(0, 3).map((p) => (
                      <li key={p.id} className="flex justify-between gap-2 text-xs text-brand-950/55">
                        <span className="min-w-0 truncate font-light">
                          {p.periodLabel || new Date(p.paidAt).toLocaleDateString('es-VE')}
                          {p.paymentMethod && ` · ${METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}`}
                        </span>
                        <span className="shrink-0">{formatBase(p.amountBase, symbol)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setPaying(e)}>
                    <Wallet className="mr-1.5 h-3.5 w-3.5" />
                    Registrar pago
                  </TextureButton>
                  <button
                    onClick={() => deactivate(e)}
                    className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-brand-950/45 hover:text-red-600"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {adding && (
        <EmployeeDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {paying && (
        <PayDialog
          employee={paying}
          symbol={symbol}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EmployeeDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError('Escribe el nombre.');
    setSaving(true);
    setError(null);
    try {
      await api.post('/payroll', {
        name: name.trim(),
        position: position.trim() || null,
        phone: phone.trim() || null,
        salaryBase: salary.trim() ? Number(salary) : null,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar a la nómina</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Cargo">
            <input value={position} onChange={(e) => setPosition(e.target.value)} className={INPUT} placeholder="Recepción, mantenimiento…" />
          </Field>
          <Field label="Teléfono">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} placeholder="04141234567" />
          </Field>
          <Field label="Sueldo acordado">
            <input
              type="number"
              min="0"
              step="0.01"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className={INPUT}
              placeholder="0.00"
            />
          </Field>
          <p className="text-xs font-light text-brand-950/40">
            El sueldo es solo una referencia al pagar — cada pago se registra a mano, porque casi
            nunca coincide exacto.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  employee,
  symbol,
  onClose,
  onPaid,
}: {
  employee: Employee;
  symbol: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState(employee.salaryBase ?? '');
  const [period, setPeriod] = useState('');
  const [method, setMethod] = useState('CASH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!amount || Number(amount) <= 0) return setError('Escribe un monto mayor a 0.');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/payroll/${employee.id}/payments`, {
        amountBase: Number(amount),
        periodLabel: period.trim() || null,
        paymentMethod: method,
      });
      onPaid();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo registrar el pago.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar a {employee.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label={`Monto (${symbol}) *`}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT}
              placeholder="0.00"
            />
          </Field>
          <Field label="Período">
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className={INPUT}
              placeholder="Agosto 2026, 1ra quincena…"
            />
          </Field>
          <Field label="¿Con qué pagaste?">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <p className="text-xs font-light text-brand-950/40">
            Se registra también como gasto en la categoría Nómina, para que cuente en el balance
            y en el cierre de caja.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Registrando…' : 'Registrar pago'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-brand-950/70">{label}</span>
      {children}
    </label>
  );
}
