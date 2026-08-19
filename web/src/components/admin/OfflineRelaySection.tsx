import { useState } from 'react';
import { CheckCircle2, Loader2, ServerCog, XCircle } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { getRelayUrl, setRelayUrl } from '@/utils/connectivity';
import { useConnectivity } from '@/hooks/useConnectivity';

/**
 * Configura a qué computadora del local recurrir si se cae el internet.
 *
 * Se guarda EN ESTE dispositivo, no en el restaurante: dos tablets pueden estar en redes
 * distintas (o una entrar por cable y otra por WiFi) y necesitar direcciones distintas.
 */
export function OfflineRelaySection() {
  const [url, setUrl] = useState(getRelayUrl() ?? '');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const [saved, setSaved] = useState(false);
  const state = useConnectivity();

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const clean = url.trim().replace(/\/+$/, '');
      const res = await fetch(`${clean}/api/v1/relay/health`, { cache: 'no-store' });
      setResult(res.ok ? 'ok' : 'fail');
    } catch {
      setResult('fail');
    } finally {
      setTesting(false);
    }
  }

  function save() {
    setRelayUrl(url.trim() || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
          <ServerCog className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-brand-950">Seguir trabajando sin internet</p>
          <p className="mt-1 text-sm font-light text-brand-950/60">
            Si se cae la conexión, esta tablet puede seguir tomando pedidos e imprimiendo
            comandas hablando con la computadora del local. Los pedidos se suben solos cuando
            vuelve el internet.
          </p>
        </div>
      </div>

      <label className="block text-sm text-brand-950/60">
        Dirección de la computadora del local
        <input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(null);
          }}
          placeholder="http://192.168.1.50:4001"
          className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-sm text-brand-950 focus:border-brand-500 focus:outline-none"
        />
        <span className="mt-1 block text-xs font-light text-brand-950/40">
          Déjalo vacío para desactivarlo. La computadora tiene que estar en la misma red WiFi.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <TextureButton
          variant="secondary"
          size="sm"
          className="!w-auto"
          disabled={!url.trim() || testing}
          onClick={test}
        >
          {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Probar conexión
        </TextureButton>
        <TextureButton variant="brand" size="sm" className="!w-auto" onClick={save}>
          {saved ? 'Guardado' : 'Guardar'}
        </TextureButton>

        {result === 'ok' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Responde correctamente
          </span>
        )}
        {result === 'fail' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
            <XCircle className="h-4 w-4" /> No responde en esa dirección
          </span>
        )}
      </div>

      <div className="rounded-xl bg-brand-950/[0.03] px-3 py-2 text-xs text-brand-950/60">
        Estado ahora:{' '}
        <span className="font-semibold text-brand-950">
          {state === 'online'
            ? 'conectado a internet'
            : state === 'relay'
              ? 'sin internet, usando la computadora del local'
              : 'sin conexión'}
        </span>
      </div>
    </div>
  );
}
