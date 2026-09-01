import { useState } from 'react';
import { Tag, X } from 'lucide-react';
import { api } from '@/api/client';

/** Lo que devuelve /promotions/validate: el descuento que otorga el código. */
export interface AppliedPromo {
  id: string;
  name: string;
  code: string;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: string;
  customerName: string | null;
}

/** El descuento de la promo sobre un saldo, espejo de promotionDiscountOf del backend. */
export function promoDiscountAmount(promo: AppliedPromo, baseAmount: number): number {
  const raw =
    promo.discountType === 'PERCENT' ? (baseAmount * Number(promo.discountValue)) / 100 : Number(promo.discountValue);
  return Math.min(Math.round((raw + Number.EPSILON) * 100) / 100, baseAmount);
}

/**
 * "Código de promoción" en caja: valida contra el CRM (lista, vigencia, canjes por
 * cliente) ANTES de cobrar y le pasa la promo aplicada al flujo de pago — el canje
 * real lo registra el backend junto con el cobro.
 */
export function PromoCodeField({
  phone,
  applied,
  onApplied,
  symbol,
}: {
  /** Teléfono del cliente que paga, si se conoce — las promos de lista lo exigen. */
  phone?: string | null;
  applied: AppliedPromo | null;
  onApplied: (promo: AppliedPromo | null) => void;
  symbol: string;
}) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (!code.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await api.get('/promotions/validate', {
        params: { code: code.trim(), phone: phone || undefined },
      });
      onApplied(res.data.data);
      setCode('');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo validar el código.');
    } finally {
      setChecking(false);
    }
  }

  if (applied) {
    const label =
      applied.discountType === 'PERCENT'
        ? `${Number(applied.discountValue)}%`
        : `${symbol}${Number(applied.discountValue).toFixed(2)}`;
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
        <Tag className="h-4 w-4 shrink-0 text-emerald-600" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-emerald-800">
          {applied.code} · {label} de descuento
          {applied.customerName && <span className="font-normal"> · {applied.customerName}</span>}
        </p>
        <button
          type="button"
          onClick={() => onApplied(null)}
          aria-label="Quitar promoción"
          className="shrink-0 rounded-full p-1 text-emerald-700 hover:bg-emerald-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-brand-950/50">Código de promoción</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            }
          }}
          // Único campo del cobro que SÍ usa el teclado del sistema, incluso en modo POS: un
          // código promocional lleva letras y guiones ("PROMO-ABC12") y el teclado numérico de
          // la pantalla solo tiene dígitos. Bloquearlo acá lo volvería imposible de escribir.
          placeholder="Ej. PROMO-ABC12"
          className="w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 font-mono text-sm uppercase focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
        />
        <button
          type="button"
          disabled={checking || !code.trim()}
          onClick={apply}
          className="shrink-0 rounded-lg bg-brand-950 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-950/90 disabled:opacity-40"
        >
          {checking ? '…' : 'Aplicar'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
