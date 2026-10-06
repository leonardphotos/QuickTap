import { useNavigate } from 'react-router-dom';
import { proposalOrders } from '../pedidos/data';
import { PAID_BY_ORDER, SENT_BY_ORDER } from '../pedidos/edit/editData';
import { toPaymentLines } from './lines';
import { PaymentSheet } from './PaymentSheet';

const SAMPLE_ORDER = proposalOrders.find((o) => o.id === '#1046') ?? proposalOrders[0];
const SAMPLE_LINES = toPaymentLines(SENT_BY_ORDER[SAMPLE_ORDER.id] ?? []);
const SAMPLE_PAID = PAID_BY_ORDER[SAMPLE_ORDER.id];

export default function PaymentProposalPage() {
  const navigate = useNavigate();
  const back = () => navigate('/propuesta/pedidos');
  return <PaymentSheet order={SAMPLE_ORDER} lines={SAMPLE_LINES} alreadyPaid={typeof SAMPLE_PAID === 'number' ? SAMPLE_PAID : 0} onClose={back} onFinish={back} />;
}
