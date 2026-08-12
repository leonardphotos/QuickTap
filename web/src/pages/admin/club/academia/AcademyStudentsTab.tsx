import { useCallback, useEffect, useState } from 'react';
import { Search, Ticket, UserPlus } from 'lucide-react';
import type { AuthRestaurant } from '@/context/AuthContext';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cell, ClubEyebrow, ClubPanel, ClubRow, ClubTable, PlainCell, type ClubColumn } from '../ClubTable';
import { academyApi, LEVELS, WEEKDAY_SHORT, type ClassGroup, type Student } from './academyApi';
import { levelLabel } from '@/utils/padelLevel';
import type { DetailTarget } from './AcademyDetails';

const COLS: ClubColumn[] = [
  { key: 'alumno', label: 'Alumno', width: 'minmax(0,1.3fr)' },
  { key: 'tel', label: 'Teléfono', width: '150px' },
  { key: 'nivel', label: 'Nivel', width: '160px' },
  { key: 'grupos', label: 'Grupos', width: 'minmax(0,1.3fr)' },
  { key: 'fichas', label: 'Fichas', width: '92px' },
  { key: 'acciones', label: '', width: '212px', align: 'right' },
];

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

const METHODS = [
  { value: 'CASH_USD', label: 'Efectivo $' },
  { value: 'CASH', label: 'Efectivo Bs' },
  { value: 'MOBILE_PAYMENT', label: 'Pago Móvil' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'ZELLE', label: 'Zelle' },
  { value: 'CARD', label: 'Punto de venta' },
];

