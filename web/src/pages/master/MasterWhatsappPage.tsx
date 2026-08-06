import { useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

type BotStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected';

interface StatusResponse {
  status: BotStatus;
  qrDataUrl: string | null;
  connectedNumber: string | null;
  masterWhatsappEnabled: boolean;
  subscriptionVerifierPhone: string | null;
}

/**
 * Chatbot de WhatsApp de la PLATAFORMA (equipo QuickTap), distinto del que vincula cada
 * restaurante — ver master-whatsapp-bot.service.ts. Manda la bienvenida a cada restaurante
 * que se registra y el recordatorio de renovación de plan 3 días antes del vencimiento.
 *
 * Sin sockets (el Dashboard maestro no usa Socket.IO en ningún otro lado todavía): mientras se
 * está vinculando (esperando escaneo del QR), se hace polling corto a /master/whatsapp/status.
 */
export default function MasterWhatsappPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifierDraft, setVerifierDraft] = useState('');
  const [savingVerifier, setSavingVerifier] = useState(false);
  const [verifierSaved, setVerifierSaved] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    const res = await masterApi.get('/master/whatsapp/status');
    setData(res.data.data);
    setVerifierDraft((d) => d || res.data.data.subscriptionVerifierPhone || '');
    return res.data.data as StatusResponse;
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const shouldPoll = data && (data.status === 'connecting' || data.status === 'qr');
    if (shouldPoll && !pollRef.current) {
      pollRef.current = setInterval(() => loadStatus().catch(() => undefined), 2000);
    }
    if (!shouldPoll && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await masterApi.post('/master/whatsapp/connect');
      setData((d) => (d ? { ...d, masterWhatsappEnabled: true, status: 'connecting' } : d));
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar la vinculación.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('¿Desvincular el WhatsApp de la plataforma? Dejarán de salir la bienvenida y los recordatorios de pago.')) return;
    setBusy(true);
    setError(null);
    try {
      await masterApi.post('/master/whatsapp/disconnect');
      setData((d) => (d ? { ...d, masterWhatsappEnabled: false, status: 'disconnected', connectedNumber: null, qrDataUrl: null } : d));
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo desvincular.');
    } finally {
      setBusy(false);
    }
  }

  async function saveVerifierPhone() {
    setSavingVerifier(true);
    setVerifierSaved(false);
    try {
      await masterApi.patch('/master/whatsapp/settings', { subscriptionVerifierPhone: verifierDraft.trim() || null });
      setData((d) => (d ? { ...d, subscriptionVerifierPhone: verifierDraft.trim() || null } : d));
      setVerifierSaved(true);
      setTimeout(() => setVerifierSaved(false), 3000);
    } finally {
      setSavingVerifier(false);
    }
  }

  if (!data) return <div className="p-10 text-center text-brand-950/50 font-light">Cargando…</div>;

  const connected = data.status === 'connected';
  const showingQr = data.status === 'qr' && data.qrDataUrl;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950 flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-emerald-600" /> WhatsApp de la plataforma
        </h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Manda la bienvenida a cada restaurante que se registra y el recordatorio de renovación de plan 3 días antes
          del vencimiento, con los datos de pago y el comprobante que sube el dueño.
        </p>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {connected ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                Conectado{data.connectedNumber ? ` · ${data.connectedNumber}` : ''}
              </p>
              <p className="text-xs text-emerald-700/70 font-light">Los mensajes salen desde este número.</p>
            </div>
            <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={busy} onClick={disconnect}>
              Desvincular
            </TextureButton>
          </div>
        ) : showingQr ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <img src={data.qrDataUrl!} alt="Código QR de WhatsApp" className="h-52 w-52 rounded-xl border border-brand-950/10" />
            <p className="text-xs text-brand-950/50 font-light text-center max-w-xs">
              Abre WhatsApp en el celular de la plataforma → Ajustes → Dispositivos vinculados → Vincular un
              dispositivo, y escanea este código.
            </p>
          </div>
        ) : data.status === 'connecting' ? (
          <p className="text-sm text-brand-950/50 font-light">Generando código QR…</p>
        ) : (
          <TextureButton variant="brand" size="default" className="!w-auto" disabled={busy} onClick={connect}>
            {busy ? 'Iniciando…' : 'Vincular WhatsApp'}
          </TextureButton>
        )}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-2">
        <p className="text-sm font-medium text-brand-950">Número que verifica los pagos de renovación</p>
        <p className="text-xs text-brand-950/50 font-light">
          Cuando un restaurante manda la foto de su comprobante de renovación, el chatbot se la reenvía a este
          número. Si responde <em>Aprobado</em>, el plan se renueva solo; si responde <em>Rechazado</em>, se le pide
          al restaurante reenviar el comprobante. Déjalo vacío para que solo llegue el recordatorio sin reenvío
          automático (hay que revisar el comprobante a mano en Comprobantes).
        </p>
        <input
          value={verifierDraft}
          onChange={(e) => setVerifierDraft(e.target.value.replace(/[^\d+]/g, ''))}
          placeholder="584141234567"
          className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
        />
        <div className="flex items-center gap-2 pt-1">
          <TextureButton variant="secondary" size="sm" className="!w-auto" disabled={savingVerifier} onClick={saveVerifierPhone}>
            {savingVerifier ? 'Guardando…' : 'Guardar número'}
          </TextureButton>
          {verifierSaved && <span className="text-xs text-emerald-700">Guardado.</span>}
        </div>
      </div>
    </div>
  );
}
