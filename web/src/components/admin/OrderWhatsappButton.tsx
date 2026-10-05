import { useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ORDER_WHATSAPP_ACTIONS, orderWhatsappMessage, orderWhatsappPhone, orderWhatsappDeliveryMode, type OrderWhatsappLinkStatus, type OrderWhatsappAction } from '@/utils/orderWhatsapp';
import type { LiveOrder } from './LiveOrdersPanel.shared';

export function OrderWhatsappButton({ order, business, buttonClassName }: { order: LiveOrder; business: string; buttonClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<OrderWhatsappAction | 'custom' | null>(null);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<OrderWhatsappLinkStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLink(null);
    setError('');
    api.get('/whatsapp-link/status').then(response => {
      if (active) setLink(response.data.data);
    }).catch(() => {
      if (active) setError('No se pudo comprobar la vinculación. Intenta nuevamente.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, retry]);
  const mode = link ? orderWhatsappDeliveryMode(link) : 'unavailable';
  const send = async () => {
    if (sendingRef.current || !phone || !message.trim() || mode !== 'direct') return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const response = await api.post('/whatsapp-link/send', { phone, message: message.trim() });
      if (!response.data?.data?.sent) {
        setError('No se pudo enviar. Revisa la conexión de WhatsApp del negocio e intenta nuevamente.');
        return;
      }
      setSent(true);
    } catch {
      setError('No se pudo confirmar el envío. Revisa la conversación antes de reintentar para evitar duplicarlo.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const phone = orderWhatsappPhone(order.customerPhone);
  const baseUrl = phone ? `https://wa.me/${phone}` : '';
  const linkClass = 'flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-brand-950 hover:bg-brand-950/5 focus-visible:outline-2 focus-visible:outline-brand-500';
  return <div onClick={event => event.stopPropagation()}>
    <button type="button" onClick={() => { setAction(null); setSent(false); setOpen(true); }} aria-label={`WhatsApp del pedido ${order.orderNumber}`} className={buttonClassName ?? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-600/15 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 active:scale-[0.97] motion-reduce:transform-none"}>
      <MessageCircle className="h-4 w-4" aria-hidden="true" /> <span>WhatsApp</span>
    </button>
    <Dialog open={open} onOpenChange={value => { if (!sendingRef.current) setOpen(value); }}>
      <DialogContent className="!max-w-md !gap-3 !p-5">
        <DialogHeader>
          <DialogTitle>WhatsApp · Pedido #{order.orderNumber}</DialogTitle>
          <DialogDescription>{order.customerName || 'Cliente'}{order.customerPhone ? ` · ${order.customerPhone}` : ''}</DialogDescription>
        </DialogHeader>
        {!phone ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900 text-base">Este pedido no tiene un teléfono válido. Edita los datos del cliente y guarda su número con código de país para contactarlo.</p> : loading ? <p role="status" className="text-brand-950/60 text-base">Comprobando WhatsApp del negocio…</p> : mode === 'unavailable' ? <div className="space-y-3">
          <p role="alert" className="text-amber-900 text-base">{error || (link?.paused ? 'El WhatsApp del negocio está pausado. Reanúdalo en Ajustes para enviar mensajes.' : link?.planPermitido === false ? 'El plan actual no permite enviar desde el WhatsApp del negocio.' : 'El WhatsApp del negocio no está conectado. Revisa su vinculación en Ajustes.')}</p>
          <button type="button" className={linkClass} onClick={() => setRetry(value => value + 1)}>Volver a comprobar</button>
        </div> : action ? <>
          <button type="button" className={`${linkClass} justify-start`} disabled={sending} onClick={() => { setAction(null); setSent(false); setError(''); }}><ChevronLeft className="h-4 w-4" /> Opciones</button>
          <label htmlFor={`wa-${order.id}`} className="text-brand-950 text-sm font-medium">{action === 'custom' ? 'Mensaje al cliente' : ORDER_WHATSAPP_ACTIONS.find(([key]) => key === action)?.[1]}</label>
          <textarea id={`wa-${order.id}`} value={message} disabled={sending || sent} maxLength={4000} onChange={event => setMessage(event.target.value)} rows={8} className="w-full resize-y rounded-xl border border-brand-950/15 p-3 text-brand-950 focus:outline-brand-500 text-base" />
          <p className="text-brand-950/60 text-xs">{mode === 'direct' ? 'El mensaje se enviará desde el WhatsApp vinculado del negocio.' : 'Se abrirá WhatsApp para que envíes el mensaje.'} Esto no modifica el estado del pedido.</p>
          {error && <p role="alert" className="text-red-700 text-base">{error}</p>}
          {sent ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800 text-base">Mensaje enviado al servicio de WhatsApp.</p> : mode === 'direct' ? <button type="button" disabled={sending || !message.trim()} onClick={send} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><MessageCircle className="h-4 w-4" /> {sending ? 'Enviando…' : 'Enviar mensaje'}</button> : message.trim() ? <a href={`${baseUrl}?text=${encodeURIComponent(message.trim())}`} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white"><MessageCircle className="h-4 w-4" /> Abrir WhatsApp para enviar</a> : <p className="text-amber-800 text-base">Escribe un mensaje para continuar.</p>}
        </> : <>
          {mode === 'direct' ? <button type="button" className={`${linkClass} bg-emerald-50 !text-emerald-800`} onClick={() => { setAction('custom'); setMessage(''); setSent(false); setError(''); }}><span>Mensaje al cliente</span><ChevronRight className="h-4 w-4" /></button> : <a href={baseUrl} target="_blank" rel="noopener noreferrer" className={`${linkClass} bg-emerald-50 !text-emerald-800`}><span className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> Conversar con el cliente</span><ChevronRight className="h-4 w-4" /></a>}
          <div className="divide-y divide-brand-950/5">
            {ORDER_WHATSAPP_ACTIONS.filter(([key]) => order.channel === 'DELIVERY' || !['on_way', 'arrived'].includes(key)).map(([key, label]) => <button type="button" key={key} className={`${linkClass} w-full text-left ${key === 'summary' ? 'bg-brand-500/5 !text-brand-500' : ''}`} onClick={() => { setAction(key); setSent(false); setError(''); setMessage(orderWhatsappMessage(order, key, business)); }}>{label}<ChevronRight className="h-4 w-4 shrink-0 opacity-40" /></button>)}
          </div>
          <p className="text-brand-950/50 text-xs">{mode === 'direct' ? 'Envía desde el WhatsApp vinculado del negocio.' : 'El negocio no tiene WhatsApp vinculado. Envía desde tu WhatsApp.'} Revisa y confirma cada mensaje.</p>
        </>}
      </DialogContent>
    </Dialog>
  </div>;
}
