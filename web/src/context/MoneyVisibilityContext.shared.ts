import { createContext,useContext } from 'react';


export interface MoneyVisibilityState {
  hidden: boolean;
  toggle: () => void;
}


export const MoneyVisibilityContext = createContext<MoneyVisibilityState | null>(null);


export function useMoneyVisibility(): MoneyVisibilityState {
  const ctx = useContext(MoneyVisibilityContext);
  if (!ctx) throw new Error('useMoneyVisibility debe usarse dentro de <MoneyVisibilityProvider>');
  return ctx;
}
