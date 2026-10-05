import { CreateOrderDialog } from '@/components/admin/CreateOrderDialog';
import { useNavigate } from 'react-router-dom';

export default function InternalMenuPage() {
  const navigate = useNavigate();
  return <CreateOrderDialog
    existingOrders={[]}
    employeeConsumption
    onClose={() => navigate('/admin')}
    onCreated={() => navigate('/admin/comandas')}
    onSelectExisting={() => undefined}
  />;
}
