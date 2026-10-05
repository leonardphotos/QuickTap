// Adaptado de beui.dev/components/motion/tabs: indicador compartido y texto recortado.
// Conserva los handlers y el montaje de los paneles de QuickTap; no navega ni carga datos.
import { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cancelFrame, frame, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

type Tone = 'brand' | 'light' | 'dark' | 'onDark';
const colors = {
  onDark: { background: 'var(--color-brand-500, #009fff)', foreground: '#fff', text: '#fff' },
  brand: { background: 'var(--color-brand-500, #009fff)', foreground: '#fff', text: 'var(--color-brand-950, #061d41)' },
  light: { background: '#fff', foreground: 'var(--color-brand-950, #061d41)', text: 'var(--color-brand-950, #061d41)' },
  dark: { background: 'var(--color-brand-950, #061d41)', foreground: '#fff', text: 'var(--color-brand-950, #061d41)' },
};
const Context = createContext<{ id: string; tone: Tone; instant: boolean; orientation: 'horizontal' | 'vertical' } | null>(null);

/** Pestañas visuales: grupo de botones con selección, sin inventar paneles ARIA.
 * Mantiene el desmontaje, permisos, URL y consultas que tenga cada pantalla.
 * Teclado: flechas/Inicio/Fin enfocan; Enter/Espacio activan el handler original.
 */
export function AnimatedTabs({ children, className, wrapperClassName, tone = 'brand', orientation = 'horizontal', label = 'Secciones', ...props }:
  HTMLAttributes<HTMLDivElement> & { wrapperClassName?: string; tone?: Tone; orientation?: 'horizontal' | 'vertical'; label?: string }) {
  const id = useId();
  const viewportId = useId();
  const reduce = useReducedMotion();
  const [keyboard, setKeyboard] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: false });
  const viewportRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const vertical = orientation === 'vertical';
  const instant = !!reduce || keyboard;

  const reveal = useCallback((target: HTMLElement | null) => {
    const viewport = viewportRef.current;
    if (!viewport || !target || vertical || !viewport.clientWidth) return;
    const bounds = viewport.getBoundingClientRect();
    const item = target.getBoundingClientRect();
    const delta = item.left < bounds.left + 36 ? item.left - bounds.left - 36
      : item.right > bounds.right - 36 ? item.right - bounds.right + 36 : 0;
    if (delta) viewport.scrollBy({ left: delta, behavior: instant ? 'instant' : 'smooth' });
  }, [instant, vertical]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    const measure = () => {
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const rtl = getComputedStyle(viewport).direction === 'rtl';
      const left = Math.max(0, Math.min(max, rtl ? max + viewport.scrollLeft : viewport.scrollLeft));
      const next = { left: !vertical && left > 1, right: !vertical && left < max - 1 };
      setEdges(previous => previous.left === next.left && previous.right === next.right ? previous : next);
    };
    const update = () => { measure(); reveal(list.querySelector('[data-animated-tab][aria-pressed="true"]')); };
    const observer = new ResizeObserver(update);
    observer.observe(viewport); observer.observe(list);
    viewport.addEventListener('scroll', measure, { passive: true });
    update();
    return () => { observer.disconnect(); viewport.removeEventListener('scroll', measure); };
  }, [reveal, vertical]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const target = list.querySelector<HTMLElement>('[data-animated-tab][aria-pressed="true"]');
    reveal(target);
    const labels = Array.from(list.querySelectorAll<HTMLElement>('[data-animated-label]'));
    const indicator = list.querySelector<HTMLElement>('[data-animated-indicator]');
    if (!indicator || !target) {
      labels.forEach(label => { label.style.clipPath = 'inset(0 100% 0 0)'; });
      return;
    }
    let frames = 0;
    const sync = () => {
      const pill = (instant ? target : indicator).getBoundingClientRect();
      const clips = labels.map(label => {
        const bounds = label.getBoundingClientRect();
        const top = Math.max(0, pill.top - bounds.top);
        const bottom = Math.max(0, bounds.bottom - pill.bottom);
        const left = Math.max(0, pill.left - bounds.left);
        const right = Math.max(0, bounds.right - pill.right);
        return left + right >= bounds.width || top + bottom >= bounds.height ? 'inset(0 100% 0 0)' : `inset(${top}px ${right}px ${bottom}px ${left}px)`;
      });
      labels.forEach((label, index) => { label.style.clipPath = clips[index]; });
      // Duración acotada: sin bucle permanente en pantallas de cocina/caja.
      if (instant || ++frames > 35) cancelFrame(sync);
    };
    frame.postRender(sync, true);
    return () => cancelFrame(sync);
  }, [children, instant, reveal]);

  function scroll(direction: number) {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollBy({ left: direction * viewport.clientWidth * .7, behavior: instant ? 'instant' : 'smooth' });
  }
  return <Context.Provider value={{ id, tone, instant, orientation }}>
    <motion.div layoutRoot className={cn('relative isolate min-w-0 max-w-full', vertical && 'w-full', wrapperClassName)}>
      <motion.div layoutScroll ref={viewportRef} id={viewportId} className={cn('min-w-0 max-w-full [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', !vertical && 'overflow-x-auto')}>
        <div {...props} ref={listRef} role="group" aria-label={label}
          className={cn('relative flex w-max min-w-0 items-center gap-1 rounded-full bg-brand-950/[0.05] p-1', vertical && 'w-full flex-col items-stretch rounded-xl', className)}
          onPointerDownCapture={() => setKeyboard(false)}
          onKeyDownCapture={() => setKeyboard(true)}
          onFocusCapture={event => { if ((event.target as HTMLElement).matches('[data-animated-tab]')) reveal(event.target as HTMLElement); }}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
            if (vertical ? ['ArrowLeft', 'ArrowRight'].includes(event.key) : ['ArrowUp', 'ArrowDown'].includes(event.key)) return;
            const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-animated-tab]:not(:disabled)'));
            const index = buttons.indexOf(event.target as HTMLButtonElement);
            if (index < 0 || !buttons.length) return;
            event.preventDefault();
            const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
            const backwards = vertical ? event.key === 'ArrowUp' : event.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (backwards ? -1 : 1) + buttons.length) % buttons.length;
            buttons[next].focus({ preventScroll: true }); reveal(buttons[next]);
          }}>{children}</div>
      </motion.div>
      {!vertical && edges.left && <button type="button" aria-label="Ver pestañas anteriores" aria-controls={viewportId} onClick={() => scroll(-1)} className="absolute inset-y-0 left-0 z-20 flex w-8 items-center justify-center rounded-l-full bg-white/95 text-brand-950 shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500"><ChevronLeft size={18} /></button>}
      {!vertical && edges.right && <button type="button" aria-label="Ver más pestañas" aria-controls={viewportId} onClick={() => scroll(1)} className="absolute inset-y-0 right-0 z-20 flex w-8 items-center justify-center rounded-r-full bg-white/95 text-brand-950 shadow-sm focus-visible:outline-2 focus-visible:outline-brand-500"><ChevronRight size={18} /></button>}
    </motion.div>
  </Context.Provider>;
}

export function AnimatedTab({ active, children, className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('AnimatedTab debe estar dentro de AnimatedTabs');
  const palette = colors[ctx.tone];
  return <button {...props} type={props.type ?? 'button'} aria-pressed={active} data-animated-tab=""
    className={cn('relative isolate inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-500', className)}
    style={{ ...style, backgroundColor: 'transparent', color: palette.text, boxShadow: 'none' }}>
    {active && <motion.span aria-hidden="true" data-animated-indicator="" layoutId={ctx.id} layout
      initial={false} transition={ctx.instant ? { duration: 0 } : { type: 'spring', duration: .24, bounce: 0 }}
      className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit]" style={{ backgroundColor: palette.background, borderRadius: ctx.orientation === 'vertical' ? 12 : 9999 }} />}
    {children}
    <span aria-hidden="true" inert data-animated-label="" className="pointer-events-none absolute inset-0 inline-flex [flex-direction:inherit] [align-items:inherit] [justify-content:inherit] [gap:inherit] [padding:inherit]" style={{ color: palette.foreground, clipPath: active ? 'inset(0)' : 'inset(0 100% 0 0)' }}>{children}</span>
  </button>;
}
