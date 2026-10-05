import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, ExternalLink, HelpCircle, ShieldCheck, X } from 'lucide-react';
import { api } from '@/api/client';

export default function GoogleCalendarSetup() {
  const [connections, setConnections] = useState<{ id:string; isActive:boolean; googleAccountEmail?:string; lastSyncedAt?:string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const load = () => api.get('/appointments/google/status').then((response) => setConnections(response.data.data)).catch(() => setError('No se pudo comprobar la conexión. Recarga e intenta nuevamente.'));
  useEffect(() => { void load(); }, []);
  const connect = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { const response = await api.get('/appointments/google/connect'); window.location.href = response.data.data.url; }
    catch { setError('No se pudo iniciar la conexión con Google. Inténtalo nuevamente o contacta a soporte.'); setBusy(false); }
  };
  const connected = connections.some(connection => connection.isActive);
  return <>
    <section className="rounded-3xl bg-white border border-slate-200/70 shadow-sm p-5">
      {error && <p className="apt-error text-xs" role="alert">{error}</p>}
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-2xl bg-blue-50 text-brand-500 grid place-items-center"><CalendarDays /></div>
        <div className="flex-1"><h2 className="font-bold text-lg">Google Calendar</h2><p className="text-gray-900 mt-1 text-base">Evita cruces de horario y agrega automáticamente las citas confirmadas.</p></div>
      </div>
      <div className={`mt-5 rounded-2xl p-4 flex gap-3 ${connected ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50'}`}>
        {connected ? <CheckCircle2 className="text-emerald-500 shrink-0" /> : <ShieldCheck className="text-slate-400 shrink-0" />}
        <div><b>{connected ? 'Calendario conectado' : 'Sin conexión'}</b><p className="opacity-65 mt-1 text-xs">{connected ? connections[0].googleAccountEmail || 'La sincronización está activa.' : 'Solo se solicitará acceso para consultar disponibilidad y gestionar las citas.'}</p></div>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <button onClick={() => setTutorialOpen(true)} className="rounded-xl border px-4 py-2.5 font-semibold flex items-center justify-center gap-2"><HelpCircle size={18}/> Cómo conectarlo</button>
        <button onClick={connect} className="rounded-xl bg-brand-500 text-white px-4 py-2.5 font-semibold flex items-center justify-center gap-2">{connected ? 'Cambiar cuenta' : 'Conectar Google Calendar'} <ExternalLink size={16}/></button>
      </div>
    </section>

    {tutorialOpen && <div className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm grid place-items-center p-4" onClick={() => setTutorialOpen(false)}>
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <header className="p-5 border-b flex items-start gap-3"><div className="h-11 w-11 rounded-2xl bg-blue-50 text-brand-500 grid place-items-center"><CalendarDays /></div><div className="flex-1"><h2 className="text-xl font-bold">Conecta tu Google Calendar</h2><p className="text-gray-900 mt-1 text-base">Solo te tomará un minuto.</p></div><button onClick={() => setTutorialOpen(false)} className="h-9 w-9 rounded-full bg-slate-100 grid place-items-center"><X size={18}/></button></header>
        <div className="p-5 space-y-3">
          {[
            ['1', 'Presiona “Conectar Google Calendar”', 'QuickTap abrirá la página segura de Google.'],
            ['2', 'Escoge la cuenta del negocio', 'Usa la cuenta donde administras tus citas.'],
            ['3', 'Revisa y permite el acceso', 'QuickTap consultará horarios ocupados y creará eventos al confirmar citas.'],
            ['4', 'Regresa automáticamente a QuickTap', 'Cuando veas “Calendario conectado”, la sincronización estará lista.'],
          ].map(([number,title,text]) => <div key={number} className="flex gap-3 rounded-2xl bg-slate-50 p-4"><div className="h-8 w-8 shrink-0 rounded-full bg-brand-500 text-white grid place-items-center text-sm font-bold">{number}</div><div><b className="text-sm">{title}</b><p className="text-gray-500 mt-1 text-xs">{text}</p></div></div>)}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900"><b>Tranquilo:</b> QuickTap no puede ver tu contraseña ni acceder a tu correo. Puedes retirar el permiso desde tu cuenta de Google cuando quieras.</div>
        </div>
        <footer className="p-5 pt-0"><button onClick={connect} className="w-full rounded-xl bg-brand-500 text-white py-3 font-semibold flex items-center justify-center gap-2">Conectar ahora <ChevronRight size={18}/></button></footer>
      </div>
    </div>}
  </>;
}
