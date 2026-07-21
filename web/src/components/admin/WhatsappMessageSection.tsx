import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

// Debe coincidir exactamente con DEFAULT_COMANDA_WHATSAPP_TEMPLATE en src/utils/whatsapp.ts.
const DEFAULT_TEMPLATE = [
  '{{header}}',
  '━━━━━━━━━━━━━━━━━━━━',
  '*Detalle:*',
  '{{items}}',
  '━━━━━━━━━━━━━━━━━━━━',
  '{{totales}}',
  '━━━━━━━━━━━━━━━━━━━━',
  '_Enviado desde QuickTap.club_',
].join('\n');

/** Personaliza el mensaje del botón "Enviar vía WhatsApp" en el detalle de un pedido. */
export function WhatsappMessageSection() {
  const { restaurant, refresh } = useAuth();
  const [template, setTemplate] = useState(restaurant?.whatsappOrderMessageTemplate || DEFAULT_TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.patch('/restaurant', { whatsappOrderMessageTemplate: template || undefined });
      await refresh();
      setMessage('Mensaje guardado.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Mensaje de WhatsApp al cliente</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Este es el texto que se envía cuando tocas "Enviar vía WhatsApp" en el detalle de un pedido.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-3">
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={10}
          className="w-full border border-brand-950/15 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
        />

        <div className="text-xs text-brand-950/50 font-light space-y-1">
          <p className="font-medium text-brand-950/70">Puedes usar estas variables, se rellenan solas con cada pedido:</p>
          <p>
            <code className="bg-brand-950/[0.06] rounded px-1">{'{{header}}'}</code> — número de pedido, restaurante y mesa
          </p>
          <p>
            <code className="bg-brand-950/[0.06] rounded px-1">{'{{items}}'}</code> — lista de productos con precios
          </p>
          <p>
            <code className="bg-brand-950/[0.06] rounded px-1">{'{{totales}}'}</code> — subtotal, cargos y total ($ y Bs)
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        <div className="flex gap-2">
          <TextureButton variant="brand" size="default" disabled={saving} onClick={save} className="!w-auto disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
          <TextureButton
            variant="secondary"
            size="default"
            disabled={saving}
            onClick={() => setTemplate(DEFAULT_TEMPLATE)}
            className="!w-auto"
          >
            Restaurar mensaje por defecto
          </TextureButton>
        </div>
      </TextureCardContent>
    </TextureCard>
  );
}
