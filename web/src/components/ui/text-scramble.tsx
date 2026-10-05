// Adaptado de beui.dev/components/motion/text-animation.
import { useReducedMotion } from 'motion/react';
import { useEffect, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export function TextScramble({ text, duration = 560, glyphs = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', className, style }:
  { text: string; duration?: number; glyphs?: string; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(text);
  useEffect(() => {
    if (reduce || !glyphs || duration <= 0) { setDisplay(text); return; }
    const characters = Array.from(text), alphabet = Array.from(glyphs);
    const started = performance.now();
    let frame = 0, last = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / Math.min(duration, 1000));
      if (now - last >= 40 || progress === 1) {
        last = now;
        setDisplay(characters.map((character, index) => index < Math.floor(progress * characters.length) || /\s/.test(character)
          ? character : alphabet[Math.floor(Math.random() * alphabet.length)]).join(''));
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setDisplay(text);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration, glyphs, reduce]);
  return <span className={cn('inline-block whitespace-pre', className)} style={style}
    onCopy={event => { event.preventDefault(); event.clipboardData.setData('text/plain', text); }}>
    <span className="sr-only">{text}</span><span aria-hidden="true">{reduce ? text : display}</span>
  </span>;
}
