import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { MessageCircle } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TEAM_MANAGER_ROLES } from '@/utils/roles';
import type { UserRole } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

type BotStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected';

interface StatusResponse {
  status: BotStatus;
  qrDataUrl: string | null;
  connectedNumber: string | null;
  whatsappBotEnabled: boolean;
  whatsappBotNotifyReceived: boolean;
  whatsappBotNotifyReady: boolean;
  whatsappBotWelcomeEnabled: boolean;
  whatsappBotWelcomeMessage: string | null;
}

// Debe coincidir con DEFAULT_WELCOME_TEMPLATE en whatsapp-bot.service.ts.
const DEFAULT_WELCOME_TEMPLATE = ['¡Hola! 👋 Bienvenido a *{{restaurant}}*.', '', 'Puedes ver el menú y hacer tu pedido aquí:', '{{link}}'].join(
  '\n',
);

/**
 * Chatbot de WhatsApp vinculado por QR (protocolo WhatsApp Web, NO la API oficial de Meta —
 * ver whatsapp-bot.service.ts en el backend para el trade-off de riesgo aceptado). Escanea el
 * QR desde el WhatsApp del restaurante y desde ahí salen los mensajes automáticos de pedido
 * recibido/listo, sin salir de QuickTap.
 */
export function WhatsappBotSection() {
  const { user } = useAuth();
  const canManage = TEAM_MANAGER_ROLES.includes(user?.role as UserRole);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeSaved, setWelcomeSaved] = useState(false);

  useEffect(() => {
    api.get('/whatsapp-bot/status').then((res) => {
      setData(res.data.data);
      setWelcomeDraft(res.data.data.whatsappBotWelcomeMessage || DEFAULT_WELCOME_TEMPLATE);
    });

    const socket: Socket = io('/', { auth: { token: getToken() } });
    socket.on('whatsapp-bot:qr', (payload: { qrDataUrl: string }) => {
      setData((d) => (d ? { ...d, status: 'qr', qrDataUrl: payload.qrDataUrl } : d));
    });
    socket.on('whatsapp-bot:status', (payload: { status: BotStatus; connectedNumber: string | null }) => {
      setData((d) =>
        d
          ? {
              ...d,
              status: payload.status,
              connectedNumber: payload.connectedNumber,
              qrDataUrl: payload.status === 'connected' ? null : d.qrDataUrl,
            }
          : d,
      );
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/whatsapp-bot/connect');
      setData((d) => (d ? { ...d, whatsappBotEnabled: true, status: 'connecting' } : d));
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo iniciar la vinculación.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm('¿Desvincular el WhatsApp del chatbot? Dejarán de salir los mensajes automáticos.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/whatsapp-bot/disconnect');
      setData((d) =>
        d ? { ...d, whatsappBotEnabled: false, status: 'disconnected', connectedNumber: null, qrDataUrl: null } : d,
      );
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo desvincular.');
    } finally {
      setBusy(false);
    }
  }

  const TOGGLE_FIELD = {
    notifyReceived: 'whatsappBotNotifyReceived',
    notifyReady: 'whatsappBotNotifyReady',
    welcomeEnabled: 'whatsappBotWelcomeEnabled',
  } as const;

  async function toggle(key: keyof typeof TOGGLE_FIELD, value: boolean) {
    setData((d) => (d ? { ...d, [TOGGLE_FIELD[key]]: value } : d));
    await api.patch('/whatsapp-bot/settings', { [key]: value }).catch(() => undefined);
  }

  async function saveWelcomeMessage() {
    setSavingWelcome(true);
    setWelcomeSaved(false);
    try {
      await api.patch('/whatsapp-bot/settings', { welcomeMessage: welcomeDraft.trim() || null });
      setData((d) => (d ? { ...d, whatsappBotWelcomeMessage: welcomeDraft.trim() || null } : d));
      setWelcomeSaved(true);
      setTimeout(() => setWelcomeSaved(false), 3000);
    } finally {
      setSavingWelcome(false);
    }
  }

  if (!data) return null;

  const connected = data.status === 'connected';
  const showingQr = data.status === 'qr' && data.qrDataUrl;

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-emerald-600" /> Chatbot de WhatsApp
        </TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Vincula el WhatsApp del restaurante (como un dispositivo más, igual que WhatsApp Web) para mandar avisos
          automáticos de pedido al cliente sin salir de QuickTap.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {connected ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-emerald-800">Conectado{data.connectedNumber ? ` · ${data.connectedNumber}` : ''}</p>
              <p className="text-xs text-emerald-700/70 font-light">Los mensajes automáticos salen desde este número.</p>
            </div>
            {canManage && (
              <TextureButton variant="minimal" size="sm" className="!w-auto" disabled={busy} onClick={disconnect}>
                Desvincular
              </TextureButton>
            )}
          </div>
        ) : showingQr ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <img src={data.qrDataUrl!} alt="Código QR de WhatsApp" className="h-52 w-52 rounded-xl border border-brand-950/10" />
            <p className="text-xs text-brand-950/50 font-light text-center max-w-xs">
              Abre WhatsApp en el celular del restaurante → Ajustes → Dispositivos vinculados → Vincular un
              dispositivo, y escanea este código.
            </p>
          </div>
        ) : data.status === 'connecting' ? (
          <p className="text-sm text-brand-950/50 font-light">Generando código QR…</p>
        ) : (
          canManage && (
            <TextureButton variant="brand" size="default" className="!w-auto" disabled={busy} onClick={connect}>
              {busy ? 'Iniciando…' : 'Vincular WhatsApp'}
            </TextureButton>
          )
        )}

        {connected && (
          <div className="space-y-2 pt-2 border-t border-brand-950/[0.06]">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-brand-950/80">Avisar "Pedido recibido" al llegar un pedido de delivery/pickup</span>
              <input
                type="checkbox"
                checked={data.whatsappBotNotifyReceived}
                disabled={!canManage}
                onChange={(e) => toggle('notifyReceived', e.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-brand-950/80">Avisar "Pedido listo/en camino" al despachar o marcar listo</span>
              <input
                type="checkbox"
                checked={data.whatsappBotNotifyReady}
                disabled={!canManage}
                onChange={(e) => toggle('notifyReady', e.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="text-brand-950/80">Responder solo con un mensaje de bienvenida al primer mensaje de cada cliente</span>
              <input
                type="checkbox"
                checked={data.whatsappBotWelcomeEnabled}
                disabled={!canManage}
                onChange={(e) => toggle('welcomeEnabled', e.target.checked)}
              />
            </label>

            {data.whatsappBotWelcomeEnabled && (
              <div className="pt-1 space-y-2">
                <p className="text-xs text-brand-950/50 font-light">
                  Se envía solo una vez cada 6 horas por cliente, para que no se sienta como spam. Variables:{' '}
                  <code className="text-[11px]">{'{{restaurant}}'}</code> y <code className="text-[11px]">{'{{link}}'}</code> (enlace a tu
                  menú público).
                </p>
                <textarea
                  value={welcomeDraft}
                  onChange={(e) => setWelcomeDraft(e.target.value)}
                  disabled={!canManage}
                  rows={5}
                  className="w-full border border-brand-950/15 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                />
                {canManage && (
                  <div className="flex items-center gap-2">
                    <TextureButton
                      variant="secondary"
                      size="sm"
                      className="!w-auto"
                      disabled={savingWelcome}
                      onClick={saveWelcomeMessage}
                    >
                      {savingWelcome ? 'Guardando…' : 'Guardar mensaje'}
                    </TextureButton>
                    {welcomeSaved && <span className="text-xs text-emerald-700">Guardado.</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </TextureCardContent>
    </TextureCard>
  );
}
