import { useState } from 'react';
import { useAuth } from '@/context/AuthContext.shared';
import { hasFullAccess } from '@/utils/roles';
import { hasFeature } from '@/utils/subscription';
import { LiveOrdersPanel } from '@/components/admin/LiveOrdersPanel';
import { CourierStatsSection } from '@/components/admin/CourierStatsSection';
import { OrderHistorySection } from '@/components/admin/OrderHistorySection';
import { PlanUpgradeNotice } from '@/components/admin/PlanUpgradeNotice';

export default function DeliveryPage() {
  const { restaurant, user } = useAuth();
  const canManage = hasFullAccess(user?.role, user?.cashierFullAccess);
  const [tab, setTab] = useState('live');
  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold text-brand-950">Repartos</h1><p className="mt-1 text-brand-950/60 text-base">Pedidos de delivery y coordinación de entregas.</p></div>
    {canManage && <div className="flex flex-wrap gap-2" role="group" aria-label="Vistas de repartos">
      {[['live', 'Pedidos'], ['couriers', 'Repartidores'], ['history', 'Historial']].map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)} className={`min-h-11 rounded-xl px-4 text-sm font-medium ${tab === id ? 'bg-brand-950 text-white' : 'bg-white text-brand-950/65'}`}>{label}</button>)}
    </div>}
    {tab === 'live' && <LiveOrdersPanel deliveryOnly hideCreateButton />}
    {canManage && tab === 'couriers' && <CourierStatsSection />}
    {canManage && tab === 'history' && (hasFeature(restaurant, 'accounting') ? <OrderHistorySection channels={['DELIVERY']} defaultRange="week" /> : <PlanUpgradeNotice feature="El historial de repartos" />)}
  </div>;
}
