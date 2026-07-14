import { useEffect, useState } from 'react';
import { Droplets, Sun } from 'lucide-react';
import { api } from '@/api/client';
import { formatBs } from '@/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

const UNIT_PRICE_USD = 5;

interface Props {
  onClose: () => void;
}

export function QrNfcQuoteDialog({ onClose }: Props) {
  const [quantity, setQuantity] = useState(2);
  const [rateBs, setRateBs] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api
      .get('/public/exchange-rate')
      .then((res) => setRateBs(res.data.data?.USD?.rateBs ?? null))
      .catch(() => setRateBs(null));
  }, []);

  const totalUsd = quantity * UNIT_PRICE_USD;

  async function submit() {
    setSending(true);
    setError(null);
    try {
      await api.post('/qr-nfc-requests', { quantity });
      setSent(true);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar la solicitud.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cotiza tus QR NFC</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-3xl">✅</p>
            <p className="font-semibold text-brand-950">¡Solicitud enviada!</p>
            <p className="text-sm text-brand-950/60 font-light">
              Te contactaremos pronto para coordinar el pago y la entrega.
            </p>
            <TextureButton variant="brand" size="default" onClick={onClose} className="mt-2 !w-auto px-6 mx-auto">
              Listo
            </TextureButton>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-brand-950/70 font-light">
              QR físicos con tecnología NFC: además de escanearse con la cámara, se leen acercando el celular (sin
              apps). Son impermeables y llevan protección UV para que no se decoloren ni se dañen con el sol o la
              lluvia.
            </p>
            <div className="flex gap-4 text-xs text-brand-950/60">
              <span className="flex items-center gap-1">
                <Droplets className="h-3.5 w-3.5 text-brand-500" /> Impermeables
              </span>
              <span className="flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-brand-500" /> Protección UV
              </span>
            </div>

            <div className="rounded-2xl border border-brand-950/10 bg-brand-950/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-brand-950">Cantidad</span>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-full border border-brand-950/20 font-bold text-brand-950"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-medium">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(1000, q + 1))}
                    className="w-9 h-9 rounded-full border border-brand-950/20 font-bold text-brand-950"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="text-xs text-brand-950/40 mt-1.5">Se recomiendan 2 por mesa.</p>
            </div>

            <div className="flex items-baseline justify-between border-t border-brand-950/[0.06] pt-3">
              <span className="text-sm text-brand-950/60">
                {quantity} × ${UNIT_PRICE_USD.toFixed(2)} (tasa BCV)
              </span>
              <div className="text-right">
                <span className="text-xl font-semibold text-brand-950">${totalUsd.toFixed(2)}</span>
                {rateBs && <p className="text-xs text-brand-950/50">{formatBs(totalUsd, rateBs)}</p>}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <TextureButton variant="brand" size="default" disabled={sending} onClick={submit} className="disabled:opacity-50">
              {sending ? 'Enviando…' : 'Solicitar cotización'}
            </TextureButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
