import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from './InlinePanel';
import { PAYMENT_LABELS } from './PaymentDialog';
import type { PaymentMethod } from '@/types';

type AccountCurrency = 'BASE' | 'BS';

interface BankAccount {
  id: string;
  name: string;
  currency: AccountCurrency;
  isPettyCash: boolean;
  isVault: boolean;
  paymentMethods: PaymentMethod[];
  balance: string;
}

interface BankTx {
  id: string;
  type: 'CREDIT' | 'DEBIT' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  amount: string;
  amountBase: string;
  description: string;
  paymentMethod: PaymentMethod | null;
  counterpartName: string | null;
  createdAt: string;
}

type Range = 'day' | 'week' | 'month' | 'year' | 'all';
const RANGE_LABELS: Record<Range, string> = { day: 'Hoy', week: 'Semana', month: 'Este mes', year: 'Este año', all: 'Todo' };

const ALL_METHODS = Object.keys(PAYMENT_LABELS) as PaymentMethod[];
const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';
const inputCls = 'w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5';

function formatAccountAmount(amount: string | number, currency: AccountCurrency, symbol: string): string {
  return currency === 'BS' ? formatBsAbsolute(amount) : formatBase(amount, symbol);
}

/**
 * Cuentas bancarias y caja chica: dónde está la plata del negocio. Cada método de pago se
 * vincula a una cuenta — al cobrar con ese método el saldo sube automáticamente, y al pagar
 * un gasto de contado o una orden de pago, baja (ver bank-ledger.service.ts en el backend).
 * Compartido por los tres verticales; todo en línea, sin ventanas flotantes.
 */
