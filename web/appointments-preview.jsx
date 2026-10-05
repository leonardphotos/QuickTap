// Vista aislada en memoria. No envía citas, pagos ni perfiles a ningún negocio real.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {AuthContext} from './src/context/AuthContext.shared';
import {api} from './src/api/client';
import AppointmentWorkspace from './src/pages/admin/appointments/AppointmentWorkspace';
import './src/index.css';
const services=[{id:'s1',name:'Consulta inicial',description:'Un primer encuentro para conocerte y definir el mejor acompañamiento.',durationMinutes:60,price:'45',color:'#009ff5',locationMode:'IN_PERSON',isActive:true},{id:'s2',name:'Sesión de seguimiento',description:'Continuamos trabajando en tus objetivos.',durationMinutes:45,price:'35',color:'#00b889',isActive:true}];
const professionals=[{id:'p1',name:'Ana Martínez',specialty:'Psicología clínica',description:'Acompañamiento cercano, centrado en tu bienestar y crecimiento personal.',isActive:true,color:'#009ff5',services:[{serviceId:'s1'},{serviceId:'s2'}],availability:[{id:'h1',dayOfWeek:1,startTime:'09:00',endTime:'17:00'}]},{id:'p2',name:'Carlos Mendoza',specialty:'Consultoría profesional',description:'Te ayudo a convertir tus próximos pasos en un plan claro.',isActive:true,color:'#009ff5',services:[{serviceId:'s1'}],availability:[]}];
let appointments=Array.from({length:4},(_,i)=>({id:'a'+i,customerName:['María González','Luis Pérez','Carolina Torres','José Ramírez'][i],customerPhone:'00000000',status:i===1?'REQUESTED':'CONFIRMED',startsAt:new Date(Date.now()+(i+1)*3600000).toISOString(),priceSnapshot:'45',service:services[0],professional:professionals[i%2],payments:i===0?[{id:'pay1',amount:'15',method:'Transferencia',reference:'DEMO-001',paidAt:new Date().toISOString()}]:[]}));
let settings={timezone:'America/Caracas',slotIntervalMinutes:15,minNoticeMinutes:120,maxAdvanceDays:90,requireManualApproval:true,primaryColor:'#009ff5',accentColor:'#00b889',backgroundColor:'#f5f7fb',collectIdNumber:false,collectNotes:true,cancellationNoticeHours:24};
let team=[];
api.defaults.adapter=async config=>{
 const body=typeof config.data==='string'?JSON.parse(config.data):{};let result;
 if(config.url.endsWith('/slots'))result=[9,10,11,14,15].map(h=>({startsAt:`${config.params.from}T${String(h).padStart(2,'0')}:00:00-04:00`}));
 else if(config.url==='/appointments/google/status')result=[];
 else if(config.url==='/appointments/google/connect')throw new Error('Google no está disponible en esta vista de prueba.');
 else if(config.url==='/products/upload-photo'||config.url==='/appointments/cover')throw new Error('Las fotos deben cargarse desde el panel real.');
 else if(config.url==='/team'&&config.method==='get')result=team;
 else if(config.url==='/team'&&config.method==='post'){team.push({id:crypto.randomUUID(),name:body.name,email:body.email,role:body.role,isActive:true});result=team.at(-1);}
 else if(config.url?.startsWith('/team/')&&config.method==='patch'){const member=team.find(item=>config.url.endsWith(item.id));if(member)Object.assign(member,body);result=member;}
 else if(config.url?.endsWith('/reset-password'))result={temporaryPassword:'Ejemplo1234'};
 else {
  if(config.method==='post'&&config.url==='/appointments')appointments.push({...body,id:crypto.randomUUID(),status:'CONFIRMED',service:services.find(s=>s.id===body.serviceId),professional:professionals.find(p=>p.id===body.professionalId),priceSnapshot:'45',payments:[]});
  else if(config.method==='patch'){const a=appointments.find(a=>config.url.endsWith(a.id));if(a)Object.assign(a,body);}
  else if(config.url.endsWith('/payments')&&config.method==='post'){const a=appointments.find(a=>config.url.includes(a.id));a.payments.push({...body,id:crypto.randomUUID(),paidAt:new Date().toISOString()});}
  else if(config.url.includes('/professionals')&&config.method!=='get'){const p={...body,services:body.serviceIds.map(serviceId=>({serviceId})),availability:[]};if(config.method==='post')professionals.push({...p,id:crypto.randomUUID()});else Object.assign(professionals.find(p=>config.url.endsWith(p.id)),p);}
  else if(config.url.includes('/services')&&config.method!=='get'){if(config.method==='post')services.push({...body,id:crypto.randomUUID()});else Object.assign(services.find(s=>config.url.endsWith(s.id)),body);}
  else if(config.url==='/appointments/settings')settings={...settings,...body};
  result={appointments,services,professionals,settings,paymentsTotal:appointments.reduce((s,a)=>s+a.payments.reduce((sum,p)=>sum+Number(p.amount),0),0)};
 }
 return {data:{data:structuredClone(result)},status:200,statusText:'OK',headers:{},config};
};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin/citas/resumen']}><AuthContext.Provider value={{user:{role:'OWNER'},restaurant:{name:'Espacio Bienestar',slug:'demo-citas',baseCurrency:'USD'},logout:()=>{}}}><div style={{padding:8,textAlign:'center',background:'#dff2ff',color:'#06436b',fontSize:12}}>Vista previa · Datos ficticios · Los cambios se reinician al recargar</div><AppointmentWorkspace/></AuthContext.Provider></MemoryRouter>);
