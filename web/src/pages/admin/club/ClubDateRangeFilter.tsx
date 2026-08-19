/** Inputs "Desde"/"Hasta" compartidos por las estadísticas del club — se agregan junto al
 * selector de preset (7/30/90 días…) de cada página; cuando se llenan, mandan sobre el
 * preset (el backend hace lo mismo, ver club-stats.service.ts#resolveStatsWindow). */
export function ClubDateRangeFilter({
  from,
  to,
  onFrom,
  onTo,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const active = Boolean(from || to);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-brand-950/50">
        Desde
        <input
          type="date"
          value={from}
          onChange={(e) => onFrom(e.target.value)}
          className="rounded-full border-none bg-brand-950/[0.06] px-2.5 py-1 text-xs font-medium text-brand-950/70"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-brand-950/50">
        Hasta
        <input
          type="date"
          value={to}
          onChange={(e) => onTo(e.target.value)}
          className="rounded-full border-none bg-brand-950/[0.06] px-2.5 py-1 text-xs font-medium text-brand-950/70"
        />
      </label>
      {active && (
        <button
          type="button"
          onClick={() => {
            onFrom('');
            onTo('');
          }}
          className="text-xs font-medium text-brand-950/40 underline"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
