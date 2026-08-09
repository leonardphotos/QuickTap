import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { masterApi } from '@/api/client';

interface MasterRestaurant {
  id: string;
  slug: string;
  name: string;
  businessType: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';
  isActive: boolean;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: string;
  createdAt: string;
  locked: boolean;
  daysRemaining: number;
  _count: { users: number; tables: number; orders: number };
}

export default function MasterRestaurantsPage() {
  const [restaurants, setRestaurants] = useState<MasterRestaurant[] | null>(null);
  const [vertical, setVertical] = useState<'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB'>('RESTAURANT');

  useEffect(() => {
    masterApi.get('/master/restaurants').then((res) => setRestaurants(res.data.data));
  }, []);

  if (!restaurants) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  const filtered = restaurants.filter((r) => r.businessType === vertical);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Locales</h1>
        <div className="inline-flex items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mt-4">
          <button
            type="button"
            onClick={() => setVertical('RESTAURANT')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              vertical === 'RESTAURANT' ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
            }`}
          >
            Restaurantes ({restaurants.filter((r) => r.businessType === 'RESTAURANT').length})
          </button>
          <button
            type="button"
            onClick={() => setVertical('SHOP')}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              vertical === 'SHOP' ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
            }`}
          >
            Locales Comerciales ({restaurants.filter((r) => r.businessType === 'SHOP').length})
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-brand-950/40 font-light">
          {vertical === 'RESTAURANT' ? 'Todavía no hay restaurantes.' : 'Todavía no hay locales comerciales.'}
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
              <span>{r._count.tables} mesas</span>
              <span>{r._count.orders} pedidos</span>
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
