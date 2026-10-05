import {ArrowRight,CalendarClock,Check,LogOut,ShieldCheck,MessageCircle} from 'lucide-react';
import {Link} from 'react-router-dom';
import './membership-expired.css';

interface Props {restaurantName:string;periodEnd?:string;canPay:boolean;suspended:boolean;onLogout:()=>void}
export function MembershipExpired({restaurantName,periodEnd,canPay,suspended,onLogout}:Props){
 const date=periodEnd?new Date(periodEnd):null;
 const dateLabel=date&&Number.isFinite(date.getTime())?date.toLocaleDateString('es-VE',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Caracas'}):null;
 return <main className="qt-expired"><header className="qt-expired-brand"><img src="/logo/logo-central.png?v=20261002" alt="QuickTap" width="100" height="20"/></header><section className="qt-expired-card" aria-labelledby="expired-title">
   <div className="qt-expired-icon">{suspended?<ShieldCheck size={29}/>:<CalendarClock size={29}/>}</div>
   <p className="qt-expired-business text-base">{restaurantName}</p>
   <h1 id="expired-title">{suspended?'Tu cuenta necesita revisión.':'Renueva tu membresía.'}</h1>
   <p className="qt-expired-intro text-base">{suspended?'El equipo de QuickTap suspendió el acceso a esta cuenta. Contáctanos para conocer el motivo y los pasos para recuperarlo.':'Tu membresía venció. Renueva para continuar gestionando tu restaurante con QuickTap.'}</p>
   {!suspended&&dateLabel&&<p className="qt-expired-date text-base">Venció el {dateLabel}</p>}
   {!suspended&&<div className="qt-expired-preserved"><Check size={18}/><span>Tu menú, productos y configuración se conservan.</span></div>}
   {!suspended&&canPay?<><div className="qt-expired-steps"><p>Volver es sencillo</p><ol><li><span>1</span><div><strong>Revisa tu membresía</strong><small>Confirma el plan y el monto a pagar.</small></div></li><li><span>2</span><div><strong>Paga y envía el comprobante</strong><small>Elige tu método y adjunta la imagen.</small></div></li></ol></div><Link className="qt-expired-primary" to="/admin/billing?renew=1">Renovar membresía<ArrowRight size={18}/></Link><p className="qt-expired-review text-base">El pago se verifica antes de confirmar la renovación.</p><details className="qt-expired-paid"><summary>¿Ya realizaste el pago?</summary><p>Si aún no enviaste el comprobante, adjúntalo en Facturación. Si ya lo enviaste, revisa allí el estado de tu solicitud antes de volver a pagar.</p><Link to="/admin/billing">Ir a Facturación <ArrowRight size={14}/></Link></details></>:!suspended?<div className="qt-expired-staff"><strong>Avísale al dueño o administrador</strong><p>Puede renovar desde su cuenta, entrando en Facturación. No necesitas realizar el pago con este usuario.</p></div>:<p className="qt-expired-staff text-base">Un pago no elimina una suspensión administrativa. El equipo de QuickTap debe revisar la cuenta.</p>}
   {suspended&&<a className="qt-expired-primary" href={`https://wa.me/584244572008?text=${encodeURIComponent('Hola, mi cuenta de QuickTap está suspendida y necesito hablar con un asesor para revisar el acceso.')}`} target="_blank" rel="noopener noreferrer">Hablar con un asesor<MessageCircle size={18}/></a>}
 </section><button className="qt-expired-logout" onClick={onLogout}><LogOut size={16}/>Cerrar sesión</button></main>
}
