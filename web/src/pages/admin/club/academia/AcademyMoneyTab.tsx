import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { card } from '../clubStyle';
import { academyApi } from './academyApi';

interface Charge {
  id: string;
  periodYear: number;
  periodMonth: number;
  amountBase: string;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'WAIVED' | 'OVERDUE';
  enrollment: {
    student: { customer: { name: string; phone: string } };
    group: { name: string };
  };
  payments: { amountBase: string }[];
}

interface Revenue {
  collectedBase: string;
  paymentsCount: number;
  groups: { groupId: string; name: string; sessions: number; consumedBase: string; coachCostBase: string; marginBase: string }[];
}

const STATUS_LABELS: Record<Charge['status'], string> = {
  PENDING: 'Pendiente',
  PAID: 'Pagada',
  WAIVED: 'Condonada',
  OVERDUE: 'Vencida',
};

const STATUS_COLORS: Record<Charge['status'], string> = {
  PENDING: 'text-amber-700 bg-amber-50 border-amber-200',
  PAID: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  WAIVED: 'text-brand-950/50 bg-brand-950/[0.04] border-brand-950/10',
  OVERDUE: 'text-red-700 bg-red-50 border-red-200',
};

export default function AcademyMoneyTab({ restaurant }: { restaurant: Pick<AuthRestaurant, 'currencySymbol'> }) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    Promise.all([academyApi.listCharges({}), academyApi.revenue()])
      .then(([c, r]) => {
        setCharges(c as Charge[]);
        setRevenue(r as Revenue);
      })
      .catch(() => setError('No pudimos cargar los cobros.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>, msg: (r: never) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      setNotice(msg(r as never));
      load();
    } catch {
      setError('No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando cobros…</p>;

  const pending = charges.filter((c) => c.status === 'PENDING' || c.status === 'OVERDUE');

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className={`${card} p-5`}>
        <p className="text-sm font-bold text-brand-950">Mensualidades</p>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          Generar el mes es idempotente: puedes correrlo las veces que quieras sin duplicarle la deuda a nadie.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TextureButton
            variant="minimal"
            size="default"
            className="!w-auto"
            disabled={busy}
            onClick={() => run(() => academyApi.generateCharges(), (r: { created: number }) => `${r.created} mensualidad(es) generadas.`)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Generar mes
          </TextureButton>
          <TextureButton
            variant="minimal"
            size="default"
            className="!w-auto"
            disabled={busy || pending.length === 0}
            onClick={() => run(() => academyApi.notifyCharges(), (r: { sent: number }) => `${r.sent} aviso(s) enviados por WhatsApp.`)}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Avisar por WhatsApp
          </TextureButton>
        </div>

        {charges.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">No hay mensualidades generadas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {charges.slice(0, 40).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-950">
                    {c.enrollment.student.customer.name}
                  </span>
                  <span className="block text-xs font-light text-brand-950/50">
                    {c.enrollment.group.name} · {String(c.periodMonth).padStart(2, '0')}/{c.periodYear}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[c.status]}`}
                >
                  {STATUS_LABELS[c.status]}
                </span>
                <span className="shrink-0 text-sm font-bold text-brand-950">{formatBase(c.amountBase, symbol)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revenue && (
        <div className={`${card} p-5`}>
          <p className="text-sm font-bold text-brand-950">Rentabilidad por grupo</p>
          <p className="mt-0.5 text-xs font-light text-brand-950/50">
            Últimos 30 días. Cobrado: {formatBase(revenue.collectedBase, symbol)} en {revenue.paymentsCount} pago(s).
          </p>
          {revenue.groups.length === 0 ? (
            <p className="py-6 text-center text-sm font-light text-brand-950/40">Aún no hay clases dadas.</p>
          ) : (
            <ul className="mt-3 divide-y divide-brand-950/[0.06]">
              {revenue.groups.map((g) => (
                <li key={g.groupId} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-brand-950">{g.name}</span>
                    <span className="block text-xs font-light text-brand-950/50">
                      {g.sessions} clases · profesor {formatBase(g.coachCostBase, symbol)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-sm font-bold ${Number(g.marginBase) < 0 ? 'text-red-600' : 'text-brand-950'}`}>
                      {formatBase(g.marginBase, symbol)}
                    </span>
                    <span className="block text-[11px] font-light text-brand-950/40">margen</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
