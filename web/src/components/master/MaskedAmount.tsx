import { useMoneyVisibility } from '@/context/MoneyVisibilityContext';

/** Envuelve cualquier texto con un monto de dinero: lo pinta o lo cambia por "*****". */
export function MaskedAmount({ value }: { value: string }) {
  const { hidden } = useMoneyVisibility();
  return <>{hidden ? '*****' : value}</>;
}
