import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
interface Result { printer: string; kitchen: string; status: string; error?: string }
interface Job { id: string; restaurantName: string; orderNumber: number; kind: string; createdAt: string; items: {name:string;quantity:number;kitchenName:string|null}[]; deliveries: {id:string;stationId:string;status:string;error?:string;updatedAt:string;results:Record<string,Result>}[] }
interface Station { id:string; name:string; restaurantName:string; platform:string; online:boolean; socketOnline:boolean; autoPrint:boolean; lastSeenAt:string; printers:{id:string;name:string;driver:string|null;kind:string;configured:boolean;assignments:string[]}[] }
const labels: Record<string,string> = { PROCESSING:'En curso / pendiente de confirmación', ACCEPTED:'Aceptado por el controlador', FAILED:'Falló', UNCONFIRMED:'Revisar papel: sin confirmación', STARTED:'Enviado: resultado pendiente' };
export default function MasterPrintingPage(){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [stations,setStations]=useState<Station[]>([]);
  const [q,setQ]=useState(''),[number,setNumber]=useState(''),[page,setPage]=useState(1);
  const [error,setError]=useState(''),[updated,setUpdated]=useState('');
  useEffect(()=>{
    let alive=true,loading=false;
    async function load(){if(loading)return;loading=true;try{
      const [response,registry]=await Promise.all([masterApi.get('/master/printing',{params:{q,orderNumber:number||undefined,page}}),masterApi.get('/master/printing/stations',{params:{q}})]);
      if(alive){setJobs(response.data.data);setStations(registry.data.data);setError('');setUpdated(new Date().toLocaleTimeString('es-VE'));}
    }catch{if(alive)setError('No se pudo actualizar el monitor. Los datos visibles pueden estar desactualizados.');}finally{loading=false;}}
    void load();const interval=setInterval(load,15000);return()=>{alive=false;clearInterval(interval);};
  },[q,number,page]);
  return <main className="space-y-5">
    <header><h1 className="text-2xl font-semibold">Monitor de impresión</h1><p className="mt-2 opacity-70 text-base">Comandas y notas de entrega por local, estación e impresora. Actualizado: {updated||'cargando…'}</p></header>
    <div className="rounded-xl border border-blue-300/30 bg-brand-500/10 p-4 text-sm">“Aceptado” confirma la respuesta del controlador, no que el papel salió físicamente. Los envíos interrumpidos requieren revisión. El historial comienza al activar esta función; las estaciones antiguas no informan resultados. Los envíos pendientes desde el registro de la estación se recuperan al reconectar, aunque hayan pasado más de 10 minutos. Los anteriores a esta actualización se conservan para revisión manual.</div>
    <div className="flex flex-wrap gap-3">
      <input aria-label="Buscar restaurante" placeholder="Restaurante" className="rounded-xl border p-3 bg-transparent text-base" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/>
      <input aria-label="Número de pedido" placeholder="Pedido, ej. 338" inputMode="numeric" className="rounded-xl border p-3 bg-transparent text-base" value={number} onChange={e=>{setNumber(e.target.value.replace(/\D/g,''));setPage(1);}}/>
    </div>
    {error&&<p role="alert" className="text-red-500 text-base">{error}</p>}
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Estaciones e impresoras registradas</h2>
      <p className="opacity-70 text-base">Últimas 200 estaciones. La conexión corresponde a la estación; no confirma papel, tinta ni conexión física de la impresora.</p>
      {!stations.length&&<p className="opacity-70 text-base">Aparecerán al abrir o actualizar la estación de impresión.</p>}
      <div className="grid gap-3 lg:grid-cols-2">{stations.map(station=><article key={station.id} className="min-w-0 rounded-2xl border border-white/15 p-4">
        <div className="flex flex-wrap justify-between gap-2"><strong>{station.restaurantName}</strong><span className={station.online?'text-emerald-500':'text-amber-500'}>{station.online?'Conectada':'Sin conexión reciente'}</span></div>
        <p className="mt-1 text-base">{station.name} · {station.platform}</p>
        <p className="opacity-60 mt-1 text-xs">Última señal: {new Date(station.lastSeenAt).toLocaleString('es-VE')} · Automática: {station.autoPrint?'sí':'no'} · Canal en tiempo real: {station.online&&station.socketOnline?'conectado':'sin confirmar'}</p>
        {!station.printers.length&&<p className="mt-3 text-amber-500 text-base">Sin impresoras configuradas.</p>}
        {station.printers.map(printer=><div key={printer.id} className="mt-3 rounded-xl bg-black/5 p-3 text-sm break-words">
          <strong>{printer.name}</strong>{!printer.configured&&<span className="text-amber-500"> · Retirada de esta estación</span>}
          <p className="opacity-70 text-base">{printer.kind==='serial'?'Conexión serial':printer.driver||'Controlador del sistema'}</p>
          <p>{printer.assignments.length?printer.assignments.join(' · '):'Sin asignaciones específicas'}</p>
        </div>)}
      </article>)}</div>
    </section>
    <h2 className="text-lg font-semibold">Historial de envíos</h2>
    {!jobs.length&&!error&&<p>No hay envíos registrados con estos filtros. No significa que pedidos anteriores no se hayan impreso.</p>}
    {jobs.map(job=><section key={job.id} className="rounded-2xl border border-white/15 bg-white/5 p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{job.restaurantName} · Pedido #{job.orderNumber}</h2><span className="text-xs opacity-60">{new Date(job.createdAt).toLocaleString('es-VE')} · {job.kind==='recibo'?'Nota de entrega':job.kind==='comanda-adicion'?'Agregado':'Comanda'}</span></div>
      <details><summary className="cursor-pointer text-sm">Productos del envío</summary><ul className="mt-2 text-sm">{job.items.map((item,i)=><li key={i}>{item.quantity} × {item.name} · {item.kitchenName||'Sin cocina'}</li>)}</ul></details>
      {!job.deliveries.length&&<p className="text-amber-500 text-base">Pendiente: ninguna estación confirmó recepción.</p>}
      {job.deliveries.map(d=><div key={d.id} className="border-t border-white/10 pt-3 text-sm">
        <p className={d.status==='FAILED'?'text-red-500':d.status==='ACCEPTED'?'text-emerald-500':'text-amber-500'}>{labels[d.status]||d.status} · Estación {d.stationId.slice(0,8)}</p>
        {d.status==='PROCESSING'&&Date.now()-new Date(d.updatedAt).getTime()>120000&&<p className="text-amber-500 text-base">Sin respuesta reciente. Revisa la estación antes de repetir.</p>}
        {Object.entries(d.results).map(([key,r])=><div key={key} className="mt-2 rounded-lg bg-black/5 p-2"><strong>{r.printer}</strong> · {r.kitchen}<p>{labels[r.status]||r.status}</p>{r.error&&<p className="text-red-500 text-base">{r.error}</p>}</div>)}
        {d.error&&<p className="mt-2 text-red-500 text-base">{d.error}</p>}
      </div>)}
    </section>)}
    <div className="flex gap-4 items-center"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="disabled:opacity-40">Anterior</button><span>Página {page}</span><button disabled={jobs.length<50} onClick={()=>setPage(p=>p+1)} className="disabled:opacity-40">Siguiente</button></div>
  </main>;
}
