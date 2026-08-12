import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { card } from '../clubStyle';
import { academyApi } from './academyApi';
import type { DetailTarget } from './AcademyDetails';

interface Charge {
  id: string;
  periodYear: number;
  periodMonth: number;
  amountBase: string;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'WAIVED' | 'OVERDUE';
  enrollment: {
    studentId: string;
    groupId: string;
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

interface Retention {
  activeNow: number;
  currentChurnPercent: number | null;
  currentRetentionPercent: number | null;
  months: { period: string; activeStart: number; joined: number; left: number; activeEnd: number; churnPercent: number | null }[];
}

interface RevenueRow {
  id: string;
  name: string;
  sessions: number;
  revenueBase: string;
  costBase: string;
  marginBase: string;
}

interface ByCoach {
  byCoach: RevenueRow[];
  byProgram: RevenueRow[];
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

export default function AcademyMoneyTab({
  restaurant,
  onOpen,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  onOpen: (t: DetailTarget) => void;
}) {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [retention, setRetention] = useState<Retention | null>(null);
  const [byCoach, setByCoach] = useState<ByCoach | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    Promise.all([academyApi.listCharges({}), academyApi.revenue(), academyApi.retention(6), academyApi.revenueByCoach()])
      .then(([c, r, ret, rc]) => {
        setCharges(c as Charge[]);
        setRevenue(r as Revenue);
        setRetention(ret as Retention);
        setByCoach(rc as ByCoach);
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
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'student', id: c.enrollment.studentId })}
                  className="-mx-2 min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-brand-950/[0.03]"
                >
                  <span className="block truncate text-sm font-semibold text-brand-950">
                    {c.enrollment.student.customer.name}
                  </span>
                  <span className="block text-xs font-light text-brand-950/50">
                    {c.enrollment.group.name} · {String(c.periodMonth).padStart(2, '0')}/{c.periodYear}
                    {Number(c.payments.reduce((a, p) => a + Number(p.amountBase), 0)) > 0 &&
                      ` · abonó ${formatBase(c.payments.reduce((a, p) => a + Number(p.amountBase), 0), symbol)}`}
                  </span>
                </button>
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

      {retention && (
        <div className={`${card} p-5`}>
          <p className="text-sm font-bold text-brand-950">Retención de alumnos</p>
          <p className="mt-0.5 text-xs font-light text-brand-950/50">
            Cuántos siguen mes a mes y cuántos se dan de baja.
          </p>

          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[20px] font-bold tracking-tight text-brand-950">{retention.activeNow}</p>
              <p className="text-[12px] font-light text-brand-950/45">activos hoy</p>
            </div>
            <div>
              <p className="text-[20px] font-bold tracking-tight text-emerald-600">
                {retention.currentRetentionPercent === null ? '—' : `${retention.currentRetentionPercent}%`}
              </p>
              <p className="text-[12px] font-light text-brand-950/45">retención</p>
            </div>
            <div>
              <p
                className={`text-[20px] font-bold tracking-tight ${
                  (retention.currentChurnPercent ?? 0) > 20 ? 'text-red-600' : 'text-brand-950'
                }`}
              >
                {retention.currentChurnPercent === null ? '—' : `${retention.currentChurnPercent}%`}
              </p>
              <p className="text-[12px] font-light text-brand-950/45">churn</p>
            </div>
          </div>

          <ul className="mt-4 divide-y divide-brand-950/[0.06]">
            {retention.months.map((m) => (
              <li key={m.period} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-16 shrink-0 font-medium text-brand-950/70">{m.period}</span>
                <span className="min-w-0 flex-1 text-xs font-light text-brand-950/50">
                  <span className="text-emerald-600">+{m.joined}</span> altas ·{' '}
                  <span className={m.left > 0 ? 'text-red-600' : ''}>−{m.left}</span> bajas
                </span>
                <span className="shrink-0 text-sm font-bold text-brand-950">{m.activeEnd}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {byCoach && byCoach.byCoach.length > 0 && (
        <div className={`${card} p-5`}>
          <p className="text-sm font-bold text-brand-950">Facturación por entrenador</p>
          <p className="mt-0.5 text-xs font-light text-brand-950/50">
            Lo que generó su clase, no lo que se le paga. Últimos 30 días.
          </p>
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {byCoach.byCoach.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2.5">
                <button
                  type="button"
                  onClick={() => onOpen({ kind: 'coach', id: r.id })}
                  className="-mx-2 min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-brand-950/[0.03]"
                >
                  <span className="block truncate text-sm font-semibold text-brand-950">{r.name}</span>
                  <span className="block text-xs font-light text-brand-950/50">
                    {r.sessions} clases · le pagaste {formatBase(r.costBase, symbol)}
                  </span>
                </button>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-brand-950">{formatBase(r.revenueBase, symbol)}</span>
                  <span
                    className={`block text-[11px] font-light ${Number(r.marginBase) < 0 ? 'text-red-600' : 'text-brand-950/40'}`}
                  >
                    margen {formatBase(r.marginBase, symbol)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {byCoach && byCoach.byProgram.length > 0 && (
        <div className={`${card} p-5`}>
          <p className="text-sm font-bold text-brand-950">Facturación por programa</p>
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {byCoach.byProgram.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-950">{r.name}</span>
                <span className="shrink-0 text-xs font-light text-brand-950/45">{r.sessions} clases</span>
                <span className="shrink-0 text-sm font-bold text-brand-950">{formatBase(r.revenueBase, symbol)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                  <button
                    type="button"
                    onClick={() => g.groupId !== 'sueltas' && onOpen({ kind: 'group', id: g.groupId })}
                    className="-mx-2 min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition-colors hover:bg-brand-950/[0.03]"
                  >
                    <span className="block truncate text-sm font-semibold text-brand-950">{g.name}</span>
                    <span className="block text-xs font-light text-brand-950/50">
                      {g.sessions} clases · profesor {formatBase(g.coachCostBase, symbol)}
                    </span>
                  </button>
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
