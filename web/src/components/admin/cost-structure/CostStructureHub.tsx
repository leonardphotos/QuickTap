import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CostStructureCalculator } from './CostStructureCalculator';
import { CostStructureConfigSection, type CostStructureConfig } from './CostStructureConfigSection';
import { CostStructureStats } from './CostStructureStats';

const TABS = [
  { id: 'calculator', label: 'Calculadora' },
  { id: 'stats', label: 'Estadísticas' },
  { id: 'config', label: 'Elementos del restaurante' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/**
 * Administración → Estructura de costo. La config (elementos fijos/variables + utilidad
 * objetivo) se carga acá una vez y se comparte con las tres vistas; la calculadora la lee para
 * calcular en vivo y "Elementos" la edita.
 */
export function CostStructureHub() {
  const { restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const [tab, setTab] = useState<TabId>('calculator');
  const [config, setConfig] = useState<CostStructureConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/cost-structure/config')
      .then((res) => setConfig(res.data.data))
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar la estructura de costo.'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!config) return <p className="text-sm font-light text-brand-950/40">Cargando…</p>;

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

      {tab === 'calculator' && <CostStructureCalculator config={config} symbol={symbol} />}
      {tab === 'stats' && <CostStructureStats symbol={symbol} />}
      {tab === 'config' && <CostStructureConfigSection config={config} symbol={symbol} onSaved={setConfig} />}
    </div>
  );
}
