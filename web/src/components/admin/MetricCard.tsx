import type { LucideIcon } from 'lucide-react';

export interface MetricCardRow {
  label: string;
  amount: string;
  tone?: 'success' | 'danger';
}

interface MetricCardProps {
  icon?: LucideIcon;
  title: string;
  /** Desglose tipo "ACEPTADO / PENDIENTE" (una fila por estado). */
  rows?: MetricCardRow[];
  /** Alternativa a `rows`: un solo número grande, con leyenda opcional debajo. */
  value?: string;
  valueTone?: 'success' | 'danger';
  caption?: string;
  /** Línea inferior tenue, ej. variación vs. período anterior. */
  trend?: string;
  action?: { label: string; onClick: () => void };
  /** Ámbar — para la tarjeta que necesita atención (ej. cuentas por pagar vencidas). */
  highlighted?: boolean;
  onClick?: () => void;
}

/** Tarjeta de métrica al estilo del CRM de referencia: icono + título, desglose por estado o un
 * valor único, y una línea de tendencia/acción abajo. Usada en Resumen, Estadísticas y Cuentas
 * por pagar de Administración (y pensada para que Canchas/Locales la reusen después). */
export function MetricCard({ icon: Icon, title, rows, value, valueTone, caption, trend, action, highlighted, onClick }: MetricCardProps) {
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-2xl border p-5 shadow-sm text-left w-full ${
        highlighted ? 'border-amber-300 bg-amber-50' : 'border-brand-950/10 bg-white'
      } ${onClick ? 'hover:bg-brand-950/[0.02] transition-colors' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className={`h-4 w-4 ${highlighted ? 'text-amber-600' : 'text-brand-950/40'}`} />}
        <p className={`text-xs font-medium uppercase tracking-wide ${highlighted ? 'text-amber-700' : 'text-brand-950/50'}`}>{title}</p>
      </div>

      {rows && (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span
                className={`text-[11px] font-semibold uppercase tracking-wide ${
                  r.tone === 'success' ? 'text-emerald-600' : r.tone === 'danger' ? 'text-red-600' : 'text-brand-950/40'
                }`}
              >
                {r.label}
              </span>
              <span className="text-sm font-semibold text-brand-950">{r.amount}</span>
            </div>
          ))}
        </div>
      )}

      {value && (
        <div>
          <p
            className={`text-2xl font-semibold ${
              valueTone === 'success' ? 'text-emerald-600' : valueTone === 'danger' ? 'text-red-600' : highlighted ? 'text-amber-700' : 'text-brand-950'
            }`}
          >
            {value}
          </p>
          {caption && <p className={`text-xs font-light mt-0.5 ${highlighted ? 'text-amber-700/70' : 'text-brand-950/40'}`}>{caption}</p>}
        </div>
      )}

      {(trend || action) && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-brand-950/[0.06]">
          {trend && <p className="text-[11px] text-brand-950/40 font-light">{trend}</p>}
          {action && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  action.onClick();
                }
              }}
              className="text-xs font-medium text-brand-500 hover:text-brand-600 cursor-pointer"
            >
              {action.label}
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}
