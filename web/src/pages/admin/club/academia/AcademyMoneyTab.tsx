import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import {
  Cell,
  ClubBadge,
  ClubEyebrow,
  ClubMetric,
  ClubPanel,
  ClubRow,
  ClubTable,
  PlainCell,
  type BadgeTone,
  type ClubColumn,
} from '../ClubTable';
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

const STATUS_TONES: Record<Charge['status'], BadgeTone> = {
  PENDING: 'amber',
  PAID: 'emerald',
  WAIVED: 'neutral',
  OVERDUE: 'red',
};

const CHARGE_COLS: ClubColumn[] = [
  { key: 'alumno', label: 'Alumno', width: 'minmax(0,1.3fr)' },
  { key: 'grupo', label: 'Grupo', width: 'minmax(0,1.2fr)' },
  { key: 'periodo', label: 'Período', width: '104px' },
  { key: 'vence', label: 'Vence', width: '118px' },
  { key: 'abonado', label: 'Abonado', width: '112px', align: 'right' },
  { key: 'estado', label: 'Estado', width: '126px' },
  { key: 'monto', label: 'Monto', width: '118px', align: 'right' },
];

const RETENTION_COLS: ClubColumn[] = [
  { key: 'mes', label: 'Mes', width: 'minmax(0,1fr)' },
  { key: 'inicio', label: 'Al abrir', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'altas', label: 'Altas', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'bajas', label: 'Bajas', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'churn', label: 'Churn', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'fin', label: 'Al cerrar', width: 'minmax(0,1fr)', align: 'right' },
];

const COACH_COLS: ClubColumn[] = [
  { key: 'nombre', label: 'Entrenador', width: 'minmax(0,2fr)' },
  { key: 'clases', label: 'Clases', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'facturado', label: 'Facturado', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'pagado', label: 'Se le pagó', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'margen', label: 'Margen', width: 'minmax(0,1fr)', align: 'right' },
];

const PROGRAM_COLS: ClubColumn[] = [
  { key: 'nombre', label: 'Programa', width: 'minmax(0,3fr)' },
  { key: 'clases', label: 'Clases', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'facturado', label: 'Facturado', width: 'minmax(0,1fr)', align: 'right' },
];

const GROUP_COLS: ClubColumn[] = [
  { key: 'nombre', label: 'Grupo', width: 'minmax(0,2fr)' },
  { key: 'clases', label: 'Clases', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'consumido', label: 'Consumido', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'profesor', label: 'Costo profesor', width: 'minmax(0,1fr)', align: 'right' },
  { key: 'margen', label: 'Margen', width: 'minmax(0,1fr)', align: 'right' },
];

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });

/** Verde o rojo según el signo. El margen es el único número de la pantalla que
 *  puede ser negativo, y hay que verlo sin leerlo. */
