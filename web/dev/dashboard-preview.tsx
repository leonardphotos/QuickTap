import {useState,type ContextType} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {AuthContext} from '../src/context/AuthContext.shared';
import {RestaurantDesktopDashboard} from '../src/pages/admin/RestaurantDesktopDashboard';
import '../src/index.css';
import '../src/pages/admin/restaurant-calm.css';
if(!import.meta.env.DEV)throw new Error('Solo desarrollo');
const context={user:{id:'preview',name:'Alex',role:'OWNER'},restaurant:{id:'preview',slug:'casa-oliva-preview',name:'Casa Oliva',businessType:'RESTAURANT',baseCurrency:'USD',subscriptionPlan:'CONTROL',subscriptionStatus:'ACTIVE',periodEnd:new Date(Date.now()+22*86400000).toISOString(),theme:{},paymentMethodsConfig:{}}} as ContextType<typeof AuthContext>;
const summary={ordersCount:48,totalBase:'864',totalBs:'86400',currency:'USD' as const,tipBase:'42.50',avgTicketBase:'18',byHour:Array.from({length:24},(_,hour)=>({hour,totalBase:String(hour>=10&&hour<=21?[30,50,78,110,95,48,35,42,75,125,100,76][hour-10]:0),ordersCount:hour>=10&&hour<=21?4:0}))};
function Preview(){const [message,setMessage]=useState('');const explain=()=>setMessage('Esta es una vista de diseño con datos de ejemplo. Las acciones reales siguen disponibles en el panel local.');return <MemoryRouter><AuthContext.Provider value={context}><div className="restaurant-dashboard-shell rd-preview" onClickCapture={e=>{if((e.target as HTMLElement).closest('a')){e.preventDefault();e.stopPropagation();explain()}}}><aside className="rd-preview-nav"><strong>quicktap<span style={{color:'#00a5ef'}}>•</span></strong>{['Resumen','Pedidos','Mesas','Cocina','Reparto','Productos','Administración','Ajustes'].map(label=><button key={label} onClick={explain}>{label}</button>)}</aside><div className="rd-preview-label">Vista previa · Datos de ejemplo · No modifica tu restaurante</div>{message&&<p role="status" className="rd-preview-message">{message}</p>}<RestaurantDesktopDashboard previewSummary={summary} onAddExpense={explain} onAddPurchase={explain}/></div></AuthContext.Provider></MemoryRouter>}
createRoot(document.getElementById('root')!).render(<Preview/>);
