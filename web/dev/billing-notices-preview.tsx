import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {MasterAuthContext} from '../src/context/MasterAuthContext.shared';
import MasterLayout from '../src/pages/master/MasterLayout';
import MasterAppsPage from '../src/pages/master/MasterAppsPage';
import MasterSummaryPage from '../src/pages/master/MasterSummaryPage';
import {api,masterApi} from '../src/api/client';
import MasterBillingNoticesPage from '../src/pages/master/MasterBillingNoticesPage';
import '../src/index.css';
if(!import.meta.env.DEV)throw new Error('Solo desarrollo.');
const local={isActive:true,id:'demo',name:'Restaurante de ejemplo',contactName:'María',phone:'04141234567',monthly:'39.99',amount:'39.99',agreedMonthly:null as string|null,currency:'EUR',months:1,partial:false,periodEnd:'2026-10-05T12:00:00Z',reason:'',segments:3,paymentUrl:'https://quicktap.club/admin/billing?renew=1&local=restaurante-ejemplo'};
api.defaults.adapter=async config=>({data:{data:{USD:{rateBs:100},EUR:{rateBs:110}}},status:200,statusText:'OK',headers:{},config});
let history:Record<string,unknown>[]=[];
masterApi.defaults.adapter=async config=>{
 let data:unknown;
 if((config.url==='/master/summary'||config.url==='/master/summary/live'))data={month:{revenueUsd:'2450',revenueBs:'245000'},quickTap:{revenueUsd:'940',revenueBs:'94000'},restaurantOwners:25,totalRestaurants:28,activeRestaurants:25,newSignupsToday:2,ordersAllTime:4850,ordersAllTimeUsd:'89000',ordersAllTimeBs:'8900000'};
 else if(config.url==='/master/administration/recurring')data={expenses:[],alerts:[],monthlyBudgetEur:80,dueSoonEur:0,overdueEur:0,pendingEur:0};
 else if(config.url==='/master/plan-requests'||config.url==='/master/qr-nfc-requests')data=[];
 else if(config.url==='/master/server-status')data=null;
 else if(config.url==='/master/summary/sms-balance')data={disponible:true,balanceUsd:8,smsRestantes:400};
 else if(config.url==='/master/billing-notices')data={items:config.params?.status==='inactive'||config.params?.phone==='missing'?[]:[local],total:config.params?.status==='inactive'||config.params?.phone==='missing'?0:1,page:1,configured:true,automationEnabled:true};
 else if(config.url?.endsWith('/contact')){const form=JSON.parse(config.data);local.contactName=form.name;local.phone=form.phone;local.agreedMonthly=form.agreedMonthly?.toFixed(2)??null;local.monthly=local.amount=local.agreedMonthly??'39.99';data={...local,history,configured:true,automationEnabled:true};}
 else if(config.url?.endsWith('/preview'))data={id:'preview',phone:local.phone,amount:local.amount,currency:'EUR',status:'DRAFT',message:`QuickTap- Hola ${local.contactName}, ingresa al siguiente link para cancelar la mensualidad del sistema: ${local.paymentUrl}`,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()};
 else if(config.url?.endsWith('/send')){const sent={id:'preview',phone:local.phone,amount:local.amount,currency:'EUR',status:'ACCEPTED',message:'SIMULACIÓN: no se envió ningún SMS.',createdAt:new Date().toISOString(),error:null};history=[sent];data=sent;}
 else data={...local,history,configured:true,automationEnabled:true};
 return {data:{data},status:200,statusText:'OK',headers:{},config};
};
createRoot(document.getElementById('root')!).render(<MasterAuthContext.Provider value={{admin:{id:'demo',name:'Equipo QuickTap',email:'demo@example.com',role:'ADMIN'},loading:false,login:async()=>{},logout:()=>{}}}><MemoryRouter initialEntries={['/master/apps']}><Routes><Route path="/master" element={<MasterLayout/>}><Route path="apps" element={<MasterAppsPage/>}/><Route path="summary" element={<MasterSummaryPage/>}/><Route path="billing-notices" element={<MasterBillingNoticesPage/>}/><Route path="*" element={<p className="rounded-2xl bg-white p-6">Vista previa de navegación. Solo Resumen y Avisos de cobro tienen datos ficticios.</p>}/></Route></Routes><div className="fixed bottom-3 right-3 z-40 rounded-full bg-amber-100 px-3 py-2 text-xs text-amber-900">Demostración · no envía SMS</div></MemoryRouter></MasterAuthContext.Provider>);