function Money({ value, symbol, signed }: { value: string; symbol: string; signed?: boolean }) {
  const negative = signed && Number(value) < 0;
  return (
    <span className={`block truncate text-[13px] font-semibold tabular-nums ${negative ? 'text-red-600' : 'text-brand-950'}`}>
      {formatBase(value, symbol)}
    </span>
  );
}

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
  const pendingBase = pending.reduce(
    (acc, c) => acc + Number(c.amountBase) - c.payments.reduce((a, p) => a + Number(p.amountBase), 0),
    0,
  );

  return (
    <div className="flex flex-col gap-3.5">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <ClubEyebrow>Resumen del dinero</ClubEyebrow>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        <ClubMetric
          value={formatBase(revenue?.collectedBase ?? 0, symbol)}
          label="Cobrado"
          hint={`${revenue?.paymentsCount ?? 0} pago(s) · últimos 30 días`}
          tone="brand"
        />
        <ClubMetric
          value={formatBase(pendingBase, symbol)}
          label="Por cobrar"
          hint={`${pending.length} mensualidad(es)`}
          tone={pending.length > 0 ? 'amber' : 'default'}
          onClick={() => onOpen({ kind: 'pendingCharges' })}
        />
        <ClubMetric
          value={retention?.currentRetentionPercent === null || !retention ? '—' : `${retention.currentRetentionPercent}%`}
          label="Retención"
          hint={`${retention?.activeNow ?? 0} alumnos activos`}
        />
        <ClubMetric
          value={retention?.currentChurnPercent === null || !retention ? '—' : `${retention.currentChurnPercent}%`}
          label="Churn"
          hint="Bajas sobre el mes anterior"
          tone={(retention?.currentChurnPercent ?? 0) > 20 ? 'amber' : 'default'}
        />
      </div>

      <ClubEyebrow>Mensualidades</ClubEyebrow>
      <ClubPanel
        title="Mensualidades"
        description="Generar el mes es idempotente: puedes correrlo las veces que quieras sin duplicarle la deuda a nadie."
        action={
          <>
            <TextureButton
              variant="minimal"
              size="sm"
              className="!w-auto"
              disabled={busy}
              onClick={() => run(() => academyApi.generateCharges(), (r: { created: number }) => `${r.created} mensualidad(es) generadas.`)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Generar mes
            </TextureButton>
            <TextureButton
              variant="minimal"
              size="sm"
              className="!w-auto"
              disabled={busy || pending.length === 0}
              onClick={() => run(() => academyApi.notifyCharges(), (r: { sent: number }) => `${r.sent} aviso(s) enviados por WhatsApp.`)}
            >
              <Send className="mr-1 h-3 w-3" />
              Avisar por WhatsApp
            </TextureButton>
          </>
        }
      >
        <ClubTable columns={CHARGE_COLS} rows={Math.min(charges.length, 40)} empty="No hay mensualidades generadas.">
          {charges.slice(0, 40).map((c) => {
            const paid = c.payments.reduce((a, p) => a + Number(p.amountBase), 0);
            return (
              <ClubRow
                key={c.id}
                label={`Ver ${c.enrollment.student.customer.name}`}
                onClick={() => onOpen({ kind: 'student', id: c.enrollment.studentId })}
                cells={[
                  <Cell key="a">{c.enrollment.student.customer.name}</Cell>,
                  <PlainCell key="g">{c.enrollment.group.name}</PlainCell>,
                  <PlainCell key="p" className="tabular-nums">
                    {String(c.periodMonth).padStart(2, '0')}/{c.periodYear}
                  </PlainCell>,
                  <PlainCell key="v" className="tabular-nums">
                    {fmtDay(c.dueDate)}
                  </PlainCell>,
                  <PlainCell key="ab" className="tabular-nums">
                    {paid > 0 ? formatBase(paid, symbol) : '—'}
                  </PlainCell>,
                  <ClubBadge key="e" tone={STATUS_TONES[c.status]}>
                    {STATUS_LABELS[c.status]}
                  </ClubBadge>,
                  <Money key="m" value={c.amountBase} symbol={symbol} />,
                ]}
              />
            );
          })}
        </ClubTable>
        {charges.length > 40 && (
          <p className="mt-4 px-1 text-[12px] font-light text-brand-950/40">
            Mostrando las 40 más recientes de {charges.length}.
          </p>
        )}
      </ClubPanel>

      {retention && (
        <>
          <ClubEyebrow>Retención</ClubEyebrow>
          <ClubPanel title="Alumnos mes a mes" description="Cuántos siguen y cuántos se dan de baja.">
            <ClubTable columns={RETENTION_COLS} rows={retention.months.length} empty="Todavía no hay meses que comparar.">
              {retention.months.map((m) => (
                <ClubRow
                  key={m.period}
                  cells={[
                    <Cell key="p">{m.period}</Cell>,
                    <PlainCell key="i" className="tabular-nums">
                      {m.activeStart}
                    </PlainCell>,
                    <span key="a" className="block truncate text-[13px] font-semibold tabular-nums text-emerald-600">
                      +{m.joined}
                    </span>,
                    <span
                      key="b"
                      className={`block truncate text-[13px] font-semibold tabular-nums ${m.left > 0 ? 'text-red-600' : 'text-brand-950/35'}`}
                    >
                      −{m.left}
                    </span>,
                    <PlainCell key="c" className="tabular-nums">
                      {m.churnPercent === null ? '—' : `${m.churnPercent}%`}
                    </PlainCell>,
                    <Cell key="f" className="tabular-nums">
                      {m.activeEnd}
                    </Cell>,
                  ]}
                />
              ))}
            </ClubTable>
          </ClubPanel>
        </>
      )}

      {byCoach && byCoach.byCoach.length > 0 && (
        <>
          <ClubEyebrow>Facturación</ClubEyebrow>
          <ClubPanel
            title="Por entrenador"
            description="Lo que generó su clase, no lo que se le paga. Últimos 30 días."
          >
            <ClubTable columns={COACH_COLS} rows={byCoach.byCoach.length}>
              {byCoach.byCoach.map((r) => (
                <ClubRow
                  key={r.id}
                  label={`Ver ${r.name}`}
                  onClick={() => onOpen({ kind: 'coach', id: r.id })}
                  cells={[
                    <Cell key="n">{r.name}</Cell>,
                    <PlainCell key="s" className="tabular-nums">
                      {r.sessions}
                    </PlainCell>,
                    <Money key="r" value={r.revenueBase} symbol={symbol} />,
                    <PlainCell key="c" className="tabular-nums">
                      {formatBase(r.costBase, symbol)}
                    </PlainCell>,
                    <Money key="m" value={r.marginBase} symbol={symbol} signed />,
                  ]}
                />
              ))}
            </ClubTable>
          </ClubPanel>
        </>
      )}

      {byCoach && byCoach.byProgram.length > 0 && (
        <ClubPanel title="Por programa" description="El mismo ingreso, agrupado por tipo de enseñanza.">
          <ClubTable columns={PROGRAM_COLS} rows={byCoach.byProgram.length}>
            {byCoach.byProgram.map((r) => (
              <ClubRow
                key={r.id}
                cells={[
                  <Cell key="n">{r.name}</Cell>,
                  <PlainCell key="s" className="tabular-nums">
                    {r.sessions}
                  </PlainCell>,
                  <Money key="r" value={r.revenueBase} symbol={symbol} />,
                ]}
              />
            ))}
          </ClubTable>
        </ClubPanel>
      )}

      {revenue && (
        <>
          <ClubEyebrow>Rentabilidad</ClubEyebrow>
          <ClubPanel
            title="Por grupo"
            description={`Últimos 30 días. Cobrado ${formatBase(revenue.collectedBase, symbol)} en ${revenue.paymentsCount} pago(s).`}
          >
            <ClubTable columns={GROUP_COLS} rows={revenue.groups.length} empty="Aún no hay clases dadas.">
              {revenue.groups.map((g) => (
                <ClubRow
                  key={g.groupId}
                  label={`Ver ${g.name}`}
                  // "sueltas" no es un grupo real, es el cajón de las clases sin
                  // grupo: no tiene ficha que abrir.
                  onClick={g.groupId === 'sueltas' ? undefined : () => onOpen({ kind: 'group', id: g.groupId })}
                  cells={[
                    <Cell key="n">{g.name}</Cell>,
                    <PlainCell key="s" className="tabular-nums">
                      {g.sessions}
                    </PlainCell>,
                    <PlainCell key="c" className="tabular-nums">
                      {formatBase(g.consumedBase, symbol)}
                    </PlainCell>,
                    <PlainCell key="p" className="tabular-nums">
                      {formatBase(g.coachCostBase, symbol)}
                    </PlainCell>,
                    <Money key="m" value={g.marginBase} symbol={symbol} signed />,
                  ]}
                />
              ))}
            </ClubTable>
          </ClubPanel>
        </>
      )}
    </div>
  );
}
