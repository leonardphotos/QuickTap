import { useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

interface Props {
  onClose: () => void;
}

const CAMPOS = [
  { id: 'contactName', label: 'Tu nombre', placeholder: 'María González', type: 'text', autoComplete: 'name' },
  { id: 'phone', label: 'Número de contacto', placeholder: '0414 555 1234', type: 'tel', autoComplete: 'tel' },
  { id: 'businessName', label: 'Nombre del negocio', placeholder: 'Sabor Criollo', type: 'text', autoComplete: 'organization' },
  { id: 'address', label: 'Dirección', placeholder: 'Av. Principal, CC Sambil, local 12', type: 'text', autoComplete: 'street-address' },
] as const;

type Campo = (typeof CAMPOS)[number]['id'];

/**
 * "Contactar a un asesor" del Plan Elite.
 *
 * El Elite no se contrata solo desde la página: son sucursales ilimitadas, migración de
 * catálogo y gerente de cuenta — cosas que se acuerdan hablando, no eligiendo un plan y
 * pagando. El formulario deja el contacto y el equipo llama.
 */
export function AdvisorLeadDialog({ onClose }: Props) {
  const [valores, setValores] = useState<Record<Campo, string>>({
    contactName: '',
    phone: '',
    businessName: '',
    address: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completo = CAMPOS.every((c) => valores[c.id].trim().length > 0);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await api.post('/public/advisor-leads', {
        contactName: valores.contactName.trim(),
        phone: valores.phone.trim(),
        businessName: valores.businessName.trim(),
        address: valores.address.trim(),
      });
      setEnviado(true);
    } catch (err: any) {
      // El servidor devuelve los errores por campo; se muestra el primero, que es el que
      // el visitante puede arreglar ahora mismo.
      const detalles = err.response?.data?.details?.fieldErrors as Record<string, string[]> | undefined;
      const primero = detalles ? Object.values(detalles)[0]?.[0] : undefined;
      setError(primero ?? err.response?.data?.error ?? 'No se pudo enviar la solicitud. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] bg-brand-950/50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B8902E]">Plan Elite</p>
            <h3 className="text-lg font-bold text-brand-950">
              {enviado ? 'Solicitud enviada' : 'Contactar a un asesor'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 shrink-0 rounded-full hover:bg-brand-950/[0.06] flex items-center justify-center text-brand-950/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {enviado ? (
          <div className="px-5 py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <p className="text-base font-semibold text-brand-950">Muy pronto serás contactado por un asesor.</p>
            <p className="text-sm text-brand-950/55 font-light leading-relaxed">
              Ya tenemos tus datos. Un asesor te va a llamar al número que dejaste para armar el plan a la medida de tu
              negocio.
            </p>
            <TextureButton variant="brand" size="default" onClick={onClose}>
              Listo
            </TextureButton>
          </div>
        ) : (
          <form onSubmit={enviar} className="px-5 pb-5 pt-3 space-y-3">
            <p className="text-sm text-brand-950/55 font-light leading-relaxed">
              El Plan Elite se arma contigo: sucursales, migración de tu catálogo y un gerente de cuenta. Déjanos tus
              datos y te llamamos.
            </p>

            {CAMPOS.map((c) => (
              <label key={c.id} className="block text-sm">
                <span className="text-brand-950/70">{c.label}</span>
                <input
                  type={c.type}
                  autoComplete={c.autoComplete}
                  value={valores[c.id]}
                  onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
                  placeholder={c.placeholder}
                  required
                  className="mt-1 w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#B8902E]/30 focus:border-[#B8902E]"
                />
              </label>
            ))}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <TextureButton
              type="submit"
              variant="brand"
              size="default"
              disabled={enviando || !completo}
              className="!mt-4 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar solicitud'}
            </TextureButton>
          </form>
        )}
      </div>
    </div>
  );
}
