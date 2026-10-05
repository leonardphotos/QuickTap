import { api } from '@/api/client';
import { TextScramble } from '@/components/ui/text-scramble';
import { Copy, ExternalLink, RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ChefAccess {
  url: string;
  code: string;
  expiresAt: number;
  refreshEverySeconds: number;
}

/** Enlace de un solo propósito para cocina: el chef no necesita una cuenta del panel. */
export function ChefRecipeAccessCard() {
  const [access, setAccess] = useState<ChefAccess | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState<'url' | 'code' | null>(null);

  async function load() {
    try {
      const response = await api.get('/chef-recipes/access');
      setAccess(response.data.data);
      setSeconds(Math.max(0, Math.ceil((response.data.data.expiresAt - Date.now()) / 1000)));
    } catch {
      setAccess(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // El generador usa ventanas de cinco minutos alineadas al reloj. Se programa
  // la próxima consulta para el vencimiento real, no cinco minutos después de
  // abrir la pantalla (que podría mostrar un código ya vencido).
  useEffect(() => {
    const expiresAt = access?.expiresAt;
    if (!expiresAt) return;
    const delay = Math.max(1_000, expiresAt - Date.now() + 250);
    const timeout = window.setTimeout(() => void load(), delay);
    return () => window.clearTimeout(timeout);
  }, [access?.expiresAt]);

  useEffect(() => {
    if (!access) return;
    const tick = () => setSeconds(Math.max(0, Math.ceil((access.expiresAt - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [access]);

  async function copy(value: string, kind: 'url' | 'code') {
    await navigator.clipboard?.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-brand-950/[0.08] bg-white shadow-[0_18px_45px_-36px_rgba(8,34,74,0.42)]">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-500">
          <Smartphone className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold tracking-tight text-brand-950">Recetario para chef</h2>
          <p className="mt-0.5 leading-snug text-brand-950/55 text-base">Comparte este enlace para cargar ingredientes y gramajes desde el teléfono.</p>
        </div>
      </div>
      {access ? (
        <div className="border-t border-brand-950/[0.07] bg-brand-950/[0.025] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold uppercase tracking-[0.12em] text-brand-950/45 text-xs">Código de acceso</p>
              <p className="mt-1 font-mono text-3xl font-semibold tracking-[0.22em] text-brand-950"><TextScramble text={access.code} /></p>
            </div>
            <button onClick={() => void copy(access.code, 'code')} className="rounded-xl bg-white p-3 text-brand-950/60 shadow-sm transition active:scale-95" aria-label="Copiar código">
              <Copy className="size-4" />
            </button>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-brand-950/10">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-200" style={{ width: `${(seconds / access.refreshEverySeconds) * 100}%` }} />
          </div>
          <p className="mt-2 text-brand-950/50 text-xs">El código vence en {seconds || access.refreshEverySeconds} s.</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void copy(access.url, 'url')} className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98]">
              <Copy className="size-4" /> {copied === 'url' ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
            <a href={access.url} target="_blank" rel="noreferrer" className="grid place-items-center rounded-xl border border-brand-950/10 bg-white px-3 text-brand-950/65" aria-label="Abrir enlace de chef">
              <ExternalLink className="size-4" />
            </a>
            <button onClick={() => void load()} className="grid place-items-center rounded-xl border border-brand-950/10 bg-white px-3 text-brand-950/65" aria-label="Actualizar código">
              <RefreshCw className="size-4" />
            </button>
          </div>
          {copied === 'code' && <p className="mt-2 font-medium text-emerald-600 text-xs">Código copiado.</p>}
        </div>
      ) : (
        <div className="border-t border-brand-950/[0.07] p-4 text-sm text-brand-950/50">No se pudo preparar el acceso. Actualiza la página e intenta otra vez.</div>
      )}
    </section>
  );
}
