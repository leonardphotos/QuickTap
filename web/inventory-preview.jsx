// Vista local aislada: ninguna escritura llega a la API real.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AuthContext} from './src/context/AuthContext.shared';
import {api} from './src/api/client';
import InventoryPage from './src/pages/admin/InventoryPage';
import './src/index.css';
const categories=[{id:'proteinas',name:'Proteínas',priority:0},{id:'secos',name:'Insumos secos',priority:1}];
const items=[['Lomito','kg',12,5,14,'proteinas'],['Pollo','kg',3,5,5,'proteinas'],['Camarones','kg',0,2,18,'proteinas'],['Arroz sushi','kg',20,5,3,'secos']].map(([name,unit,quantity,minQuantity,pricePerUnitBase,categoryId],i)=>({id:String(i),name,unit,quantity:String(quantity),minQuantity:String(minQuantity),pricePerUnitBase:String(pricePerUnitBase),yieldPercent:'100',correctionPercent:'0',categoryId,category:categories.find(c=>c.id===categoryId)}));
api.defaults.adapter=async config=>{
  if(config.method!=='get')throw new Error('Vista previa: los cambios no se guardan.');
  let result=[];
  if(config.url==='/inventory')result=config.params?.locationScope==='CASA_MATRIZ'?items.map(i=>({...i,quantity:'30'})):items;
  if(config.url==='/inventory/categories')result=categories;
  if(config.url==='/chef-recipes/access')result={url:'http://localhost:5198/inventory-preview.html',code:'DEMO01',expiresAt:Date.now()+300000,refreshEverySeconds:300};
  return {data:{data:result},status:200,statusText:'OK',headers:{},config};
};
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthContext.Provider value={{restaurant:{name:'Restaurante de ejemplo',subscriptionPlan:'CONTROL',baseCurrency:'USD',casaMatrizEnabled:true,modifierInventoryLinkEnabled:true},refresh:async()=>{}}}><main style={{padding:16,maxWidth:1400,margin:'auto'}}><p className="mb-5 rounded-xl bg-accent p-3 text-sm text-brand-950">Vista previa · Datos ficticios. Los cambios no se guardan.</p><InventoryPage/></main></AuthContext.Provider></BrowserRouter>);
