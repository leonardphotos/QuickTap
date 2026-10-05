// Vista aislada: los cambios se simulan en memoria y desaparecen al recargar.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AuthContext} from './src/context/AuthContext.shared';
import {api} from './src/api/client';
import KitchenPage from './src/pages/admin/KitchenPage';
import './src/index.css';
const kitchens=[{id:'1',name:'Cocina principal',priority:0},{id:'2',name:'Barra',priority:1}];
let orders=[0,1,2].map((n)=>({id:String(n),orderNumber:142+n,status:'KITCHEN',channel:n===1?'DELIVERY':'DINE_IN',table:{number:String(n+1)},customerName:['María González','Carlos Mendoza','Ana Pérez'][n],createdAt:new Date(Date.now()-(n+1)*7*60000).toISOString(),items:[{id:'item-'+n,productName:['Hamburguesa de la casa','Pollo crocante','Lomito al grill'][n],quantity:n===0?2:1,modifiers:[],note:n===0?'Sin cebolla. Salsa aparte.':'',kitchenName:'Cocina principal',kitchenBatch:1,kitchenStartedAt:n===1?new Date().toISOString():null},{id:'side-'+n,productName:'Papas fritas',quantity:1,modifiers:[],kitchenName:'Cocina principal',kitchenBatch:1}]}));
api.defaults.adapter=async config=>{
  if(config.method!=='get') {
    const id=config.url.split('/')[2];const body=JSON.parse(config.data||'{}');
    orders=orders.map(o=>o.id===id?{...o,items:o.items.map(i=>({...i,...(config.url.endsWith('kitchen-start')?{kitchenStartedAt:new Date().toISOString()}:{}),...(config.url.endsWith('kitchen-ready')?{kitchenReadyAt:new Date().toISOString()}: {})})),...(body.status?{status:body.status}:{})}:o).filter(o=>o.status!=='CANCELLED');
  }
  return {data:{data:config.url==='/kitchens'?kitchens:orders},status:200,statusText:'OK',headers:{},config};
};
function simulateArrival() {
  const id=crypto.randomUUID();
  orders=[...orders,{...orders[0],id,orderNumber:200+orders.length,createdAt:new Date().toISOString(),items:[{id:'new-'+id,productName:'Hamburguesa recién comandada',quantity:2,modifiers:[],kitchenName:'Cocina principal',kitchenBatch:1}]}];
  // Reutiliza la actualización al volver a la pestaña, sin un servidor ni pedidos reales.
  document.dispatchEvent(new Event('visibilitychange'));
}
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthContext.Provider value={{user:{role:'OWNER'},restaurant:{name:'Restaurante de ejemplo'}}}><main style={{padding:16,maxWidth:1500,margin:'auto'}}><p className="mb-5 rounded-xl bg-accent p-3 text-sm text-brand-950">Vista previa · Comandas ficticias. No afecta pedidos reales; la conexión en vivo no se simula.</p><button className="mb-4 rounded-xl bg-brand-500 px-4 py-3 text-white" onClick={simulateArrival}>Simular nueva comanda</button><KitchenPage/></main></AuthContext.Provider></BrowserRouter>);
