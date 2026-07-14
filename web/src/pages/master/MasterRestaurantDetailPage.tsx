import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface RestaurantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface RestaurantDetail {
  id: string;
  slug: string;
  name: string;
  whatsappPhone: string | null;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: string;
  createdAt: string;
  suspended: boolean;
  locked: boolean;
  daysRemaining: number;
  users: RestaurantUser[];
  _count: { products: number; tables: number; orders: number };
  recentOrders: {
    id: string;
    orderNumber: number;
    channel: string;
    status: string;
    currency: string;
    totalBase: string;
    createdAt: string;
  }[];
}

const PLAN_OPTIONS = ['DELIVERY', 'STARTER', 'PRO', 'PREMIUM', 'CUSTOM'] as const;
const CYCLE_OPTIONS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'] as const;

export default function MasterRestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RestaurantDetail | null>(null);
  const [plan, setPlan] = useState<(typeof PLAN_OPTIONS)[number]>('PRO');
  const [cycle, setCycle] = useState<(typeof CYCLE_OPTIONS)[number]>('MONTHLY');
  const [extendDays, setExtendDays] = useState(30);
  const [exactPeriodEnd, setExactPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<RestaurantUser | null>(null);

  function load() {
    masterApi.get(`/master/restaurants/${id}`).then((res) => {
      const data: RestaurantDetail = res.data.data;
      setDetail(data);
      setExactPeriodEnd(data.periodEnd.slice(0, 10));
    });
  }

  useEffect(load, [id]);

  async function activate() {
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.post(`/master/restaurants/${id}/activate`, { plan, billingCycle: cycle });
      setMessage('Suscripción activada/extendida.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo activar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSuspended() {
    if (!detail) return;
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/suspend`, { suspended: !detail.suspended });
      setMessage(detail.suspended ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  }

  async function applyExtendDays() {
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/extend`, { days: extendDays });
      setMessage(`Vencimiento ajustado ${extendDays >= 0 ? '+' : ''}${extendDays} día(s).`);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo ajustar.');
    } finally {
      setBusy(false);
    }
  }

  async function applyExactPeriodEnd() {
    if (!exactPeriodEnd) return;
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/period-end`, { periodEnd: exactPeriodEnd });
      setMessage('Fecha de vencimiento actualizada.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar la fecha.');
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(input: { name: string; email: string; password: string }) {
    if (!editingUser) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, string> = {};
      if (input.name.trim()) payload.name = input.name.trim();
      if (input.email.trim()) payload.email = input.email.trim();
      if (input.password.trim()) payload.password = input.password.trim();
      await masterApi.patch(`/master/restaurants/${id}/users/${editingUser.id}`, payload);
      setMessage('Usuario actualizado.');
      setEditingUser(null);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar el usuario.');
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">{detail.name}</h1>
        <p className="text-sm text-brand-950/40 font-light">/{detail.slug}</p>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-2">
        <p className="font-semibold text-brand-950 mb-1">Información del local</p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">Nombre: </span>
          {detail.name}
        </p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">Teléfono: </span>
          {detail.whatsappPhone ?? 'No registrado'}
        </p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">Correo: </span>
          {detail.users.find((u) => u.role === 'OWNER')?.email ?? 'No registrado'}
        </p>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <Stat label="Usuarios" value={detail.users.length} />
        <Stat label="Mesas" value={detail._count.tables} />
        <Stat label="Productos" value={detail._count.products} />
        <Stat label="Pedidos" value={detail._count.orders} />
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-brand-950">Suscripción</p>
            <p className="text-sm text-brand-950/60 font-light mt-1">
              {detail.suspended
                ? 'Bloqueada manualmente desde el Dashboard maestro.'
                : detail.locked
                  ? 'Bloqueada por falta de pago.'
                  : `${detail.subscriptionStatus === 'TRIALING' ? 'En prueba' : `Plan ${detail.subscriptionPlan}`} · vence en ${detail.daysRemaining} día(s) (${new Date(detail.periodEnd).toLocaleDateString('es-VE')}).`}
            </p>
          </div>
          <TextureButton
            variant={detail.suspended ? 'brand' : 'destructive'}
            size="sm"
            disabled={busy}
            className="!w-auto px-4 shrink-0"
            onClick={toggleSuspended}
          >
            {detail.suspended ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
          </TextureButton>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Editar plan</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Plan</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as (typeof PLAN_OPTIONS)[number])}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Ciclo</span>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as (typeof CYCLE_OPTIONS)[number])}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              >
                {CYCLE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <TextureButton variant="brand" size="default" disabled={busy} className="!w-auto px-5" onClick={activate}>
              {busy ? 'Activando…' : 'Activar / Extender'}
            </TextureButton>
          </div>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Ajustar días de vencimiento</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Días (negativo para recortar)</span>
              <input
                type="number"
                value={extendDays}
                onChange={(e) => setExtendDays(Number(e.target.value))}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-32"
              />
            </label>
            <TextureButton
              variant="minimal"
              size="default"
              disabled={busy}
              className="!w-auto px-5"
              onClick={applyExtendDays}
            >
              {busy ? 'Guardando…' : 'Aplicar'}
            </TextureButton>
          </div>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Establecer fecha exacta de vencimiento</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Día / mes / año</span>
              <input
                type="date"
                value={exactPeriodEnd}
                onChange={(e) => setExactPeriodEnd(e.target.value)}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <TextureButton
              variant="minimal"
              size="default"
              disabled={busy || !exactPeriodEnd}
              className="!w-auto px-5 disabled:opacity-50"
              onClick={applyExactPeriodEnd}
            >
              {busy ? 'Guardando…' : 'Establecer fecha'}
            </TextureButton>
          </div>
        </div>

        {message && <p className="text-sm text-brand-950/70">{message}</p>}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
        <p className="font-semibold text-brand-950 mb-3">Equipo</p>
        <ul className="space-y-2 text-sm">
          {detail.users.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setEditingUser(u)}
                className="w-full flex items-center justify-between text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-brand-950/[0.04] transition-colors"
              >
                <span className="text-brand-950/80">
                  {u.name} <span className="text-brand-950/40 font-light">· {u.email}</span>
                </span>
                <span className="text-xs text-brand-950/50">{u.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          busy={busy}
          onClose={() => setEditingUser(null)}
          onSave={saveUser}
        />
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
        <p className="font-semibold text-brand-950 mb-3">Pedidos recientes</p>
        {detail.recentOrders.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">Sin pedidos todavía.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span className="text-brand-950/80">
                  #{o.orderNumber} <span className="text-brand-950/40 font-light">· {o.channel}</span>
                </span>
                <span className="text-brand-950/60">{formatBase(o.totalBase, o.currency === 'USD' ? '$' : '€')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-brand-950">{value}</p>
      <p className="text-xs text-brand-950/50 font-light">{label}</p>
    </div>
  );
}

function EditUserDialog({
  user,
  busy,
  onClose,
  onSave,
}: {
  user: RestaurantUser;
  busy: boolean;
  onClose: () => void;
  onSave: (input: { name: string; email: string; password: string }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario · {user.role}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Nueva contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Dejar en blanco para no cambiarla"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <TextureButton
            variant="brand"
            size="default"
            disabled={busy}
            className="disabled:opacity-50"
            onClick={() => onSave({ name, email, password })}
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
