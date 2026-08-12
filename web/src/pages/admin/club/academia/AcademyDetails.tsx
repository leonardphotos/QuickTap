import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { formatBase } from '@/utils/format';
import { levelLabel, levelRangeLabel } from '@/utils/padelLevel';
import { TextureButton } from '@/components/ui/texture-button';
import DetailSheet, { EmptyNote, ItemRow, PayBadge, Row, Section, type PayState } from '../DetailSheet';
import { academyApi, PAY_TYPE_LABELS, SESSION_STATUS_LABELS, WEEKDAY_SHORT, type Student } from './academyApi';

const fmtDateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: false });
const fmtDate = (iso: string | Date) => new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });

interface Payment {
  state: PayState;
  label: string;
  detail: string | null;
}

/** Un id + qué tipo de ficha abrir. Lo maneja el contenedor para poder encadenar:
 *  de un grupo a un alumno, de un alumno a su grupo, sin perder el hilo. */
export type DetailTarget =
  | { kind: 'session'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'program'; id: string }
  | { kind: 'student'; id: string }
  | { kind: 'coach'; id: string }
  // Estas dos no tienen id: son las casillas del resumen ("14 alumnos activos",
  // "$250 por cobrar"), que abren una LISTA en vez de una ficha sola.
  | { kind: 'activeStudents' }
  | { kind: 'pendingCharges' };

function useDetail<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    setData(null);
    setError(null);
    api
      .get(url)
      .then((r) => setData(r.data.data))
      .catch((e) => setError(e.response?.data?.error ?? 'No pudimos cargar el detalle.'));
  }, [url]);

  return { data, error };
}

/** Enruta al detalle correcto. Una sola pieza para no repetir el <DetailSheet>
 *  siete veces con siete estilos distintos. */
export function AcademyDetail({
  target,
  symbol,
  onClose,
  onNavigate,
}: {
  target: DetailTarget;
  symbol: string;
  onClose: () => void;
  onNavigate: (t: DetailTarget) => void;
}) {
  if (target.kind === 'session') return <SessionDetail id={target.id} symbol={symbol} onClose={onClose} onNavigate={onNavigate} />;
  if (target.kind === 'group') return <GroupDetail id={target.id} symbol={symbol} onClose={onClose} onNavigate={onNavigate} />;
  if (target.kind === 'program') return <ProgramDetail id={target.id} symbol={symbol} onClose={onClose} onNavigate={onNavigate} />;
  if (target.kind === 'coach') return <CoachDetail id={target.id} symbol={symbol} onClose={onClose} onNavigate={onNavigate} />;
  if (target.kind === 'activeStudents') return <ActiveStudentsList onClose={onClose} onNavigate={onNavigate} />;
  if (target.kind === 'pendingCharges') return <PendingChargesList symbol={symbol} onClose={onClose} onNavigate={onNavigate} />;
  return <StudentDetail id={target.id} symbol={symbol} onClose={onClose} onNavigate={onNavigate} />;
}

// --------------------------------------------------------- Alumnos activos
/** Abre desde la casilla "N alumnos activos" del resumen. Lista simple: cada
 *  fila lleva a la ficha completa del alumno (ahí sí se ve su historial de
 *  pagos, asistencia y lotes). */
