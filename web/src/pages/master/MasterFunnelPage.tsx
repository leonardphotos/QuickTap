import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
];

interface Overview {
  total: number;
  completados: number;
  abandonos: number;
  conversion: number;
  abandonoEnVertical: number;
  abandonoEnFormulario: number;
}

/** Estadísticas de registro sin datos de contacto. */
export default function MasterFunnelPage() {
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<Overview | null>(null);

  function load() {
    masterApi.get('/master/registration-funnel', { params: { range } }).then((r) => setData(r.data.data));
  }

  useEffect(load, [range]);

  if (!data) return <p className="text-brand-950/50 font-light text-base">Cargando…</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Abandono de registro</h1>
          <p className="text-brand-950/60 font-light mt-1 text-base">
            Estadísticas de los últimos 90 días, sin nombres, teléfonos ni correos. Un intento cuenta como abandonado tras 30 minutos sin avanzar.
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {RANGE_LABELS.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r.value ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Llegaron a la pasarela" value={data.total} />
        <Stat label="Se registraron" value={data.completados} tone="good" />
        <Stat label="Abandonaron" value={data.abandonos} tone="bad" />
        <Stat label="Conversión" value={`${data.conversion}%`} tone={data.conversion >= 50 ? 'good' : 'warn'} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-brand-950/70 mb-3">¿Dónde se caen?</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-2xl font-semibold text-brand-950">{data.abandonoEnVertical}</p>
            <p className="text-brand-950/50 font-light mt-1 text-xs">
              Eligiendo el tipo de negocio — entraron a la pasarela y no llegaron ni al formulario.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-2xl font-semibold text-brand-950">{data.abandonoEnFormulario}</p>
            <p className="text-brand-950/50 font-light mt-1 text-xs">
              Llegaron a la pantalla de registro, pero no crearon la cuenta.
            </p>
          </div>
        </div>
      </section>

      <p className="rounded-2xl border border-brand-950/10 bg-white p-5 text-brand-950/60 text-base">
        Privacidad del registro: no guardamos los campos de formularios abandonados ni los usamos para contactar a visitantes. Las métricas individuales se eliminan después de 90 días.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' | 'warn' }) {
  const color =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-brand-950';
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
      <p className={`text-3xl font-semibold ${color}`}>{value}</p>
      <p className="text-brand-950/50 font-light mt-1 text-xs">{label}</p>
    </div>
  );
}