export default function AcademyStudentsTab({
  restaurant,
  onOpen,
}: {
  restaurant: Pick<AuthRestaurant, 'currencySymbol'>;
  onOpen: (t: DetailTarget) => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [enrolling, setEnrolling] = useState<Student | null>(null);
  const [sellingTo, setSellingTo] = useState<Student | null>(null);
  const symbol = restaurant.currencySymbol ?? '$';

  const load = useCallback(() => {
    Promise.all([academyApi.listStudents({ q: q || undefined }), academyApi.listGroups()])
      .then(([s, g]) => {
        setStudents(s);
        setGroups(g);
      })
      .catch(() => setError('No pudimos cargar los alumnos.'))
      .finally(() => setLoading(false));
  }, [q]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ClubEyebrow>Base de alumnos</ClubEyebrow>
      <ClubPanel
        title="Alumnos"
        description="Cada alumno usa la misma ficha de cliente que sus reservas de cancha: el historial no se parte en dos."
        action={
          <>
            <label className="relative block w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-950/30" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full rounded-full border border-brand-950/10 bg-brand-950/[0.03] py-2.5 pl-10 pr-4 text-sm placeholder:text-brand-950/35 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-400/30"
                placeholder="Buscar por nombre o teléfono…"
              />
            </label>
            <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setCreating(true)}>
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Nuevo alumno
            </TextureButton>
          </>
        }
      >
        {loading ? (
          <p className="py-12 text-center text-sm font-light text-brand-950/40">Cargando…</p>
        ) : (
          <ClubTable columns={COLS} rows={students.length} empty="No hay alumnos todavía.">
            {students.map((s) => (
              <ClubRow
                key={s.id}
                label={`Ver ${s.customer.name}`}
                muted={!s.active}
                onClick={() => onOpen({ kind: 'student', id: s.id })}
                cells={[
                  <Cell key="n">{s.customer.name}</Cell>,
                  <PlainCell key="t" className="tabular-nums">
                    {s.customer.phone}
                  </PlainCell>,
                  <PlainCell key="l">
                    {s.level ? `${Number(s.level).toFixed(1)} · ${levelLabel(s.level) ?? ''}` : 'Sin definir'}
                  </PlainCell>,
                  <PlainCell key="g">
                    {s.enrollments.length > 0 ? s.enrollments.map((e) => e.group.name).join(' · ') : '—'}
                  </PlainCell>,
                  <span key="f" className="flex items-center gap-1.5 text-[14px] font-semibold text-brand-950">
                    <Ticket className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                    <span className="tabular-nums">{s.creditBalance}</span>
                  </span>,
                  <span key="a" className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                    <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setEnrolling(s)}>
                      Inscribir
                    </TextureButton>
                    <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setSellingTo(s)}>
                      Vender lote
                    </TextureButton>
                  </span>,
                ]}
              />
            ))}
          </ClubTable>
        )}
      </ClubPanel>

      {creating && (
        <StudentDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {enrolling && (
        <EnrollDialog
          student={enrolling}
          groups={groups}
          onClose={() => setEnrolling(null)}
          onSaved={() => {
            setEnrolling(null);
            load();
          }}
        />
      )}
      {sellingTo && (
        <PackageDialog
          student={sellingTo}
          groups={groups}
          symbol={symbol}
          onClose={() => setSellingTo(null)}
          onSaved={() => {
            setSellingTo(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function StudentDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [level, setLevel] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !phone.trim()) return setError('Nombre y teléfono son obligatorios.');
    setSaving(true);
    setError(null);
    try {
      await academyApi.createStudent({
        name: name.trim(),
        phone: phone.trim(),
        level: level ? Number(level) : null,
        guardianName: guardianName.trim() || null,
        guardianPhone: guardianPhone.trim() || null,
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo alumno</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Nombre *">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Nombre y apellido" />
          </Field>
          <Field label="Teléfono *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT} placeholder="04141234567" />
          </Field>
          <Field label="Nivel">
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={INPUT}>
              <option value="">Sin definir</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.toFixed(1)} · {levelLabel(l)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Representante (si es menor)">
            <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className={INPUT} placeholder="Nombre" />
          </Field>
          <Field label="Teléfono del representante">
            <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className={INPUT} placeholder="04141234567" />
          </Field>
          <p className="text-xs font-light text-brand-950/40">
            Si esta persona ya reservó cancha alguna vez, se usa su misma ficha de cliente: el historial no se parte en dos.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Guardando…' : 'Agregar'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EnrollDialog({
  student,
  groups,
  onClose,
  onSaved,
}: {
  student: Student;
  groups: ClassGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const active = groups.filter((g) => g.status === 'ACTIVE' || g.status === 'DRAFT');
  const [groupId, setGroupId] = useState(active[0]?.id ?? '');
  const [billingMode, setBillingMode] = useState('MONTHLY');
  const [billingDay, setBillingDay] = useState('1');
  const [override, setOverride] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);

  async function submit() {
    if (!groupId) return setError('Elige un grupo.');
    setSaving(true);
    setError(null);
    try {
      await academyApi.enroll({
        studentId: student.id,
        groupId,
        billingMode,
        billingDay: billingMode === 'MONTHLY' ? Number(billingDay) : null,
        levelOverrideReason: override.trim() || null,
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      const msg = e.response?.data?.error ?? 'No se pudo inscribir.';
      // 409 por nivel: se ofrece la excepción en vez de dejar al usuario atascado.
      if (e.response?.status === 409 && msg.includes('nivel')) setNeedsOverride(true);
      setError(msg);
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Inscribir a {student.customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Grupo">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={INPUT}>
              {active.length === 0 && <option value="">No hay grupos activos</option>}
              {active.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.slots.map((s) => `${WEEKDAY_SHORT[s.weekday]} ${s.startTime}`).join(', ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cómo paga">
            <select value={billingMode} onChange={(e) => setBillingMode(e.target.value)} className={INPUT}>
              <option value="MONTHLY">Mensualidad</option>
              <option value="PACKAGE">Con fichas de su lote</option>
              <option value="PER_CLASS">Clase suelta</option>
            </select>
          </Field>
          {billingMode === 'MONTHLY' && (
            <Field label="Día de cobro">
              <input type="number" min="1" max="28" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} className={INPUT} />
            </Field>
          )}
          {needsOverride && (
            <Field label="Motivo de la excepción de nivel *">
              <input value={override} onChange={(e) => setOverride(e.target.value)} className={INPUT} placeholder="El profesor lo autorizó" />
            </Field>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Inscribiendo…' : 'Inscribir'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Venta de lote. El alumno escoge un horario fijo y esa silla le queda reservada
 * durante meses — por eso se pide el horario, no solo el número de clases.
 */
function PackageDialog({
  student,
  groups,
  symbol,
  onClose,
  onSaved,
}: {
  student: Student;
  groups: ClassGroup[];
  symbol: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const withPackage = groups.filter((g) => g.status !== 'ENDED');
  const [groupId, setGroupId] = useState(withPackage[0]?.id ?? '');
  const group = withPackage.find((g) => g.id === groupId);
  const [slotId, setSlotId] = useState('');
  const [totalClasses, setTotalClasses] = useState(String(group?.packageClasses ?? 8));
  const [priceBase, setPriceBase] = useState(group?.packagePriceBase ?? '');
  const [expiresAt, setExpiresAt] = useState('');
  const [method, setMethod] = useState('CASH_USD');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!priceBase || Number(priceBase) <= 0) return setError('Escribe el precio del lote.');
    setSaving(true);
    setError(null);
    try {
      await academyApi.sellPackage({
        studentId: student.id,
        groupId: groupId || null,
        slotId: slotId || null,
        totalClasses: Number(totalClasses),
        priceBase: Number(priceBase),
        holdsSeat: !!slotId,
        expiresAt: expiresAt || null,
        method,
        referenceNumber: reference.trim() || null,
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo vender el lote.');
      setSaving(false);
    }
  }

  const perClass = Number(priceBase) && Number(totalClasses) ? Number(priceBase) / Number(totalClasses) : 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vender lote a {student.customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Grupo">
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                setSlotId('');
                const g = withPackage.find((x) => x.id === e.target.value);
                if (g?.packageClasses) setTotalClasses(String(g.packageClasses));
                if (g?.packagePriceBase) setPriceBase(g.packagePriceBase);
              }}
              className={INPUT}
            >
              <option value="">Sin grupo (solo fichas)</option>
              {withPackage.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>

          {group && group.slots.length > 0 && (
            <Field label="Horario que reserva">
              <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className={INPUT}>
                <option value="">Sin horario fijo</option>
                {group.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {WEEKDAY_SHORT[s.weekday]} {s.startTime}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className="text-xs font-light text-brand-950/40">
            Al elegir un horario, ese puesto le queda reservado en todas las clases de esa franja mientras el lote esté
            vigente.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Clases">
              <input type="number" min="1" value={totalClasses} onChange={(e) => setTotalClasses(e.target.value)} className={INPUT} />
            </Field>
            <Field label={`Precio (${symbol})`}>
              <input type="number" min="0" step="0.01" value={priceBase} onChange={(e) => setPriceBase(e.target.value)} className={INPUT} placeholder="0.00" />
            </Field>
          </div>
          {perClass > 0 && (
            <p className="text-xs font-light text-brand-950/50">
              Cada ficha vale {formatBase(perClass, symbol)} y se congela a ese precio.
            </p>
          )}

          <Field label="Vence el (opcional)">
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Cómo pagó">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referencia">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={INPUT} placeholder="Opcional" />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Registrando…' : 'Cobrar y entregar fichas'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-brand-950/70">{label}</span>
      {children}
    </label>
  );
}
