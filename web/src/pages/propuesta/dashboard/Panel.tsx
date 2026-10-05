import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Tarjeta base con el mismo trato que .rd-panel en el tema calm: radio 24px, borde suave. */
export function Panel({ title, subtitle, action, aside, className, children }: PanelProps) {
  return (
    <section className={cn('flex min-w-0 flex-col rounded-3xl border border-border bg-card p-6 shadow-[0_8px_30px_#20272004]', className)}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-brand-950">{title}</h2>
          {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
        {action && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-[13px] font-medium text-brand-500 transition-colors hover:bg-accent"
          >
            {action}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </header>
      {children}
    </section>
  );
}
