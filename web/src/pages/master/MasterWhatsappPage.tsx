import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { AnnouncementsSection } from '@/components/master/AnnouncementsSection';
import { WhatsappLinkSection } from '@/components/admin/WhatsappLinkSection';

interface MessageTemplates {
  reminderMessage: string;
  proofReceivedMessage: string;
  paymentApprovedMessage: string;
  paymentRejectedMessage: string;
  welcomeMessage: string;
  newSignupAlertMessage: string;
}

const TEMPLATE_FIELDS: { key: keyof MessageTemplates; label: string; help: string; rows: number }[] = [
  {
    key: 'welcomeMessage',
    label: 'Bienvenida al registrarse',
    help: 'Variables: {{ownerName}} {{restaurantName}} — se le manda al dueño nuevo.',
    rows: 5,
  },
  {
    key: 'newSignupAlertMessage',
    label: 'Aviso de nuevo ingreso',
    help: 'Variables: {{restaurantName}} {{ownerName}} {{businessType}} {{slug}} — se le manda al número verificador de abajo, no al restaurante.',
    rows: 5,
  },
  {
    key: 'reminderMessage',
    label: 'Recordatorio de renovación',
    help: 'Variables: {{restaurantName}} {{periodEndLabel}} {{amountLine}} {{chargesBlock}} {{pagoMovilBlock}} — estas ya vienen armadas (monto, cargos pendientes como instalación/QR NFC, y datos de Pago Móvil), solo indica dónde va cada línea.',
    rows: 6,
  },
  {
    key: 'proofReceivedMessage',
    label: 'Acuse al recibir el comprobante',
    help: 'Sin variables.',
    rows: 2,
  },
  {
    key: 'paymentApprovedMessage',
    label: 'Pago aprobado',
    help: 'Variables: {{periodEndLabel}}',
    rows: 3,
  },
  {
    key: 'paymentRejectedMessage',
    label: 'Pago rechazado',
    help: 'Sin variables.',
    rows: 2,
  },
];

/**
 * Chatbot de WhatsApp de la PLATAFORMA (equipo QuickTap), distinto del que vincula cada
 * restaurante. Manda la bienvenida a cada restaurante que se registra, el recordatorio de
 * renovación de plan, el aviso de nuevo ingreso al verificador y las cotizaciones.
 *
 * El vínculo en sí es SOLO por Evolution API (WhatsappLinkSection, abajo) — el mecanismo viejo
 * (Baileys, master-whatsapp-bot.service.ts) es el mismo que causó el baneo de agosto 2026 y se
 * dejó a propósito sin botón acá para que nadie lo vuelva a vincular por accidente. El servicio
 * sigue existiendo porque sendMessage()/sendImage() (bienvenida, recordatorio, aviso,
 * cotizaciones) caen solas a Evolution cuando no hay sesión Baileys conectada — que es siempre,
 * ahora que no hay forma de conectarla desde acá.
 */
export default function MasterWhatsappPage() {
  const [verifierDraft, setVerifierDraft] = useState('');
  const [savingVerifier, setSavingVerifier] = useState(false);
  const [verifierSaved, setVerifierSaved] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplates | null>(null);
  const [templatesDraft, setTemplatesDraft] = useState<MessageTemplates | null>(null);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [templatesSaved, setTemplatesSaved] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  useEffect(() => {
    masterApi.get('/master/message-templates').then((res) => {
      setTemplates(res.data.data);
      setTemplatesDraft(res.data.data);
    });
    masterApi.get('/master/whatsapp/status').then((res) => {
      setVerifierDraft((d) => d || res.data.data.subscriptionVerifierPhone || '');
    });
  }, []);

  async function saveTemplates() {
    if (!templatesDraft) return;
    setSavingTemplates(true);
    setTemplatesSaved(false);
    setTemplatesError(null);
    try {
      const res = await masterApi.patch('/master/message-templates', templatesDraft);
      setTemplates(res.data.data);
      setTemplatesDraft(res.data.data);
      setTemplatesSaved(true);
      setTimeout(() => setTemplatesSaved(false), 3000);
    } catch (err: any) {
      setTemplatesError(err.response?.data?.error ?? 'No se pudieron guardar los mensajes.');
    } finally {
      setSavingTemplates(false);
    }
  }

  const templatesChanged = templates && templatesDraft && JSON.stringify(templates) !== JSON.stringify(templatesDraft);

  async function saveVerifierPhone() {
    setSavingVerifier(true);
    setVerifierSaved(false);
    try {
      await masterApi.patch('/master/whatsapp/settings', { subscriptionVerifierPhone: verifierDraft.trim() || null });
      setVerifierSaved(true);
      setTimeout(() => setVerifierSaved(false), 3000);
    } finally {
      setSavingVerifier(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950 flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-emerald-600" /> WhatsApp de la plataforma
        </h1>
        <p className="text-sm text-brand-950/60 font-light mt-1">
          Manda la bienvenida a cada restaurante que se registra, el recordatorio de renovación de plan 3 días antes
          del vencimiento (con los datos de pago y el comprobante que sube el dueño), el aviso de nuevo ingreso al
          número verificador, y las cotizaciones que se envían desde Cotizaciones — mismo número, mismas 4 vías.
        </p>
      </div>

      {/* Único mecanismo de vinculación: la instancia de Evolution de la plataforma. El botón
          "Enviar por WhatsApp" de cada restaurante sale por acá; con el número sin vincular
          o auto-pausado, ese botón lo dice y el cobro sigue saliendo con "Copiar mensaje". */}
      <WhatsappLinkSection base="/master/whatsapp-link" titulo="WhatsApp de cobranzas (vinculado)" cliente={masterApi} />

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

      {templatesDraft && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-brand-950">Mensajes del chatbot</p>
            <p className="text-xs text-brand-950/50 font-light mt-0.5">
              Edita el texto de cada mensaje automático. Las variables entre llaves (<code>{'{{así}}'}</code>) se
              reemplazan solas — no las borres, solo muévelas de línea si quieres.
            </p>
          </div>

          {TEMPLATE_FIELDS.map((f) => (
            <label key={f.key} className="block space-y-1.5">
              <span className="text-xs font-medium text-brand-950/70">{f.label}</span>
              <textarea
                value={templatesDraft[f.key]}
                onChange={(e) => setTemplatesDraft({ ...templatesDraft, [f.key]: e.target.value })}
                rows={f.rows}
                className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              />
              <span className="block text-[11px] text-brand-950/40 font-light">{f.help}</span>
            </label>
          ))}

          {templatesError && <p className="text-sm text-red-600">{templatesError}</p>}
          <div className="flex items-center gap-2">
            <TextureButton
              variant="brand"
              size="default"
              className="!w-auto disabled:opacity-50"
              disabled={savingTemplates || !templatesChanged}
              onClick={saveTemplates}
            >
              {savingTemplates ? 'Guardando…' : 'Guardar mensajes'}
            </TextureButton>
            {templatesSaved && <span className="text-xs text-emerald-700">Guardado.</span>}
          </div>
        </div>
      )}

      <AnnouncementsSection />
    </div>
  );
}
