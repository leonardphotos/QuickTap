import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { LockScreenMode } from '@/hooks/useLockScreen';

interface Props {
  mode: LockScreenMode;
  onUnlock: () => void;
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Pantalla completa estilo "lock screen" de iPhone: reloj grande, puntos que se llenan a
 * medida que se tipea el PIN, teclado numérico circular. Dos modos:
 * - 'setup': primera vez que este usuario entra — es obligatorio crear el PIN antes de poder
 *   usar el panel (se pide dos veces para confirmar).
 * - 'unlock': re-solicitud periódica — hay que reingresar el PIN ya configurado.
 * La única salida sin el PIN correcto es "Cerrar sesión" (logout real), nunca un botón que
 * simplemente cierre esta pantalla.
 */
/** Duración de la animación de desenfoque, en ms — usada tanto para entrar (montar) como para
 * salir (justo antes de desbloquear), así que ambos extremos usan el mismo número. */
const BLUR_TRANSITION_MS = 320;

export function LockScreen({ mode, onUnlock }: Props) {
  const { user, verifyLockPin, setLockPin, logout } = useAuth();
  const [step, setStep] = useState<'first' | 'confirm'>('first');
  const [firstPin, setFirstPin] = useState('');
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(new Date());
  // Arranca desenfocado/invisible y pasa a nítido un instante después de montar (transición de
  // entrada); se vuelve a poner en false justo antes de desbloquear (transición de salida) para
  // que sea la misma animación en ambos sentidos.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);

  /** Reproduce la animación de desenfoque en reversa antes de avisarle al padre que ya se
   * desbloqueó — así el teclado se difumina y desaparece en vez de cortar en seco. */
  function closeAndUnlock() {
    setVisible(false);
    setTimeout(onUnlock, BLUR_TRANSITION_MS);
  }

  // Reinicia el flujo si el modo cambia bajo nosotros (ej: se completó el setup y todavía
  // queda visible un instante mientras el padre re-renderiza con mode='unlock').
  useEffect(() => {
    setStep('first');
    setFirstPin('');
    setDigits('');
    setError(null);
  }, [mode]);

  async function handleComplete(pin: string) {
    setBusy(true);
    try {
      if (mode === 'setup') {
        if (step === 'first') {
          setFirstPin(pin);
          setDigits('');
          setStep('confirm');
          return;
        }
        if (pin !== firstPin) {
          triggerError('Los códigos no coinciden. Empieza de nuevo.');
          setStep('first');
          setFirstPin('');
          return;
        }
        await setLockPin(pin);
        closeAndUnlock();
        return;
      }

      const valid = await verifyLockPin(pin);
      if (valid) {
        closeAndUnlock();
      } else {
        triggerError('PIN incorrecto');
      }
    } finally {
      setBusy(false);
    }
  }

  function triggerError(message: string) {
    setError(message);
    setDigits('');
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }

  function pressDigit(d: string) {
    if (busy || digits.length >= 4) return;
    setError(null);
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) {
      setTimeout(() => handleComplete(next), 150);
    }
  }

  function backspace() {
    if (busy) return;
    setError(null);
    setDigits((d) => d.slice(0, -1));
  }

  const title =
    mode === 'setup'
      ? step === 'first'
        ? 'Crea tu PIN de bloqueo'
        : 'Confirma tu PIN'
      : 'QuickTap bloqueado';

  const subtitle =
    mode === 'setup'
      ? 'Se te pedirá periódicamente para volver a entrar al panel.'
      : user?.name;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-black/55 backdrop-blur-2xl text-white py-10 px-6 select-none">
      <div className="flex flex-col items-center gap-3 mt-6 sm:mt-10">
        <p className="text-6xl sm:text-7xl font-semibold tracking-tight tabular-nums">
          {now.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' })}
        </p>
        <p className="text-sm font-medium text-white/60 capitalize">
          {now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div
        className={`flex flex-col items-center gap-7 transition-all ease-out ${
          visible ? 'opacity-100 blur-none' : 'opacity-0 blur-md'
        }`}
        style={{ transitionDuration: `${BLUR_TRANSITION_MS}ms` }}
      >
        <div className="text-center px-6">
          <p className="text-[15px] font-semibold">{title}</p>
          {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
          {error && <p className="text-sm text-red-400 mt-1.5">{error}</p>}
        </div>

        <div className={`flex gap-4 ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
          <style>{`@keyframes shake { 10%,90%{transform:translateX(-2px)} 20%,80%{transform:translateX(4px)} 30%,50%,70%{transform:translateX(-8px)} 40%,60%{transform:translateX(8px)} }`}</style>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                error ? 'border-red-400' : 'border-white/60'
              } ${i < digits.length ? (error ? 'bg-red-400' : 'bg-white') : 'bg-transparent'}`}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-x-6 gap-y-4">
          {KEYPAD.map((d) => (
            <button
              key={d}
              type="button"
              disabled={busy}
              onClick={() => pressDigit(d)}
              className="h-16 w-16 rounded-full bg-white/10 text-2xl font-light active:bg-white/25 transition-colors disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            disabled={busy}
            onClick={() => pressDigit('0')}
            className="h-16 w-16 rounded-full bg-white/10 text-2xl font-light active:bg-white/25 transition-colors disabled:opacity-40"
          >
            0
          </button>
          <button
            type="button"
            disabled={busy || digits.length === 0}
            onClick={backspace}
            className="h-16 w-16 rounded-full flex items-center justify-center text-xl text-white/70 active:bg-white/10 transition-colors disabled:opacity-0"
          >
            ⌫
          </button>
        </div>
      </div>

      <button type="button" onClick={logout} className="text-sm text-white/50 underline underline-offset-2">
        Cerrar sesión
      </button>
    </div>
  );
}
