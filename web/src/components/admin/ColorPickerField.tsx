import { useState } from 'react';
import { HexColorPicker } from 'react-colorful';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (hex: string) => void;
  className?: string;
}

export function ColorPickerField({ label, value, defaultValue, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const current = value || defaultValue;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-medium text-brand-950/70">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2 w-full hover:border-brand-500/40 transition-colors"
        >
          <span
            className="h-6 w-6 rounded-full border border-black/10 shrink-0"
            style={{ backgroundColor: current }}
          />
          <span className="text-sm text-brand-950/70 uppercase">{current}</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-2 rounded-2xl border border-border bg-white p-3 shadow-xl">
              <HexColorPicker color={current} onChange={onChange} />
              <button
                type="button"
                onClick={() => onChange(defaultValue)}
                className="mt-2 w-full text-xs text-brand-950/50 hover:text-brand-950"
              >
                Restablecer por defecto
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
