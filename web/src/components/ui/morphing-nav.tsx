// Superficie curva adaptada de beui.dev/components/blocks/morphing-tabs.
// Navegación real: sin cerrar/reordenar módulos ni volver a montar sus formularios.
import { useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { Link } from 'react-router-dom';

function liquidNavPath(left: number, width: number, tabWidth: number) {
  const end = Math.max(16, width - 8), x = Math.max(8, Math.min(end - tabWidth, left)), right = x + tabWidth;
  const before = Math.max(8, x - 16), after = Math.min(end, right + 16);
  return `M8 80 V72 Q8 64 ${before} 64 C${x} 64 ${x} 56 ${x} 48 V32 Q${x} 16 ${x+16} 16 H${right-16} Q${right} 16 ${right} 32 V48 C${right} 56 ${right} 64 ${after} 64 H${end-8} Q${end} 64 ${end} 72 V80 Z`;
}

export function MorphingNav({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  const rail = useRef<HTMLDivElement>(null), viewport = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const keyboard = useRef(false), positioned = useRef(false);
  const [geometry, setGeometry] = useState({ width: 0, tabWidth: 120 });
  const x = useMotionValue(8), w = useMotionValue(120);
  const path = useTransform(() => liquidNavPath(x.get(), geometry.width, w.get()));
  const activeHref = items.find(item => item.active)?.href;
  useLayoutEffect(() => {
    const root = rail.current, view = viewport.current;
    if (!root || !view) return;
    let animation: ReturnType<typeof animate> | undefined, widthAnimation: ReturnType<typeof animate> | undefined;
    const update = (moving: boolean) => {
      const selected = root.querySelector<HTMLElement>('[aria-current="page"]');
      if (!selected) return;
      const width = root.scrollWidth;
      setGeometry(previous => previous.width === width && previous.tabWidth === selected.offsetWidth ? previous : { width, tabWidth: selected.offsetWidth });
      animation?.stop(); widthAnimation?.stop();
      const options = reduce || keyboard.current || !moving || !positioned.current ? { duration: 0 } : { type: 'spring' as const, bounce: 0, duration: .26 };
      animation = animate(x, selected.offsetLeft, options);
      widthAnimation = animate(w, selected.offsetWidth, options);
      positioned.current = true;
      const start = selected.offsetLeft, end = start + selected.offsetWidth;
      if (start < view.scrollLeft) view.scrollTo({ left: start - 8, behavior: 'instant' });
      else if (end > view.scrollLeft + view.clientWidth) view.scrollTo({ left: end - view.clientWidth + 8, behavior: 'instant' });
    };
    update(true);
    let initialized = false;
    const observer = new ResizeObserver(() => { if (initialized) update(false); initialized = true; });
    observer.observe(root); observer.observe(view);
    return () => { observer.disconnect(); animation?.stop(); widthAnimation?.stop(); };
  }, [activeHref, items.length, reduce, x, w]);
  return <nav ref={viewport} aria-label={label} className="mb-6 min-w-0 max-w-full overflow-x-auto rounded-3xl bg-brand-950/[0.055] [scrollbar-width:thin]"
    onKeyDownCapture={() => { keyboard.current = true; }} onPointerDownCapture={() => { keyboard.current = false; }}>
    <div ref={rail} className="relative isolate flex h-20 w-max min-w-full items-start gap-2 px-2 pt-4">
      {geometry.width > 0 && activeHref && <svg aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-20 w-full text-white" viewBox={`0 0 ${geometry.width} 80`} preserveAspectRatio="none"><motion.path d={path} fill="currentColor" /></svg>}
      {items.map(item => <Link key={item.href} to={item.href} aria-current={item.active ? 'page' : undefined}
        className={`flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-t-2xl px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand-500 ${item.active ? 'text-brand-600' : 'text-brand-950/65 hover:text-brand-950'}`}>
        {item.label}
      </Link>)}
    </div>
  </nav>;
}
