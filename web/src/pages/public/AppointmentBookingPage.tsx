import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, ShieldCheck, UserRound } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api } from '@/api/client';
import './appointment-booking.css';
import { appointmentAppearanceStyle, type AppointmentPalette } from '@/utils/appointment-appearance';

type Service = { id: string; name: string; description?: string | null; durationMinutes: number; price: string; color: string };
type Professional = { id: string; name: string; specialty?: string | null; description?: string | null; photoUrl?: string | null; services: { serviceId: string; customPrice?: string | null; customDuration?: number | null }[] };
type Settings = { appearance?: AppointmentPalette | null; publicTitle?: string | null; publicDescription?: string | null; coverImageUrl?: string | null; primaryColor?: string; accentColor?: string; backgroundColor?: string; cancellationPolicy?: string | null; collectIdNumber?: boolean; collectNotes?: boolean; timezone?: string; requireManualApproval?: boolean };
type Catalog = { business: { name: string; logoUrl?: string | null; baseCurrency: string }; settings: Settings; services: Service[]; professionals: Professional[] };
type Slot = { startsAt: string; endsAt: string };

export default function AppointmentBookingPage() {
  const { slug = '' } = useParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'CONFIRMED' | 'REQUESTED' | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get(`/public/appointments/${slug}`).then(response => { if (active) setCatalog(response.data.data); }).catch(() => { if (active) setError('No pudimos abrir esta agenda.'); });
    return () => { active = false; };
  }, [slug]);
  useEffect(() => {
    if (!service || !professional) return;
    let active = true;
    setLoading(true); setSlots([]); setError('');
    const from = new Intl.DateTimeFormat('en-CA', { timeZone: catalog?.settings.timezone || 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    api.get(`/public/appointments/${slug}/slots`, { params: { serviceId: service.id, professionalId: professional.id, from, days: 21 } })
      .then(response => { if (active) setSlots(response.data.data); })
      .catch(() => { if (active) setError('No pudimos consultar la disponibilidad. Intenta de nuevo.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [catalog?.settings.timezone, service, professional, slug]);

  const professionals = useMemo(() => catalog?.professionals.filter(person => person.services.some(item => item.serviceId === service?.id)) ?? [], [catalog, service]);
  if (error && !catalog) return <main className="booking-fallback" role="alert">{error}</main>;
  if (!catalog) return <main className="booking-fallback">Preparando la agenda…</main>;

  const settings = catalog.settings;
  const timezone = settings.timezone || 'America/Caracas';
  const primary = settings.primaryColor || '#008edf';
  const style = appointmentAppearanceStyle(settings);
  const money = (amount: string | number) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: catalog.business.baseCurrency || 'EUR' }).format(Number(amount));
  const price = professional?.services.find(item => item.serviceId === service?.id)?.customPrice ?? service?.price ?? '0';
  const duration = professional?.services.find(item => item.serviceId === service?.id)?.customDuration ?? service?.durationMinutes;
  const stage = !service ? 0 : !professional ? 1 : !slot ? 2 : 3;
  const back = () => { setError(''); if (slot) setSlot(null); else if (professional) setProfessional(null); else setService(null); };
  const restart = () => { setService(null); setProfessional(null); setSlot(null); setDone(null); setError(''); };

  return <main className="booking-page" style={style}>
    <div className="booking-wrap">
      <section className="booking-brand" aria-label={catalog.business.name}>
        <div className="booking-logo">{catalog.business.logoUrl ? <img src={catalog.business.logoUrl} alt={`Logo de ${catalog.business.name}`}/> : <CalendarDays size={33}/>}</div>
        <div className="booking-brand-copy"><span>Bienvenido a</span><strong>{catalog.business.name}</strong></div>
        <div className="booking-brand-trust"><CalendarDays size={18}/><span>Agenda en línea</span></div>
      </section>
      <header className="booking-intro"><p>Un momento para ti</p><h1>{settings.publicTitle || 'Encuentra tu próxima cita.'}</h1><div>{settings.publicDescription || 'Elige tu servicio. Nosotros te ayudamos con el resto.'}</div></header>
      {settings.coverImageUrl && !done && stage === 0 && <div className="booking-cover"><img src={settings.coverImageUrl} alt={`Espacio de ${catalog.business.name}`} fetchPriority="high"/><div><span>{catalog.business.name}</span><p>Tu bienestar empieza aquí.</p></div></div>}

      {done ? <section className="booking-card booking-success" role="status"><div className="booking-success-icon"><CheckCircle2 size={42}/></div><span className="booking-kicker">TODO LISTO</span><h2>{done === 'CONFIRMED' ? 'Tu cita está confirmada' : 'Solicitud enviada'}</h2><p>{done === 'CONFIRMED' ? 'Tu horario quedó reservado. Guarda la fecha para tu visita.' : 'Recibimos tu solicitud. El negocio revisará el horario y te avisará cuando quede confirmado.'}</p><button className="booking-button" onClick={restart}>Reservar otra cita <ArrowRight size={17}/></button></section> : <>
        <div className="booking-progress" aria-label={`Paso ${stage + 1} de 4`}>{['Servicio', 'Profesional', 'Horario', 'Tus datos'].map((label,index) => <span key={label} className={index === stage ? 'active' : index < stage ? 'complete' : ''} aria-current={index === stage ? 'step' : undefined}><i>{index < stage ? '✓' : index + 1}</i>{label}</span>)}</div>
        <div className="booking-section-heading"><h2>{['Nuestros servicios', 'Elige a tu profesional', 'Encuentra tu horario', 'Completa tu reserva'][stage]}</h2><span className="booking-step">{stage === 0 ? `${catalog.services.length} disponibles` : `Paso ${stage + 1} de 4`}</span></div>
        {stage > 0 && <div className="booking-selection"><button onClick={back} aria-label="Volver al paso anterior"><ArrowLeft size={18}/> Volver</button><span>{service?.name}{professional ? ` · ${professional.name}` : ''}{slot ? ` · ${new Date(slot.startsAt).toLocaleString('es-VE', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })}` : ''}</span></div>}
        {stage === 0 && <div className="booking-grid">{catalog.services.length ? catalog.services.map(item => <button className="booking-choice" key={item.id} onClick={() => { setService(item); setError(''); }}><span className="booking-choice-icon" style={{ background: item.color || primary }}><CalendarDays size={22}/></span><span className="booking-choice-body"><strong>{item.name}</strong><span>{item.description || 'Reserva un espacio para este servicio.'}</span><span className="booking-choice-meta"><Clock3 size={15}/> {item.durationMinutes} min <b>{money(item.price)}</b></span></span><ArrowRight className="booking-choice-arrow" size={18}/></button>) : <div className="booking-empty">Este negocio todavía no tiene servicios disponibles.</div>}</div>}
        {stage === 1 && <div className="booking-grid">{professionals.length ? professionals.map(person => <button className="booking-choice" key={person.id} onClick={() => { setProfessional(person); setError(''); }}>{person.photoUrl ? <img className="booking-person-photo" src={person.photoUrl} alt={person.name} loading="lazy"/> : <span className="booking-choice-icon booking-person-placeholder"><UserRound size={24}/></span>}<span className="booking-choice-body"><strong>{person.name}</strong><span>{person.specialty || 'Profesional'}</span>{person.description && <span>{person.description}</span>}<span className="booking-choice-meta"><Clock3 size={15}/> {person.services.find(item => item.serviceId === service?.id)?.customDuration ?? service?.durationMinutes} min <b>{money(person.services.find(item => item.serviceId === service?.id)?.customPrice ?? service?.price ?? 0)}</b></span></span><ArrowRight className="booking-choice-arrow" size={18}/></button>) : <div className="booking-empty">No hay profesionales disponibles para este servicio.</div>}</div>}
        {stage === 2 && <section className="booking-card">{loading ? <div className="booking-empty">Consultando disponibilidad…</div> : <SlotPicker slots={slots} timezone={timezone} onPick={setSlot}/>}</section>}
        {stage === 3 && service && professional && slot && <section className="booking-card booking-form-card"><div className="booking-summary"><div><span>ESTÁS RESERVANDO</span><strong>{service.name}</strong><p>{professional.name} · {new Date(slot.startsAt).toLocaleString('es-VE', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' })}</p></div><b>{money(price)}</b></div><BookingForm slug={slug} service={service} professional={professional} slot={slot} settings={settings} duration={duration} onDone={setDone} onError={setError}/></section>}
        {error && <div className="booking-error" role="alert">{error}</div>}
      </>}
      <footer className="booking-footer"><ShieldCheck size={15}/> Tu información se usa únicamente para gestionar la cita · QuickTap Citas</footer>
    </div>
  </main>;
}

function SlotPicker({ slots, timezone, onPick }: { slots: Slot[]; timezone: string; onPick: (slot: Slot) => void }) {
  const groups = slots.reduce<Record<string, Slot[]>>((accumulator, slot) => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(slot.startsAt));
    (accumulator[date] ??= []).push(slot);
    return accumulator;
  }, {});
  if (!slots.length) return <div className="booking-empty">No hay horarios disponibles en los próximos 21 días. Consulta con el negocio para otra fecha.</div>;
  return <div className="booking-slot-groups">{Object.entries(groups).map(([date, list]) => <section key={date}><h3>{new Date(list[0].startsAt).toLocaleDateString('es-VE', { timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long' })}</h3><div>{list.map(slot => <button key={slot.startsAt} onClick={() => onPick(slot)}><Clock3 size={15}/>{new Date(slot.startsAt).toLocaleTimeString('es-VE', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}</button>)}</div></section>)}</div>;
}

function BookingForm({ slug, service, professional, slot, settings, duration, onDone, onError }: { slug: string; service: Service; professional: Professional; slot: Slot; settings: Settings; duration?: number; onDone: (status: 'CONFIRMED' | 'REQUESTED') => void; onError: (message: string) => void }) {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', customerEmail: '', customerIdNumber: '', customerNotes: '' });
  const [sending, setSending] = useState(false);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending) return; setSending(true); onError('');
    try {
      const response = await api.post(`/public/appointments/${slug}/requests`, { ...form, serviceId: service.id, professionalId: professional.id, startsAt: slot.startsAt });
      onDone(response.data.data?.status === 'CONFIRMED' ? 'CONFIRMED' : 'REQUESTED');
    } catch (cause: unknown) {
      const response = cause as { response?: { data?: { message?: string; error?: string } } };
      onError(response.response?.data?.message || response.response?.data?.error || 'No pudimos enviar la solicitud. Verifica tus datos e intenta de nuevo.');
    } finally { setSending(false); }
  }
  return <form className="booking-form" onSubmit={send}><h3>Tus datos de contacto</h3><p>Solo los usaremos para coordinar tu cita de {duration || service.durationMinutes} minutos.</p><div className="booking-form-grid"><Field label="Nombre y apellido" required autoComplete="name" value={form.customerName} onChange={value => setForm({ ...form, customerName: value })}/><Field label="Teléfono" required type="tel" autoComplete="tel" value={form.customerPhone} onChange={value => setForm({ ...form, customerPhone: value })}/><Field label="Correo electrónico" type="email" autoComplete="email" value={form.customerEmail} onChange={value => setForm({ ...form, customerEmail: value })}/>{settings.collectIdNumber && <Field label="Documento" value={form.customerIdNumber} onChange={value => setForm({ ...form, customerIdNumber: value })}/>}</div>{settings.collectNotes && <label className="booking-field text-sm font-medium">Nota opcional<textarea rows={3} value={form.customerNotes} onChange={event => setForm({ ...form, customerNotes: event.target.value })}/></label>}{settings.cancellationPolicy && <p className="booking-policy text-base">Política de cancelación: {settings.cancellationPolicy}</p>}<button className="booking-button" disabled={sending}>{sending ? 'Enviando solicitud…' : settings.requireManualApproval === false ? 'Confirmar cita' : 'Enviar solicitud'}<ArrowRight size={17}/></button></form>;
}

function Field({ label, value, onChange, type = 'text', required = false, autoComplete }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; autoComplete?: string }) {
  return <label className="booking-field text-sm font-medium">{label}<input required={required} type={type} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)}/></label>;
}
