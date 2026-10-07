import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Search, Send, CheckCircle2 } from 'lucide-react';
import { masterApi } from '@/api/client';

type Notice = { email?:string|null; emailStatus?:string|null; emailError?:string|null; deliveryDay?:string|null; id:string; status:string; message:string; phone:string; amount:string; currency:string; createdAt:string; error:string|null; expiresAt:string };
type Local = { email:string; billingNoticesEnabled:boolean; isActive:boolean; id:string; name:string; contactName:string; phone:string; monthly:string|null; agreedMonthly:string|null; amount:string|null; currency:string; periodEnd:string; reason:string; months:number; partial:boolean; segments:number; paymentUrl:string };
type Detail = Local & { history:Notice[]; configured:boolean };
const labels:Record<string,string> = {SKIPPED:'Omitido · ya hubo un intento hoy',DRAFT:'Por confirmar',SENDING:'En proceso · no reenviar sin verificar',ACCEPTED:'Aceptado por el proveedor',FAILED:'No enviado',UNKNOWN:'Sin confirmación · revisar proveedor'};
const errorText=(e:unknown)=> (e as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'No se pudo completar la operación. Intenta de nuevo.';
const field='w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900';
const primary='inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40';
const date=(v:string)=>new Date(v).toLocaleDateString('es-VE',{timeZone:'America/Caracas'});
export default function MasterBillingNoticesPage(){
  const detailRef=useRef<HTMLElement>(null);
  const [q,setQ]=useState(''),[page,setPage]=useState(1),[rows,setRows]=useState<Local[]>([]),[total,setTotal]=useState(0);
  const [status,setStatus]=useState('active'),[phoneFilter,setPhoneFilter]=useState('all');
  const [automatic,setAutomatic]=useState(false);
  const [configured,setConfigured]=useState(true),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState<Detail|null>(null),[draft,setDraft]=useState<Notice|null>(null);
  const [email,setEmail]=useState('');
  const [name,setName]=useState(''),[phone,setPhone]=useState(''),[agreed,setAgreed]=useState(''),[dirty,setDirty]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{
    let alive=true;
    const timer=setTimeout(()=>{setLoading(true);masterApi.get('/master/billing-notices',{params:{q,page,status,phone:phoneFilter}}).then(({data})=>{
      if(alive){setRows(data.data.items);setTotal(data.data.total);setConfigured(data.data.configured);setAutomatic(data.data.automationEnabled);}
    }).catch(e=>{if(alive)setError(errorText(e));}).finally(()=>{if(alive)setLoading(false);});},200);
    return()=>{alive=false;clearTimeout(timer);};
  },[q,page,status,phoneFilter,refresh]);
  function fill(d:Detail){setSelected(d);setName(d.contactName);setPhone(d.phone);setEmail(d.email??'');setAgreed(d.agreedMonthly??'');setDirty(false);setDraft(null);}
  async function run(fn:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(errorText(e));}finally{setBusy(false);}}
  function edit(fn:()=>void){fn();setDirty(true);setDraft(null);}
  return <main className="mx-auto max-w-7xl space-y-6 text-slate-900">
    <header><p className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-widest text-brand-500 text-xs"><BellRing size={16}/> Suscripciones</p><h1 className="text-2xl font-semibold tracking-tight">Avisos de cobro</h1><p className="mt-2 text-gray-900 text-base">Recordatorios por SMS con el nombre del responsable y el enlace para renovar.</p></header>
    <div className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900"><strong>{automatic?'Envío automático activo':'Envío automático inactivo en este entorno'}</strong><p className="mt-1 text-base">Solo para locales activos: desde dos días antes del vencimiento, un aviso diario a partir de las 9:00 a. m. (Venezuela), hasta renovar. Los pagos completos en revisión pausan los avisos.</p><p className="mt-1 text-xs">Guarda un celular válido del responsable en cada local. Puedes revisar los envíos en su historial.</p></div>
    {!configured&&<p role="status" className="rounded-2xl bg-amber-50 p-4 text-amber-900 text-base">El proveedor SMS no está configurado en este entorno. Puedes preparar avisos; el envío no está disponible.</p>}
    {error&&<p role="alert" className="rounded-2xl bg-red-50 p-4 text-red-700 text-base">{error}</p>}
    {notice&&<p role="status" className="flex items-center gap-2 rounded-2xl bg-blue-50 p-4 text-blue-800 text-base"><CheckCircle2 size={18}/>{notice}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(350px,.85fr)]">
      <section className="min-w-0 space-y-4">
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium"><Search size={18} className="text-slate-400"/><input aria-label="Buscar local o responsable" className="w-full bg-transparent outline-none text-base" placeholder="Buscar local, responsable o teléfono…" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}}/></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-gray-700 text-sm font-medium">Estado del local<select aria-label="Estado del local" className={`${field} mt-1.5`} value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(1);setSelected(null);setDraft(null);}}><option value="active">Activos</option><option value="inactive">Desactivados</option><option value="all">Todos los estados</option></select></label>
          <label className="text-gray-700 text-sm font-medium">Teléfono de cobro<select aria-label="Teléfono de cobro" className={`${field} mt-1.5`} value={phoneFilter} disabled={busy} onChange={e=>{setPhoneFilter(e.target.value);setPage(1);setSelected(null);setDraft(null);}}><option value="all">Todos</option><option value="missing">Sin teléfono asignado</option></select></label>
        </div>
        {status!=='active'&&<p className="rounded-xl bg-slate-100 p-3 text-gray-500 text-xs">Los locales desactivados son solo para consulta y actualización de datos. No reciben SMS.</p>}
        <p className="text-gray-500 text-xs">{total} locales · Ordenados por vencimiento</p>
        {loading?<p className="p-6 text-gray-900 text-base">Consultando mensualidades…</p>:rows.length===0?<p className="rounded-2xl bg-white p-6 text-gray-900 text-base">No hay locales para esta búsqueda.</p>:rows.map(r=><button key={r.id} disabled={busy} onClick={()=>void run(async()=>{const {data}=await masterApi.get(`/master/billing-notices/${r.id}`);fill(data.data);requestAnimationFrame(()=>{if(window.matchMedia('(max-width:1279px)').matches)detailRef.current?.scrollIntoView({behavior:'instant',block:'start'});});})} className={`block w-full rounded-2xl border bg-white p-5 text-left transition-colors ${selected?.id===r.id?'border-brand-500 ring-2 ring-blue-50':'border-slate-200 hover:border-blue-200'}`}>
          <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{r.name} {!r.isActive&&<span className="ml-1 text-xs font-normal text-slate-500">· Desactivado</span>}</h2><span className="text-sm font-semibold text-brand-500">{r.amount?`${r.currency} ${r.amount}`:'Revisar monto'}</span></div>
          <p className="mt-2 font-medium text-brand-500 text-xs">Avisos {r.billingNoticesEnabled?'activados':'desactivados'}</p>
          <p className="mt-2 text-gray-900 text-base">{r.contactName||'Sin responsable'} · {r.phone||'Sin celular de cobro'}</p>
          <p className="mt-2 text-gray-500 text-xs">Vence {date(r.periodEnd)} · {r.partial?'Saldo por completar':r.months===1?'Mensualidad':`Ciclo de ${r.months} meses`}</p>
          <p className="mt-1 text-gray-500 text-xs">{r.email||'Sin correo de cobro'}</p>
          {r.reason&&<p className="mt-2 text-amber-700 text-xs">{r.reason}</p>}
        </button>)}
        <div className="flex items-center justify-between text-sm"><button disabled={page===1||loading} className="rounded-lg px-3 py-2 disabled:opacity-40" onClick={()=>setPage(p=>p-1)}>Anterior</button><span>Página {page}</span><button disabled={page*20>=total||loading} className="rounded-lg px-3 py-2 disabled:opacity-40" onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
      </section>
      <section ref={detailRef} className="min-w-0 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
        {!selected?<div className="py-12 text-center"><BellRing className="mx-auto mb-4 text-brand-500" size={30}/><h2 className="font-semibold">Prepara un aviso</h2><p className="mt-2 text-gray-900 text-base">Selecciona un local para revisar el contacto, la mensualidad y el SMS.</p></div>:<>
          <div className="mb-5 flex flex-wrap justify-between gap-2"><h2 className="text-lg font-semibold">{selected.name}</h2><Link className="text-sm text-brand-500" to={`/master/restaurants/${selected.id}`}>Ver ficha del local</Link></div>
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
            <div><p className="font-semibold text-base">Aviso de cobro por SMS</p><p className="mt-1 text-gray-500 text-xs">{selected.billingNoticesEnabled?'Activado. Se envía por SMS (y correo si está configurado) cuando corresponde al vencimiento.':'Desactivado. Este local no recibe avisos de cobro por SMS.'}</p></div>
            <button type="button" role="switch" aria-label={`Aviso de cobro por SMS de ${selected.name}`} aria-checked={selected.billingNoticesEnabled} disabled={busy} onClick={()=>void run(async()=>{
              const {data}=await masterApi.patch(`/master/billing-notices/${selected.id}/enabled`,{enabled:!selected.billingNoticesEnabled});
              setSelected(data.data);setDraft(null);setRefresh(n=>n+1);
              setNotice(data.data.billingNoticesEnabled?'Aviso de cobro por SMS activado.':'Aviso de cobro por SMS desactivado.');
            })} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-40 ${selected.billingNoticesEnabled?'bg-brand-500':'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${selected.billingNoticesEnabled?'left-1 translate-x-5':'left-1'}`}/></button>
          </div>
          <form className="space-y-4" onSubmit={e=>{e.preventDefault();void run(async()=>{const {data}=await masterApi.patch(`/master/billing-notices/${selected.id}/contact`,{name,phone,email,agreedMonthly:agreed.trim()?Number(agreed):null});fill(data.data);setRefresh(n=>n+1);setNotice('Contacto y mensualidad acordada guardados.');});}}>
            <label className="block text-sm font-medium">Nombre del responsable<input required maxLength={80} className={`${field} mt-1.5`} value={name} onChange={e=>edit(()=>setName(e.target.value))}/></label>
            <label className="block text-sm font-medium">Celular para SMS<input required type="tel" placeholder="0414 123 4567" maxLength={30} className={`${field} mt-1.5`} value={phone} onChange={e=>edit(()=>setPhone(e.target.value))}/><span className="mt-1 block text-xs text-slate-500">Usa el número de quien paga la membresía, no el de atención al cliente.</span></label>
            <label className="block text-sm font-medium">Correo de cobro (opcional)<input type="email" maxLength={254} placeholder="nombre@negocio.com" className={`${field} mt-1.5`} value={email} onChange={e=>edit(()=>setEmail(e.target.value))}/><span className="mt-1 block text-xs text-slate-500">Recibirá también el recordatorio y el enlace de pago. El interruptor de avisos controla ambos canales.</span></label>
            <label className="block text-sm font-medium">Mensualidad base acordada ({selected.currency})<input type="number" min="0.01" max="1000000" step="0.01" placeholder="Usar tarifa del plan" className={`${field} mt-1.5`} value={agreed} onChange={e=>edit(()=>setAgreed(e.target.value))}/><span className="mt-1 block text-xs text-slate-500">Opcional. Cambia la tarifa del local en la pasarela. Los módulos y cargos adicionales se suman aparte. Vacío utiliza la tarifa del plan.</span></label>
            <button className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm disabled:opacity-40" disabled={busy||!dirty}>Guardar datos</button>
          </form>
          <div className="my-5 space-y-2 rounded-2xl bg-blue-50 p-4 text-sm"><div className="flex justify-between gap-2"><span>Mensualidad con adicionales</span><strong>{selected.monthly?`${selected.currency} ${selected.monthly}`:'Por revisar'}</strong></div><div className="flex justify-between gap-2"><span>{selected.partial?'Saldo a completar':'Total a cancelar'}</span><strong>{selected.amount?`${selected.currency} ${selected.amount}`:'Por revisar'}</strong></div><p className="text-gray-500 text-xs">Incluye el ciclo contratado y cargos pendientes que corresponden en la pasarela. Vencimiento: {date(selected.periodEnd)}.</p></div>
          {selected.reason&&<p className="mb-4 text-amber-700 text-base">{selected.reason}</p>}
          {dirty&&<p className="mb-4 text-gray-500 text-xs">Guarda los cambios antes de preparar el mensaje.</p>}
          {!draft?<button className={primary} disabled={busy||dirty||!!selected.reason} onClick={()=>void run(async()=>{const {data}=await masterApi.post(`/master/billing-notices/${selected.id}/preview`);setDraft(data.data);})}>Vista previa del SMS</button>:<div className="space-y-4 border-t border-slate-100 pt-5">
            <h3 className="font-semibold">¿Enviar este aviso?</h3>{draft.email&&<p className="text-gray-900 text-base">También se enviará por correo a {draft.email}.</p>}<p className="text-gray-500 text-xs">Para {draft.phone} · {selected.segments} segmento(s) estimados</p><p className="break-words whitespace-pre-wrap rounded-2xl bg-slate-100 p-4 leading-relaxed text-base">{draft.message}</p><p className="text-gray-500 text-xs">Se descontará del saldo del proveedor SMS. La aceptación no confirma la recepción en el teléfono.</p>
            <button className={primary} disabled={busy||!selected.configured} onClick={()=>void run(async()=>{const {data}=await masterApi.post(`/master/billing-notices/messages/${draft.id}/send`,{confirmed:true});const sent=data.data as Notice;const next=await masterApi.get(`/master/billing-notices/${selected.id}`);fill(next.data.data);setNotice(sent.status==='ACCEPTED'?'SMS aceptado por el proveedor. Puedes consultar el registro abajo.':sent.error??labels[sent.status]);})}><Send size={16}/>{busy?'Procesando…':'Confirmar y enviar aviso'}</button><button disabled={busy} className="ml-3 text-sm text-slate-500" onClick={()=>setDraft(null)}>Cancelar</button>
          </div>}
          <div className="mt-7 border-t border-slate-100 pt-5"><h3 className="font-semibold">Historial de avisos</h3><p className="mt-1 text-gray-500 text-xs">Últimos 30 registros. No se repite un intento automático en el mismo día; el siguiente recordatorio corresponde al día siguiente.</p>{selected.history.length===0?<p className="mt-4 text-gray-900 text-base">Todavía no hay envíos.</p>:selected.history.map(h=><details key={h.id} className="mt-3 rounded-xl border border-slate-100 p-3 text-sm"><summary className="cursor-pointer">{new Date(h.createdAt).toLocaleString('es-VE',{timeZone:'America/Caracas'})} · {labels[h.status]??h.status}</summary><p className="mt-2 text-gray-500 text-xs">{h.deliveryDay?'Automático · ':'Manual · '}{h.phone} · {h.currency} {h.amount}</p><p className="mt-2 break-words text-base">{h.message}</p>{h.email&&<p className="mt-2 text-xs">Correo: {h.email} · {labels[h.emailStatus??'']??h.emailStatus??'Sin intento registrado'}{h.emailError&&` · ${h.emailError}`}</p>}{h.error&&<p className="mt-2 text-amber-700 text-base">{h.error}</p>}</details>)}</div>
        </>}
      </section>
    </div>
  </main>;
}
