import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import '../proposal.css';
import { ProposalSidebar } from './ProposalSidebar';
import { ProposalToolbar, WelcomeRow } from './WelcomeRow';
import { HourlySalesChart } from './HourlySalesChart';
import { LiveOrdersCard } from './LiveOrdersCard';
import { QuickActionsCard } from './QuickActionsCard';
import { AttentionCard, TablesCard, TopProductsCard } from './FloorAndAlerts';
import { restaurant } from './data';

/**
 * Propuesta del Resumen (/admin) sobre la estructura actual de RestaurantDesktopDashboard:
 * misma barra, saludo + 2 mini tarjetas y columnas 2.1fr / 1fr. Cambios propuestos:
 * total del día y comparación en el saludo, ventas vs. semana pasada, pedidos en vivo,
 * salón y un bloque de alertas en la columna de acciones.
 */
export default function DashboardProposalPage() {
  useDocumentMeta('Propuesta · Resumen del restaurante | QuickTap');

  return (
    <div className="qt-proposal min-h-dvh">
      <ProposalSidebar />
      <div className="lg:pl-[264px]">
        <main className="mx-auto flex max-w-[1600px] flex-col gap-4 overflow-x-clip px-4 py-6 sm:gap-6 sm:px-5 sm:py-8 lg:px-10">
          <ProposalToolbar />
          <WelcomeRow />

          <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)]">
            <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
              <HourlySalesChart />
              <LiveOrdersCard />
              <TablesCard />
            </div>
            <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
              <AttentionCard />
              <QuickActionsCard />
              <TopProductsCard />
            </div>
          </div>

          <footer className="flex justify-between py-3 text-xs text-muted-foreground">
            <span>QuickTap · {restaurant.name}</span>
            <a href="#" className="text-brand-500">Ver menú público ↗</a>
          </footer>
        </main>
      </div>
    </div>
  );
}
