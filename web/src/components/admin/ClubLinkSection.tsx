import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { clubLinkApi, type RestaurantLinkState } from '@/api/clubLink';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardContent, TextureCardHeader, TextureCardTitle } from '@/components/ui/texture-card';

/** "12:34" restantes, o null si ya venció. */
function useCountdown(expiresAt: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return null;
  const mins = Math.floor(left / 60_000);
  const secs = Math.floor((left % 60_000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Ajustes → Vincular canchas. Genera un código de un solo uso que vive 1 hora;
 * el club lo escribe en sus propios Ajustes y a partir de ahí los pedidos que
 * los jugadores hacen desde la tablet de la cancha caen en la pestaña "Canchas"
 * de este restaurante.
 */
export function ClubLinkSection() {
  const { refresh } = useAuth();
  const [state, setState] = useState<RestaurantLinkState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    clubLinkApi
      .state()
      .then(setState)
      .catch(() => setError('No se pudo cargar el estado de vinculación.'));
  }, []);

  useEffect(load, [load]);

  const countdown = useCountdown(state?.activeCode?.expiresAt);
  // El contador llega a 0 mientras la pantalla está abierta: el código de la
  // pantalla ya no sirve aunque el servidor todavía no lo sepa.
  const codeAlive = !!state?.activeCode && countdown !== null;

  async function generate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await clubLinkApi.createCode();
      setState((s) => (s ? { ...s, activeCode: created } : s));
      setMessage('Código generado. Dícteselo al club: vence en 1 hora.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo generar el código.');
    } finally {
      setBusy(false);
    }
  }

  async function unlink(clubId: string, name: string) {
    if (!window.confirm(`¿Desvincular "${name}"? Dejarás de recibir los pedidos de sus canchas.`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await clubLinkApi.unlinkClub(clubId);
      load();
      // La pestaña "Canchas" depende de si queda algún club vinculado.
      await refresh();
      setMessage('Club desvinculado.');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo desvincular.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Vincular canchas</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Si un club deportivo te terceriza la cocina o la barra, genera un código y dáselo. Cuando lo canjee, los
          pedidos que sus jugadores hagan desde la tablet de cada cancha te van a llegar en la pestaña{' '}
          <span className="font-medium text-brand-950/80">Canchas</span>, con el nombre de la cancha haciendo de mesa.
        </p>
      </TextureCardHeader>

      <TextureCardContent className="space-y-4">
        {codeAlive ? (
          <div className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-950/50">Código activo</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-[0.2em] text-brand-950">
                {state!.activeCode!.code}
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(state!.activeCode!.code)}
                className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-950 shadow-sm transition-colors hover:bg-brand-950/[0.04]"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </button>
            </div>
            <p className="mt-2 text-sm font-light text-brand-950/60">
              Vence en <span className="font-semibold text-brand-950">{countdown}</span>. Se usa una sola vez.
            </p>
          </div>
        ) : (
          <p className="text-sm font-light text-brand-950/50">
            No tienes ningún código activo. Genera uno cuando tengas al club listo para canjearlo.
          </p>
        )}

        <TextureButton
          variant="brand"
          size="default"
          disabled={busy}
          onClick={generate}
          className="!w-auto disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {busy ? 'Generando…' : codeAlive ? 'Generar otro código' : 'Generar código'}
        </TextureButton>

        {state && state.clubs.length > 0 && (
          <div className="border-t border-brand-950/[0.06] pt-4">
            <p className="text-sm font-semibold text-brand-950">Canchas vinculadas</p>
            <ul className="mt-2 space-y-2">
              {state.clubs.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-xl border border-brand-950/[0.07] bg-white px-3 py-2.5"
                >
                  {c.logoUrl ? (
                    <img src={c.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-950/[0.06] text-xs font-bold text-brand-950/50">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-brand-950">{c.name}</p>
                    <p className="text-xs font-light text-brand-950/45">/{c.slug}</p>
                  </div>
                  <button
                    onClick={() => unlink(c.id, c.name)}
                    disabled={busy}
                    className="shrink-0 rounded-lg p-2 text-brand-950/35 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    aria-label={`Desvincular ${c.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-brand-500">{message}</p>}
      </TextureCardContent>
    </TextureCard>
  );
}
