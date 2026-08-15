import type { MethodAccount } from '@/utils/payment-accounts';

/**
 * "¿A cuál cuenta entró el pago?" — aparece solo cuando el método elegido tiene más
 * de una cuenta configurada (varios Zelle, varios Pago Móvil). La elegida decide a
 * cuál cuenta bancaria registrada se asienta el dinero.
 */
export function MethodAccountPicker({
  accounts,
  value,
  onChange,
  label = '¿A cuál cuenta entró el pago?',
}: {
  accounts: MethodAccount[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
}) {
  if (accounts.length < 2) return null;
  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs font-medium text-brand-950/50">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {accounts.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => onChange(a.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              value === a.key ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
