import { AdminSectionNav } from '@/components/admin/AdminSectionNav';
import { AccountingHub } from '@/components/admin/AccountingHub';
import { BankAccountsSection } from '@/components/admin/BankAccountsSection';
import { PayablesSection } from '@/components/admin/PayablesSection';
import { PlanUpgradeNotice } from '@/components/admin/PlanUpgradeNotice';
import { QuoteManager } from '@/components/admin/QuoteManager';
import ExpensesPage from '@/pages/admin/ExpensesPage';
import { hasFeature, type FeatureFlag } from '@/utils/subscription';
import type { AuthRestaurant } from '@/context/AuthContext';
import type { ShopSession } from './shopSession';
import ShopStatsPage from './ShopStatsPage';
import ShopPurchasesPage from './ShopPurchasesPage';
import ShopReceivablesPage from './ShopReceivablesPage';
import ShopSalesByUnitPage from './ShopSalesByUnitPage';

/**
 * Administración del local, con el mismo formato que la de restaurantes: un solo menú lateral
 * y todo desplegado en línea, sin ventanas flotantes.
 *
 * Antes estas nueve pantallas colgaban sueltas del menú del panel, mezcladas con las de
 * operación diaria (Venta, Pedidos, Inventario). Quien entraba a facturar tenía delante la
 * misma lista que quien venía a cuadrar el mes.
 *
 * `feature` marca lo que pide Elite Shop: la pestaña se ve igual, con candado, y abre el aviso
 * de mejora — si se escondiera, el dueño no se enteraría de que existe.
 */
const ALL_TABS = [
  { id: 'estadisticas', label: 'Estadísticas', feature: null },
  { id: 'ventasUnidad', label: 'Ventas por unidad', feature: null },
  { id: 'gastos', label: 'Gastos', feature: null },
  { id: 'compras', label: 'Compras', feature: null },
  { id: 'cotizaciones', label: 'Cotizaciones', feature: null },
  { id: 'cuentas', label: 'Abrir cuenta', feature: null },
  { id: 'ordenes', label: 'Órdenes de pago', feature: 'accounting' },
  { id: 'contabilidad', label: 'Contabilidad', feature: 'accounting' },
  { id: 'bancos', label: 'Cuentas bancarias', feature: 'accounting' },
] as const satisfies readonly { id: string; label: string; feature: FeatureFlag | null }[];

export type ShopAdminTab = (typeof ALL_TABS)[number]['id'];

interface Props {
  restaurant: AuthRestaurant;
  session: ShopSession;
  /** Lleva a Facturación desde el aviso de mejora de plan. */
  onGoToBilling: () => void;
  /** La pestaña la manda el panel, no esta pantalla: los accesos de Inicio a Cotizaciones y
   *  Cuentas por Cobrar abren Administración ya parada en la suya. */
  tab: ShopAdminTab;
  onTabChange: (t: ShopAdminTab) => void;
}

export default function ShopAdministracionPage({ restaurant, session, onGoToBilling, tab, onTabChange }: Props) {
  const activa = ALL_TABS.find((t) => t.id === tab)!;
  const bloqueada = activa.feature != null && !hasFeature(restaurant, activa.feature);

  const items = ALL_TABS.map((t) => ({
    id: t.id,
    label: t.label,
    locked: t.feature != null && !hasFeature(restaurant, t.feature),
  }));

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Administración</h1>
        <p className="mt-1 text-sm font-light text-brand-950/60">
          Ventas, gastos, compras y contabilidad de {restaurant.name}.
        </p>
      </div>

      <div className="lg:flex lg:flex-row lg:gap-6">
        <AdminSectionNav items={items} activeId={tab} onChange={(id) => onTabChange(id as ShopAdminTab)} />
        <div className="mt-5 min-w-0 flex-1 lg:mt-0">
          {bloqueada && <PlanUpgradeNotice feature={activa.label} onGoToBilling={onGoToBilling} />}

          {!bloqueada && tab === 'estadisticas' && <ShopStatsPage restaurant={restaurant} />}
          {!bloqueada && tab === 'ventasUnidad' && <ShopSalesByUnitPage restaurant={restaurant} />}
          {!bloqueada && tab === 'gastos' && <ExpensesPage />}
          {!bloqueada && tab === 'compras' && <ShopPurchasesPage session={session} restaurant={restaurant} />}
          {!bloqueada && tab === 'cotizaciones' && <QuoteManager />}
          {!bloqueada && tab === 'cuentas' && <ShopReceivablesPage />}

          {!bloqueada && tab === 'ordenes' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-brand-950">Órdenes de pago</h2>
                <p className="mt-0.5 text-sm font-light text-brand-950/50">
                  Cuentas por pagar a proveedores: gastos a crédito, retenciones y pagos.
                </p>
              </div>
              <PayablesSection />
            </div>
          )}

          {!bloqueada && tab === 'contabilidad' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-brand-950">Contabilidad</h2>
                <p className="mt-0.5 text-sm font-light text-brand-950/50">
                  Cuentas bancarias, proveedores y libros de compras/ventas.
                </p>
              </div>
              <AccountingHub />
            </div>
          )}

          {!bloqueada && tab === 'bancos' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-brand-950">Cuentas bancarias</h2>
              </div>
              <BankAccountsSection symbol={restaurant.currencySymbol ?? '$'} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
