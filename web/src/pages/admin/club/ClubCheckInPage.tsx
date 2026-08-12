import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, QrCode, XCircle } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import ScannerModal from '@/components/ui/scanner-modal';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { clubApi, type ClubBooking } from './clubApi';

type Result =
  | { kind: 'ok'; booking: ClubBooking; already: boolean }
  | { kind: 'error'; message: string };

/**
 * Control de acceso: recepción escanea el QR de la reserva (o pega el código) y
 * el sistema valida y marca la asistencia. Ese check-in es lo que después
 * distingue una reserva jugada de una ausencia, sin registrarlo a mano.
 */
export default function ClubCheckInPage() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);

  async function validate(token: string) {
    const clean = token.trim().replace(/^.*\/acceso\//, '');
    if (!clean) return;
    setLoading(true);
    try {
      const data = await clubApi.checkIn(clean);
      setResult({ kind: 'ok', booking: data.booking, already: data.alreadyCheckedIn });
      setCode('');
    } catch (err: any) {
      setResult({ kind: 'error', message: err.response?.data?.error ?? 'No se pudo validar el código.' });
    } finally {
      setLoading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    validate(code);
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 text-center">
      <div>
        <h1 className="text-[20px] font-bold text-brand-950 tracking-tight">Control de acceso</h1>
        <p className="mt-1 text-[13px] text-brand-950/50 font-light">
          Escanea el QR que el jugador recibió al reservar.
        </p>
      </div>

      <button
        onClick={() => setScanning(true)}
        className="flex items-center justify-center gap-2.5 rounded-2xl border border-brand-950/[0.08] bg-white p-6 shadow-sm hover:border-brand-400 transition-colors"
      >
        <QrCode className="h-6 w-6 text-brand-500" />
        <span className="text-[15px] font-bold text-brand-950">Escanear QR</span>
      </button>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="…o pega el código aquí"
          className="flex-1 rounded-xl border border-brand-950/10 px-3 py-2 text-[14px] outline-none focus:border-brand-400"
        />
        <TextureButton type="submit" disabled={loading || !code.trim()}>
          Validar
        </TextureButton>
      </form>

      {result?.kind === 'ok' && (
        <div
          className={`rounded-2xl border p-5 ${
            result.already ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`h-5 w-5 ${result.already ? 'text-amber-600' : 'text-emerald-600'}`} />
            <p className={`font-bold ${result.already ? 'text-amber-900' : 'text-emerald-900'}`}>
              {result.already ? 'Ya había entrado' : 'Acceso permitido'}
            </p>
          </div>
          <p className="mt-2.5 text-[15px] font-bold text-brand-950">{result.booking.playerName}</p>
          {result.booking.block && (
            <p className="text-[13px] text-brand-950/60">
              {result.booking.block.court.name} ·{' '}
              {new Date(result.booking.block.startsAt).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              a{' '}
              {new Date(result.booking.block.endsAt).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
          <p className="mt-1 text-[13px] text-brand-950/50 font-light">
            {result.booking.playerCount} jugadores · {result.booking.playerPhone}
          </p>
        </div>
      )}

      {result?.kind === 'error' && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-5">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-rose-600" />
            <p className="font-bold text-rose-900">No válido</p>
          </div>
          <p className="mt-1 text-[13px] text-rose-800">{result.message}</p>
        </div>
      )}

      <QrScanDialog
        open={scanning}
        onClose={() => setScanning(false)}
        onDecoded={(value) => {
          setScanning(false);
          validate(value);
        }}
      />
    </div>
  );
}

/** Cámara para leer el QR de acceso. Usa ScannerModal (sin backdrop-blur) por el bug de WebKit
 * que deja el <video> en negro — ver el comentario en scanner-modal.tsx.
 *
 * Cámara FRONTAL ('user'): el equipo de acceso está fijo en el mostrador mirando al jugador,
 * que acerca el QR de su teléfono de frente. Con la trasera (el defecto del hook, pensada para
 * quien apunta a un código con el equipo en la mano) recepción tendría que voltear la tablet en
 * cada entrada. */
function QrScanDialog({ open, onClose, onDecoded }: { open: boolean; onClose: () => void; onDecoded: (v: string) => void }) {
  const { videoRef, cameraError } = useBarcodeCamera(open, onDecoded, 'user');

  return (
    <ScannerModal
      open={open}
      onClose={onClose}
      title="Escanear QR de la reserva"
      footer={
        <TextureButton variant="minimal" size="default" className="!w-auto" onClick={onClose}>
          Cerrar
        </TextureButton>
      }
    >
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
        {/* Espejado como cualquier cámara frontal: sin esto, mover el QR a la derecha lo mueve
            a la izquierda en pantalla y apuntar se vuelve un rompecabezas. Solo afecta a la
            vista previa — zxing decodifica el stream original, no el elemento con el
            transform (mismo criterio que la tablet de la cancha). */}
        <video ref={videoRef} className="w-full h-full -scale-x-100 object-cover" muted autoPlay playsInline />
        {!cameraError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-2/3 aspect-square border-2 border-white/70 rounded-2xl" />
          </div>
        )}
        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/80">
            <p className="text-sm text-white text-center">{cameraError} Revisa los permisos de cámara del navegador.</p>
          </div>
        )}
      </div>
    </ScannerModal>
  );
}
