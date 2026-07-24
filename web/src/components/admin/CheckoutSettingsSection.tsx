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
  const [rif, setRif] = useState(restaurant?.rif ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { orderingEnabled, requireOrderConfirmation, serviceChargeEnabled, rif: rif.trim() });
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

        <div className="flex items-start justify-between gap-4 py-3">
          <div>
            <p className="text-sm font-medium text-brand-950">IVA (16%)</p>
            <p className="text-xs text-brand-950/50 font-light mt-0.5">
              Solo el equipo de QuickTap puede activarlo, y solo si tienes tu RIF registrado abajo. Escríbenos si
              necesitas activarlo.
            </p>
          </div>
          <span
            className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
              restaurant?.ivaEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {restaurant?.ivaEnabled ? 'Activado' : 'Inactivo'}
          </span>
        </div>

        <label className="block py-3">
          <p className="text-sm font-medium text-brand-950">RIF del restaurante</p>
          <p className="text-xs text-brand-950/50 font-light mt-0.5 mb-1.5">
            Necesario para que QuickTap pueda activarte el IVA.
          </p>
          <input
            value={rif}
            onChange={(e) => setRif(e.target.value)}
            placeholder="Ej: J-12345678-9"
            className="w-full max-w-xs text-sm border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </label>

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
