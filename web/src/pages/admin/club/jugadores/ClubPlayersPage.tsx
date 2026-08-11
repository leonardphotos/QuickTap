import { useCallback, useEffect, useState } from 'react';
import { Ban, Plus, ShieldCheck, Star } from 'lucide-react';
import { api } from '@/api/client';
import type { AuthRestaurant } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from '../clubStyle';

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

interface ClubCustomer {
  id: string;
  name: string;
  phone: string;
  points: number;
  bookings: number;
  blockedReason: string | null;
  clubPlayerAccount: { username: string; lastLoginAt: string | null } | null;
}

interface BlacklistEntry {
  id: string;
  phone: string;
  reason: string;
  automatic: boolean;
  noShowCount: number;
  createdAt: string;
  customer: { name: string } | null;
}

interface BookingSettings {
  requirePhoneVerification: boolean;
  autoBlacklistEnabled: boolean;
  noShowStrikesToBlock: number;
  loyaltyEnabled: boolean;
  pointsPerBooking: number;
  pointsPerCurrencyUnit: string | number;
  pointsPerRedeemUnit: number;
}

type Tab = 'clientes' | 'bloqueados' | 'reglas';
const TAB_LABELS: Record<Tab, string> = { clientes: 'Clientes', bloqueados: 'Bloqueados', reglas: 'Reglas' };

/**
 * Jugadores del club: la base de clientes (entren por reserva o cargados a mano),
 * la lista negra y las reglas de verificación y fidelización.
 */
export default function ClubPlayersPage({
  restaurant,
  isAdmin,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>('clientes');
  const tabs = (Object.keys(TAB_LABELS) as Tab[]).filter((t) => isAdmin || t !== 'reglas');

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                tab === t ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === 'clientes' && <CustomersTab restaurant={restaurant} isAdmin={isAdmin} />}
      {tab === 'bloqueados' && <BlacklistTab isAdmin={isAdmin} />}
      {tab === 'reglas' && isAdmin && <RulesTab restaurant={restaurant} />}
    </div>
  );
}

