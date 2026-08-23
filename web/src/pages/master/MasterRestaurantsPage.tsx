import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { masterApi } from '@/api/client';

interface MasterRestaurant {
  id: string;
  slug: string;
  name: string;
  businessType: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE';
  isActive: boolean;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: string;
  createdAt: string;
  locked: boolean;
  daysRemaining: number;
  _count: { users: number; tables: number; orders: number; companies: number };
}

type Vertical = 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE';

const VERTICALES: { id: Vertical; label: string; vacio: string }[] = [
  { id: 'RESTAURANT', label: 'Restaurantes', vacio: 'Todavía no hay restaurantes.' },
  { id: 'SHOP', label: 'Locales Comerciales', vacio: 'Todavía no hay locales comerciales.' },
  { id: 'SPORTS_CLUB', label: 'Canchas', vacio: 'Todavía no hay clubes de canchas.' },
  { id: 'ADMIN_OFFICE', label: 'Administración', vacio: 'Todavía no hay cuentas de administración.' },
];

export default function MasterRestaurantsPage() {
  const [restaurants, setRestaurants] = useState<MasterRestaurant[] | null>(null);
  const [vertical, setVertical] = useState<Vertical>('RESTAURANT');

  useEffect(() => {
    masterApi.get('/master/restaurants').then((res) => setRestaurants(res.data.data));
  }, []);

  if (!restaurants) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  const filtered = restaurants.filter((r) => r.businessType === vertical);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Locales</h1>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mt-4">
          {VERTICALES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVertical(v.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                vertical === v.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
              }`}
            >
              {v.label} ({restaurants.filter((r) => r.businessType === v.id).length})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-brand-950/40 font-light">
          {VERTICALES.find((v) => v.id === vertical)?.vacio}
        </p>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {filtered.map((r) => (
          <Link
            key={r.id}
            to={`/master/restaurants/${r.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-brand-950/[0.02] transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-brand-950 truncate">{r.name}</p>
              <p className="text-xs text-brand-950/40 font-light truncate">/{r.slug}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs text-brand-950/50 font-light">
              <span>{r._count.users} usuarios</span>
              {r.businessType === 'ADMIN_OFFICE' ? (
                <span>{r._count.companies} empresa{r._count.companies === 1 ? '' : 's'}</span>
              ) : (
                <>
                  <span>{r._count.tables} mesas</span>
                  <span>{r._count.orders} pedidos</span>
                </>
              )}
              <StatusBadge r={r} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ r }: { r: MasterRestaurant }) {
  if (r.locked) {
    return <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-1 font-medium">Bloqueada</span>;
  }
  if (r.subscriptionStatus === 'TRIALING') {
    return (
      <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-medium">
        Prueba · {r.daysRemaining}d
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 font-medium">
      {r.subscriptionPlan} · {r.daysRemaining}d
    </span>
  );
}
