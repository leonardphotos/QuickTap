import { Eye, EyeOff } from 'lucide-react';
import { useMoneyVisibility } from '@/context/MoneyVisibilityContext';

/** Ícono de ojo para mostrar/ocultar los montos de dinero de todo el Dashboard maestro. */
export function MoneyVisibilityToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useMoneyVisibility();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
      title={hidden ? 'Mostrar montos' : 'Ocultar montos'}
      className={className ?? 'text-brand-950/40 hover:text-brand-500 transition-colors shrink-0'}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}
