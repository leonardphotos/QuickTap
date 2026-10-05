import { useEffect, useState } from 'react';
import { api } from '@/api/client';

type Resource = 'users' | 'tables' | 'products' | 'kitchens' | 'sites';
const labels: Record<Resource, string> = { users: 'Usuarios activos (incluye dueño)', tables: 'Mesas', products: 'Productos', kitchens: 'Estaciones de cocina/impresión', sites: 'Sedes' };
export function MembershipCapacity() {
  const [capacity, setCapacity] = useState<{ limits: Record<Resource, number | null> | null; usage: Record<Resource, number> } | null>(null);
  useEffect(() => { api.get('/plan-requests/capacity').then(r => setCapacity(r.data.data)).catch(() => {}); }, []);
  if (!capacity?.limits) return null;
  return <section className="rounded-2xl border border-blue-100 bg-white p-5">
    <h2 className="font-semibold text-brand-950">Capacidad de tu membresía</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {(Object.keys(labels) as Resource[]).map(key => {
        const limit = capacity.limits![key];
        const reached = limit !== null && capacity.usage[key] >= limit;
        return <div key={key} className={reached ? 'rounded-xl bg-amber-50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
          <p className="text-gray-500 text-xs">{labels[key]}</p>
          <p className="font-semibold text-base">{capacity.usage[key]} / {limit ?? 'Sin límite'}</p>
          {reached && <p className="mt-1 text-amber-800 text-xs">Límite alcanzado. Elige un plan mayor abajo o solicita cotización.</p>}
        </div>;
      })}
    </div>
    <p className="mt-3 text-gray-500 text-xs">Los usuarios se cuentan entre todas las sedes. Mesas y productos ocultos también cuentan; desactivar un usuario libera su cupo.</p>
  </section>;
}
