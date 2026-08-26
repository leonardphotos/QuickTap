import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, MessageCircle, PauseCircle, Unlink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api as apiTenant } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

interface Estado {
  disponible: boolean;
  vinculado?: boolean;
  status?: string;
  phone?: string | null;
  paused?: boolean;
  autoPaused?: boolean;
  /** false = el plan actual no incluye el beneficio: la tarjeta se pinta bloqueada. El master
   *  no manda este campo (undefined) y se trata como permitido. */
  planPermitido?: boolean;
}

/**
 * Vincular el WhatsApp del negocio (Evolution API) — o el de la plataforma, según `base`.
 *
 * El QR se refresca solo cada 30s mientras está visible (Evolution lo rota) y el estado se
 * sondea cada 4s hasta que conecte: escanear y que la pantalla no reaccione se siente roto,
 * aunque por detrás ya haya conectado.
 */
export function WhatsappLinkSection({
  base = '/whatsapp-link',
  titulo = 'WhatsApp del negocio',
  // El master usa su propio cliente (masterApi): mismo componente, otra puerta.
  cliente,
  // El panel de locales no navega por rutas: su facturación es una pantalla interna, así que
  // el botón del candado recibe el salto en vez de asumir /admin/billing.
  onMejorarPlan,
}: {
  base?: string;
  titulo?: string;
  cliente?: typeof apiTenant;
  onMejorarPlan?: () => void;
}) {
  const api = cliente ?? apiTenant;
  const [estado, setEstado] = useState<Estado | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vinculando = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargar = useCallback(() => api.get(`${base}/status`).then((r) => setEstado(r.data.data)).catch(() => undefined), [base]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Mientras hay QR en pantalla: sondear el estado (¿ya escaneó?) y renovar el QR.
  useEffect(() => {
    if (!qr) return;
    const poll = setInterval(async () => {
      const r = await api.get(`${base}/status`).then((x) => x.data.data as Estado).catch(() => null);
      if (r) setEstado(r);
      if (r?.vinculado) {
        setQr(null);
        return;
      }
      // renovar el QR sin parpadeo: solo si sigue sin vincular
    }, 4000);
    const renew = setInterval(async () => {
      const r = await api.post(`${base}/link`).then((x) => x.data.data).catch(() => null);
      if (r?.qr) setQr(r.qr);
      if (r?.vinculado) setQr(null);
    }, 30000);
    return () => {
      clearInterval(poll);
      clearInterval(renew);
    };
  }, [qr, base]);

  async function vincular() {
    if (vinculando.current) return;
    vinculando.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post(`${base}/link`);
      if (r.data.data.vinculado) await cargar();
      else setQr(r.data.data.qr);
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo iniciar la vinculación.');
    } finally {
      setBusy(false);
      vinculando.current = false;
    }
  }

  async function accion(path: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/${path}`);
      setQr(null);
      await cargar();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  // Sin estado aún (cargando) o sin Evolution configurada en el servidor, la tarjeta no existe.
  if (!estado || !estado.disponible) return null;

  // Plan sin el beneficio: la tarjeta SE VE, bloqueada. Que exista y no se pueda tocar vende
  // el plan de arriba mejor que un beneficio invisible — el candado es el argumento.
  if (estado.planPermitido === false) {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-brand-950/[0.08] bg-white p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-950/[0.06]">
            <Lock className="h-4 w-4 text-brand-950/40" />
          </span>
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-950">
              {titulo}
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Plan Elite
              </span>
            </h2>
            <p className="text-[11.5px] font-light text-brand-950/50">
              Vincula tu número y tus clientes reciben la confirmación de cada pedido, su
              entrada y el aviso de sus cuotas — directo de tu WhatsApp, sin que nadie los
              escriba a mano.
            </p>
          </div>
        </div>
        <div className="mt-4">
          {onMejorarPlan ? (
            <button
              type="button"
              onClick={onMejorarPlan}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-950 px-5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-800"
            >
              Mejorar mi plan
            </button>
          ) : (
            <Link
              to="/admin/billing"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-950 px-5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-800"
            >
              Mejorar mi plan
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-brand-950/[0.08] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
          <MessageCircle className="h-4.5 w-4.5 text-emerald-600" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-brand-950">{titulo}</h2>
          <p className="text-[11.5px] font-light text-brand-950/50">
            {estado?.vinculado
              ? `Vinculado${estado.phone ? ` · +${estado.phone}` : ''}`
              : 'Vincula un número para enviar avisos directamente por WhatsApp.'}
          </p>
        </div>
      </div>

      {estado?.autoPaused && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
          <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Envíos pausados automáticamente: WhatsApp dejó de confirmar entregas. Revisa que el
          número siga activo antes de reanudar.
        </p>
      )}

      {qr && !estado?.vinculado && (
        <div className="mt-4 flex flex-col items-center">
          <img src={qr} alt="Código QR para vincular WhatsApp" className="h-52 w-52 rounded-xl border border-brand-950/10" />
          <p className="mt-2 max-w-xs text-center text-[11.5px] font-light text-brand-950/50">
            En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular dispositivo, y escanea
            este código.
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        {!estado?.vinculado && !qr && (
          <TextureButton variant="brand" size="default" disabled={busy} className="!w-auto px-5 disabled:opacity-50" onClick={vincular}>
            {busy ? 'Generando código…' : 'Vincular WhatsApp'}
          </TextureButton>
        )}
        {estado?.autoPaused && (
          <TextureButton variant="secondary" size="default" disabled={busy} className="!w-auto px-5 disabled:opacity-50" onClick={() => accion('resume')}>
            Reanudar envíos
          </TextureButton>
        )}
        {(estado?.vinculado || qr) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => accion('unlink')}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-medium text-brand-950/50 transition-colors hover:bg-brand-950/[0.05] hover:text-red-600 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" /> {qr && !estado?.vinculado ? 'Cancelar' : 'Desvincular'}
          </button>
        )}
      </div>
    </section>
  );
}