export function BankAccountsSection({ symbol = '$' }: { symbol?: string }) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'create' | 'transfer' | null>(null);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [expanded, setExpanded] = useState<BankAccount | null>(null);

  const load = useCallback(() => {
    api
      .get('/bank-accounts')
      .then((res) => setAccounts(res.data.data))
      .catch(() => setError('No pudimos cargar las cuentas bancarias.'));
  }, []);

  useEffect(load, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!accounts) return <p className="text-sm text-brand-950/40 font-light">Cargando cuentas…</p>;

  if (expanded) {
    return (
      <AccountDetail
        account={expanded}
        symbol={symbol}
        onClose={() => {
          setExpanded(null);
          load();
        }}
      />
    );
  }

  const takenBy = new Map<PaymentMethod, string>();
  for (const a of accounts) for (const m of a.paymentMethods) takenBy.set(m, a.name);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {accounts.length >= 2 && (
          <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setPanel(panel === 'transfer' ? null : 'transfer')}>
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /> Transferir entre cuentas
          </TextureButton>
        )}
        <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setPanel(panel === 'create' ? null : 'create')}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Agregar cuenta
        </TextureButton>
      </div>

      {panel === 'create' && (
        <AccountForm
          account={null}
          takenBy={takenBy}
          symbol={symbol}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            load();
          }}
        />
      )}
      {editing && (
        <AccountForm
          account={editing}
          takenBy={takenBy}
          symbol={symbol}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {panel === 'transfer' && (
        <TransferForm
          accounts={accounts}
          symbol={symbol}
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            load();
          }}
        />
      )}

      {accounts.length === 0 && (
        <div className={`${card} p-6 text-center`}>
          <p className="text-sm text-brand-950/60">
            Agrega tus cuentas bancarias y tu caja chica, y vincula cada método de pago a la suya.
          </p>
          <p className="mt-1 text-xs text-brand-950/40 font-light">
            Ejemplo: Pago Móvil → Banco de Venezuela. Al cobrar un Pago Móvil, el saldo del banco sube solo; al pagar un
            gasto con ese método, baja.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((a) => (
          <div key={a.id} className={`${card} p-5`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {a.isPettyCash ? (
                  <PiggyBank className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <Landmark className="h-4 w-4 shrink-0 text-brand-950/40" />
                )}
                <p className="truncate text-sm font-bold text-brand-950">{a.name}</p>
              </div>
              <span className="shrink-0 rounded-full bg-brand-950/[0.06] px-2 py-0.5 text-[10px] font-bold text-brand-950/50">
                {a.currency === 'BS' ? 'Bs' : symbol}
              </span>
            </div>

            <p className="mt-2 text-2xl font-semibold text-brand-950">
              {formatAccountAmount(a.balance, a.currency, symbol)}
            </p>

            <div className="mt-2 flex flex-wrap gap-1">
              {a.isPettyCash && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Caja chica</span>
              )}
              {a.isVault && (
                <span className="rounded-full bg-brand-950/[0.08] px-2 py-0.5 text-[10px] font-bold text-brand-950/70">Bóveda</span>
              )}
              {a.paymentMethods.map((m) => (
                <span key={m} className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                  {PAYMENT_LABELS[m]}
                </span>
              ))}
              {a.paymentMethods.length === 0 && (
                <span className="text-[11px] font-light text-brand-950/40">Sin métodos vinculados</span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-950/[0.06] pt-3">
              <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setExpanded(a)}>
                Movimientos
              </TextureButton>
              <button
                type="button"
                onClick={() => {
                  setPanel(null);
                  setEditing(a);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-brand-950/50 hover:bg-brand-950/5 hover:text-brand-950"
              >
                Editar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountForm({
  account,
  takenBy,
  symbol,
  onClose,
  onSaved,
}: {
  account: BankAccount | null;
  takenBy: Map<PaymentMethod, string>;
  symbol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [currency, setCurrency] = useState<AccountCurrency>(account?.currency ?? 'BS');
  const [isPettyCash, setIsPettyCash] = useState(account?.isPettyCash ?? false);
  const [isVault, setIsVault] = useState(account?.isVault ?? false);
  const [methods, setMethods] = useState<Set<PaymentMethod>>(new Set(account?.paymentMethods ?? []));
  const [initialBalance, setInitialBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleMethod(m: PaymentMethod) {
    setMethods((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  async function submit() {
    if (!name.trim()) {
      setError('Escribe el nombre de la cuenta.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (account) {
        await api.patch(`/bank-accounts/${account.id}`, {
          name: name.trim(),
          isPettyCash,
          isVault,
          paymentMethods: [...methods],
        });
      } else {
        await api.post('/bank-accounts', {
          name: name.trim(),
          currency,
          isPettyCash,
          isVault,
          paymentMethods: [...methods],
          initialBalance: Number(initialBalance) || undefined,
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar la cuenta.');
      setSaving(false);
    }
  }

  async function remove() {
    if (!account) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/bank-accounts/${account.id}`);
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo borrar la cuenta.');
      setSaving(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <InlinePanel
      title={account ? `Editar ${account.name}` : 'Agregar cuenta'}
      description={account ? 'La moneda no se puede cambiar: el libro de la cuenta ya está asentado en ella.' : undefined}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Nombre de la cuenta</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Banco de Venezuela — Corriente"
            className={inputCls}
          />
        </div>

        {!account && (
          <div>
            <p className="text-xs font-medium text-brand-950/50 mb-1.5">Tipo de cuenta</p>
            <div className="flex gap-1.5">
              {(
                [
                  ['BS', 'Bolívares (Bs)'],
                  ['BASE', `Divisas (${symbol})`],
                ] as [AccountCurrency, string][]
              ).map(([c, label]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    currency === c ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Métodos de pago vinculados</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_METHODS.map((m) => {
              const owner = takenBy.get(m);
              const takenElsewhere = !!owner && owner !== account?.name;
              const active = methods.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={takenElsewhere}
                  title={takenElsewhere ? `Ya vinculado a "${owner}"` : undefined}
                  onClick={() => toggleMethod(m)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-35 ${
                    active ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                  }`}
                >
                  {PAYMENT_LABELS[m]}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-brand-950/40 font-light">
            Cada cobro o pago con estos métodos moverá el saldo de esta cuenta automáticamente.
          </p>
        </div>

        {!account && (
          <div>
            <p className="text-xs font-medium text-brand-950/50 mb-1.5">
              Saldo inicial ({currency === 'BS' ? 'Bs' : symbol}, opcional)
            </p>
            <input
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className={inputCls}
            />
          </div>
        )}

        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={isPettyCash}
            onChange={(e) => {
              setIsPettyCash(e.target.checked);
              if (e.target.checked) setIsVault(false);
            }}
          />
          ¿Es caja chica? (efectivo físico del día a día)
        </label>

        {/* Bóveda: adonde va el efectivo al cerrar el turno. Excluyente con caja chica —
            una cuenta es el efectivo del día o el que se guarda, no las dos cosas. */}
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={isVault}
            onChange={(e) => {
              setIsVault(e.target.checked);
              if (e.target.checked) setIsPettyCash(false);
            }}
          />
          ¿Es la bóveda? (donde se guarda el efectivo al cerrar caja)
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2">
          <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
            {saving ? 'Guardando…' : account ? 'Guardar cambios' : 'Agregar cuenta'}
          </TextureButton>
          {account && (
            <button
              type="button"
              disabled={saving}
              onClick={() => (confirmingDelete ? remove() : setConfirmingDelete(true))}
              className="flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmingDelete ? '¿Seguro? Se borra con su historial' : 'Borrar cuenta'}
            </button>
          )}
        </div>
      </div>
    </InlinePanel>
  );
}

function TransferForm({
  accounts,
  symbol,
  onClose,
  onDone,
}: {
  accounts: BankAccount[];
  symbol: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const crossCurrency = from && to && from.currency !== to.currency;

  async function submit() {
    // El concepto es obligatorio: es lo único que explica la transferencia en el libro de
    // las dos cuentas cuando se revisa meses después.
    if (!note.trim()) {
      setError('Escribe el concepto de la transferencia.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/bank-accounts/transfer', {
        fromId,
        toId,
        amount: Number(amount) || 0,
        note: note.trim(),
      });
      onDone();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo hacer la transferencia.');
      setSaving(false);
    }
  }

  return (
    <InlinePanel title="Transferir entre cuentas" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-xs font-medium text-brand-950/50 mb-1.5">Desde</p>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputCls}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatAccountAmount(a.balance, a.currency, symbol)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-xs font-medium text-brand-950/50 mb-1.5">Hacia</p>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputCls}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">
            Monto ({from?.currency === 'BS' ? 'Bs' : symbol})
          </p>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className={inputCls}
          />
          {crossCurrency && (
            <p className="mt-1 text-[11px] text-brand-950/40 font-light">
              Las cuentas usan monedas distintas: se convierte con la tasa BCV del momento.
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">
            Concepto <span className="text-red-500">*</span>
          </p>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: reposición de caja chica"
            className={inputCls}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
          {saving ? 'Transfiriendo…' : 'Transferir'}
        </TextureButton>
      </div>
    </InlinePanel>
  );
}

const TX_META: Record<BankTx['type'], { label: string; sign: string; cls: string }> = {
  CREDIT: { label: 'Entrada', sign: '+', cls: 'text-emerald-600' },
  DEBIT: { label: 'Salida', sign: '−', cls: 'text-red-600' },
  TRANSFER_IN: { label: 'Transferencia recibida', sign: '+', cls: 'text-emerald-600' },
  TRANSFER_OUT: { label: 'Transferencia enviada', sign: '−', cls: 'text-red-600' },
};

/** Detalle de una cuenta: su libro de movimientos con filtro por fecha + ajuste manual. */
function AccountDetail({ account, symbol, onClose }: { account: BankAccount; symbol: string; onClose: () => void }) {
  const [range, setRange] = useState<Range>('month');
  const [date, setDate] = useState('');
  const [rows, setRows] = useState<BankTx[] | null>(null);
  const [balance, setBalance] = useState(account.balance);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustDirection, setAdjustDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTx = useCallback(() => {
    api
      .get(`/bank-accounts/${account.id}/transactions`, { params: { range, date: date || undefined } })
      .then((res) => setRows(res.data.data))
      .catch(() => setError('No se pudieron cargar los movimientos.'));
  }, [account.id, range, date]);

  useEffect(loadTx, [loadTx]);

  async function adjust() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/bank-accounts/${account.id}/adjust`, {
        direction: adjustDirection,
        amount: Number(adjustAmount) || 0,
        note: adjustNote.trim() || null,
      });
      setBalance(Number(res.data.data.balance).toFixed(2));
      setShowAdjust(false);
      setAdjustAmount('');
      setAdjustNote('');
      loadTx();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo ajustar el saldo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlinePanel
      title={account.name}
      description={`Saldo actual: ${formatAccountAmount(balance, account.currency, symbol)}`}
      onClose={onClose}
      closeLabel="← Volver"
      size="wide"
      actions={
        <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setShowAdjust((s) => !s)}>
          Ajustar saldo
        </TextureButton>
      }
    >
      <div className="space-y-4">
        {showAdjust && (
          <div className="rounded-xl border border-brand-950/10 p-3 space-y-2.5">
            <div className="flex gap-1.5">
              {(
                [
                  ['CREDIT', 'Sumar'],
                  ['DEBIT', 'Restar'],
                ] as ['CREDIT' | 'DEBIT', string][]
              ).map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAdjustDirection(d)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    adjustDirection === d ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={`Monto en ${account.currency === 'BS' ? 'Bs' : symbol}`}
                className={inputCls}
              />
              <input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="Motivo (opcional)" className={inputCls} />
            </div>
            <TextureButton variant="brand" size="sm" className="!w-auto disabled:opacity-50" disabled={saving} onClick={adjust}>
              {saving ? 'Ajustando…' : 'Aplicar ajuste'}
            </TextureButton>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
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

        <div className="rounded-xl border border-brand-950/10 divide-y divide-brand-950/[0.06]">
          {rows?.length === 0 && (
            <p className="p-4 text-sm text-brand-950/40 font-light">Sin movimientos en este período.</p>
          )}
          {rows?.map((t) => {
            const meta = TX_META[t.type];
            const Icon = meta.sign === '+' ? ArrowDownLeft : ArrowUpRight;
            return (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className={`h-4 w-4 shrink-0 ${meta.cls}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-brand-950">{t.description}</p>
                  <p className="text-xs text-brand-950/40 font-light">
                    {meta.label}
                    {t.paymentMethod && ` · ${PAYMENT_LABELS[t.paymentMethod]}`}
                    {t.counterpartName && ` · ${t.counterpartName}`}
                    {' · '}
                    {new Date(t.createdAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${meta.cls}`}>
                  {meta.sign}
                  {formatAccountAmount(t.amount, account.currency, symbol)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </InlinePanel>
  );
}
