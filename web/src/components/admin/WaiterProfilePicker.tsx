import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface Waiter {
  id: string;
  name: string;
}

interface Props {
  /** Solo en el login: deja seguir con la cuenta que acaba de entrar (dueño/admin/cajero en
   * su propio dispositivo, no la tablet compartida) sin tener que elegir un mesero. */
  onSkip?: () => void;
  /** Solo al cambiar de mesero desde dentro del panel: cierra sin cambiar de sesión. */
  onClose?: () => void;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Paleta fija de marca — el color de cada mesero sale de su nombre (mismo nombre, mismo
// color siempre), así la tarjeta se reconoce de un vistazo sin depender de una foto.
const COLORES = ['#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ef4444'];
function colorDeNombre(nombre: string): string {
  let hash = 0;
  for (const ch of nombre) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES[hash % COLORES.length];
}

/**
 * Cuadrícula de perfiles estilo Netflix, para el "segundo inicio de sesión" de la tablet
 * compartida: una vez que alguien entró con correo y clave, elegir DE QUIÉN es este pedido es
 * un simple toque + PIN de 4 dígitos, sin volver a escribir credenciales completas.
 *
 * Dos usos, mismo componente:
 * - Justo después de un login exitoso (LoginPage): se muestra si el restaurante tiene algún
 *   mesero con PIN configurado; `onSkip` deja seguir como quien acaba de entrar.
 * - "Cambiar de mesero" desde dentro del panel de Mesero (WaiterLayout): `onClose` cierra sin
 *   tocar la sesión actual.
 */
export function WaiterProfilePicker({ onSkip, onClose }: Props) {
  const { user, switchableWaiters, switchUser } = useAuth();
  const [waiters, setWaiters] = useState<Waiter[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Waiter | null>(null);
  const [digits, setDigits] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    switchableWaiters()
      .then(setWaiters)
      .catch(() => setLoadError('No se pudo cargar la lista de meseros.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegir(w: Waiter) {
    setSelected(w);
    setDigits('');
    setPinError(null);
  }

  function volverALaGrilla() {
    setSelected(null);
    setDigits('');
    setPinError(null);
  }

  async function intentar(pin: string) {
    if (!selected) return;
    setBusy(true);
    try {
      await switchUser(selected.id, pin);
      // switchUser recarga la app entera al confirmar — no hace falta tocar más estado acá.
    } catch (err: any) {
      setPinError(err.response?.data?.error ?? 'PIN incorrecto');
      setDigits('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  }

  function presionar(d: string) {
    if (busy || digits.length >= 4) return;
    setPinError(null);
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) setTimeout(() => intentar(next), 150);
  }

  function borrar() {
    if (busy) return;
    setPinError(null);
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center bg-[#141414] text-white overflow-y-auto py-10 px-6">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-white/50 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar"
        >
          ✕
        </button>
      )}

      {!selected ? (
        <div className="flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-center">¿Quién está atendiendo?</h1>
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}
          {waiters === null && !loadError && <p className="text-sm text-white/50">Cargando…</p>}
          {waiters?.length === 0 && (
            <p className="max-w-sm text-center text-sm text-white/50">
              Todavía no hay meseros con PIN configurado. Se hace desde Equipo, o cada mesero puede
              ponerse el suyo en Ajustes.
            </p>
          )}
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            {waiters?.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => elegir(w)}
                className="group flex flex-col items-center gap-2.5"
              >
                <span
                  className="flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-2xl text-3xl font-bold text-white/90 ring-2 ring-transparent transition-all group-hover:ring-white/70 group-active:scale-95"
                  style={{ backgroundColor: colorDeNombre(w.name) }}
                >
                  {w.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="max-w-[6.5rem] truncate text-sm text-white/70 group-hover:text-white">
                  {w.name}
                </span>
              </button>
            ))}
          </div>
          {onSkip && (
            <button type="button" onClick={onSkip} className="mt-2 text-sm text-white/50 underline underline-offset-2">
              Seguir como {user?.name} →
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-7">
          <div className="text-center px-6">
            <span
              className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white/90"
              style={{ backgroundColor: colorDeNombre(selected.name) }}
            >
              {selected.name.trim().charAt(0).toUpperCase()}
            </span>
            <p className="text-[15px] font-semibold">{selected.name}</p>
            <p className="text-sm text-white/50 mt-1">PIN de 4 dígitos</p>
            {pinError && <p className="text-sm text-red-400 mt-1.5">{pinError}</p>}
          </div>

          <div className={`flex gap-4 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
            <style>{`@keyframes shake { 10%,90%{transform:translateX(-2px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-8px)} 40%,60%{transform:translateX(8px)} }`}</style>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                  pinError ? 'border-red-400' : 'border-white/60'
                } ${i < digits.length ? (pinError ? 'bg-red-400' : 'bg-white') : 'bg-transparent'}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-x-6 gap-y-4">
            {KEYPAD.map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => presionar(d)}
                className="h-16 w-16 rounded-full bg-white/10 text-2xl font-light active:bg-white/25 transition-colors disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <div />
            <button
              type="button"
              disabled={busy}
              onClick={() => presionar('0')}
              className="h-16 w-16 rounded-full bg-white/10 text-2xl font-light active:bg-white/25 transition-colors disabled:opacity-40"
            >
              0
            </button>
            <button
              type="button"
              disabled={busy || digits.length === 0}
              onClick={borrar}
              className="h-16 w-16 rounded-full flex items-center justify-center text-xl text-white/70 active:bg-white/10 transition-colors disabled:opacity-0"
            >
              ⌫
            </button>
          </div>

          <button type="button" onClick={volverALaGrilla} className="text-sm text-white/50 underline underline-offset-2">
            ‹ Elegir otro
          </button>
        </div>
      )}
    </div>
  );
}
