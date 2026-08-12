import { useCallback, useEffect, useState } from 'react';
import { Clock, Layers, Plus, UserMinus } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Cell,
  ClubBadge,
  ClubEyebrow,
  ClubPanel,
  ClubRow,
  ClubTable,
  PlainCell,
  type ClubColumn,
} from '../ClubTable';
import { academyApi, type Program, type WaitlistEntry } from './academyApi';
import type { DetailTarget } from './AcademyDetails';

const PROGRAM_COLS: ClubColumn[] = [
  { key: 'programa', label: 'Programa', width: 'minmax(0,1.2fr)' },
  { key: 'desc', label: 'Descripción', width: 'minmax(0,1.8fr)' },
  { key: 'grupos', label: 'Grupos', width: '100px' },
  { key: 'estado', label: 'Estado', width: '120px' },
  { key: 'accion', label: '', width: '130px', align: 'right' },
];

const WAITLIST_COLS: ClubColumn[] = [
  { key: 'pos', label: '#', width: '56px' },
  { key: 'alumno', label: 'Alumno', width: 'minmax(0,1.3fr)' },
  { key: 'grupo', label: 'Grupo', width: 'minmax(0,1.2fr)' },
  { key: 'tel', label: 'Teléfono', width: '150px' },
  { key: 'estado', label: 'Estado', width: '160px' },
  { key: 'accion', label: '', width: '110px', align: 'right' },
];

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

/** Colores sugeridos: distinguen los programas de un vistazo sin pedirle al club
 *  que elija un hex a mano. */
const COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#ef4444', '#eab308'];

/** Ejemplos típicos, para que la primera pantalla no esté vacía sin explicación. */
const SUGGESTIONS = ['Infantil', 'Adultos', 'Competición', 'Clínicas'];

/**
 * Programas (Infantil, Adultos, Competición…) y lista de espera.
 *
 * Van juntos porque son las dos caras de cómo se organiza la oferta: el programa
 * define qué se ofrece, y la lista de espera dice a quién no le alcanzó el cupo.
 */
export default function AcademyProgramsTab({ onOpen }: { onOpen: (t: DetailTarget) => void }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([academyApi.listPrograms(), academyApi.listWaitlist()])
      .then(([p, w]) => {
        setPrograms(p);
        setWaitlist(w);
      })
      .catch(() => setError('No pudimos cargar los programas.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading) return <p className="text-sm font-light text-brand-950/40">Cargando…</p>;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ClubEyebrow>Estructura de la academia</ClubEyebrow>
      <ClubPanel
        title={
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-brand-500" />
            Programas
          </span>
        }
        description="La tipología de tu enseñanza. Cada grupo se asigna a uno, y los reportes se pueden ver por programa."
        action={
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo
          </TextureButton>
        }
      >
        <ClubTable
          columns={PROGRAM_COLS}
          rows={programs.length}
          empty={`Todavía no hay programas. Por ejemplo: ${SUGGESTIONS.join(' · ')}`}
        >
          {programs.map((p) => (
            <ClubRow
              key={p.id}
              label={`Ver ${p.name}`}
              muted={!p.active}
              onClick={() => onOpen({ kind: 'program', id: p.id })}
              cells={[
                <Cell key="n">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-7 w-7 shrink-0 rounded-xl"
                      style={{ backgroundColor: p.color ?? '#94a3b8' }}
                      aria-hidden
                    />
                    <span className="truncate">{p.name}</span>
                  </span>
                </Cell>,
                <PlainCell key="d">{p.description || '—'}</PlainCell>,
                <PlainCell key="g" className="tabular-nums">
                  {p._count.groups}
                </PlainCell>,
                <ClubBadge key="e" tone={p.active ? 'brand' : 'neutral'}>
                  {p.active ? 'Activo' : 'Inactivo'}
                </ClubBadge>,
                p.active ? (
                  <button
                    key="a"
                    onClick={async () => {
                      await academyApi.deleteProgram(p.id);
                      load();
                    }}
                    className="flex min-h-[34px] items-center rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-red-600"
                  >
                    Desactivar
                  </button>
                ) : null,
              ]}
            />
          ))}
        </ClubTable>
      </ClubPanel>

      <ClubEyebrow>Cupos</ClubEyebrow>
      <ClubPanel
        title={
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            Lista de espera
          </span>
        }
        description="Quien quiso entrar a un grupo lleno. Al liberarse un puesto se le avisa por WhatsApp al primero."
      >
        <ClubTable columns={WAITLIST_COLS} rows={waitlist.length} empty="Nadie esperando cupo.">
          {waitlist.map((w) => (
            <ClubRow
              key={w.id}
              label={`Ver ${w.group.name}`}
              onClick={() => onOpen({ kind: 'group', id: w.group.id })}
              cells={[
                <span
                  key="p"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-950/[0.05] text-[12px] font-bold text-brand-950/60"
                >
                  {w.position}
                </span>,
                <Cell key="a">{w.student.customer.name}</Cell>,
                <PlainCell key="g">{w.group.name}</PlainCell>,
                <PlainCell key="t" className="tabular-nums">
                  {w.student.customer.phone}
                </PlainCell>,
                <ClubBadge key="e" tone={w.status === 'OFFERED' ? 'emerald' : 'neutral'}>
                  {w.status === 'OFFERED' ? 'Puesto ofrecido' : 'Esperando'}
                </ClubBadge>,
                <button
                  key="x"
                  onClick={async () => {
                    await academyApi.leaveWaitlist(w.id);
                    load();
                  }}
                  className="flex min-h-[34px] items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-red-600"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Quitar
                </button>,
              ]}
            />
          ))}
        </ClubTable>
      </ClubPanel>

      {creating && (
        <ProgramDialog
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProgramDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (name.trim().length < 2) return setError('Ponle nombre al programa.');
    setSaving(true);
    setError(null);
    try {
      await academyApi.createProgram({ name: name.trim(), description: description.trim() || null, color });
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
          <DialogTitle>Nuevo programa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Nombre *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Infantil" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setName(s)}
                className="min-h-[30px] rounded-full bg-brand-950/[0.05] px-3 text-xs font-medium text-brand-950/60 hover:text-brand-950"
              >
                {s}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-brand-950/70">Descripción</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={INPUT}
              placeholder="Opcional"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-brand-950/70">Color</span>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-8 w-8 rounded-xl transition-transform ${color === c ? 'ring-2 ring-brand-950/30 ring-offset-2' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton variant="brand" size="default" disabled={saving} className="disabled:opacity-50" onClick={submit}>
            {saving ? 'Guardando…' : 'Crear programa'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
