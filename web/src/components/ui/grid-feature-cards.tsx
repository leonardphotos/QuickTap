import { cn } from '@/lib/utils';
import type React from 'react';

export type GridFeature = {
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
  eyebrow?: string;
  details?: string[];
};

type FeatureCardProps = React.ComponentProps<'article'> & {
  feature: GridFeature;
};

/**
 * Tarjeta editorial para explicar una capacidad sin depender de capturas ni mockups.
 * El patrón se deriva del título para que no cambie entre renders.
 */
export function FeatureCard({ feature, className, ...props }: FeatureCardProps) {
  const Icon = feature.icon;
  const pattern = patternFor(feature.title);

  return (
    <article
      className={cn(
        'group relative min-h-72 overflow-hidden bg-brand-950 p-6 sm:p-8',
        'transition-[background-color,transform] duration-200 ease-[cubic-bezier(.23,1,.32,1)] active:scale-[.99]',
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 -ml-20 -mt-2 h-full w-full [mask-image:linear-gradient(white,transparent)]">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-500/20 to-sky-300/[.03] opacity-80 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)] transition-opacity duration-200 group-hover:opacity-100">
          <GridPattern
            width={20}
            height={20}
            x="-12"
            y="4"
            squares={pattern}
            className="absolute inset-0 h-full w-full fill-brand-500/15 stroke-white/[.11]"
          />
        </div>
      </div>

      <div className="relative z-10">
        <Icon className="h-6 w-6 text-brand-500" strokeWidth={1.5} aria-hidden="true" />
        {feature.eyebrow && (
          <p className="mt-9 font-bold uppercase tracking-[.16em] text-sky-300 text-xs">
            {feature.eyebrow}
          </p>
        )}
        <h3 className={cn('text-base font-semibold leading-snug tracking-[-.02em] text-white sm:text-lg', feature.eyebrow ? 'mt-2' : 'mt-10')}>
          {feature.title}
        </h3>
        <p className="mt-3 font-light leading-6 text-white/58 text-base">{feature.description}</p>

        {feature.details && feature.details.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-dashed border-white/10 pt-5">
            {feature.details.map((detail) => (
              <li key={detail} className="flex gap-2.5 text-xs leading-5 text-white/62">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  ...props
}: React.ComponentProps<'svg'> & {
  width: number;
  height: number;
  x: string;
  y: string;
  squares?: number[][];
}) {
  const patternId = `feature-grid-${squares?.map((square) => square.join('-')).join('-') ?? 'base'}`;

  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern id={patternId} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      {squares && (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([squareX, squareY], index) => (
            <rect
              key={`${squareX}-${squareY}-${index}`}
              strokeWidth="0"
              width={width + 1}
              height={height + 1}
              x={squareX * width}
              y={squareY * height}
            />
          ))}
        </svg>
      )}
    </svg>
  );
}

function patternFor(seed: string, length = 5): number[][] {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;

  return Array.from({ length }, (_, index) => {
    const value = (hash + index * 2654435761) >>> 0;
    return [7 + (value % 4), 1 + ((value >>> 5) % 6)];
  });
}
