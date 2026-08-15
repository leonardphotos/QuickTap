import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { MovementsLedgerSection } from './MovementsLedgerSection';
import { SuppliersSection } from './SuppliersSection';
import { FiscalBooksSection } from './FiscalBooksSection';
import { BankAccountsSection } from './BankAccountsSection';

const TABS = [
  { id: 'ledger', label: 'Movimientos' },
  { id: 'banks', label: 'Cuentas bancarias' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'books', label: 'Libros fiscales' },
] as const;

/**
 * Contabilidad para Locales y Canchas: agrupa Cuentas bancarias, Proveedores y Libros
 * fiscales en una sola pestaña con sub-navegación — sus menús ya van apretados y tres
 * entradas más no caben. En Restaurantes cada sección tiene su propia pestaña del menú
 * lateral de Administración (allí sí hay espacio vertical).
 */
export function AccountingHub() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('ledger');

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                tab === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ledger' && <MovementsLedgerSection />}
      {tab === 'banks' && <BankAccountsSection symbol={symbol} />}
      {tab === 'suppliers' && <SuppliersSection />}
      {tab === 'books' && <FiscalBooksSection />}
    </div>
  );
}
