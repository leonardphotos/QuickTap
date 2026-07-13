import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';

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
  locked: boolean;
  daysRemaining: number;
  users: { id: string; name: string; email: string; role: string; isActive: boolean }[];
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

const PLAN_OPTIONS = ['STARTER', 'PRO', 'PREMIUM', 'CUSTOM'] as const;
const CYCLE_OPTIONS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'] as const;

export default function MasterRestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<RestaurantDetail | null>(null);
  const [plan, setPlan] = useState<(typeof PLAN_OPTIONS)[number]>('PRO');
  const [cycle, setCycle] = useState<(typeof CYCLE_OPTIONS)[number]>('MONTHLY');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    masterApi.get(`/master/restaurants/${id}`).then((res) => setDetail(res.data.data));
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

  if (!detail) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">{detail.name}</h1>
        <p className="text-sm text-brand-950/40 font-light">/{detail.slug}</p>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <Stat label="Usuarios" value={detail.users.length} />
        <Stat label="Mesas" value={detail._count.tables} />
        <Stat label="Productos" value={detail._count.products} />
        <Stat label="Pedidos" value={detail._count.orders} />
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div>
          <p className="font-semibold text-brand-950">Suscripción</p>
          <p className="text-sm text-brand-950/60 font-light mt-1">
            {detail.locked
              ? 'Bloqueada por falta de pago.'
              : `${detail.subscriptionStatus === 'TRIALING' ? 'En prueba' : `Plan ${detail.subscriptionPlan}`} · vence en ${detail.daysRemaining} día(s) (${new Date(detail.periodEnd).toLocaleDateString('es-VE')}).`}
          </p>
        </div>

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
        {message && <p className="text-sm text-brand-950/70">{message}</p>}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
        <p className="font-semibold text-brand-950 mb-3">Equipo</p>
        <ul className="space-y-2 text-sm">
          {detail.users.map((u) => (
            <li key={u.id} className="flex items-center justify-between">
              <span className="text-brand-950/80">
                {u.name} <span className="text-brand-950/40 font-light">· {u.email}</span>
              </span>
              <span className="text-xs text-brand-950/50">{u.role}</span>
            </li>
          ))}
        </ul>
      </div>

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
