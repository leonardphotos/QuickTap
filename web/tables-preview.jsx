// Vista local aislada: datos ficticios y ninguna operación contra la API real.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AuthContext} from './src/context/AuthContext.shared';
import {api} from './src/api/client';
import TablesPage from './src/pages/admin/TablesPage';
import './src/index.css';
const zones=[{id:'salon',name:'Salón Principal'},{id:'terraza',name:'Terraza'},{id:'barra',name:'Barra'}];
const tables=Array.from({length:7},(_,i)=>({id:String(i),number:i<4?String(i+1):`Terraza-${i-3}`,zoneId:i<4?'salon':'terraza',zone:zones[i<4?0:1],qrToken:'preview-'+i,seats:4}));
api.defaults.adapter=async config=>{
  if(config.method!=='get')throw new Error('Vista previa: no se guardan cambios.');
  return {data:{data:config.url?.endsWith('/guests') ? {total:0,filtered:0,visits:0,entries:[],openSessions:[]} : config.url==='/zones'?zones:config.url==='/tables'?tables:[]},status:200,statusText:'OK',headers:{},config};
};
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthContext.Provider value={{restaurant:{slug:'vista-previa',name:'Restaurante de ejemplo'}}}><main style={{padding:24,maxWidth:1400,margin:'auto'}}><p className="mb-5 rounded-xl bg-accent p-3 text-sm text-brand-950">Vista previa con datos de ejemplo · Los cambios no se guardan.</p><TablesPage/></main></AuthContext.Provider></BrowserRouter>);
