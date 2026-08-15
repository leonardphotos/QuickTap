import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { hasFeature } from '@/utils/subscription';
import { SuppliersSection } from '@/components/admin/SuppliersSection';
import { FiscalBooksSection } from '@/components/admin/FiscalBooksSection';
import { PlanUpgradeNotice } from '@/components/admin/PlanUpgradeNotice';
import { PurchasesRegisterSection } from './PurchasesRegisterSection';
import { SupplierRatingsSection } from './SupplierRatingsSection';

const TABS = [
  { id: 'register', label: 'Registro de compras' },
  { id: 'suppliers', label: 'Proveedores' },
  { id: 'book', label: 'Libro de compras' },
  { id: 'ratings', label: 'Calificación de proveedores' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Módulo de Compras (debajo de Gastos en el menú): registro de compras a proveedores — el
 * único lugar donde una compra reabastece el inventario —, directorio y relación de cuenta
 * de proveedores, libro de compras y calificación de proveedores.
 */
export function PurchasesHub({ initialTab = 'register' }: { initialTab?: TabId }) {
  const { restaurant } = useAuth();
  const [tab, setTab] = useState<TabId>(initialTab);
  // El libro de compras es contabilidad avanzada (Elite / Elite Shop / Club); el resto del
  // módulo va con Administración básica.
  const canBook = hasFeature(restaurant, 'accounting');

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

      {tab === 'register' && <PurchasesRegisterSection />}
      {tab === 'suppliers' && <SuppliersSection />}
      {tab === 'book' && (canBook ? <FiscalBooksSection only="compras" /> : <PlanUpgradeNotice feature="El Libro de compras" />)}
      {tab === 'ratings' && <SupplierRatingsSection />}
    </div>
  );
}
