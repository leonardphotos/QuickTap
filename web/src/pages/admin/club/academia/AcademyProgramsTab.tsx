import { useCallback, useEffect, useState } from 'react';
import { Clock, Layers, Plus, UserMinus } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { card } from '../clubStyle';
import { academyApi, type Program, type WaitlistEntry } from './academyApi';

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
export default function AcademyProgramsTab() {
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
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className={`${card} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-brand-950">
            <Layers className="h-4 w-4 text-brand-500" />
            Programas
          </p>
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Nuevo
          </TextureButton>
        </div>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          La tipología de tu enseñanza. Cada grupo se asigna a uno, y los reportes se pueden ver por programa.
        </p>

        {programs.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-light text-brand-950/40">Todavía no hay programas.</p>
            <p className="mt-1 text-xs font-light text-brand-950/35">Por ejemplo: {SUGGESTIONS.join(' · ')}</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {programs.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <span
                  className="h-8 w-8 shrink-0 rounded-xl"
                  style={{ backgroundColor: p.color ?? '#94a3b8' }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-950">
                    {p.name}
                    {!p.active && <span className="ml-1.5 text-xs font-light text-brand-950/40">(inactivo)</span>}
                  </span>
                  <span className="block truncate text-xs font-light text-brand-950/50">
                    {p.description || `${p._count.groups} grupo(s)`}
                  </span>
                </span>
                {p.active && (
                  <button
                    onClick={async () => {
                      await academyApi.deleteProgram(p.id);
                      load();
                    }}
                    className="flex min-h-[34px] shrink-0 items-center rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-red-600"
                  >
                    Desactivar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${card} p-5`}>
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-950">
          <Clock className="h-4 w-4 text-amber-500" />
          Lista de espera
        </p>
        <p className="mt-0.5 text-xs font-light text-brand-950/50">
          Quien quiso entrar a un grupo lleno. Al liberarse un puesto se le avisa por WhatsApp al primero.
        </p>

        {waitlist.length === 0 ? (
          <p className="py-6 text-center text-sm font-light text-brand-950/40">Nadie esperando cupo.</p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-950/[0.06]">
            {waitlist.map((w) => (
              <li key={w.id} className="flex items-center gap-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-950/[0.05] text-xs font-bold text-brand-950/60">
                  {w.position}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-950">
                    {w.student.customer.name}
                    {w.status === 'OFFERED' && (
                      <span className="ml-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        PUESTO OFRECIDO
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs font-light text-brand-950/50">
                    {w.group.name} · {w.student.customer.phone}
                  </span>
                </span>
                <button
                  onClick={async () => {
                    await academyApi.leaveWaitlist(w.id);
                    load();
                  }}
                  className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-brand-950/45 hover:text-red-600"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
