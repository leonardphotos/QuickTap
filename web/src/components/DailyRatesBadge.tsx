import { useEffect, useState } from 'react';
import { api } from '../api/client';

/** Bs por dólar y por euro del día; null = aún sin tasa en el backend. */
interface DayRates {
  usd: number | null;
  eur: number | null;
}

const fmt = (n: number) => n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Tasa BCV del día de las dos monedas ($ y €), en pequeño, para la parte superior
 * de todos los paneles (Restaurante, Shop, Club y Dashboard maestro). Usa el
 * endpoint público porque la tasa es global (no depende del tenant ni del realm
 * del token — el panel maestro no puede llamar rutas de tenant).
 */
export function DailyRatesBadge({ className = '' }: { className?: string }) {
  const [rates, setRates] = useState<DayRates | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/public/exchange-rate')
      .then(({ data }) => {
        if (cancelled) return;
        const usd = data.data?.USD?.rateBs;
        const eur = data.data?.EUR?.rateBs;
        setRates({ usd: usd != null ? Number(usd) : null, eur: eur != null ? Number(eur) : null });
      })
      .catch(() => {
        /* Sin tasa no se muestra nada — el badge es informativo, nunca debe romper el panel. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rates || (rates.usd == null && rates.eur == null)) return null;

  return (
    <span
      className={`shrink-0 whitespace-nowrap text-[10px] font-bold text-brand-500 ${className}`}
      title="Tasa BCV del día (Bs por dólar y por euro)"
    >
      {rates.usd != null && <>$ {fmt(rates.usd)}</>}
      {rates.usd != null && rates.eur != null && <span className="font-normal text-brand-950/30"> · </span>}
      {rates.eur != null && <>€ {fmt(rates.eur)}</>}
    </span>
  );
}
