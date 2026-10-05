import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard,TextureCardContent,TextureCardHeader,TextureCardTitle } from '@/components/ui/texture-card';
import { useAuth } from '@/context/AuthContext.shared';
import { useState } from 'react';

/** Código de 6 dígitos que el Mesero debe ingresar para eliminar una comanda. Solo Dueño/Admin lo crean o cambian. */
export function DeleteOrderPinSection() {
  const { restaurant, refresh } = useAuth();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setMessage(null);
    if (!/^\d{6}$/.test(pin)) {
      setError('El código debe tener exactamente 6 dígitos.');
      return;
    }
    if (pin !== confirmPin) {
      setError('Los códigos no coinciden.');
      return;
    }
    setSaving(true);
    try {
      await api.patch('/restaurant/delete-order-pin', { pin });
      await refresh();
      setPin('');
      setConfirmPin('');
      setMessage('Código guardado.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el código.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Código para eliminar comandas</TextureCardTitle>
        <p className="text-brand-950/60 font-light text-base">
          El Mesero debe ingresar este código de 6 dígitos para poder eliminar una comanda desde Pedidos.{' '}
          {restaurant?.hasDeleteOrderPin ? (
            <span className="text-emerald-600 font-medium">Ya está configurado.</span>
          ) : (
            <span className="text-amber-600 font-medium">Aún no está configurado: el Mesero no puede eliminar comandas.</span>
          )}
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            className="border border-brand-950/15 rounded-lg px-3 py-2 tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
          />
          <input
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="Confirmar código"
            className="border border-brand-950/15 rounded-lg px-3 py-2 tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
          />
        </div>

        {error && <p className="text-red-600 text-base">{error}</p>}
        {message && <p className="text-brand-500 text-base">{message}</p>}

        <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
          {saving ? 'Guardando…' : restaurant?.hasDeleteOrderPin ? 'Cambiar código' : 'Crear código'}
        </TextureButton>
      </TextureCardContent>
    </TextureCard>
  );
}
