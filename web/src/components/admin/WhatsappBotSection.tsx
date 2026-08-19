import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { apiOrigin } from '@/utils/apiOrigin';
import { MessageCircle } from 'lucide-react';
import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TEAM_MANAGER_ROLES } from '@/utils/roles';
import type { UserRole } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { WhatsappPhoneInput } from '@/components/ui/whatsapp-phone-input';

type BotStatus = 'idle' | 'connecting' | 'qr' | 'connected' | 'disconnected';
type OrderMode = 'PAYMENT_VERIFICATION' | 'FULL_ORDER';

interface StatusResponse {
  status: BotStatus;
  qrDataUrl: string | null;
  connectedNumber: string | null;
  whatsappBotEnabled: boolean;
  whatsappBotNotifyReceived: boolean;
  whatsappBotNotifyReady: boolean;
  whatsappBotWelcomeEnabled: boolean;
  whatsappBotWelcomeMessage: string | null;
  whatsappBotPaymentVerifierPhone: string | null;
  whatsappOrderMode: OrderMode;
  whatsappBotDebtRemindersEnabled: boolean;
}

// Debe coincidir con DEFAULT_WELCOME_TEMPLATE / DEFAULT_WELCOME_TEMPLATE_CLUB en
// whatsapp-bot.service.ts.
const DEFAULT_WELCOME_TEMPLATE = ['¡Hola! 👋 Bienvenido a *{{restaurant}}*.', '', 'Puedes ver el menú y hacer tu pedido aquí:', '{{link}}'].join(
  '\n',
);
const DEFAULT_WELCOME_TEMPLATE_CLUB = ['¡Hola! 👋 Bienvenido a *{{restaurant}}*.', '', 'Reserva tu cancha aquí:', '{{link}}'].join('\n');

/**
 * Chatbot de WhatsApp vinculado por QR (protocolo WhatsApp Web, NO la API oficial de Meta —
 * ver whatsapp-bot.service.ts en el backend para el trade-off de riesgo aceptado). Escanea el
 * QR desde el WhatsApp del negocio y desde ahí salen los mensajes automáticos.
 *
 * `variant` cambia qué controles se muestran, no el mecanismo de vinculación (que es el mismo
 * Restaurant/restaurantId para cualquier businessType):
 * - 'restaurant': incluye avisos de pedido y el modo de confirmación (verificación de pago /
 *   pedido completo), que dependen del ciclo de vida de `Order` — solo existe en restaurantes.
 * - 'club': sin esos controles (un club no tiene Order/cocina). En su lugar explica para qué
 *   usa QuickTap este número: código de verificación al reservar, avisos de reserva liberada
 *   y notificaciones a los profesores de la academia — todo eso ya sale por acá una vez
 *   vinculado, sin nada que configurar.
 */
