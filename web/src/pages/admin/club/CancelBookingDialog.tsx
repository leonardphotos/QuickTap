import { useState } from 'react';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const INPUT =
  'w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40';

/**
 * Motivos frecuentes, para que cancelar sea un tap y no una redacción.
 *
 * Importa que la lista distinga quién falló: "no se presentó" y "el club canceló"
 * son cosas distintas a la hora de decidir si esa persona debería quedar en la
 * lista negra, y sin motivo escrito no hay forma de saberlo después.
 */
const REASONS = [
  'El jugador avisó que no viene',
  'El jugador no se presentó',
  'Lluvia / cancha no jugable',
  'Mantenimiento imprevisto',
  'Error al cargar la reserva',
];

export default function CancelBookingDialog({
  playerName,
  onClose,
  onConfirm,
}: {
  playerName: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = choice === 'OTRO' ? other.trim() : choice;

  async function submit() {
    if (!reason || reason.length < 3) return setError('Elige o escribe el motivo.');
    setSaving(true);
    setError(null);
    try {
      await onConfirm(reason);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo cancelar.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar la reserva de {playerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-brand-950/70">¿Por qué se cancela?</p>
          <div className="space-y-1.5">
            {[...REASONS, 'OTRO'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setChoice(r)}
                className={`flex min-h-[38px] w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${
                  choice === r
                    ? 'bg-brand-500/10 font-semibold text-brand-950'
                    : 'bg-brand-950/[0.04] font-light text-brand-950/70 hover:text-brand-950'
                }`}
              >
                {r === 'OTRO' ? 'Otro motivo…' : r}
              </button>
            ))}
          </div>

          {choice === 'OTRO' && (
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              className={INPUT}
              placeholder="Escribe el motivo"
              autoFocus
            />
          )}

          <p className="text-xs font-light text-brand-950/40">
            El motivo queda guardado en la reserva. La cancha se libera de inmediato y vuelve a estar disponible.
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton
            variant="brand"
            size="default"
            disabled={saving || !reason}
            className="disabled:opacity-50"
            onClick={submit}
          >
            {saving ? 'Cancelando…' : 'Confirmar cancelación'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