function CustomersTab({
  restaurant,
  isAdmin,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<ClubCustomer[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pointsFor, setPointsFor] = useState<ClubCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ data: ClubCustomer[] }>('/club/players/customers', { params: { q: q || undefined } })
      .then((r) => setRows(r.data.data))
      .catch(() => setError('No pudimos cargar los clientes.'))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(load, [load]);

  return (
    <div className={`${card} p-5`}>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-brand-950">Clientes</p>
        <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Agregar
        </TextureButton>
      </div>
      <p className="mt-0.5 text-xs font-light text-brand-950/50">
        Los que reservaron alguna vez y los cargados a mano, en la misma lista.
      </p>

      <input value={q} onChange={(e) => setQ(e.target.value)} className={`${INPUT} mt-3`} placeholder="Buscar por nombre o teléfono…" />

      {loading ? (
        <p className="py-6 text-center text-sm font-light text-brand-950/40">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm font-light text-brand-950/40">No hay clientes todavía.</p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-950/[0.06]">
          {rows.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-950">
                    {c.name}
                    {c.blockedReason && (
                      <span className="ml-1.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        BLOQUEADO
                      </span>
                    )}
                  </p>
                  <p className="text-xs font-light text-brand-950/50">
                    {c.phone}
                    {c.clubPlayerAccount && ` · @${c.clubPlayerAccount.username}`}
                    {` · ${c.bookings} reserva${c.bookings === 1 ? '' : 's'}`}
                  </p>
                  {c.blockedReason && <p className="text-xs font-light text-red-600">{c.blockedReason}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="flex items-center justify-end gap-1 text-sm font-bold text-brand-950">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    {c.points}
                  </p>
                  <p className="text-[11px] font-light text-brand-950/40">puntos</p>
                </div>
              </div>
              {isAdmin && (
                <div className="mt-2">
                  <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setPointsFor(c)}>
                    Puntos
                  </TextureButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CustomerDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {pointsFor && (
        <PointsDialog
          customer={pointsFor}
          symbol={restaurant.currencySymbol ?? '$'}
          onClose={() => setPointsFor(null)}
          onSaved={() => {
            setPointsFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CustomerDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !phone.trim()) return setError('Nombre y teléfono son obligatorios.');
    setSaving(true);
    setError(null);
    try {
      await api.post('/club/players/customers', { name: name.trim(), phone: phone.trim(), idNumber: idNumber.trim() || null });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Teléfono *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} placeholder="04141234567" />
          </Field>
          <Field label="Cédula">
            <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={INPUT} placeholder="Opcional" />
          </Field>
          <p className="text-xs font-light text-brand-950/40">
            Si este teléfono ya existe se actualizan sus datos, no se crea un duplicado.
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

function PointsDialog({
  customer,
  symbol,
  onClose,
  onSaved,
}: {
  customer: ClubCustomer;
  symbol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [redeem, setRedeem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function adjust() {
    if (!delta || Number(delta) === 0) return setError('Escribe cuántos puntos sumar o restar.');
    if (note.trim().length < 3) return setError('El motivo es obligatorio.');
    setSaving(true);
    setError(null);
    try {
      await api.post(`/club/players/customers/${customer.id}/points`, { delta: Number(delta), note: note.trim() });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo ajustar.');
      setSaving(false);
    }
  }

  async function doRedeem() {
    if (!redeem || Number(redeem) <= 0) return setError('Escribe cuántos puntos canjear.');
    setSaving(true);
    setError(null);
    try {
      const r = await api.post(`/club/players/customers/${customer.id}/redeem`, { points: Number(redeem) });
      setError(null);
      alert(`Canjeado: ${symbol}${r.data.data.valueBase} de descuento.`);
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo canjear.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Puntos de {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-brand-950">
            Saldo actual: <span className="font-bold">{customer.points}</span> puntos
          </p>

          <Field label="Canjear puntos">
            <input type="number" min="1" value={redeem} onChange={(e) => setRedeem(e.target.value)} className={INPUT} placeholder="0" />
          </Field>
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={doRedeem}>
            Canjear
          </TextureButton>

          <div className="border-t border-brand-950/[0.06] pt-3">
            <Field label="Ajuste manual (+ o −)">
              <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} className={INPUT} placeholder="Ej: 50 o -20" />
            </Field>
            <Field label="Motivo *">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Por qué se ajusta" />
            </Field>
            <p className="mt-1 text-xs font-light text-brand-950/40">
              Todo ajuste queda en el libro de puntos con su motivo: por eso se puede auditar de dónde salió cada punto.
            </p>
            <TextureButton variant="minimal" size="default" disabled={saving} className="mt-2 disabled:opacity-50" onClick={adjust}>
              Guardar ajuste
            </TextureButton>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlacklistTab({ isAdmin }: { isAdmin: boolean }) {
  const [rows, setRows] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ data: BlacklistEntry[] }>('/club/players/blacklist')
      .then((r) => setRows(r.data.data))
      .catch(() => setError('No pudimos cargar la lista.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function lift(id: string) {
    await api.post(`/club/players/blacklist/${id}/lift`, { reason: 'Desbloqueado desde el panel' });
    load();
  }

  return (
    <div className={`${card} p-5`}>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-950">
          <Ban className="h-4 w-4 text-red-500" />
          Bloqueados
        </p>
        <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Bloquear
        </TextureButton>
      </div>
      <p className="mt-0.5 text-xs font-light text-brand-950/50">
        No pueden reservar por internet. Recepción sí puede anotarlos a mano.
      </p>

      {loading ? (
        <p className="py-6 text-center text-sm font-light text-brand-950/40">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm font-light text-brand-950/40">Nadie bloqueado. Bien.</p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-950/[0.06]">
          {rows.map((b) => (
            <li key={b.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-950">{b.customer?.name ?? b.phone}</p>
                  <p className="text-xs font-light text-brand-950/50">
                    {b.phone} · {b.automatic ? 'automático' : 'manual'}
                  </p>
                  <p className="text-xs font-light text-red-600">{b.reason}</p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => lift(b.id)}
                    className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-500 hover:text-brand-600"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Desbloquear
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <BlockDialog
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function BlockDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!phone.trim() || reason.trim().length < 3) return setError('Teléfono y motivo son obligatorios.');
    setSaving(true);
    setError(null);
    try {
      await api.post('/club/players/blacklist', { phone: phone.trim(), reason: reason.trim() });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo bloquear.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bloquear un teléfono</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Teléfono *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} placeholder="04141234567" />
          </Field>
          <Field label="Motivo *">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={INPUT} placeholder="Por qué se bloquea" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Bloqueando…' : 'Bloquear'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RulesTab({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [s, setS] = useState<BookingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const symbol = restaurant.currencySymbol ?? '$';

  useEffect(() => {
    api.get<{ data: BookingSettings }>('/club/players/settings').then((r) => setS(r.data.data));
  }, []);

  async function save(patch: Partial<BookingSettings>) {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    setSaved(false);
    await api.put('/club/players/settings', {
      ...patch,
      pointsPerCurrencyUnit: patch.pointsPerCurrencyUnit != null ? Number(patch.pointsPerCurrencyUnit) : undefined,
    });
    setSaving(false);
    setSaved(true);
  }

  if (!s) return <p className="text-sm font-light text-brand-950/40">Cargando reglas…</p>;

  return (
    <div className="flex flex-col gap-5">
      <div className={`${card} p-5`}>
        <p className="text-sm font-bold text-brand-950">Reservar por internet</p>
        <Toggle
          label="Pedir código por WhatsApp"
          hint="El jugador tiene que confirmar su número antes de cerrar la reserva."
          checked={s.requirePhoneVerification}
          onChange={(v) => save({ requirePhoneVerification: v })}
        />
        <Toggle
          label="Bloquear automáticamente a quien falta"
          hint="Quien no se presenta ni escanea su QR queda sin poder reservar por internet."
          checked={s.autoBlacklistEnabled}
          onChange={(v) => save({ autoBlacklistEnabled: v })}
        />
        {s.autoBlacklistEnabled && (
          <>
            <label className="mt-3 block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Ausencias antes de bloquear</span>
              <input
                type="number"
                min="1"
                max="10"
                value={s.noShowStrikesToBlock}
                onChange={(e) => save({ noShowStrikesToBlock: Number(e.target.value) })}
                className={INPUT}
              />
            </label>
            {/* El aviso importa: settlePastBookings marca ausente a toda reserva sin
                check-in, así que en un club que no escanea, esto alcanzaría a todos. */}
            <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-light text-amber-900">
              Esto solo funciona si de verdad escaneas los QR en recepción: una reserva sin escanear cuenta como
              ausencia. Mientras el club no registre ningún check-in, no se bloquea a nadie.
            </p>
          </>
        )}
      </div>

      <div className={`${card} p-5`}>
        <p className="text-sm font-bold text-brand-950">Fidelización</p>
        <Toggle
          label="Dar puntos por jugar y consumir"
          hint="Se otorgan al cerrarse la reserva, no al reservarla."
          checked={s.loyaltyEnabled}
          onChange={(v) => save({ loyaltyEnabled: v })}
        />
        {s.loyaltyEnabled && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Puntos por reserva</span>
              <input
                type="number"
                min="0"
                value={s.pointsPerBooking}
                onChange={(e) => save({ pointsPerBooking: Number(e.target.value) })}
                className={INPUT}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Puntos por cada {symbol}1</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={Number(s.pointsPerCurrencyUnit)}
                onChange={(e) => save({ pointsPerCurrencyUnit: Number(e.target.value) })}
                className={INPUT}
              />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-[13px] font-medium text-brand-950/70">
                Puntos que equivalen a {symbol}1 al canjear
              </span>
              <input
                type="number"
                min="1"
                value={s.pointsPerRedeemUnit}
                onChange={(e) => save({ pointsPerRedeemUnit: Number(e.target.value) })}
                className={INPUT}
              />
            </label>
          </div>
        )}
      </div>

      {saving && <p className="text-sm font-light text-brand-950/40">Guardando…</p>}
      {saved && !saving && <p className="text-sm text-emerald-700">Guardado.</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-3 flex items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-brand-950">{label}</span>
        <span className="block text-xs font-light text-brand-950/50">{hint}</span>
      </span>
    </label>
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
