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

export function Panel({ title, subtitle, action, aside, className, children }: PanelProps) {
  return (
    <section className={cn('flex flex-col rounded-2xl border border-brand-950/[0.06] bg-white p-5 shadow-sm', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-brand-950">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {aside}
        {action && (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-500/10"
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
