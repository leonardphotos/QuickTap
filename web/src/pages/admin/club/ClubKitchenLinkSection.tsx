import { useCallback, useEffect, useState } from 'react';
import { Link2, Store, Unlink } from 'lucide-react';
import { clubLinkApi, type LinkedParty } from '@/api/clubLink';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';

type LinkedStore = LinkedParty & { linkedAt: string };

/**
 * Ajustes del club → Tiendas vinculadas. Cada tienda genera un código en sus
 * propios Ajustes y el club lo canjea acá; a partir de ahí esa tienda aparece
 * como un icono más en la tablet de cada cancha, junto a la tienda propia.
 *
 * Se pueden vincular varias (el tope lo manda el servidor en `maxStores`).
 * Canjear un código SUMA una tienda — no reemplaza a la anterior, que es lo que
 * hacía cuando solo se podía tener una.
 */
export function ClubKitchenLinkSection() {
  const [stores, setStores] = useState<LinkedStore[]>([]);
  const [maxStores, setMaxStores] = useState(4);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Confirmación dentro de la tarjeta: `window.confirm` no aparece en la app
  // instalada ni en algunos navegadores de tablet, y el botón parece muerto.
  const [confirming, setConfirming] = useState<LinkedStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    clubLinkApi
      .clubState()
      .then((s) => {
        setStores(s.stores);
        setMaxStores(s.maxStores);
      })
      .catch(() => setError('No se pudieron cargar las tiendas.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  const full = stores.length >= maxStores;

  async function redeem() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { restaurant } = await clubLinkApi.redeem(code);
      setCode('');
      setMessage(`${restaurant.name} quedó vinculada.`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo canjear el código.');
    } finally {
      setBusy(false);
    }
  }

  async function unlink(store: LinkedStore) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await clubLinkApi.unlinkFromClub(store.id);
      setConfirming(null);
      setMessage(`${store.name} quedó desvinculada.`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo desvincular.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Tiendas vinculadas</TextureCardTitle>
        <p className="text-sm font-light text-brand-950/60">
          Si un restaurante o una tienda le vende a tus canchas, pídele el código de vinculación desde sus Ajustes y
          cánjealo acá. Cada una aparece como un icono en las tablets de las canchas, y sus comandas le llegan directo
          con el nombre de la cancha. Puedes vincular hasta {maxStores}.
        </p>
      </TextureCardHeader>

      <TextureCardContent className="space-y-4">
        {!loaded && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}

        {loaded && stores.length === 0 && (
          <p className="rounded-2xl bg-brand-950/[0.03] px-4 py-3 text-sm font-light text-brand-950/50">
            Todavía no hay tiendas vinculadas. En la tablet solo se ve la tienda propia del club.
          </p>
        )}

        {stores.length > 0 && (
          <ul className="space-y-2">
            {stores.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                {s.logoUrl ? (
                  <img src={s.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-700">
                    {s.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-emerald-900">{s.name}</p>
                  <p className="text-xs font-light text-emerald-800/70">Recibe los pedidos de tus canchas</p>
                </div>
                <button
                  onClick={() => setConfirming(s)}
                  disabled={busy}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-950/70 transition-colors hover:text-red-600 disabled:opacity-40"
                >
                  <Unlink className="h-3.5 w-3.5" /> Desvincular
                </button>
              </li>
            ))}
          </ul>
        )}

        {confirming && (
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">
              ¿Desvincular "{confirming.name}"? Sus productos dejarán de verse en las tablets de las canchas.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => unlink(confirming)}
                disabled={busy}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                Sí, desvincular
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-brand-950/60"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {loaded && !full && (
          <div>
            <label className="block text-sm">
              <span className="text-brand-950/70">Código de la tienda</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 font-mono text-lg tracking-[0.2em] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
              />
            </label>
            <p className="mt-1 text-xs font-light text-brand-950/45">El código vence 1 hora después de generarse.</p>
          </div>
        )}

        {loaded && full && (
          <p className="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-light text-amber-900">
            <Store className="h-4 w-4 shrink-0" />
            Llegaste al máximo de {maxStores} tiendas. Desvincula una para agregar otra.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

        {!full && (
          <TextureButton
            variant="brand"
            size="default"
            disabled={busy || code.trim().length < 4}
            onClick={redeem}
            className="!w-auto disabled:opacity-50"
          >
            <Link2 className="h-4 w-4" />
            {busy ? 'Vinculando…' : 'Vincular'}
          </TextureButton>
        )}
      </TextureCardContent>
    </TextureCard>
  );
}
