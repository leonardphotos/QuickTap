import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** Casillas de código de un dígito cada una, con animación de entrada escalonada y "pop" al escribir. */
export function OtpInput({ value, onChange, length = 6, autoFocus, disabled }: Props) {
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, char: string) {
    if (char && !/^[0-9]$/.test(char)) return;
    const next = digits.slice();
    next[index] = char;
    onChange(next.join('').replace(/\s+$/, ''));
    if (char && index < length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          value={d}
          onChange={(e) => setDigit(i, e.target.value.slice(-1))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          initial={{ opacity: 0, y: 12, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: d ? 1.08 : 1 }}
          transition={{ delay: i * 0.05, duration: 0.25, ease: 'easeOut' }}
          className={cn(
            'h-12 w-10 text-center text-lg font-semibold rounded-xl border focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 transition-colors disabled:opacity-50',
            d ? 'border-brand-500 bg-brand-400/10 text-brand-950' : 'border-brand-950/15 text-brand-950',
          )}
        />
      ))}
    </div>
  );
}
