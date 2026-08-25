import { waPhone } from '@/utils/waPhone';
import { useState } from 'react';
import { MessageCircle, Search, Star } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { shopMoneyFormatters } from './shopFormat';
import type { ShopSession } from './shopSession';

interface Props {
  session: ShopSession;
  restaurant: Pick<AuthRestaurant, 'currencySymbol' | 'exchangeRate'>;
}

interface CustomerRow {
  key: string;
  name: string | null;
  phone: string | null;
  visits: number;
  totalSpent: number;
  lastVisit: Date;
  points: number;
}

/**
 * Base de clientes + fidelización básica: se deriva de las ventas registradas en Venta (no hay
 * un modelo de Customer aparte todavía — mismo alcance "en memoria" que el resto de Shop). Se
 * agrupa por teléfono cuando está disponible (mismo cliente en varias compras); si solo cargaron
 * el nombre, se agrupa por nombre. Puntos: 1 punto por cada $1 gastado, sin canje todavía — solo
 * para que el dueño vea quién es cliente frecuente.
 */
export default function ShopCustomersPage({ session, restaurant }: Props) {
  const { money } = shopMoneyFormatters(restaurant);
  const { sales } = session;
  const [search, setSearch] = useState('');

  const byKey = new Map<string, CustomerRow>();
  for (const s of sales) {
    if (s.returned) continue;
    if (!s.customerName && !s.customerPhone) continue;
    const key = s.customerPhone || `name:${s.customerName}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.visits += 1;
      existing.totalSpent += s.total;
      existing.points += Math.floor(s.total);
      if (s.time > existing.lastVisit) existing.lastVisit = s.time;
      if (s.customerName) existing.name = s.customerName;
    } else {
      byKey.set(key, {
        key,
        name: s.customerName,
        phone: s.customerPhone,
        visits: 1,
        totalSpent: s.total,
        lastVisit: s.time,
        points: Math.floor(s.total),
      });
    }
  }

  const customers = [...byKey.values()]
    .filter(
      (c) =>
        !search.trim() ||
        c.name?.toLowerCase().includes(search.trim().toLowerCase()) ||
        c.phone?.includes(search.trim()),
    )
    .sort((a, b) => b.totalSpent - a.totalSpent);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-brand-950">Clientes</h1>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-950/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            className="w-full border border-brand-950/15 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
          <p className="text-sm font-medium text-brand-950/50">Clientes registrados</p>
          <p className="text-[24px] font-bold text-brand-950 tracking-tight mt-1.5">{byKey.size}</p>
        </div>
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
          <p className="text-sm font-medium text-brand-950/50">Gasto total</p>
          <p className="text-[24px] font-bold text-brand-950 tracking-tight mt-1.5">
            {money([...byKey.values()].reduce((a, c) => a + c.totalSpent, 0))}
          </p>
        </div>
        <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
          <p className="text-sm font-medium text-brand-950/50">Cliente más frecuente</p>
          <p className="text-[16px] font-bold text-brand-950 tracking-tight mt-1.5 truncate">
            {customers.length > 0 ? [...byKey.values()].sort((a, b) => b.visits - a.visits)[0].name || 'Sin nombre' : '—'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-brand-950/[0.06] bg-white shadow-sm p-5">
        {customers.length === 0 ? (
          <p className="text-sm text-brand-950/40 text-center py-8">
            Todavía no hay clientes cargados — se agregan automáticamente cuando cargas nombre o teléfono al cobrar en Venta.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold uppercase text-brand-950/40 text-left">
                  <th className="pb-2 pr-3">Cliente</th>
                  <th className="pb-2 pr-3">Visitas</th>
                  <th className="pb-2 pr-3">Gasto total</th>
                  <th className="pb-2 pr-3">Puntos</th>
                  <th className="pb-2 pr-3">Última visita</th>
                  <th className="pb-2">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.key} className="border-t border-brand-950/[0.05]">
                    <td className="py-2.5 pr-3 font-medium text-brand-950">{c.name || 'Sin nombre'}</td>
                    <td className="py-2.5 pr-3 text-brand-950/70">{c.visits}</td>
                    <td className="py-2.5 pr-3 text-brand-950/70">{money(c.totalSpent)}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        <Star className="h-3 w-3" /> {c.points}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-brand-950/50">
                      {c.lastVisit.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="py-2.5">
                      {c.phone ? (
                        <a
                          href={`https://wa.me/${waPhone(c.phone)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </a>
                      ) : (
                        <span className="text-brand-950/30 text-xs">Sin teléfono</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
