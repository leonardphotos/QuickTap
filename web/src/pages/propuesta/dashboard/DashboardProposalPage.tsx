import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { ProposalSidebar } from './ProposalSidebar';
import { ProposalHeader } from './ProposalHeader';
import { KpiCards } from './KpiCards';
import { HourlySalesChart } from './HourlySalesChart';
import { LiveOrdersCard } from './LiveOrdersCard';
import { ChannelsCard, PaymentMethodsCard, TopProductsCard } from './BreakdownCards';
import { AttentionCard, TablesCard } from './FloorAndAlerts';

/**
 * Propuesta de rediseño del Resumen (/admin) del panel de restaurantes, con datos de ejemplo.
 * Jerarquía: 1) cómo va el día (KPI), 2) qué está pasando ahora (ventas por hora + pedidos
 * en vivo), 3) qué hay que resolver (salón + alertas), 4) de dónde sale el dinero.
 */
export default function DashboardProposalPage() {
  useDocumentMeta('Propuesta · Resumen del restaurante | QuickTap');

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <ProposalSidebar />
      <div className="lg:pl-[248px]">
        <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-5 py-8 lg:px-8">
          <ProposalHeader />
          <KpiCards />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <HourlySalesChart />
            <LiveOrdersCard />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <TablesCard />
            <AttentionCard />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ChannelsCard />
            <PaymentMethodsCard />
            <TopProductsCard />
          </div>
        </main>
      </div>
    </div>
  );
}
