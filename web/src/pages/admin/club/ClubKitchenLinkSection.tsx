import { useCallback, useEffect, useState } from 'react';
import { Link2, Unlink } from 'lucide-react';
import { clubLinkApi, type LinkedParty } from '@/api/clubLink';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';

/**
 * Ajustes del club → Restaurante vinculado. El restaurante genera un código en
 * sus propios Ajustes y el club lo canjea acá; a partir de ahí el menú del
 * restaurante aparece en la tablet de cada cancha, junto con la tienda propia.
 *
 * Lo consumido sigue cobrándose acá, en la Caja de Canchas: al restaurante le
 * llega la comanda para preparar y llevar, no la venta.
 */
export function ClubKitchenLinkSection() {
  const [linked, setLinked] = useState<LinkedParty | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    clubLinkApi
      .clubState()
      .then((s) => setLinked(s.restaurant))
      .catch(() => setError('No se pudo cargar el vínculo.'))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  async function redeem() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { restaurant } = await clubLinkApi.redeem(code);
      setLinked(restaurant);
      setCode('');
      setMessage(`Vinculado con ${restaurant.name}.`);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo canjear el código.');
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!linked) return;
    if (!window.confirm(`¿Desvincular "${linked.name}"? Sus productos dejarán de verse en las tablets.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await clubLinkApi.unlinkFromClub();
      setLinked(null);
      setMessage('Restaurante desvinculado.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo desvincular.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Restaurante vinculado</TextureCardTitle>
        <p className="text-sm font-light text-brand-950/60">
          Si un restaurante te prepara la comida y la bebida, pídele el código de vinculación desde sus Ajustes y
          cánjealo acá. Su menú se suma al de tu tienda en las tablets de las canchas, y las comandas le llegan
          directo con el nombre de la cancha.
        </p>
      </TextureCardHeader>

      <TextureCardContent className="space-y-4">
        {!loaded && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}

        {loaded && linked && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            {linked.logoUrl ? (
              <img src={linked.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-700">
                {linked.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-emerald-900">{linked.name}</p>
              <p className="text-xs font-light text-emerald-800/70">Recibe los pedidos de tus canchas</p>
            </div>
            <button
              onClick={unlink}
              disabled={busy}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-950/70 transition-colors hover:text-red-600 disabled:opacity-40"
            >
              <Unlink className="h-3.5 w-3.5" /> Desvincular
            </button>
          </div>
        )}

        {loaded && (
          <div>
            <label className="block text-sm">
              <span className="text-brand-950/70">{linked ? 'Cambiar de restaurante' : 'Código del restaurante'}</span>
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

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}

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
      </TextureCardContent>
    </TextureCard>
  );
}
