import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { clubPublicApi, humanDate, type ClubExtra, type PublicClub, type PublicSlot } from './clubPublic';

interface Props {
  slug: string;
  club: PublicClub | null;
  picked: { courtId: string; courtName: string; date: string; slot: PublicSlot };
  extras: (ClubExtra & { quantity: number })[];
  symbol: string;
  onBooked: () => void;
  /** El turno se lo llevó otra persona mientras llenaba el formulario. */
  onTaken: () => void;
  onToken: (accessToken: string) => void;
}

/** Umbral a partir del cual tiene sentido preguntar por un Americano/Mexicano. */
const AMERICANO_MIN_PLAYERS = 6;

export default function ClubDetailsStep({ slug, club, picked, extras, symbol, onBooked, onTaken, onToken }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerIdNumber, setPlayerIdNumber] = useState('');
  const [playerCount, setPlayerCount] = useState(4);
  // null = todavía no contestó la pregunta del torneo.
  const [americano, setAmericano] = useState<boolean | null>(null);
  const [tournamentNames, setTournamentNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Paso de verificación por WhatsApp: 'form' = datos del jugador; 'code' = ya se
  // pidió el código y falta escribirlo. En el club demo no se envía nada de
  // verdad y cualquier código de 4 dígitos vale.
  const [stage, setStage] = useState<'form' | 'code'>('form');
  const [code, setCode] = useState('');
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  const codeLength = club?.isDemo ? 4 : 6;

  const showAmericanoQuestion = playerCount >= AMERICANO_MIN_PLAYERS;

  // Si baja de 6 jugadores, la pregunta deja de tener sentido: se olvida lo contestado.
  useEffect(() => {
    if (!showAmericanoQuestion) {
      setAmericano(null);
      setTournamentNames([]);
    }
  }, [showAmericanoQuestion]);

  // Un campo de nombre por jugador, sin perder lo ya escrito al ajustar la cantidad.
  useEffect(() => {
    if (americano !== true) return;
    setTournamentNames((prev) => {
      const next = prev.slice(0, playerCount);
      while (next.length < playerCount) next.push('');
      return next;
    });
  }, [americano, playerCount]);

  const namesReady = americano !== true || tournamentNames.every((n) => n.trim().length > 0);

  const durationMinutes = Math.round(
    (new Date(picked.slot.endsAt).getTime() - new Date(picked.slot.startsAt).getTime()) / 60_000,
  );

  const extrasTotal = extras.reduce((acc, e) => acc + Number(e.priceBase) * e.quantity, 0);

  async function doBook() {
    const booking = await clubPublicApi.book(slug, {
      courtId: picked.courtId,
      date: picked.date,
      startTime: picked.slot.startTime,
      durationMinutes,
      playerName: playerName.trim(),
      playerPhone: playerPhone.trim(),
      playerIdNumber: playerIdNumber.trim(),
      playerCount,
      requestedExtras: extras.map((e) => ({ id: e.id, name: e.name, quantity: e.quantity })),
      tournamentPlayerNames: americano ? tournamentNames.map((n) => n.trim()) : undefined,
    });
    onToken(booking.accessToken);
    onBooked();
  }

  function handleBookingError(err: any) {
    const status = err.response?.status;
    const message = err.response?.data?.error ?? 'No se pudo crear la reserva.';
    // 409 = la restricción de la base de datos rechazó el solape. No sirve
    // reintentar con los mismos datos: hay que volver a elegir turno.
    if (status === 409) {
      setError(message);
      setTimeout(onTaken, 1800);
      return;
    }
    setError(message);
    setSaving(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!namesReady) {
      setError('Completa el nombre de todos los jugadores del Americano.');
      return;
    }
    setSaving(true);
    setError(null);
    // Si el club exige verificar el teléfono, primero el código; si no, directo.
    if (club?.requiresVerification) {
      try {
        const r = await clubPublicApi.sendCode(slug, playerPhone.trim());
        if (!r.sent) {
          setError(r.message);
          setSaving(false);
          return;
        }
        setCodeMessage(r.message);
        setCode('');
        setStage('code');
        setSaving(false);
      } catch (err: any) {
        setError(err.response?.data?.error ?? 'No se pudo enviar el código. Intenta de nuevo.');
        setSaving(false);
      }
      return;
    }
    try {
      await doBook();
    } catch (err: any) {
      handleBookingError(err);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (code.length < codeLength) return;
    setSaving(true);
    setError(null);
    try {
      await clubPublicApi.checkCode(slug, playerPhone.trim(), code);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'El código no es correcto.');
      setSaving(false);
      return;
    }
    try {
      await doBook();
    } catch (err: any) {
      handleBookingError(err);
    }
  }

  if (stage === 'code') {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="text-[26px] font-bold tracking-tight">Verifica tu número</h1>
        <p className="mt-2 text-[14px] font-light text-club-text/70">
          {club?.isDemo
            ? 'Modo demostración: escribe cualquier código de 4 dígitos para confirmar tu reserva.'
            : (codeMessage ?? `Te enviamos un código de ${codeLength} dígitos por WhatsApp al ${playerPhone.trim()}.`)}
        </p>

        <form onSubmit={submitCode} className="mt-8 flex flex-1 flex-col">
          <CodeBoxes value={code} onChange={setCode} length={codeLength} disabled={saving} />

          {error && (
            <p className="mt-5 rounded-2xl bg-rose-500/25 p-3 text-[13px] font-medium text-club-text">{error}</p>
          )}

          <div className="mt-auto pt-6">
            <button
              type="submit"
              disabled={saving || code.length < codeLength}
              className="w-full rounded-full bg-white px-6 py-4 text-[15px] font-bold text-brand-950 shadow-xl transition-transform active:scale-[0.99] disabled:opacity-60"
            >
              {saving ? 'Confirmando…' : 'Confirmar reserva'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setStage('form');
                setError(null);
                setSaving(false);
              }}
              className="mt-3 w-full text-center text-[13px] font-medium text-club-text/60 underline"
            >
              Cambiar mis datos
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[26px] font-bold tracking-tight">Tus datos</h1>

      <div className="mt-4 rounded-2xl border border-white/25 bg-white/15 p-4 backdrop-blur-xl">
        <p className="text-[15px] font-bold">
          {picked.courtName} · {picked.slot.startTime} a {picked.slot.endTime}
        </p>
        <p className="text-[13px] font-light capitalize text-club-text/65">{humanDate(picked.date)}</p>
        <p className="mt-1.5 text-[17px] font-bold">
          {symbol}
          {picked.slot.priceBase}
        </p>
        {extras.length > 0 && (
          <p className="mt-2 border-t border-white/15 pt-2 text-[12px] font-light text-club-text/60">
            Para tener listo: {extras.map((e) => `${e.quantity}× ${e.name}`).join(', ')} · {symbol}
            {extrasTotal.toFixed(2)}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 flex flex-1 flex-col">
        <div className="space-y-3">
          <Field label="Nombre y apellido" value={playerName} onChange={setPlayerName} autoComplete="name" />
          <Field
            label="Teléfono"
            value={playerPhone}
            onChange={setPlayerPhone}
            inputMode="tel"
            placeholder="0414 123 4567"
            autoComplete="tel"
          />
          <Field label="Cédula" value={playerIdNumber} onChange={setPlayerIdNumber} placeholder="V-12345678" />

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-club-text/70">¿Cuántos van a jugar?</span>
            <select
              value={playerCount}
              onChange={(e) => setPlayerCount(Number(e.target.value))}
              className="w-full rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-[15px] text-club-text outline-none backdrop-blur-xl focus:border-white/60"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n} className="text-brand-950">
                  {n}
                </option>
              ))}
            </select>
          </label>

          {showAmericanoQuestion && (
            <div className="rounded-2xl border border-white/25 bg-white/10 p-3.5">
              <p className="text-[13px] font-medium text-club-text/85">¿Jugarás un americano?</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmericano(true)}
                  className={cn(
                    'flex-1 rounded-xl py-2 text-[13px] font-bold transition-colors',
                    americano === true ? 'bg-white text-brand-950' : 'bg-white/15 text-club-text hover:bg-white/25',
                  )}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setAmericano(false)}
                  className={cn(
                    'flex-1 rounded-xl py-2 text-[13px] font-bold transition-colors',
                    americano === false ? 'bg-white text-brand-950' : 'bg-white/15 text-club-text hover:bg-white/25',
                  )}
                >
                  No
                </button>
              </div>

              {americano === true && (
                <div className="mt-3 space-y-2">
                  <p className="text-[12px] font-light text-club-text/60">
                    Nombres de los {playerCount} jugadores, para tenerlos ya cargados en la cancha:
                  </p>
                  {tournamentNames.map((name, i) => (
                    <input
                      key={i}
                      value={name}
                      onChange={(e) =>
                        setTournamentNames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
                      placeholder={`Jugador ${i + 1}`}
                      className="w-full rounded-xl border border-white/25 bg-white/15 px-3 py-2 text-[14px] text-club-text placeholder:text-club-text/40 outline-none focus:border-white/60"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-2xl bg-rose-500/25 p-3 text-[13px] font-medium text-club-text">{error}</p>
        )}

        <div className="mt-auto pt-6">
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-full bg-white px-6 py-4 text-[15px] font-bold text-brand-950 shadow-xl transition-transform active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? 'Reservando…' : 'Confirmar reserva'}
          </button>
          <p className="mt-3 text-center text-[11px] font-light text-club-text/50">
            Pagas en el club al llegar.
          </p>
        </div>
      </form>
    </div>
  );
}

/** Casillas del código, una por dígito, con el estilo de cristal del enlace del
 * club (OtpInput, el componente del panel, viene pintado para fondo claro). */
function CodeBoxes({
  value,
  onChange,
  length,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  length: number;
  disabled?: boolean;
}) {
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, char: string) {
    if (char && !/^[0-9]$/.test(char)) return;
    const next = digits.slice();
    next[index] = char;
    onChange(next.join('').replace(/\s+$/, ''));
    if (char && index < length - 1) refs.current[index + 1]?.focus();
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
  }

  return (
    <div className="flex justify-center gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => setDigit(i, e.target.value.slice(-1))}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (!pasted) return;
            e.preventDefault();
            onChange(pasted);
            refs.current[Math.min(pasted.length, length - 1)]?.focus();
          }}
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          autoFocus={i === 0}
          className={cn(
            'h-14 w-12 rounded-2xl border text-center text-xl font-bold text-club-text outline-none backdrop-blur-xl transition-colors disabled:opacity-50',
            d ? 'border-white/70 bg-white/25' : 'border-white/25 bg-white/15 focus:border-white/60',
          )}
        />
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  // Omit del onChange nativo: aquí se recibe el valor ya extraído, no el evento.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-club-text/70">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-[15px] text-club-text placeholder:text-club-text/40 outline-none backdrop-blur-xl focus:border-white/60"
        {...rest}
      />
    </label>
  );
}
