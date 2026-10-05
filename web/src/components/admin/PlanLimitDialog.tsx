import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers, ShieldCheck, X } from 'lucide-react';
import './plan-limit-dialog.css';

export function PlanLimitDialog() {
  const [message, setMessage] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener('quicktap:plan-limit', show);
    return () => window.removeEventListener('quicktap:plan-limit', show);
  }, []);
  useEffect(() => {
    if (!message) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMessage('');
      if (event.key !== 'Tab') return;
      const items = panel.current?.querySelectorAll<HTMLElement>('a[href],button');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [message]);
  if (!message) return null;
  return <div className="qt-limit-overlay">
    <div ref={panel} tabIndex={-1} className="qt-limit-panel" role="dialog" aria-modal="true" aria-labelledby="plan-limit-title" aria-describedby="plan-limit-description">
      <button className="qt-limit-close" aria-label="Cerrar aviso" onClick={() => setMessage('')}><X size={18}/></button>
      <div className="qt-limit-icon"><Layers size={23}/></div>
      <span className="qt-limit-eyebrow">TU MEMBRESÍA</span>
      <h2 id="plan-limit-title">Más espacio para<br/>tu restaurante.</h2>
      <p id="plan-limit-description" className="qt-limit-description text-base">{message}</p>
      <div className="qt-limit-reassurance"><ShieldCheck size={18}/><div><strong>Tus datos se conservan</strong><p>El dueño o administrador puede revisar los planes o solicitar una cotización.</p></div></div>
      <div className="qt-limit-actions"><Link to="/admin/billing" onClick={() => setMessage('')}>Ver planes y opciones <ArrowUpRight size={17}/></Link><button onClick={() => setMessage('')}>Ahora no</button></div>
    </div>
  </div>;
}
