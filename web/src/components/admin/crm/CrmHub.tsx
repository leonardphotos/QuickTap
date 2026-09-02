import { useState } from 'react';
import { CustomersSection } from './CustomersSection';
import { PartnersSection } from './PartnersSection';
import { PromotionsSection } from './PromotionsSection';

const TABS = [
  { id: 'customers', label: 'Clientes' },
  // Socios va justo debajo de Clientes: es la misma gente del directorio, pero su consumo no
  // es una venta. Se separa para que no aparezcan mezclados con la clientela normal.
  { id: 'partners', label: 'Socios' },
  { id: 'promotions', label: 'Promociones' },
] as const;

/**
 * CRM compartido por los tres verticales: el directorio de clientes con segmentos
 * (las listas) y las promociones personalizadas con código canjeable. En
 * Restaurantes es una pestaña de Administración; en Locales y Canchas reemplaza
 * la página de Clientes.
 */
export function CrmHub() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('customers');

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

      {tab === 'customers' && <CustomersSection />}
      {tab === 'partners' && <PartnersSection />}
      {tab === 'promotions' && <PromotionsSection />}
    </div>
  );
}
