import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { InlinePanel } from '../InlinePanel';
import {
  crmApi,
  SEGMENT_LABELS,
  waPhoneOf,
  type CrmCustomer,
  type CrmProfile,
  type CrmSegment,
  type CrmSummary,
} from './crmApi';

const card = 'rounded-2xl border border-brand-950/10 bg-white shadow-sm';
const inputCls =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

function fmtDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('es-VE') : '—';
}

/**
 * CRM → Clientes: la lista con segmentos (las "listas de clientes" de las promos),
 * la ficha completa con historial, y el interruptor de datos obligatorios.
 */
export function CustomersSection() {
  const { restaurant, refresh } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<CrmSegment>('ALL');
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [view, setView] = useState<'list' | 'new' | 'profile'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingRequire, setTogglingRequire] = useState(false);

  const load = useCallback(() => {
    crmApi
      .customers({ search: search.trim() || undefined, segment })
      .then((d) => {
        setCustomers(d.customers);
        setSummary(d.summary);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar el CRM.'));
  }, [search, segment]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function toggleRequire() {
    setTogglingRequire(true);
    try {
      await api.patch('/restaurant', { requireCustomerData: !restaurant?.requireCustomerData });
      await refresh();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo cambiar el ajuste.');
    } finally {
      setTogglingRequire(false);
    }
  }

  if (view === 'new') {
    return (
      <CustomerForm
        symbol={symbol}
        onClose={() => setView('list')}
        onSaved={() => {
          setView('list');
          load();
        }}
      />
    );
  }

  if (view === 'profile' && selectedId) {
    return (
      <CustomerProfile
        id={selectedId}
        symbol={symbol}
        onClose={() => {
          setView('list');
          setSelectedId(null);
          load();
        }}
      />
    );
  }

  const segmentCount = (s: CrmSegment) =>
    !summary
      ? null
      : s === 'ALL'
        ? summary.total
        : s === 'FREQUENT'
          ? summary.frequent
          : s === 'NEW'
            ? summary.new
            : s === 'INACTIVE'
              ? summary.inactive
              : summary.birthday;

  return (
    <div className="flex flex-col gap-4">
      {/* Interruptor de datos obligatorios: es lo que garantiza que las listas se llenen. */}
      <div className={`${card} flex flex-wrap items-center gap-3 p-4`}>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-brand-950">Exigir datos del cliente</p>
          <p className="text-[12px] font-light text-brand-950/50">
            Con esto activo, toda venta pide nombre y teléfono obligatorios — así se llenan las listas del CRM y las
            promociones llegan a gente real.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(restaurant?.requireCustomerData)}
          disabled={togglingRequire}
          onClick={toggleRequire}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            restaurant?.requireCustomerData ? 'bg-brand-500' : 'bg-brand-950/15'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              restaurant?.requireCustomerData ? 'translate-x-5' : ''
            }`}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o cédula…"
            className={`${inputCls} pl-9`}
          />
        </div>
        <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setView('new')}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Añadir cliente
        </TextureButton>
      </div>

      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {(Object.keys(SEGMENT_LABELS) as CrmSegment[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSegment(s)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                segment === s ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {SEGMENT_LABELS[s]}
              {segmentCount(s) != null && (
                <span className="ml-1.5 text-[11px] font-medium text-brand-950/40">{segmentCount(s)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className={`${card} overflow-x-auto`}>
        <div className="flex min-w-[640px] items-center gap-3 border-b border-brand-950/[0.06] px-5 py-2 text-[11px] font-medium uppercase tracking-wide text-brand-950/40">
          <span className="flex-1">Cliente</span>
          <span className="w-32 shrink-0">Teléfono</span>
          <span className="w-16 shrink-0 text-right">Visitas</span>
          <span className="w-24 shrink-0 text-right">Gastado</span>
          <span className="w-24 shrink-0 text-right">Última visita</span>
        </div>
        <div className="divide-y divide-brand-950/[0.06]">
          {customers.length === 0 && (
            <p className="p-5 text-sm font-light text-brand-950/40">
              {segment === 'ALL'
                ? 'Todavía no hay clientes registrados. Se crean solos con cada venta que capture nombre y teléfono.'
                : 'Ningún cliente cae en este segmento por ahora.'}
            </p>
          )}
          {customers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedId(c.id);
                setView('profile');
              }}
              className="flex w-full min-w-[640px] items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors hover:bg-brand-950/[0.03]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-brand-950">{c.name}</span>
                <span className="block truncate text-xs font-light text-brand-950/40">
                  {c.email || c.idNumber || (c.birthday ? `Cumple: ${fmtDate(c.birthday)}` : 'Sin datos extra')}
                </span>
              </span>
              <span className="w-32 shrink-0 text-xs text-brand-950/60">{c.phone}</span>
              <span className="w-16 shrink-0 text-right font-semibold text-brand-950">{c.visits}</span>
              <span className="w-24 shrink-0 text-right font-semibold text-brand-950">
                {formatBase(c.totalBase, symbol)}
              </span>
              <span className="w-24 shrink-0 text-right text-xs text-brand-950/50">{fmtDate(c.lastVisit)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Alta manual de un cliente, con la ficha CRM completa. */
function CustomerForm({ symbol: _symbol, onClose, onSaved }: { symbol: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', idNumber: '', email: '', birthday: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Nombre y teléfono son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await crmApi.createCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        idNumber: form.idNumber.trim() || null,
        email: form.email.trim() || null,
        birthday: form.birthday || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
      onSaved();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el cliente.');
      setSaving(false);
    }
  }

  return (
    <InlinePanel title="Añadir cliente" description="Nombre y teléfono son obligatorios; el resto suma para las promos." onClose={onClose}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={form.name} onChange={set('name')} placeholder="Nombre *" className={inputCls} />
        <input value={form.phone} onChange={set('phone')} placeholder="Teléfono *" className={inputCls} />
        <input value={form.idNumber} onChange={set('idNumber')} placeholder="Cédula/RIF" className={inputCls} />
        <input value={form.email} onChange={set('email')} placeholder="Correo" className={inputCls} />
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-brand-950/50">Cumpleaños</span>
          <input type="date" value={form.birthday} onChange={set('birthday')} className={inputCls} />
        </label>
        <input value={form.address} onChange={set('address')} placeholder="Dirección" className={`${inputCls} sm:self-end`} />
        <textarea value={form.notes} onChange={set('notes')} placeholder="Nota (alergias, preferencias…)" rows={2} className={`${inputCls} sm:col-span-2`} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="mt-3 !w-auto disabled:opacity-50">
        {saving ? 'Guardando…' : 'Guardar cliente'}
      </TextureButton>
    </InlinePanel>
  );
}

/** La ficha del cliente: datos editables, historial, promos y canjes. */
function CustomerProfile({ id, symbol, onClose }: { id: string; symbol: string; onClose: () => void }) {
  const [profile, setProfile] = useState<CrmProfile | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', idNumber: '', email: '', birthday: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    crmApi
      .profile(id)
      .then((p) => {
        setProfile(p);
        setForm({
          name: p.name,
          phone: p.phone,
          idNumber: p.idNumber ?? '',
          email: p.email ?? '',
          birthday: p.birthday ?? '',
          address: p.address ?? '',
          notes: p.notes ?? '',
        });
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la ficha.'));
  }, [id]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Nombre y teléfono son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await crmApi.updateCustomer(id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        idNumber: form.idNumber.trim() || null,
        email: form.email.trim() || null,
        birthday: form.birthday || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
      setMessage('Ficha guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await crmApi.deleteCustomer(id);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar.');
    }
  }

  if (!profile) {
    return (
      <InlinePanel title="Ficha del cliente" onClose={onClose} closeLabel="← Volver">
        <p className="text-sm font-light text-brand-950/40">{error ?? 'Cargando…'}</p>
      </InlinePanel>
    );
  }

  return (
    <InlinePanel
      title={profile.name}
      description={`Cliente desde ${fmtDate(profile.createdAt)}`}
      onClose={onClose}
      closeLabel="← Volver"
      size="wide"
      actions={
        <a
          href={`https://wa.me/${waPhoneOf(profile.phone)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" /> WhatsApp
        </a>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">Datos</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={form.name} onChange={set('name')} placeholder="Nombre *" className={inputCls} />
            <input value={form.phone} onChange={set('phone')} placeholder="Teléfono *" className={inputCls} />
            <input value={form.idNumber} onChange={set('idNumber')} placeholder="Cédula/RIF" className={inputCls} />
            <input value={form.email} onChange={set('email')} placeholder="Correo" className={inputCls} />
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-brand-950/50">Cumpleaños</span>
              <input type="date" value={form.birthday} onChange={set('birthday')} className={inputCls} />
            </label>
            <input value={form.address} onChange={set('address')} placeholder="Dirección" className={`${inputCls} sm:self-end`} />
            <textarea value={form.notes} onChange={set('notes')} placeholder="Nota (alergias, preferencias…)" rows={2} className={`${inputCls} sm:col-span-2`} />
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {message && <p className="mt-2 text-sm text-brand-500">{message}</p>}
          <div className="mt-3 flex items-center gap-2">
            <TextureButton variant="brand" size="sm" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </TextureButton>
            <button
              type="button"
              onClick={remove}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                confirmDelete ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" /> {confirmDelete ? '¿Seguro? Toca otra vez' : 'Eliminar'}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">Historial reciente</p>
            <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
              {profile.history.length === 0 && (
                <p className="p-4 text-sm font-light text-brand-950/40">Sin compras registradas todavía.</p>
              )}
              {profile.history.map((h, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-brand-950/50">{fmtDate(h.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-brand-950">{h.detail}</span>
                  <span className="shrink-0 font-semibold text-brand-950">{formatBase(h.amountBase, symbol)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">Promociones</p>
            <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
              {profile.promotions.length === 0 && (
                <p className="p-4 text-sm font-light text-brand-950/40">No está en ninguna campaña todavía.</p>
              )}
              {profile.promotions.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <UserRound className="h-4 w-4 shrink-0 text-brand-950/30" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-brand-950">{p.name}</span>
                    <span className="block text-xs font-light text-brand-950/40">
                      Código {p.code}
                      {p.sentAt ? ` · enviada ${fmtDate(p.sentAt)}` : ' · sin enviar'}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-950/[0.06] text-brand-950/50'
                    }`}
                  >
                    {p.isActive ? 'Activa' : 'Apagada'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {profile.redemptions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-950/40">Canjes</p>
              <div className={`${card} divide-y divide-brand-950/[0.06] overflow-hidden`}>
                {profile.redemptions.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-20 shrink-0 text-xs text-brand-950/50">{fmtDate(r.createdAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-brand-950">
                      {r.promotionName} ({r.code})
                    </span>
                    <span className="shrink-0 font-semibold text-emerald-600">−{formatBase(r.amountBase, symbol)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </InlinePanel>
  );
}
