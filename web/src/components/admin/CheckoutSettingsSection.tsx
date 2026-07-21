import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer">
      <div>
        <p className="text-sm font-medium text-brand-950">{label}</p>
        <p className="text-xs text-brand-950/50 font-light mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand-500' : 'bg-brand-950/15'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </label>
  );
}

/** Pedidos: permitir/deshabilitar el carrito, y cargos opcionales de servicio/IVA. */
export function CheckoutSettingsSection() {
  const { restaurant, refresh } = useAuth();
  const [orderingEnabled, setOrderingEnabled] = useState(restaurant?.orderingEnabled ?? true);
  const [requireOrderConfirmation, setRequireOrderConfirmation] = useState(restaurant?.requireOrderConfirmation ?? false);
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(restaurant?.serviceChargeEnabled ?? false);
  const [ivaEnabled, setIvaEnabled] = useState(restaurant?.ivaEnabled ?? false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { orderingEnabled, requireOrderConfirmation, serviceChargeEnabled, ivaEnabled });
      await refresh();
      setMessage('Configuración guardada.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Pedidos y cargos</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Controla si tu menú acepta pedidos, y si se suman cargos opcionales al total.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-1 divide-y divide-brand-950/[0.06]">
        <Toggle
          checked={orderingEnabled}
          onChange={setOrderingEnabled}
          label="Permitir pedidos"
          description="Si lo apagas, el menú público queda solo para ver: sin carrito ni botón de ordenar, en mesa o por delivery."
        />
        <Toggle
          checked={requireOrderConfirmation}
          onChange={setRequireOrderConfirmation}
          label="Confirmar pedido antes de enviarse a cocina"
          description="Los pedidos que el cliente envía desde la mesa (QR) quedan esperando a que un mesero los acepte antes de llegar a cocina."
        />
        <Toggle
          checked={serviceChargeEnabled}
          onChange={setServiceChargeEnabled}
          label="Cargo por servicio (10%)"
          description="Se suma automáticamente sobre el subtotal de cada pedido."
        />
        <Toggle
          checked={ivaEnabled}
          onChange={setIvaEnabled}
          label="IVA (16%)"
          description="Se suma automáticamente sobre el subtotal de cada pedido."
        />

        {error && <p className="text-sm text-red-600 pt-2">{error}</p>}
        {message && <p className="text-sm text-brand-500 pt-2">{message}</p>}

        <div className="pt-4">
          <TextureButton
            variant="brand"
            size="default"
            disabled={saving}
            onClick={save}
            className="!w-auto disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </div>
      </TextureCardContent>
    </TextureCard>
  );
}
