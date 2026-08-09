import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Tablet, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';
import { clubApi, type ClubCourt } from './clubApi';

interface TabletUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  clubCourtId: string | null;
  clubCourt: { id: string; name: string } | null;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

/**
 * Ajustes del club → Tablets. Cada cancha tiene su tablet con un usuario propio
 * (rol CANCHA): entra una vez, se queda con la sesión abierta y solo muestra el
 * botón "Acceder". El jugador escanea el QR de su reserva y pide desde ahí.
 *
 * La tablet va atada a UNA cancha: el QR que se escanee tiene que ser de una
 * reserva de esa misma cancha, o los pedidos terminarían en la pista de al lado.
 */
export function ClubTabletsSection() {
  const [tablets, setTablets] = useState<TabletUser[] | null>(null);
  const [courts, setCourts] = useState<ClubCourt[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [courtId, setCourtId] = useState('');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.get<{ data: TabletUser[] }>('/team'), clubApi.listCourts()])
      .then(([team, c]) => {
        setTablets(team.data.data.filter((u) => u.role === 'CANCHA'));
        setCourts(c.filter((x) => x.active));
      })
      .catch(() => setTablets([]));
  }, []);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/team', { name, email, password, role: 'CANCHA', clubCourtId: courtId });
      setName('');
      setEmail('');
      setPassword('');
      setCourtId('');
      setOpen(false);
      load();
      setMessage('Tablet creada. Inicia sesión con ese correo en la tablet y déjala abierta.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la tablet.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TabletUser) {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/team/${t.id}`);
      load();
      setMessage('Tablet eliminada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar.');
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  async function toggleActive(t: TabletUser) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/team/${t.id}`, { isActive: !t.isActive });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  }

  async function reassign(t: TabletUser, newCourtId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/team/${t.id}`, { clubCourtId: newCourtId });
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo cambiar la cancha.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Tablets de las canchas</TextureCardTitle>
        <p className="text-sm font-light text-brand-950/60">
          Una cuenta por tablet, atada a una cancha. Inicia sesión con ella una sola vez y déjala montada: solo muestra
          el botón <span className="font-medium text-brand-950/80">Acceder</span>, y el jugador entra escaneando el QR
          de su reserva — que tiene que ser de esa misma cancha.
        </p>
      </TextureCardHeader>

      <TextureCardContent className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-2xl bg-brand-950/[0.04] px-4 py-3">
          <Tablet className="mt-0.5 h-4 w-4 shrink-0 text-brand-950/45" />
          <p className="text-[13px] font-light text-brand-950/60">
            La pantalla funciona solo en <span className="font-medium text-brand-950/80">horizontal</span>. Si la
            tablet está vertical, avisa que hay que girarla. Bloquea la rotación en horizontal para que no se mueva.
          </p>
        </div>

        {courts.length === 0 && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-900">
            Primero crea al menos una cancha acá arriba: cada tablet va montada en una.
          </p>
        )}

        {tablets === null && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}
        {tablets?.length === 0 && (
          <p className="text-sm font-light text-brand-950/45">Todavía no creaste ninguna tablet.</p>
        )}

        {tablets && tablets.length > 0 && (
          <ul className="space-y-2">
            {tablets.map((t) => (
              <li key={t.id} className="rounded-xl border border-brand-950/[0.07] bg-white px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Tablet className="h-4 w-4 shrink-0 text-brand-950/35" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-950">{t.name}</p>
                    <p className="truncate text-xs font-light text-brand-950/45">{t.email}</p>
                  </div>
                  <select
                    value={t.clubCourtId ?? ''}
                    onChange={(e) => reassign(t, e.target.value)}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-brand-950/10 px-2 py-1.5 text-xs text-brand-950 outline-none focus:border-brand-400"
                    aria-label={`Cancha de ${t.name}`}
                  >
                    <option value="" disabled>
                      Sin cancha
                    </option>
                    {courts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {!t.isActive && (
                    <span className="shrink-0 rounded-full bg-brand-950/[0.06] px-2 py-0.5 text-[10px] font-bold text-brand-950/45">
                      Inactiva
                    </span>
                  )}
                  <button
                    onClick={() => toggleActive(t)}
                    disabled={busy}
                    className="shrink-0 rounded-lg p-2 text-brand-950/35 transition-colors hover:bg-brand-950/[0.04] hover:text-brand-950 disabled:opacity-40"
                    aria-label={t.isActive ? `Desactivar ${t.name}` : `Activar ${t.name}`}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmingId(t.id)}
                    disabled={busy}
                    className="shrink-0 rounded-lg p-2 text-brand-950/35 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    aria-label={`Eliminar ${t.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Confirmación dentro de la tarjeta y no con window.confirm: el
                    diálogo nativo no aparece en la app instalada ni en algunos
                    navegadores de tablet, y el botón parecía no hacer nada. */}
                {confirmingId === t.id && (
                  <div className="mt-2.5 rounded-lg bg-red-50 p-3">
                    <p className="text-[13px] font-medium text-red-900">
                      ¿Eliminar "{t.name}"? Se cerrará su sesión en la tablet.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => remove(t)}
                        disabled={busy}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-40"
                      >
                        Sí, eliminar
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-brand-950/60"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="space-y-3 rounded-2xl border border-brand-950/[0.07] bg-white p-4">
            <label className="block text-sm">
              <span className="text-brand-950/70">Cancha donde va montada</span>
              <select
                value={courtId}
                onChange={(e) => setCourtId(e.target.value)}
                className={inputClass}
              >
                <option value="">Elige una cancha…</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Nombre de la tablet</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tablet Cancha 1"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Correo de acceso</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoCapitalize="none"
                placeholder="cancha1@miclub.com"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Contraseña</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="text"
                placeholder="Mínimo 6 caracteres"
                className={inputClass}
              />
            </label>
            <div className="flex gap-2">
              <TextureButton
                variant="brand"
                size="default"
                disabled={busy || !name.trim() || !email.trim() || password.length < 6 || !courtId}
                onClick={create}
                className="!w-auto disabled:opacity-50"
              >
                {busy ? 'Creando…' : 'Crear tablet'}
              </TextureButton>
              <TextureButton variant="minimal" size="default" onClick={() => setOpen(false)} className="!w-auto">
                Cancelar
              </TextureButton>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        {!open && (
          <TextureButton
            variant="brand"
            size="default"
            disabled={courts.length === 0}
            onClick={() => setOpen(true)}
            className="!w-auto disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Agregar tablet
          </TextureButton>
        )}
      </TextureCardContent>
    </TextureCard>
  );
}