function ActiveStudentsList({ onClose, onNavigate }: { onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    academyApi
      .listStudents({ active: 'true' })
      .then(setStudents)
      .catch(() => setError('No pudimos cargar los alumnos.'));
  }, []);

  return (
    <DetailSheet open title="Alumnos activos" subtitle={students ? `${students.length} en total` : undefined} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!students && !error && <EmptyNote>Cargando…</EmptyNote>}
      {students && students.length === 0 && <EmptyNote>No hay alumnos activos.</EmptyNote>}
      {students && students.length > 0 && (
        <div className="divide-y divide-brand-950/[0.06]">
          {students.map((s) => (
            <ItemRow
              key={s.id}
              onClick={() => onNavigate({ kind: 'student', id: s.id })}
              title={s.customer.name}
              subtitle={
                <>
                  {s.customer.phone}
                  {s.level && ` · ${Number(s.level).toFixed(1)} ${levelLabel(s.level) ?? ''}`}
                  {s.enrollments.length > 0 && ` · ${s.enrollments.map((e) => e.group.name).join(', ')}`}
                </>
              }
              right={
                s.creditBalance > 0 ? (
                  <span className="shrink-0 text-[12px] font-bold text-brand-950">{s.creditBalance} fichas</span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </DetailSheet>
  );
}

// -------------------------------------------------------------- Por cobrar
interface PendingCharge {
  id: string;
  periodYear: number;
  periodMonth: number;
  amountBase: string;
  status: 'PENDING' | 'PAID' | 'WAIVED' | 'OVERDUE';
  enrollment: {
    studentId: string;
    student: { customer: { name: string; phone: string } };
    group: { name: string };
  };
  payments: { amountBase: string }[];
}

/**
 * Abre desde la casilla "$X por cobrar" del resumen. A diferencia de las demás
 * fichas, ESTA deja actuar: cada fila tiene un botón "Cobrar" que registra el
 * pago ahí mismo, sin tener que ir a buscar al alumno en otra pestaña.
 */
function PendingChargesList({ symbol, onClose, onNavigate }: { symbol: string; onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const [charges, setCharges] = useState<PendingCharge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState<PendingCharge | null>(null);

  function load() {
    academyApi
      .listCharges({})
      .then((all: PendingCharge[]) => setCharges(all.filter((c) => c.status === 'PENDING' || c.status === 'OVERDUE')))
      .catch(() => setError('No pudimos cargar los cobros.'));
  }
  useEffect(load, []);

  const total = charges?.reduce((acc, c) => acc + Number(c.amountBase), 0) ?? 0;

  return (
    <DetailSheet
      open
      title="Por cobrar"
      subtitle={charges ? `${charges.length} mensualidad(es) · ${formatBase(total, symbol)}` : undefined}
      onClose={onClose}
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!charges && !error && <EmptyNote>Cargando…</EmptyNote>}
      {charges && charges.length === 0 && <EmptyNote>Nadie debe mensualidad. Bien.</EmptyNote>}
      {charges && charges.length > 0 && (
        <div className="divide-y divide-brand-950/[0.06]">
          {charges.map((c) => {
            const paid = c.payments.reduce((acc, p) => acc + Number(p.amountBase), 0);
            const balance = Number(c.amountBase) - paid;
            return (
              <div key={c.id} className="flex items-center gap-2 py-2.5">
                <button
                  type="button"
                  onClick={() => onNavigate({ kind: 'student', id: c.enrollment.studentId })}
                  className="-mx-2 min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-brand-950/[0.03]"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold text-brand-950">{c.enrollment.student.customer.name}</span>
                    {c.status === 'OVERDUE' && <PayBadge state="OVERDUE" label="Vencida" />}
                  </span>
                  <span className="block truncate text-[12px] font-light text-brand-950/50">
                    {c.enrollment.group.name} · {String(c.periodMonth).padStart(2, '0')}/{c.periodYear}
                    {paid > 0 && ` · abonó ${formatBase(paid, symbol)}`}
                  </span>
                </button>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold text-brand-950">{formatBase(balance, symbol)}</p>
                  <TextureButton variant="minimal" size="sm" className="!w-auto !min-h-0 !py-1" onClick={() => setCollecting(c)}>
                    Cobrar
                  </TextureButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {collecting && (
        <CollectChargeDialog
          charge={collecting}
          balance={Number(collecting.amountBase) - collecting.payments.reduce((a, p) => a + Number(p.amountBase), 0)}
          symbol={symbol}
          onClose={() => setCollecting(null)}
          onCollected={() => {
            setCollecting(null);
            load();
          }}
        />
      )}
    </DetailSheet>
  );
}

const CHARGE_METHODS = [
  { value: 'CASH_USD', label: 'Efectivo $' },
  { value: 'CASH', label: 'Efectivo Bs' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'CARD', label: 'Punto de venta' },
  { value: 'BINANCE', label: 'Binance' },
  { value: 'PAYPAL', label: 'PayPal' },
] as const;

/** Cobrar una mensualidad sin salir de la lista. Mismo criterio que el resto del
 *  vertical: referencia + método, sin pasarela — el club aprueba a mano. */
function CollectChargeDialog({
  charge,
  balance,
  symbol,
  onClose,
  onCollected,
}: {
  charge: PendingCharge;
  balance: number;
  symbol: string;
  onClose: () => void;
  onCollected: () => void;
}) {
  const [amount, setAmount] = useState(String(balance.toFixed(2)));
  const [method, setMethod] = useState<(typeof CHARGE_METHODS)[number]['value']>('CASH_USD');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return setError('Escribe un monto mayor a 0.');
    setSaving(true);
    setError(null);
    try {
      await academyApi.recordPayment({
        studentId: charge.enrollment.studentId,
        kind: 'MONTHLY',
        chargeId: charge.id,
        amountBase: n,
        method,
        referenceNumber: reference.trim() || null,
      });
      onCollected();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo registrar el cobro.');
      setSaving(false);
    }
  }

  return (
    <DetailSheet open title={`Cobrar a ${charge.enrollment.student.customer.name}`} subtitle={charge.enrollment.group.name} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Monto ({symbol})</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          />
          <span className="mt-1 block text-[11px] font-light text-brand-950/40">Saldo pendiente: {formatBase(balance, symbol)}</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Cómo pagó</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          >
            {CHARGE_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Referencia</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Opcional"
            className="w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
          {saving ? 'Registrando…' : `Cobrar ${formatBase(amount || '0', symbol)}`}
        </TextureButton>
      </div>
    </DetailSheet>
  );
}

// ------------------------------------------------------------------- Clase
interface RosterResponse {
  session: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: keyof typeof SESSION_STATUS_LABELS;
    capacityMin: number;
    capacityMax: number;
    coachFeeBase: string | null;
    group: { id: string; name: string } | null;
    coach: { id: string; displayName: string };
    court: { id: string; name: string } | null;
  };
  roster: {
    studentId: string;
    name: string;
    phone: string;
    level: string | null;
    billingMode: string;
    attendance: { status: string } | null;
    payment: Payment;
    isMakeup?: boolean;
  }[];
  occupiedSeats: number;
}

const ATT_LABELS: Record<string, string> = { PRESENT: 'Asistió', ABSENT: 'Faltó', JUSTIFIED: 'Justificada', MAKEUP: 'Recuperación' };

function SessionDetail({ id, symbol, onClose, onNavigate }: { id: string; symbol: string; onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const { data, error } = useDetail<RosterResponse>(`/club/academy/sessions/${id}/attendance`);

  return (
    <DetailSheet open title={data?.session.group?.name ?? 'Clase'} subtitle={data ? fmtDateTime(data.session.startsAt) : undefined} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <EmptyNote>Cargando…</EmptyNote>}
      {data && (
        <>
          <Section title="La clase">
            <Row label="Profesor" value={
              <button className="text-brand-500 hover:underline" onClick={() => onNavigate({ kind: 'coach', id: data.session.coach.id })}>
                {data.session.coach.displayName}
              </button>
            } />
            <Row label="Cancha" value={data.session.court?.name ?? 'Sin asignar'} />
            <Row label="Hora" value={`${fmtTime(data.session.startsAt)} a ${fmtTime(data.session.endsAt)}`} />
            <Row label="Estado" value={SESSION_STATUS_LABELS[data.session.status] ?? data.session.status} />
            <Row label="Cupo" value={`${data.occupiedSeats} de ${data.session.capacityMax}`} tone="strong" />
            {data.session.group && (
              <Row label="Grupo" value={
                <button className="text-brand-500 hover:underline" onClick={() => onNavigate({ kind: 'group', id: data.session.group!.id })}>
                  Ver grupo
                </button>
              } />
            )}
            {data.session.coachFeeBase && <Row label="Honorario del profesor" value={formatBase(data.session.coachFeeBase, symbol)} />}
          </Section>

          <Section title={`Alumnos (${data.roster.length})`}>
            {data.roster.length === 0 ? (
              <EmptyNote>Nadie inscrito en esta clase.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.roster.map((r) => (
                  <ItemRow
                    key={r.studentId}
                    onClick={() => onNavigate({ kind: 'student', id: r.studentId })}
                    title={
                      <>
                        {r.name}
                        {r.isMakeup && <span className="ml-1.5 text-[11px] font-light text-sky-600">recuperación</span>}
                      </>
                    }
                    subtitle={
                      <>
                        {r.phone}
                        {r.level && ` · ${Number(r.level).toFixed(1)} ${levelLabel(r.level) ?? ''}`}
                        {r.attendance && ` · ${ATT_LABELS[r.attendance.status] ?? r.attendance.status}`}
                        {r.payment.detail && ` · ${r.payment.detail}`}
                      </>
                    }
                    right={<PayBadge state={r.payment.state} label={r.payment.label} />}
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </DetailSheet>
  );
}

// ------------------------------------------------------------------- Grupo
interface GroupDetailResponse {
  group: {
    id: string;
    name: string;
    levelMin: string;
    levelMax: string;
    capacityMin: number;
    capacityMax: number;
    status: string;
    priceMonthlyBase: string | null;
    pricePerClassBase: string | null;
    packagePriceBase: string | null;
    packageClasses: number | null;
    seasonStart: string;
    seasonEnd: string | null;
    coach: { id: string; displayName: string };
    program: { id: string; name: string; color: string | null } | null;
    slots: { id: string; weekday: number; startTime: string; durationMinutes: number; court: { name: string } | null }[];
  };
  members: {
    studentId: string;
    name: string;
    phone: string;
    level: string | null;
    billingMode: string;
    priceBase: string;
    status: string;
    payment: Payment;
  }[];
  upcoming: { id: string; startsAt: string; endsAt: string; status: string; court: { name: string } | null; coach: { displayName: string } }[];
  pastCount: number;
  waitlist: { id: string; position: number; name: string; phone: string; status: string }[];
  owing: number;
}

const BILLING_LABELS: Record<string, string> = { MONTHLY: 'Mensualidad', PACKAGE: 'Por fichas', PER_CLASS: 'Clase suelta' };

function GroupDetail({ id, symbol, onClose, onNavigate }: { id: string; symbol: string; onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const { data, error } = useDetail<GroupDetailResponse>(`/club/academy/groups/${id}`);

  return (
    <DetailSheet open title={data?.group.name ?? 'Grupo'} subtitle={data?.group.program?.name ?? undefined} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <EmptyNote>Cargando…</EmptyNote>}
      {data && (
        <>
          <Section title="El grupo">
            <Row label="Profesor" value={
              <button className="text-brand-500 hover:underline" onClick={() => onNavigate({ kind: 'coach', id: data.group.coach.id })}>
                {data.group.coach.displayName}
              </button>
            } />
            {data.group.program && (
              <Row label="Programa" value={
                <button className="text-brand-500 hover:underline" onClick={() => onNavigate({ kind: 'program', id: data.group.program!.id })}>
                  {data.group.program.name}
                </button>
              } />
            )}
            <Row label="Nivel" value={`${levelRangeLabel(data.group.levelMin, data.group.levelMax)} (${Number(data.group.levelMin).toFixed(1)}–${Number(data.group.levelMax).toFixed(1)})`} />
            <Row label="Cupo" value={`${data.members.length} de ${data.group.capacityMax} · mínimo ${data.group.capacityMin}`} tone="strong" />
            <Row label="Horarios" value={data.group.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(' · ') || '—'} />
            <Row label="Canchas" value={[...new Set(data.group.slots.map((s) => s.court?.name ?? 'Cualquiera'))].join(' · ')} />
            {data.group.priceMonthlyBase && <Row label="Mensualidad" value={formatBase(data.group.priceMonthlyBase, symbol)} />}
            {data.group.packagePriceBase && (
              <Row label="Lote" value={`${formatBase(data.group.packagePriceBase, symbol)} · ${data.group.packageClasses ?? '?'} clases`} />
            )}
            <Row label="Clases dadas" value={String(data.pastCount)} />
            {data.owing > 0 && <Row label="Con pago pendiente" value={`${data.owing} alumno(s)`} tone="strong" />}
          </Section>

          <Section title={`Inscritos (${data.members.length})`}>
            {data.members.length === 0 ? (
              <EmptyNote>Todavía no hay nadie inscrito.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.members.map((m) => (
                  <ItemRow
                    key={m.studentId}
                    onClick={() => onNavigate({ kind: 'student', id: m.studentId })}
                    title={m.name}
                    subtitle={
                      <>
                        {m.phone} · {BILLING_LABELS[m.billingMode] ?? m.billingMode}
                        {/* El precio solo se muestra a quien paga por ese precio. En
                            "por fichas" el monto sale del lote, no de la mensualidad:
                            enseñarlo acá haría creer que también paga eso al mes. */}
                        {m.billingMode !== 'PACKAGE' && ` ${formatBase(m.priceBase, symbol)}`}
                        {m.payment.detail && ` · ${m.payment.detail}`}
                      </>
                    }
                    right={<PayBadge state={m.payment.state} label={m.payment.label} />}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title={`Próximas clases (${data.upcoming.length})`}>
            {data.upcoming.length === 0 ? (
              <EmptyNote>No hay clases agendadas.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.upcoming.map((s) => (
                  <ItemRow
                    key={s.id}
                    onClick={() => onNavigate({ kind: 'session', id: s.id })}
                    title={fmtDateTime(s.startsAt)}
                    subtitle={`${s.court?.name ?? 'Sin cancha'} · ${s.coach.displayName}`}
                    right={
                      <span className="shrink-0 text-[11px] font-light text-brand-950/40">
                        {SESSION_STATUS_LABELS[s.status as keyof typeof SESSION_STATUS_LABELS] ?? s.status}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {data.waitlist.length > 0 && (
            <Section title={`Lista de espera (${data.waitlist.length})`}>
              <div className="divide-y divide-brand-950/[0.06]">
                {data.waitlist.map((w) => (
                  <ItemRow
                    key={w.id}
                    title={`${w.position}. ${w.name}`}
                    subtitle={w.phone}
                    right={
                      w.status === 'OFFERED' ? (
                        <PayBadge state="PAID" label="Puesto ofrecido" />
                      ) : (
                        <span className="text-[11px] font-light text-brand-950/40">esperando</span>
                      )
                    }
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </DetailSheet>
  );
}

// ---------------------------------------------------------------- Programa
interface ProgramDetailResponse {
  program: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    active: boolean;
    groups: {
      id: string;
      name: string;
      levelMin: string;
      levelMax: string;
      capacityMax: number;
      status: string;
      coach: { id: string; displayName: string };
      slots: { weekday: number; startTime: string; court: { name: string } | null }[];
      _count: { enrollments: number; sessions: number; waitlist: number };
    }[];
  };
  activeStudents: number;
  packageRevenueBase: string;
}

function ProgramDetail({ id, symbol, onClose, onNavigate }: { id: string; symbol: string; onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const { data, error } = useDetail<ProgramDetailResponse>(`/club/academy/programs/${id}`);

  return (
    <DetailSheet open title={data?.program.name ?? 'Programa'} subtitle={data?.program.description ?? undefined} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <EmptyNote>Cargando…</EmptyNote>}
      {data && (
        <>
          <Section title="Resumen">
            <Row label="Grupos" value={String(data.program.groups.length)} />
            <Row label="Alumnos activos" value={String(data.activeStudents)} tone="strong" />
            <Row label="Vendido en lotes" value={formatBase(data.packageRevenueBase, symbol)} />
            <Row label="Estado" value={data.program.active ? 'Activo' : 'Inactivo'} />
          </Section>

          <Section title={`Grupos (${data.program.groups.length})`}>
            {data.program.groups.length === 0 ? (
              <EmptyNote>Este programa todavía no tiene grupos.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.program.groups.map((g) => (
                  <ItemRow
                    key={g.id}
                    onClick={() => onNavigate({ kind: 'group', id: g.id })}
                    title={g.name}
                    subtitle={
                      <>
                        {g.coach.displayName} · {levelRangeLabel(g.levelMin, g.levelMax)} ·{' '}
                        {g.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(' ')}
                      </>
                    }
                    right={
                      <span className="shrink-0 text-[12px] font-bold text-brand-950">
                        {g._count.enrollments}/{g.capacityMax}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </DetailSheet>
  );
}

// --------------------------------------------------------------- Profesor
interface CoachDetailResponse {
  coach: {
    id: string;
    displayName: string;
    phone: string;
    email: string | null;
    active: boolean;
    levelMin: string | null;
    levelMax: string | null;
    payType: keyof typeof PAY_TYPE_LABELS;
    payAmountBase: string | null;
    commissionPercent: string | null;
    availability: { id: string; weekday: number; startTime: string; endTime: string }[];
    timeOff: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
    groups: { id: string; name: string; program: { name: string } | null; _count: { enrollments: number } }[];
    employee: { id: string; name: string } | null;
    user: { id: string; email: string } | null;
  };
  upcoming: { id: string; startsAt: string; court: { name: string } | null; group: { name: string } | null }[];
  doneCount: number;
  payouts: { id: string; periodStart: string; periodEnd: string; amountBase: string; sessionsCount: number; paidAt: string | null }[];
}

function CoachDetail({ id, symbol, onClose, onNavigate }: { id: string; symbol: string; onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const { data, error } = useDetail<CoachDetailResponse>(`/club/academy/coaches/${id}`);

  return (
    <DetailSheet open title={data?.coach.displayName ?? 'Profesor'} subtitle={data?.coach.phone} onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <EmptyNote>Cargando…</EmptyNote>}
      {data && (
        <>
          <Section title="Datos">
            <Row label="Teléfono" value={data.coach.phone} />
            {data.coach.email && <Row label="Correo" value={data.coach.email} />}
            {data.coach.levelMin && data.coach.levelMax && (
              <Row label="Niveles que da" value={`${Number(data.coach.levelMin).toFixed(1)} a ${Number(data.coach.levelMax).toFixed(1)}`} />
            )}
            <Row label="Cómo se le paga" value={PAY_TYPE_LABELS[data.coach.payType] ?? data.coach.payType} />
            {data.coach.payAmountBase && <Row label="Monto" value={formatBase(data.coach.payAmountBase, symbol)} />}
            {data.coach.commissionPercent && <Row label="Comisión" value={`${Number(data.coach.commissionPercent)}%`} />}
            <Row label="Clases dadas" value={String(data.doneCount)} tone="strong" />
            <Row label="Portal propio" value={data.coach.user ? `Sí — ${data.coach.user.email}` : 'No tiene acceso'} tone={data.coach.user ? undefined : 'muted'} />
            <Row label="En nómina" value={data.coach.employee ? data.coach.employee.name : 'No vinculado'} tone={data.coach.employee ? undefined : 'muted'} />
          </Section>

          <Section title={`Sus grupos (${data.coach.groups.length})`}>
            {data.coach.groups.length === 0 ? (
              <EmptyNote>No tiene grupos asignados.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.coach.groups.map((g) => (
                  <ItemRow
                    key={g.id}
                    onClick={() => onNavigate({ kind: 'group', id: g.id })}
                    title={g.name}
                    subtitle={g.program?.name ?? 'Sin programa'}
                    right={<span className="shrink-0 text-[12px] font-bold text-brand-950">{g._count.enrollments}</span>}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Disponibilidad">
            {data.coach.availability.length === 0 ? (
              <EmptyNote>Sin franjas cargadas — se asume disponible siempre.</EmptyNote>
            ) : (
              <p className="text-[13px] font-light text-brand-950/70">
                {data.coach.availability.map((a) => `${WEEKDAY_SHORT[a.weekday]} ${a.startTime}–${a.endTime}`).join(' · ')}
              </p>
            )}
          </Section>

          <Section title={`Próximas clases (${data.upcoming.length})`}>
            {data.upcoming.length === 0 ? (
              <EmptyNote>No tiene clases agendadas.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.upcoming.map((s) => (
                  <ItemRow
                    key={s.id}
                    onClick={() => onNavigate({ kind: 'session', id: s.id })}
                    title={fmtDateTime(s.startsAt)}
                    subtitle={`${s.group?.name ?? 'Clase suelta'} · ${s.court?.name ?? 'Sin cancha'}`}
                  />
                ))}
              </div>
            )}
          </Section>

          {data.payouts.length > 0 && (
            <Section title="Liquidaciones">
              <div className="divide-y divide-brand-950/[0.06]">
                {data.payouts.map((p) => (
                  <ItemRow
                    key={p.id}
                    title={formatBase(p.amountBase, symbol)}
                    subtitle={`${fmtDate(p.periodStart)} a ${fmtDate(p.periodEnd)} · ${p.sessionsCount} clases`}
                    right={p.paidAt ? <PayBadge state="PAID" label="Pagada" /> : <PayBadge state="PENDING" label="Pendiente" />}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </DetailSheet>
  );
}

// ---------------------------------------------------------------- Alumno
interface StudentDetailResponse {
  id: string;
  level: string | null;
  active: boolean;
  accessToken: string;
  creditBalance: number;
  medicalNotes: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  customer: { name: string; phone: string; idNumber: string | null };
  enrollments: { id: string; status: string; billingMode: string; priceBase: string; group: { id: string; name: string } }[];
  packages: { id: string; name: string; totalClasses: number; priceBase: string; expiresAt: string | null }[];
  payments: { id: string; kind: string; amountBase: string; method: string; createdAt: string }[];
  attendances: { id: string; status: string; session: { startsAt: string } }[];
}

function StudentDetail({ id, symbol, onClose, onNavigate }: { id: string; symbol: string; onClose: () => void; onNavigate: (t: DetailTarget) => void }) {
  const { data, error } = useDetail<StudentDetailResponse>(`/club/academy/students/${id}`);

  return (
    <DetailSheet
      open
      title={data?.customer.name ?? 'Alumno'}
      subtitle={data ? `${data.customer.phone}${data.level ? ` · ${Number(data.level).toFixed(1)} ${levelLabel(data.level) ?? ''}` : ''}` : undefined}
      onClose={onClose}
      footer={
        data ? (
          <TextureButton
            variant="minimal"
            size="default"
            onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/academia/${data.accessToken}`)}
          >
            Copiar enlace de su portal
          </TextureButton>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <EmptyNote>Cargando…</EmptyNote>}
      {data && (
        <>
          <Section title="Ficha">
            <Row label="Teléfono" value={data.customer.phone} />
            {data.customer.idNumber && <Row label="Cédula" value={data.customer.idNumber} />}
            <Row label="Fichas disponibles" value={String(data.creditBalance)} tone="strong" />
            {data.guardianName && <Row label="Representante" value={`${data.guardianName}${data.guardianPhone ? ` · ${data.guardianPhone}` : ''}`} />}
            {data.medicalNotes && <Row label="Notas médicas" value={data.medicalNotes} />}
          </Section>

          <Section title={`Grupos (${data.enrollments.length})`}>
            {data.enrollments.length === 0 ? (
              <EmptyNote>No está inscrito en ningún grupo.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.enrollments.map((e) => (
                  <ItemRow
                    key={e.id}
                    onClick={() => onNavigate({ kind: 'group', id: e.group.id })}
                    title={e.group.name}
                    subtitle={`${BILLING_LABELS[e.billingMode] ?? e.billingMode} · ${formatBase(e.priceBase, symbol)}`}
                    right={<span className="shrink-0 text-[11px] font-light text-brand-950/40">{e.status === 'ACTIVE' ? 'activo' : e.status.toLowerCase()}</span>}
                  />
                ))}
              </div>
            )}
          </Section>

          {data.packages.length > 0 && (
            <Section title="Lotes comprados">
              <div className="divide-y divide-brand-950/[0.06]">
                {data.packages.map((p) => (
                  <ItemRow
                    key={p.id}
                    title={p.name}
                    subtitle={`${p.totalClasses} clases · ${p.expiresAt ? `vence ${fmtDate(p.expiresAt)}` : 'sin vencimiento'}`}
                    right={<span className="shrink-0 text-[13px] font-bold text-brand-950">{formatBase(p.priceBase, symbol)}</span>}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section title="Últimos pagos">
            {data.payments.length === 0 ? (
              <EmptyNote>Todavía no ha pagado nada.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.payments.slice(0, 8).map((p) => (
                  <ItemRow
                    key={p.id}
                    title={formatBase(p.amountBase, symbol)}
                    subtitle={`${p.kind} · ${p.method} · ${fmtDate(p.createdAt)}`}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section title="Asistencia reciente">
            {data.attendances.length === 0 ? (
              <EmptyNote>Sin clases registradas.</EmptyNote>
            ) : (
              <div className="divide-y divide-brand-950/[0.06]">
                {data.attendances.slice(0, 8).map((a) => (
                  <ItemRow key={a.id} title={fmtDate(a.session.startsAt)} right={
                    <span className="shrink-0 text-[12px] font-medium text-brand-950/60">{ATT_LABELS[a.status] ?? a.status}</span>
                  } />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </DetailSheet>
  );
}
