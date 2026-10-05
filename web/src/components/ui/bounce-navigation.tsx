// Indicador adaptado de beui.dev/components/motion/bounce-sidebar.
// Los enlaces y handlers originales siguen siendo la fuente de navegación.
import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export function BounceNavigation({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  const root = useRef<HTMLElement>(null);
  const previous = useRef<string | null>(null);
  const keyboard = useRef(false);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(0), y = useMotionValue(0), opacity = useMotionValue(0);
  useLayoutEffect(() => {
    const nav = root.current;
    if (!nav) return;
    const target = nav.querySelector<HTMLElement>('[aria-current="page"], [data-sidebar-active="true"]');
    animation.current?.stop();
    if (!target) { opacity.set(0); previous.current = null; return; }
    const key = target.getAttribute('href') ?? target.textContent ?? '';
    const destination = () => target.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop + target.offsetHeight / 2 - 3;
    const snap = () => { animation.current?.stop(); x.set(0); y.set(destination()); opacity.set(target.offsetHeight ? 1 : 0); };
    if (!previous.current || previous.current === key || reduce || keyboard.current) snap();
    else {
      const from = y.get(), to = destination();
      const arc = -Math.min(14, Math.max(6, Math.abs(to - from) * .12));
      opacity.set(1);
      animation.current = animate(0, 1, { type: 'spring', stiffness: 280, damping: 18, mass: .3,
        onUpdate: progress => { x.set(2 * (1 - progress) * progress * arc); y.set(from + (to - from) * progress); },
        onComplete: () => { x.set(0); y.set(to); },
      });
    }
    previous.current = key;
    // Ignorar la notificación inicial: no cancelar el salto recién iniciado.
    let initialized = false;
    const observer = new ResizeObserver(() => { if (initialized) snap(); initialized = true; });
    observer.observe(nav); observer.observe(target);
    return () => { observer.disconnect(); animation.current?.stop(); };
  }, [children, reduce, x, y, opacity]);
  return <nav {...props} ref={root} className={cn('relative pl-4', className)}
    onKeyDownCapture={() => { keyboard.current = true; }} onPointerDownCapture={() => { keyboard.current = false; }}>
    <motion.span aria-hidden="true" style={{ x, y, opacity }} className="pointer-events-none absolute left-[18px] top-0 h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_#38bdf880]" />
    {children}
  </nav>;
}
