import { AnimatedTabs, AnimatedTab } from '@/components/ui/animated-tabs';
import { useAuth } from '@/context/AuthContext.shared';
import ClubPayrollPage from '@/pages/admin/club/ClubPayrollPage';
import { useState } from 'react';
import { BankAccountsSection } from './BankAccountsSection';
import { FiscalBooksSection } from './FiscalBooksSection';
import { MovementsLedgerSection } from './MovementsLedgerSection';
import { SuppliersSection } from './SuppliersSection';
import { CostAnalysisSection } from './accounting/CostAnalysisSection';
import { BalanceSheetSection,IncomeStatementSection } from './accounting/FinancialStatementsSection';

const ALL_TABS = [
  { id: 'ledger', label: 'Movimientos' },
  { id: 'income', label: 'Estado de resultados' },
  { id: 'balance', label: 'Situación financiera' },
  { id: 'cost', label: 'Análisis de costo' },
  // Nómina vive aquí adentro (Contabilidad → Desarrollo Humano), no como pestaña suelta.
  { id: 'hr', label: 'Desarrollo Humano' },
  { id: 'banks', label: 'Cuentas bancarias' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'books', label: 'Libros fiscales' },
] as const;
export type AccountingTabId = (typeof ALL_TABS)[number]['id'];

/**
 * Contabilidad. Locales y Canchas la usan completa (sus menús ya van apretados y tres
 * entradas más no caben); Restaurantes pasa `sections` sin bancos/proveedores/libros porque
 * esos ya tienen su propia pestaña en Administración. Los estados financieros (Estado de
 * resultados y Situación financiera, estructura NIIF) y Desarrollo Humano (nómina) viven acá.
 */
export function AccountingHub({ sections }: { sections?: AccountingTabId[] } = {}) {
  const { restaurant, user } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  // La nómina la administra solo dueño/admin (mismo criterio que la API de payroll).
  const canHr = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const tabs = ALL_TABS.filter((t) => (!sections || sections.includes(t.id)) && (t.id !== 'hr' || canHr));
  const [tab, setTab] = useState<AccountingTabId>(tabs[0]?.id ?? 'ledger');

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <AnimatedTabs tone="light" className="flex  items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {tabs.map((t) => (
            <AnimatedTab active={tab === t.id}
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                tab === t.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {t.label}
            </AnimatedTab>
          ))}
        </AnimatedTabs>
      </div>

      {tab === 'ledger' && <MovementsLedgerSection />}
      {tab === 'income' && <IncomeStatementSection />}
      {tab === 'balance' && <BalanceSheetSection />}
      {tab === 'cost' && <CostAnalysisSection />}
      {tab === 'hr' && restaurant && <ClubPayrollPage restaurant={restaurant} />}
      {tab === 'banks' && <BankAccountsSection symbol={symbol} />}
      {tab === 'suppliers' && <SuppliersSection />}
      {tab === 'books' && <FiscalBooksSection />}
    </div>
  );
}
