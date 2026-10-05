// Vista aislada: solo memoria local, nunca modifica reservas reales.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AuthContext} from './src/context/AuthContext.shared';
import {api} from './src/api/client';
import ReservationsPage from './src/pages/admin/ReservationsPage';
import './src/index.css';
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Caracas',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tables=Array.from({length:6},(_,i)=>({id:String(i),number:`Mesa ${i+1}`,seats:4}));
let reservations=[
  {id:'example-1',date:date+'T04:00:00.000Z',time:'19:30',partySize:4,customerName:'María González',customerIdNumber:'',customerPhone:'',tables:[tables[0]],status:'PENDING',note:'Mesa para una cena de cumpleaños.'},
  {id:'example-2',date:date+'T04:00:00.000Z',time:'20:00',partySize:2,customerName:'Carlos Mendoza',customerIdNumber:'',customerPhone:'',tables:[tables[2]],status:'CONFIRMED'},
];
api.defaults.adapter=async config=>{
  let result;
  if(config.url==='/tables/floor-plan') result={zones:[],unzoned:tables};
  else if(config.method==='post' && config.url==='/reservations') {
    const input=JSON.parse(config.data);
    result={...input,id:crypto.randomUUID(),date:input.date+'T04:00:00.000Z',status:'CONFIRMED',tables:tables.filter(t=>input.tableIds.includes(t.id))};
    reservations=[...reservations,result];
  } else if(config.method==='patch') {
    const [, ,id,action]=config.url.split('/');
    reservations=reservations.map(r=>r.id===id?{...r,status:action==='accept'?'CONFIRMED':'CANCELLED'}:r);
    result={};
  } else result=reservations;
  return {data:{data:result},status:200,statusText:'OK',headers:{},config};
};
createRoot(document.getElementById('root')).render(<BrowserRouter><AuthContext.Provider value={{user:{role:'OWNER'},restaurant:{name:'Restaurante de ejemplo'}}}><main style={{padding:16,maxWidth:1400,margin:'auto'}}><p className="mb-5 rounded-xl bg-accent p-3 text-sm text-brand-950">Vista previa · Datos ficticios. Las reservas de prueba se borran al recargar.</p><ReservationsPage/></main></AuthContext.Provider></BrowserRouter>);
