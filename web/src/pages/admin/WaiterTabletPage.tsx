import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Tablet de Meseros: pantalla fija de un dispositivo compartido (mismo patrón que
 * Pantalla/Comanda/Numero) cuya única función es un teclado de 4 dígitos. No hay grilla
 * de nombres — la clave sola identifica a cuál mesero pertenece (ver
 * auth.service.ts identifyWaiterByPin). Después de identificar, recarga la app entera
 * con el token del mesero ya guardado, igual que switchUser/switchToBranch.
 */
export function WaiterTabletPage() {
  const { identifyWaiterByPin } = useAuth();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  async function intentar(pin: string) {
    setBusy(true);
    try {
      await identifyWaiterByPin(pin);
      // identifyWaiterByPin recarga la app entera al confirmar — no hace falta tocar más estado acá.
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Clave incorrecta.');
      setDigits('');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setBusy(false);
    }
  }

  function presionar(d: string) {
    if (busy || digits.length >= 4) return;
    setError(null);
    const next = digits + d;
    setDigits(next);
    if (next.length === 4) setTimeout(() => intentar(next), 150);
  }

  function borrar() {
    if (busy) return;
    setError(null);
    setDigits((d) => d.slice(0, -1));
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-7 bg-[#141414] text-white">
      <div className="text-center px-6">
        <h1 className="text-2xl sm:text-3xl font-semibold">Tablet de meseros</h1>
        <p className="text-sm text-white/50 mt-1.5">Ingresa tu clave de 4 dígitos</p>
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
    </div>
  );
}
