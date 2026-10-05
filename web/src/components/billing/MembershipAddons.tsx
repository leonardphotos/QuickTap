import {useState} from 'react';
import {MEMBERSHIP_ADDONS, addonLimits, readAddons, priceAddons, type AddonSelection} from '@/utils/membership-addons';
import {hasFeature, type FeatureFlag} from '@/utils/subscription';
import {COMMERCIAL_PLANS, isCommercialPlan} from '@/utils/commercial-plans';
import {api} from '@/api/client';
import type {SelectedPlan} from '@/components/landing/PaymentForm';

export function MembershipAddons({plan,terms,cycle,onChoose}:{plan:string;terms:unknown;cycle:SelectedPlan["billingCycle"];onChoose:(value:SelectedPlan)=>void}) {
  const [selection,setSelection]=useState<AddonSelection>(()=>readAddons(terms));
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const included=(feature:string)=>hasFeature({subscriptionPlan:plan},feature as FeatureFlag);
  let monthly=0;let validation='';
  try{monthly=priceAddons(plan,selection,included,terms).reduce((s,a)=>s+a.monthlyCents,0)/100}catch(e){validation=(e as Error).message}
  const base=isCommercialPlan(plan)?COMMERCIAL_PLANS[plan].monthly:null;
  const update=(code:string,quantity:number)=>setSelection(prev=>[...prev.filter(x=>x.code!==code),{code,quantity}]);
  async function choose(){setBusy(true);setError('');try{const {data}=await api.get('/plan-requests/quote',{params:{plan,billingCycle:cycle,addonsOnly:"true",membershipAddons:JSON.stringify(selection)}});onChoose({plan:plan as SelectedPlan['plan'],billingCycle:cycle,priceUsd:Number(data.data.monthlyUsd),membershipAddons:selection,addonsOnly:true})}catch(e:any){setError(e.response?.data?.error??'No se pudo consultar el precio.')}finally{setBusy(false)}}
  return <section className="qt-addon-section"><h2>Personaliza tu membresía</h2><p>Añade solo lo que necesitas. El importe se suma a tu mensualidad. Hoy solo pagas la ampliación hasta tu vencimiento actual, calculada por días con base de 30 días por mes. Se activa al verificar el pago.</p><div className="qt-addon-grid">{MEMBERSHIP_ADDONS.map(d=>{
    const already='feature' in d?included(d.feature):!addonLimits(plan,{})||addonLimits(plan,{})![d.resource]===null;
    const quantity=selection.find(a=>a.code===d.code)?.quantity??0;
    return <label key={d.code} className="qt-addon-card text-sm font-medium"><span><strong>{d.name}</strong><small>{d.description}</small><b>{already?'Incluido en tu plan':`€${(d.cents/100).toFixed(2)} / mes`}</b></span>{!already&&('feature' in d?<input type="checkbox" checked={quantity>0} onChange={e=>update(d.code,e.target.checked?1:0)}/>:<input aria-label={`Cantidad: ${d.name}`} type="number" min={0} max={100} step={1} value={quantity} onChange={e=>update(d.code,Number(e.target.value))}/>)}</label>
  })}</div><div className="qt-addon-total"><strong>Adicionales: €{monthly.toFixed(2)} / mes</strong>{base!==null&&base+monthly>=59.99&&plan!=='CONTROL'&&<p>Compara con Control (€59,99/mes): podría convenirte más. Revisa también la capacidad que necesitas.</p>}<p>El total final respeta tu tarifa acordada y los cargos pendientes. Las sedes adicionales requieren cotización.</p>{(error||validation)&&<p role="alert">{error||validation}</p>}<button disabled={busy||!!validation} onClick={choose}>{busy?'Consultando…':'Revisar total y continuar'}</button></div></section>;
}