export function WhatsappBotSection({ variant = 'restaurant' }: { variant?: 'restaurant' | 'club' }) {
  const { user } = useAuth();
  const canManage = TEAM_MANAGER_ROLES.includes(user?.role as UserRole);
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [welcomeDraft, setWelcomeDraft] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [welcomeSaved, setWelcomeSaved] = useState(false);
  const [verifierDraft, setVerifierDraft] = useState('');
  const [savingVerifier, setSavingVerifier] = useState(false);
  const [verifierSaved, setVerifierSaved] = useState(false);

  useEffect(() => {
    api.get('/whatsapp-bot/status').then((res) => {
      setData(res.data.data);
      setWelcomeDraft(
        res.data.data.whatsappBotWelcomeMessage ||
          (variant === 'club' ? DEFAULT_WELCOME_TEMPLATE_CLUB : DEFAULT_WELCOME_TEMPLATE),
      );
      setVerifierDraft(res.data.data.whatsappBotPaymentVerifierPhone || '');
    });

    const socket: Socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
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
    debtRemindersEnabled: 'whatsappBotDebtRemindersEnabled',
  } as const;

  async function toggle(key: keyof typeof TOGGLE_FIELD, value: boolean) {
    setData((d) => (d ? { ...d, [TOGGLE_FIELD[key]]: value } : d));
    await api.patch('/whatsapp-bot/settings', { [key]: value }).catch(() => undefined);
  }

  async function setOrderMode(mode: OrderMode) {
    setData((d) => (d ? { ...d, whatsappOrderMode: mode } : d));
    await api.patch('/whatsapp-bot/settings', { orderMode: mode }).catch(() => undefined);
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

  async function saveVerifierPhone() {
    setSavingVerifier(true);
    setVerifierSaved(false);
    try {
      await api.patch('/whatsapp-bot/settings', { paymentVerifierPhone: verifierDraft.trim() || null });
      setData((d) => (d ? { ...d, whatsappBotPaymentVerifierPhone: verifierDraft.trim() || null } : d));
      setVerifierSaved(true);
      setTimeout(() => setVerifierSaved(false), 3000);
    } finally {
      setSavingVerifier(false);
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
          {variant === 'club'
            ? 'Vincula el WhatsApp del club (como un dispositivo más, igual que WhatsApp Web) para mandarle a tus jugadores el código de verificación al reservar y avisos automáticos, sin salir de QuickTap.'
            : 'Vincula el WhatsApp del restaurante (como un dispositivo más, igual que WhatsApp Web) para mandar avisos automáticos de pedido al cliente sin salir de QuickTap.'}
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
              Abre WhatsApp en el celular {variant === 'club' ? 'del club' : 'del restaurante'} → Ajustes → Dispositivos
              vinculados → Vincular un dispositivo, y escanea este código.
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

        {connected && variant === 'club' && (
          <div className="rounded-xl border border-brand-950/10 bg-brand-950/[0.02] px-4 py-3">
            <p className="text-sm font-semibold text-brand-950">Ya sale automático, sin nada que configurar</p>
            <ul className="mt-1.5 space-y-1 text-xs font-light text-brand-950/60">
              <li>· El código de verificación cuando un jugador reserva por internet</li>
              <li>· El aviso a los inscritos si una clase se libera por falta de cupo</li>
              <li>· Los avisos de la academia al profesor (clase asignada, cancelación)</li>
            </ul>
          </div>
        )}

        {connected && (
          <div className="space-y-2 pt-2 border-t border-brand-950/[0.06]">
            {variant === 'restaurant' && (
              <>
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
              </>
            )}
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
                  Se envía en cada mensaje que escriba el cliente (sin límite de frecuencia), para responder lo más
                  rápido posible en hora pico. Variables:{' '}
                  <code className="text-[11px]">{'{{restaurant}}'}</code> y <code className="text-[11px]">{'{{link}}'}</code> (enlace a tu{' '}
                  {variant === 'club' ? 'página de reservas' : 'menú público'}).
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

            {variant === 'club' && (
              <>
                <div className="pt-2 space-y-2 border-t border-brand-950/[0.06]">
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-brand-950/80">Recordatorio automático de deudas con cobro por comprobante</span>
                    <input
                      type="checkbox"
                      checked={data.whatsappBotDebtRemindersEnabled}
                      disabled={!canManage}
                      onChange={(e) => toggle('debtRemindersEnabled', e.target.checked)}
                    />
                  </label>
                  <p className="text-xs text-brand-950/50 font-light">
                    A los 3 días de una deuda (reserva, tienda fiada o mensualidad de academia) el chatbot le recuerda
                    al cliente el monto pendiente — con tus datos de Pago Móvil — y lo repite cada 7 días mientras siga
                    sin pagar. El cliente responde con la foto de su comprobante, esta llega al número verificador de
                    abajo y, al responder <em>Aprobado</em>, el pago se registra solo en Administración con su método.
                  </p>
                </div>

                <div className="pt-1 space-y-2">
                  <label className="text-sm text-brand-950/80">
                    Número que verifica los pagos (recibe cada comprobante y responde Aprobado/Rechazado)
                  </label>
                  <p className="text-xs text-brand-950/50 font-light">
                    Puede indicar el método al aprobar: <em>"Aprobado zelle"</em>, <em>"Aprobado efectivo"</em>… — sin
                    indicarlo, se registra como Pago Móvil. Sin este número, los comprobantes de deuda no tienen a
                    dónde llegar.
                  </p>
                  <WhatsappPhoneInput value={verifierDraft} onChange={setVerifierDraft} disabled={!canManage} />
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <TextureButton
                        variant="secondary"
                        size="sm"
                        className="!w-auto"
                        disabled={savingVerifier}
                        onClick={saveVerifierPhone}
                      >
                        {savingVerifier ? 'Guardando…' : 'Guardar número'}
                      </TextureButton>
                      {verifierSaved && <span className="text-xs text-emerald-700">Guardado.</span>}
                    </div>
                  )}
                </div>
              </>
            )}

            {variant === 'restaurant' && (
            <>
            <div className="pt-2 space-y-2 border-t border-brand-950/[0.06]">
              <p className="text-sm text-brand-950/80 font-medium">Modo de pedidos</p>
              <p className="text-xs text-brand-950/50 font-light">
                Cómo confirmar un pedido de Delivery/Pickup antes de que pase a cocina.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => setOrderMode('PAYMENT_VERIFICATION')}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    data.whatsappOrderMode === 'PAYMENT_VERIFICATION'
                      ? 'border-brand-500 bg-brand-50/60'
                      : 'border-brand-950/10 hover:border-brand-950/20'
                  }`}
                >
                  <p className="text-sm font-medium text-brand-950/90">Verificación de pago</p>
                  <p className="text-xs text-brand-950/50 font-light mt-0.5">
                    El cliente manda foto del comprobante y ustedes la aprueban por WhatsApp.
                  </p>
                </button>
                <button
                  type="button"
                  disabled={!canManage}
                  onClick={() => setOrderMode('FULL_ORDER')}
                  className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${
                    data.whatsappOrderMode === 'FULL_ORDER'
                      ? 'border-brand-500 bg-brand-50/60'
                      : 'border-brand-950/10 hover:border-brand-950/20'
                  }`}
                >
                  <p className="text-sm font-medium text-brand-950/90">Enviar pedido completo</p>
                  <p className="text-xs text-brand-950/50 font-light mt-0.5">
                    Les llega el pedido completo a este WhatsApp y ustedes confirman a mano antes de que pase a
                    cocina.
                  </p>
                </button>
              </div>
            </div>

            <div className="pt-1 space-y-2">
              <label className="text-sm text-brand-950/80">
                {data.whatsappOrderMode === 'FULL_ORDER'
                  ? 'Número que recibe los pedidos para confirmar'
                  : 'Número que verifica los pagos (recibe cada comprobante y responde Aprobado/Rechazado)'}
              </label>
              <p className="text-xs text-brand-950/50 font-light">
                {data.whatsappOrderMode === 'FULL_ORDER' ? (
                  <>
                    Cada pedido de Delivery/Pickup (sin importar el método de pago) le llega completo a este número.
                    Si responden <em>Aprobado</em>, el pedido pasa solo a cocina; si responden <em>Rechazado</em>, se
                    le avisa al cliente. Déjalo vacío para desactivar este flujo.
                  </>
                ) : (
                  <>
                    Cuando un cliente paga por Pago Móvil/Zelle/Binance/PayPal/Transferencia y manda la foto de su
                    comprobante, el chatbot se la reenvía a este número. Si responde <em>Aprobado</em>, el pedido pasa
                    solo a cocina; si responde <em>Rechazado</em>, se le pide al cliente reenviar el comprobante.
                    Déjalo vacío para desactivar este flujo (el pedido seguirá requiriendo aceptación manual, como
                    siempre).
                  </>
                )}
              </p>
              <WhatsappPhoneInput value={verifierDraft} onChange={setVerifierDraft} disabled={!canManage} />
              {canManage && (
                <div className="flex items-center gap-2">
                  <TextureButton
                    variant="secondary"
                    size="sm"
                    className="!w-auto"
                    disabled={savingVerifier}
                    onClick={saveVerifierPhone}
                  >
                    {savingVerifier ? 'Guardando…' : 'Guardar número'}
                  </TextureButton>
                  {verifierSaved && <span className="text-xs text-emerald-700">Guardado.</span>}
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}
      </TextureCardContent>
    </TextureCard>
  );
}
