import {useState} from 'react';
import {connectApi,type ConnectProfile} from './connect-api';
import {COMMERCIAL_PLANS} from '../../utils/commercial-plans';
import {setToken,setStoredSlug} from '../../api/client';

export default function ConnectUpgrade({profile,onDone,unsaved=false,preview=false}:{profile:ConnectProfile;onDone:()=>void;unsaved?:boolean;preview?:boolean}){
 const [plan,setPlan]=useState('ESSENTIAL'),[existing,setExisting]=useState(false),[slug,setSlug]=useState(profile.handle),[owner,setOwner]=useState(''),[email,setEmail]=useState(profile.email||''),[password,setPassword]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function upgrade(){if(preview){setError('Vista previa: no se creará ni vinculará ningún restaurante.');return;}setBusy(true);setError('');try{
  let restaurantToken:string|undefined;
  if(existing){const response=await fetch('/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,slug})});const body=await response.json();if(!response.ok)throw Error(body.error||'No se pudo verificar tu acceso.');restaurantToken=body.data.token;}
  const result=await connectApi<{token?:string;slug:string;plan:string}>('/me/upgrade','POST',{plan,confirmed,...(restaurantToken?{restaurantToken}:{slug,ownerName:owner})});setPassword('');
  if(result.token){setToken(result.token);setStoredSlug(result.slug);window.location.assign(`/admin/billing?plan=${result.plan}`);}else onDone();
 }catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <section className="connect-card"><h2>Mejorar mi menú</h2><p>Conserva tus productos, categorías, fotos y precios en USD. Tu enlace, QR y tarjeta NFC seguirán funcionando.</p>
 <label>Plan al terminar la prueba<select value={plan} onChange={e=>setPlan(e.target.value)}>{Object.entries(COMMERCIAL_PLANS).map(([id,p])=><option key={id} value={id}>{p.name} · €{p.monthly.toFixed(2)}/mes</option>)}</select></label>
 <label className="connect-check text-sm font-medium"><input type="checkbox" checked={existing} onChange={e=>setExisting(e.target.checked)}/>Ya tengo un restaurante en QuickTap</label>
 <label>{existing?'Enlace del restaurante existente':'Enlace del nuevo restaurante'}<input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="mi-restaurante"/></label>
 {existing?<><p>Los productos se añadirán al catálogo existente. Su nombre, portada y colores actuales se conservan. Debes ingresar como dueño y el restaurante debe usar USD.</p><label>Correo del dueño<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Contraseña del restaurante<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label></>:<><label>Nombre del dueño<input value={owner} onChange={e=>setOwner(e.target.value)}/></label><p>Empiezas con 15 días de prueba de Control. Ingresarás con el mismo correo y contraseña del menú gratis. El plan elegido se paga y verifica desde Facturación; esta acción no genera un cobro.</p></>}
 <label className="connect-check text-sm font-medium"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo la transferencia. Después editaré mi menú desde el panel del restaurante.</label>
 {!profile.verifiedAt&&<p>Confirma tu correo para continuar.</p>}{error&&<p role="alert">{error}</p>}
 {unsaved&&<p>Guarda tus cambios antes de transferir el menú.</p>}
 <button type="button" className="connect-primary" disabled={busy||unsaved||!confirmed||!profile.verifiedAt} onClick={upgrade}>{busy?'Transfiriendo tu menú…':'Continuar sin perder mi menú'}</button>
 </section>;
}
