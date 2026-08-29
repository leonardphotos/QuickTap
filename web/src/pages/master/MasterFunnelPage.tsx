import { useEffect, useState } from 'react';
import { Check, Filter, Mail, MessageCircle, Undo2 } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { waPhone } from '@/utils/waPhone';

type Range = 'day' | 'week' | 'month' | 'year' | 'all';

const RANGE_LABELS: { value: Range; label: string }[] = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
];

const VERTICAL_LABELS: Record<string, string> = {
  restaurant: 'Restaurante',
  shop: 'Local comercial',
  club: 'Canchas',
  office: 'Administración',
};

interface Contactable {
  id: string;
  stage: string;
  businessType: string | null;
  shopRubro: string | null;
  restaurantName: string | null;
  slug: string | null;
  whatsappPhone: string | null;
  ownerName: string | null;
  email: string | null;
  lastError: string | null;
  contactedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Overview {
  total: number;
  completados: number;
  abandonos: number;
  conversion: number;
  abandonoEnVertical: number;
  abandonoEnFormulario: number;
  contactables: Contactable[];
}

/** Mensaje con el que el equipo retoma a quien no terminó de registrarse. */
function mensajeDeRescate(c: Contactable): string {
  const nombre = c.ownerName?.trim().split(' ')[0];
  const negocio = c.restaurantName?.trim();
  return [
    `Hola${nombre ? ` ${nombre}` : ''} 👋 Te escribimos de *QuickTap*.`,
    '',
    `Vimos que empezaste a crear tu cuenta${negocio ? ` para *${negocio}*` : ''} y quedó a medio camino.`,
    '¿Te ayudamos a terminarla? Son 2 minutos y tienes 15 días de prueba gratis, sin tarjeta.',
  ].join('\n');
}

/**
 * Abandono de la pasarela de registro (Dashboard maestro).
 *
 * Responde dos cosas distintas: cuánta gente empieza a registrarse y no termina (y en qué paso
 * se cae), y quiénes son los que dejaron con qué contactarlos. La lista solo trae a los que
 * dejaron teléfono o correo — el resto no sirve para llamar a nadie.
 */
export default function MasterFunnelPage() {
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<Overview | null>(null);
  const [soloSinContactar, setSoloSinContactar] = useState(false);

  function load() {
    masterApi.get('/master/registration-funnel', { params: { range } }).then((r) => setData(r.data.data));
  }

  useEffect(load, [range]);

  async function marcarContactado(c: Contactable) {
    await masterApi.patch(`/master/registration-funnel/${c.id}/contacted`, { contactado: !c.contactedAt });
    load();
  }

  if (!data) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  const lista = soloSinContactar ? data.contactables.filter((c) => !c.contactedAt) : data.contactables;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Abandono de registro</h1>
          <p className="text-sm text-brand-950/60 font-light mt-1">
            Cuánta gente llega a la pasarela y no termina de crear su cuenta, y con quiénes se puede hablar para
            rescatarlos. Un intento cuenta como abandonado tras 30 minutos sin avanzar — quien está llenando el
            formulario ahora mismo no aparece acá.
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
            <p className="text-xs text-brand-950/50 font-light mt-1">
              Eligiendo el tipo de negocio — entraron a la pasarela y no llegaron ni al formulario.
            </p>
          </div>
          <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <p className="text-2xl font-semibold text-brand-950">{data.abandonoEnFormulario}</p>
            <p className="text-xs text-brand-950/50 font-light mt-1">
              Con el formulario abierto — llegaron a llenar sus datos y no lo enviaron.
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-sm font-semibold text-brand-950/70">
            Para contactar
            {data.contactables.length > 0 && (
              <span className="ml-2 text-xs font-semibold bg-brand-500 text-white rounded-full px-2 py-0.5">
                {data.contactables.length}
              </span>
            )}
          </h2>
          <button
            onClick={() => setSoloSinContactar((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              soloSinContactar ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            <Filter className="h-3 w-3" /> Solo sin contactar
          </button>
        </div>

        {lista.length === 0 ? (
          <p className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-8 text-center text-sm text-brand-950/40 font-light">
            {data.contactables.length === 0
              ? 'Nadie abandonó dejando teléfono o correo en este período.'
              : 'Ya contactaste a todos los de este período.'}
          </p>
        ) : (
          <div className="space-y-2.5">
            {lista.map((c) => (
              <div
                key={c.id}
                className={`rounded-2xl border bg-white shadow-sm p-4 ${
                  c.contactedAt ? 'border-emerald-200 bg-emerald-50/40' : 'border-brand-950/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-950">
                      {c.ownerName || 'Sin nombre'}
                      {c.restaurantName && <span className="font-normal text-brand-950/60"> · {c.restaurantName}</span>}
                    </p>
                    <p className="text-xs text-brand-950/50 mt-0.5">
                      {c.businessType ? (VERTICAL_LABELS[c.businessType] ?? c.businessType) : 'Sin vertical'}
                      {c.shopRubro ? ` · ${c.shopRubro}` : ''}
                      {c.slug ? ` · /${c.slug}` : ''}
                      {' · '}
                      {c.stage === 'START' ? 'no llegó al formulario' : 'no envió el formulario'}
                    </p>
                    <p className="text-xs text-brand-950/40 mt-0.5">
                      {c.whatsappPhone ?? ''}
                      {c.whatsappPhone && c.email ? ' · ' : ''}
                      {c.email ?? ''}
                    </p>
                    {c.lastError && (
                      <p className="text-xs text-red-600/80 mt-1">Se topó con: {c.lastError}</p>
                    )}
                    <p className="text-[11px] text-brand-950/35 mt-1">
                      {new Date(c.updatedAt).toLocaleString('es-VE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {c.contactedAt && ' · ya contactado'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.whatsappPhone && (
                      <a
                        href={`https://wa.me/${waPhone(c.whatsappPhone)}?text=${encodeURIComponent(mensajeDeRescate(c))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-1 rounded-full border border-brand-950/15 px-3 py-1.5 text-xs font-medium text-brand-950/60 hover:bg-brand-950/5"
                      >
                        <Mail className="h-3.5 w-3.5" /> Correo
                      </a>
                    )}
                    <TextureButton
                      variant="minimal"
                      size="sm"
                      className="!w-auto"
                      onClick={() => marcarContactado(c)}
                    >
                      {c.contactedAt ? (
                        <>
                          <Undo2 className="h-3.5 w-3.5" /> Deshacer
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" /> Ya lo contacté
                        </>
                      )}
                    </TextureButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'good' | 'bad' | 'warn' }) {
  const color =
    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-brand-950';
  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
      <p className={`text-3xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-brand-950/50 font-light mt-1">{label}</p>
    </div>
  );
}
