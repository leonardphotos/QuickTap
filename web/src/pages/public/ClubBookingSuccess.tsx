import { useEffect, useState } from 'react';

interface Props {
  courtName: string;
  dateLabel: string;
  timeLabel: string;
  onDone: () => void;
}

/**
 * Confirmación de la reserva: una pelota cae, rebota y se transforma en el check.
 *
 * Todo es CSS (keyframes en index.css) y no una librería de animación, para que
 * el estado final quede visible aunque la animación no llegue a correr — mismo
 * criterio que el carrusel de la Pantalla. Con `prefers-reduced-motion` la
 * pelota no aparece y el check se muestra directo.
 */
export default function ClubBookingSuccess({ courtName, dateLabel, timeLabel, onDone }: Props) {
  // El botón aparece cuando la animación ya contó su historia, para que nadie
  // salte la confirmación sin verla y quede la duda de si reservó.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setReady(true), reduce ? 0 : 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="relative flex h-32 w-32 items-center justify-center">
        {/* Pelota */}
        <div
          className="club-ball absolute h-20 w-20 rounded-full shadow-lg"
          style={{
            animation: 'var(--animate-ball-drop), var(--animate-ball-morph)',
            background: 'radial-gradient(circle at 32% 28%, #e8ff65 0%, #cbe33f 45%, #a9c22c 100%)',
          }}
        >
          {/* Las dos costuras: sin ellas es un círculo amarillo, no una pelota. */}
          <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full">
            <path d="M6 14c16 12 16 40 0 52" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
            <path d="M74 14c-16 12-16 40 0 52" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
          </svg>
        </div>

        {/* Check */}
        <div
          className="club-check absolute flex h-24 w-24 items-center justify-center rounded-full bg-white/95 shadow-xl"
          style={{ animation: 'var(--animate-check-pop)' }}
        >
          <svg viewBox="0 0 48 48" className="h-12 w-12">
            <path
              d="M13 25l8 8 15-16"
              fill="none"
              stroke="#16a34a"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="34"
              style={{ animation: 'var(--animate-check-draw)' }}
            />
          </svg>
        </div>
      </div>

      <div className="club-rise mt-8" style={{ animation: 'var(--animate-rise)', animationDelay: '1700ms' }}>
        <h2 className="text-[26px] font-bold tracking-tight text-club-text">¡Reserva lista!</h2>
        <p className="mt-2 text-[15px] font-light text-club-text/80">
          {courtName} · {timeLabel}
        </p>
        <p className="text-[14px] font-light capitalize text-club-text/60">{dateLabel}</p>
      </div>

      <button
        onClick={onDone}
        disabled={!ready}
        className="club-rise mt-8 w-full max-w-xs rounded-full bg-white px-6 py-4 text-[15px] font-bold text-brand-950 shadow-lg transition-opacity disabled:opacity-0"
        style={{ animation: 'var(--animate-rise)', animationDelay: '1900ms' }}
      >
        Ver mi código de acceso
      </button>
    </div>
  );
}
