import { useState } from 'react';
import { api } from '@/api/client';
import type { StaffMember } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  waiter: StaffMember;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Equipo → "PIN": el dueño/admin fija (o quita) el PIN de 4 dígitos que este mesero usa para
 * aparecer en la cuadrícula de la tablet compartida (segundo inicio de sesión) — mismo PIN que
 * la Pantalla de bloqueo, así que el mesero también puede cambiárselo él mismo desde Ajustes.
 */
export function SetWaiterPinDialog({ waiter, onClose, onSaved }: Props) {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(nuevoPin: string | null) {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/team/${waiter.id}/pin`, { pin: nuevoPin });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el PIN.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>PIN de {waiter.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-brand-950/60 font-light">
            {waiter.hasLockPin
              ? 'Este mesero ya tiene un PIN configurado. Escribe uno nuevo para reemplazarlo, o quítalo abajo.'
              : 'Mientras no tenga PIN, no aparece en la cuadrícula de la tablet compartida.'}
          </p>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="4 dígitos"
            inputMode="numeric"
            maxLength={4}
            className="w-full text-center text-2xl tracking-[0.5em] border border-brand-950/15 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <TextureButton
              variant="brand"
              size="default"
              disabled={saving || pin.length !== 4}
              onClick={() => guardar(pin)}
              className="disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar PIN'}
            </TextureButton>
            {waiter.hasLockPin && (
              <button
                type="button"
                disabled={saving}
                onClick={() => guardar(null)}
                className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                Quitar PIN
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
