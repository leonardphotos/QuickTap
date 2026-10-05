import { useState } from 'react';
import { api } from '@/api/client';
import { PAYMENT_LABELS } from './PaymentDialog.shared';
import type { PaymentMethod } from '@/types';

/** Una preferencia nunca genera un cobro ni un movimiento de caja. */
export function DeliveryPaymentPreference({order,onSaved}:{order:{id:string;paymentMethod?:PaymentMethod|null};onSaved:()=>void}) {
 const [method,setMethod]=useState(order.paymentMethod??'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){
  if(!method||busy)return;
  setBusy(true);setError('');
  try {
   const current=await api.get(`/orders/${order.id}/corrections`);
   await api.post(`/orders/${order.id}/corrections`,{action:'PAYMENT_PREFERENCE',method,version:current.data.data.order.updatedAt,reason:'Actualizar el método previsto por el cliente, sin registrar un cobro.',requestKey:crypto.randomUUID()});
   onSaved();
  }catch(e:any){setError(e.response?.data?.error??'No se pudo guardar el método previsto.');}
  finally{setBusy(false);}
 }
 return <section className="space-y-2 rounded-2xl border border-brand-950/10 p-3">
  <label className="block text-sm font-medium" htmlFor={`expected-${order.id}`}>El cliente pagará con</label>
  <div className="flex gap-2"><select id={`expected-${order.id}`} value={method} onChange={e=>setMethod(e.target.value as PaymentMethod)} disabled={busy} className="min-h-11 min-w-0 flex-1 rounded-xl border border-brand-950/15 bg-white px-2 text-base"><option value="">Sin definir</option>{Object.entries(PAYMENT_LABELS).filter(([key])=>key!=='PAYROLL_DEDUCTION').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={save} disabled={busy||!method||method===order.paymentMethod} className="rounded-xl bg-brand-950/5 px-3 text-sm font-semibold disabled:opacity-40">{busy?'Guardando…':'Guardar'}</button></div>
  <p className="text-brand-950/60 text-xs">Método previsto. No registra dinero recibido ni modifica los pagos existentes.</p>
  {error&&<p role="alert" className="text-red-600 text-xs">{error}</p>}
 </section>;
}
