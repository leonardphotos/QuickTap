import type { PaymentMethodsConfig } from '@/types';

/**
 * Una cuenta receptora concreta de un método de pago (la principal o una adicional),
 * ya normalizada para la caja: cómo se llama, qué datos mostrar y a cuál cuenta
 * bancaria registrada suma el dinero.
 */
export interface MethodAccount {
  /** 'main' para la principal; el `key` del extra para las demás. */
  key: string;
  label: string;
  bankAccountId: string | null;
  qrImageUrl: string | null;
  /** Datos visibles (banco, teléfono, correo…), solo los que tengan valor. */
  fields: Record<string, string>;
}

const DATA_FIELDS = ['banco', 'telefono', 'cedula', 'titular', 'correo', 'id', 'cuenta', 'rif'] as const;

/**
 * Todas las cuentas receptoras de un método (principal + adicionales), en el orden
 * en que se configuraron. Con una sola, la caja no pregunta nada (comportamiento de
 * siempre); con varias, el cajero elige a cuál entró el dinero.
 */
export function methodAccountsOf(config: PaymentMethodsConfig | null | undefined, method: string): MethodAccount[] {
  const cfg = config?.[method as keyof PaymentMethodsConfig];
  if (!cfg) return [];

  const build = (src: Record<string, unknown>, key: string, fallback: string): MethodAccount => {
    const fields: Record<string, string> = {};
    for (const f of DATA_FIELDS) {
      const v = src[f];
      if (typeof v === 'string' && v.trim()) fields[f] = v;
    }
    const label = typeof src.label === 'string' && src.label.trim() ? src.label.trim() : null;
    return {
      key,
      // Sin nombre propio, se distingue por su dato más reconocible (correo/teléfono/banco).
      label: label ?? fields.correo ?? fields.telefono ?? fields.banco ?? fallback,
      bankAccountId: typeof src.bankAccountId === 'string' ? src.bankAccountId : null,
      qrImageUrl: typeof src.qrImageUrl === 'string' && src.qrImageUrl ? src.qrImageUrl : null,
      fields,
    };
  };

  const main = build(cfg as Record<string, unknown>, 'main', 'Cuenta principal');
  const extras = (cfg.extraAccounts ?? []).map((a, i) =>
    build(a as unknown as Record<string, unknown>, a.key, `Cuenta ${i + 2}`),
  );
  return [main, ...extras];
}
