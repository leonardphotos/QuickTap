import { COMMERCIAL_PLANS, isCommercialPlan } from './commercial-plans';
export const MEMBERSHIP_ADDONS = [
  { code:'administration', name:'Administración', cents:700, feature:'administration', description:'Gastos y reportes administrativos.' },
  { code:'inventoryBasic', name:'Inventario básico', cents:500, feature:'inventoryBasic', description:'Existencias y control de stock.' },
  { code:'inventoryRecipe', name:'Recetas y costos', cents:800, feature:'inventoryRecipe', description:'Recetas y consumo de ingredientes. Requiere inventario básico.' },
  { code:'accounting', name:'Finanzas avanzadas', cents:1200, feature:'accounting', description:'Movimientos, proveedores, bancos y cuentas por cobrar.' },
  { code:'crm', name:'Gestión de clientes', cents:400, feature:'crm', description:'Clientes, segmentos y promociones.' },
  { code:'users', name:'Usuario adicional', cents:200, resource:'users', units:1, description:'Un usuario activo adicional.' },
  { code:'products', name:'100 productos adicionales', cents:300, resource:'products', units:100, description:'Amplía la capacidad del catálogo.' },
  { code:'tables', name:'10 mesas adicionales', cents:300, resource:'tables', units:10, description:'Amplía la capacidad de mesas.' },
  { code:'kitchens', name:'Estación de cocina adicional', cents:300, resource:'kitchens', units:1, description:'Una estación de cocina o impresión adicional.' },
] as const;
export type AddonSelection = {code:string; quantity:number}[];
export type AddonSnapshot = {code:string; quantity:number; monthlyCents:number}[];
export function readAddons(terms: unknown): AddonSnapshot {
  const value = (terms as {addons?:unknown} | null)?.addons;
  if (!Array.isArray(value)) return [];
  return value.filter((a): a is AddonSnapshot[number] => !!a && typeof a.code==='string' && MEMBERSHIP_ADDONS.some(d=>d.code===a.code) && Number.isInteger(a.quantity) && a.quantity>0 && Number.isInteger(a.monthlyCents) && a.monthlyCents>=0);
}
export function addonFeature(terms:unknown, feature:string):boolean {
  return readAddons(terms).some(a => a.code===feature || (a.code==='accounting' && ['accountsPayable','administration'].includes(feature)));
}
export function addonLimits(plan:string, terms:unknown) {
  if(plan==='DELIVERY'||plan==='DELIVERY_SUCURSALES'){const extra=readAddons(terms).filter(a=>a.code==='users').reduce((s,a)=>s+a.quantity,0);return {name:'Delivery',users:6+extra,tables:null,products:null,kitchens:null,sites:null}}
  if(!isCommercialPlan(plan))return null;
  const limits:{name:string;users:number|null;tables:number|null;products:number|null;kitchens:number|null;sites:number}= {...COMMERCIAL_PLANS[plan]};
  for(const a of readAddons(terms)) {
    const def=MEMBERSHIP_ADDONS.find(d=>d.code===a.code)!;
    if('resource' in def && limits[def.resource]!==null) limits[def.resource]=(limits[def.resource]??0)+def.units*a.quantity;
  }
  return limits;
}
export function addonMonthlyCents(terms:unknown){return readAddons(terms).reduce((s,a)=>s+a.monthlyCents,0)}
/** Fuente autoritativa: nunca acepta precios ni permisos enviados por el cliente. */
export function priceAddons(plan:string, selection:AddonSelection, included:(feature:string)=>boolean, previous:unknown={}):AddonSnapshot {
  if(selection.length>MEMBERSHIP_ADDONS.length)throw new Error('Demasiados adicionales.');
  const seen=new Set<string>();
  const result:AddonSnapshot=[];
  for(const a of selection){
    const def=MEMBERSHIP_ADDONS.find(d=>d.code===a.code);
    if(!def||seen.has(a.code)||!Number.isInteger(a.quantity)||a.quantity<0||a.quantity>100)throw new Error('Adicional o cantidad inválida.');
    seen.add(a.code);if(!a.quantity)continue;
    if('feature' in def){if(a.quantity!==1)throw new Error('Cada módulo se contrata una vez.');if(included(def.feature) || (def.feature==='administration' && selection.some(x=>x.code==='accounting'&&x.quantity===1)))continue;}
    if('resource' in def && (!addonLimits(plan,{})||addonLimits(plan,{})![def.resource]===null))continue;
    const old=readAddons(previous).find(x=>x.code===a.code && x.quantity===a.quantity);
    result.push({code:a.code,quantity:a.quantity,monthlyCents:old?.monthlyCents??def.cents*a.quantity});
  }
  if(result.some(a=>a.code==='inventoryRecipe')&&!included('inventoryBasic')&&!result.some(a=>a.code==='inventoryBasic'))throw new Error('Recetas y costos requiere Inventario básico.');
  return result;
}
