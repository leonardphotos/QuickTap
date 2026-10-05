import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react';
import { UserRound, PhoneOff, X } from 'lucide-react';
import { api } from '@/api/client';

type BusinessToolParams = { from?: string; to?: string };
type VoiceTools = {
  consultar_negocio: (params: BusinessToolParams) => Promise<string>;
};

function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string } } })?.response;
  return response?.data?.error ?? response?.data?.message ?? fallback;
}

function VoiceAssistantContent({ sidebar, compact }: { sidebar: boolean; compact: boolean }) {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    onError: (message) => setError(message || 'La conversación se interrumpió.'),
  });

  useConversationClientTool<VoiceTools>('consultar_negocio', useCallback(async (params) => {
    try {
      const response = await api.post('/ai-reports/voice/context', {
        from: params.from || undefined,
        to: params.to || undefined,
      });
      return JSON.stringify(response.data.data);
    } catch (requestError) {
      return JSON.stringify({ error: errorMessage(requestError, 'No se pudieron consultar los datos del negocio.') });
    }
  }, []));

  useEffect(() => {
    api.get('/ai-reports/status')
      .then((response) => {
        setEnabled(Boolean(response.data.data?.voiceEnabled));
        setConfigured(Boolean(response.data.data?.voiceConfigured));
      })
      .catch(() => setEnabled(false));
  }, []);

  const endSession = conversation.endSession;
  useEffect(() => () => endSession(), [endSession]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function start() {
    if (starting || conversation.status === 'connecting' || conversation.status === 'connected') return;

    setStarting(true);
    setError(null);
    try {
      if (!configured) throw new Error('La conexión con ElevenLabs todavía no está configurada.');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este dispositivo no permite usar el micrófono desde el navegador.');

      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());

      const response = await api.post('/ai-reports/voice/signed-url');
      const { signedUrl, businessName, today } = response.data.data as { signedUrl: string; businessName: string; today: string };
      await conversation.startSession({
        signedUrl,
        connectionType: 'websocket',
        dynamicVariables: {
          business_name: businessName,
          current_date: today,
          timezone: 'America/Caracas',
        },
      });
    } catch (startError) {
      const responseMessage = errorMessage(startError, '');
      const message = responseMessage || (startError instanceof Error
        ? startError.message
        : 'No se pudo iniciar la conversación.');
      setError(message);
    } finally {
      setStarting(false);
    }
  }

  function openAssistant() {
    setOpen(true);
    void start();
  }

  function close() {
    void conversation.endSession();
    setOpen(false);
    setError(null);
  }

  if (!enabled) return null;

  const connected = conversation.status === 'connected';
  const connecting = conversation.status === 'connecting' || starting;
  const visualState = connecting ? 'connecting' : connected && conversation.isSpeaking ? 'speaking' : connected ? 'listening' : 'idle';
  const statusText = connecting
    ? 'Conectando…'
    : connected && conversation.isSpeaking
      ? 'Respondiendo…'
      : connected
        ? 'Escuchando…'
        : error
          ? 'No se pudo conectar'
          : 'Listo para conversar';

  return (
    <>
      <button
        type="button"
        onClick={openAssistant}
        className={compact
          ? 'flex h-11 w-11 items-center justify-center rounded-full border border-brand-950/10 bg-white text-brand-600 shadow-sm transition-transform active:scale-95'
          : sidebar
            ? 'mt-1 flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white active:scale-[0.98]'
            : 'fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-950/20 transition-transform hover:bg-brand-600 active:scale-95'}
        title="Hablar con la IA de mi negocio"
        aria-label="Hablar con la IA de mi negocio"
      >
        <UserRound className="h-4.5 w-4.5" />
        {!compact && 'Hablar con mi negocio'}
      </button>

      {createPortal(
        <AnimatePresence>
        {open && <motion.div
          key="business-voice-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reduceMotion ? 0.1 : 0.28, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: reduceMotion ? 0.1 : 0.22, ease: 'easeOut' } }}
          className="fixed inset-0 z-[9999] flex h-dvh w-screen flex-col items-center justify-center overflow-hidden bg-[#020611] px-6 text-white"
          role="dialog" aria-modal="true" aria-label="Asistente de voz de QuickTap"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar asistente de voz"
            className="absolute right-5 top-[max(1.25rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/80 backdrop-blur-xl transition-transform hover:bg-white/[0.12] active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex -translate-y-4 flex-col items-center text-center sm:-translate-y-2">
            <button
              type="button"
              onClick={() => !connected && !connecting && void start()}
              disabled={connected || connecting}
              className={`business-voice-orb business-voice-orb--${visualState}`}
              aria-label={error ? 'Reintentar conexión' : statusText}
            >
              <span className="business-voice-orb__halo" />
              <span className="business-voice-orb__core" />
            </button>

            <p className="mt-10 font-medium tracking-[0.02em] text-white/75 text-base" aria-live="polite">{statusText}</p>
            {error && (
              <p className="mt-3 max-w-xs leading-relaxed text-white/45 text-base">
                {error}. Toca el círculo para reintentar.
              </p>
            )}
          </div>

          {connected && (
            <button
              type="button"
              onClick={close}
              className="absolute bottom-[max(1.75rem,env(safe-area-inset-bottom))] flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-medium text-white/75 backdrop-blur-xl transition-transform hover:bg-white/[0.12] active:scale-95"
            >
              <PhoneOff className="h-4 w-4" /> Finalizar
            </button>
          )}
        </motion.div>}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

export function BusinessVoiceAssistant({ sidebar = false, compact = false }: { sidebar?: boolean; compact?: boolean }) {
  return (
    <ConversationProvider>
      <VoiceAssistantContent sidebar={sidebar} compact={compact} />
    </ConversationProvider>
  );
}
