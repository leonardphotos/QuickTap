import { cn } from '@/lib/utils';

interface KineticDotsLoaderProps {
  className?: string;
}

/** Cuatro gotas con gravedad, deformación e impacto. Las animaciones viven en index.css para
 * funcionar tanto en Vite como en las apps instaladas y respetar prefers-reduced-motion. */
export default function KineticDotsLoader({ className }: KineticDotsLoaderProps) {
  return (
    <div className={cn('flex min-h-[190px] items-center justify-center px-8 py-6', className)} aria-hidden="true">
      <div className="flex gap-5">
        {[0, 1, 2, 3].map((index) => {
          const animationDelay = `${index * 0.15}s`;
          return (
            <div key={index} className="relative flex h-20 w-6 flex-col items-center justify-end">
              <div className="qt-kinetic-dot relative z-10 h-5 w-5" style={{ animationDelay }}>
                <div
                  className="qt-kinetic-morph h-full w-full rounded-full bg-gradient-to-b from-cyan-300 to-blue-600 shadow-[0_0_15px_rgba(6,182,212,0.6)]"
                  style={{ animationDelay }}
                />
                <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-white/60 blur-[0.5px]" />
              </div>

              <span
                className="qt-kinetic-ripple absolute bottom-0 h-3 w-10 rounded-[100%] border border-brand-500/30 opacity-0"
                style={{ animationDelay }}
              />
              <span
                className="qt-kinetic-shadow absolute -bottom-1 h-1.5 w-5 rounded-[100%] bg-brand-500/40 blur-sm"
                style={{ animationDelay }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
