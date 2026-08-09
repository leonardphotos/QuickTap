import { useCallback, useEffect, useState } from 'react';
import { Plus, RotateCcw, Tablet, Trash2 } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';

interface TabletUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

/**
 * Ajustes del club → Tablets. Cada cancha tiene su tablet con un usuario propio
 * (rol CANCHA): entra una vez, se queda con la sesión abierta y solo muestra el
 * botón "Acceder". El jugador escanea el QR de su reserva y pide desde ahí.
 *
 * Es un alta de usuario como la de Equipo, pero acotada a este rol: quien monta
 * la tablet no tiene por qué pasar por la pantalla completa de permisos.
 */
export function ClubTabletsSection() {
  const [tablets, setTablets] = useState<TabletUser[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ data: TabletUser[] }>('/team')
      .then((r) => setTablets(r.data.data.filter((u) => u.role === 'CANCHA')))
      .catch(() => setTablets([]));
  }, []);

  useEffect(load, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.post('/team', { name, email, password, role: 'CANCHA' });
      setName('');
      setEmail('');
      setPassword('');
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
    if (!window.confirm(`¿Eliminar la tablet "${t.name}"? Se cerrará su sesión.`)) return;
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

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Tablets de las canchas</TextureCardTitle>
        <p className="text-sm font-light text-brand-950/60">
          Una cuenta por tablet. Inicia sesión con ella una sola vez y déjala abierta en la cancha: solo muestra el
          botón <span className="font-medium text-brand-950/80">Acceder</span>, y el jugador entra escaneando el QR de
          su reserva.
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

        {tablets === null && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}
        {tablets?.length === 0 && (
          <p className="text-sm font-light text-brand-950/45">Todavía no creaste ninguna tablet.</p>
        )}

        {tablets && tablets.length > 0 && (
          <ul className="space-y-2">
            {tablets.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-brand-950/[0.07] bg-white px-3 py-2.5"
              >
                <Tablet className="h-4 w-4 shrink-0 text-brand-950/35" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-950">{t.name}</p>
                  <p className="truncate text-xs font-light text-brand-950/45">{t.email}</p>
                </div>
                {!t.isActive && (
                  <span className="shrink-0 rounded-full bg-brand-950/[0.06] px-2 py-0.5 text-[10px] font-bold text-brand-950/45">
                    Inactiva
                  </span>
                )}
                <button
                  onClick={() => toggleActive(t)}
                  disabled={busy}
                  className="shrink-0 rounded-lg p-2 text-brand-950/35 transition-colors hover:bg-brand-950/[0.04] hover:text-brand-950 disabled:opacity-40"
                  aria-label={t.isActive ? 'Desactivar' : 'Activar'}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(t)}
                  disabled={busy}
                  className="shrink-0 rounded-lg p-2 text-brand-950/35 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  aria-label={`Eliminar ${t.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="space-y-3 rounded-2xl border border-brand-950/[0.07] bg-white p-4">
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
                disabled={busy || !name.trim() || !email.trim() || password.length < 6}
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
          <TextureButton variant="brand" size="default" onClick={() => setOpen(true)} className="!w-auto">
            <Plus className="h-4 w-4" /> Agregar tablet
          </TextureButton>
        )}
      </TextureCardContent>
    </TextureCard>
  );
}
