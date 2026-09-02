import { useCallback, useEffect, useState } from 'react';
import { Loader2, Phone, Star } from 'lucide-react';
import { masterApi } from '@/api/client';

type Estado = 'PENDING' | 'CONTACTED' | 'CLOSED' | 'DISCARDED';

interface Lead {
  id: string;
  contactName: string;
  phone: string;
  address: string;
  businessName: string;
  status: Estado;
  notes: string | null;
  notifiedAt: string | null;
  createdAt: string;
}

const ESTADOS: { id: Estado; label: string; clase: string }[] = [
  { id: 'PENDING', label: 'Por llamar', clase: 'bg-amber-100 text-amber-800' },
  { id: 'CONTACTED', label: 'Contactado', clase: 'bg-blue-100 text-blue-800' },
  { id: 'CLOSED', label: 'Cerrado', clase: 'bg-emerald-100 text-emerald-800' },
  { id: 'DISCARDED', label: 'Descartado', clase: 'bg-neutral-200 text-neutral-600' },
];

const CLASE_DE = Object.fromEntries(ESTADOS.map((e) => [e.id, e.clase])) as Record<Estado, string>;
const LABEL_DE = Object.fromEntries(ESTADOS.map((e) => [e.id, e.label])) as Record<Estado, string>;

function fecha(iso: string): string {
  return new Date(iso).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Solo dígitos, para el enlace wa.me. */
function soloDigitos(tel: string): string {
  const d = tel.replace(/\D/g, '');
  // Un número venezolano local (04141234567) necesita el 58 para que wa.me lo entienda.
  return d.startsWith('0') ? `58${d.slice(1)}` : d;
}

/**
 * Asesorías: los prospectos que pidieron que los llamara un asesor por el Plan Elite.
 *
 * Existe además del aviso por WhatsApp porque el aviso se puede perder — el número del máster
 * puede estar desconectado o el formulario llegar fuera de su ventana horaria. Acá está
 * siempre; `notifiedAt` dice si el aviso llegó a salir o si nadie se enteró por otra vía.
 */
export default function MasterAdvisorLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pendientes, setPendientes] = useState(0);
  const [filtro, setFiltro] = useState<Estado | 'ALL'>('ALL');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    masterApi
      .get('/master/advisor-leads', { params: filtro === 'ALL' ? {} : { status: filtro } })
      .then((r) => {
        setLeads(r.data.data.leads);
        setPendientes(r.data.data.pendientes);
        setError(null);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudieron cargar las solicitudes.'))
      .finally(() => setCargando(false));
  }, [filtro]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiar(lead: Lead, cambios: Partial<Pick<Lead, 'status' | 'notes'>>) {
    setGuardando(lead.id);
    try {
      await masterApi.patch(`/master/advisor-leads/${lead.id}`, cambios);
      cargar();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-5 w-5 text-[#B8902E]" /> Asesorías
        </h1>
        <p className="text-sm opacity-60 font-light">
          Prospectos que pidieron que los contacte un asesor por el Plan Elite.
          {pendientes > 0 && <span className="font-semibold text-amber-600"> · {pendientes} por llamar</span>}
        </p>
      </div>

      <div className="flex w-max flex-wrap items-center gap-1 rounded-full bg-black/[0.06] p-1">
        {([{ id: 'ALL' as const, label: 'Todas' }, ...ESTADOS]).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setFiltro(e.id as Estado | 'ALL')}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtro === e.id ? 'bg-white text-black shadow-sm' : 'opacity-50 hover:opacity-90'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin opacity-30" />
        </div>
      ) : leads.length === 0 ? (
        <p className="text-sm opacity-40 font-light py-8 text-center">Sin solicitudes.</p>
      ) : (
        <div className="space-y-2">
          {leads.map((l) => (
            <div key={l.id} className="rounded-2xl border border-black/10 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2 flex-wrap">
                    {l.businessName}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CLASE_DE[l.status]}`}>
                      {LABEL_DE[l.status]}
                    </span>
                    {!l.notifiedAt && (
                      <span
                        className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"
                        title="El aviso por WhatsApp no salió: el número del máster estaba desconectado o fuera de su horario de envío."
                      >
                        Sin aviso
                      </span>
                    )}
                  </p>
                  <p className="text-sm opacity-70">{l.contactName}</p>
                  <p className="text-xs opacity-50">{l.address}</p>
                </div>
                <div className="text-right shrink-0">
                  <a
                    href={`https://wa.me/${soloDigitos(l.phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                  >
                    <Phone className="h-3.5 w-3.5" /> {l.phone}
                  </a>
                  <p className="text-[10px] opacity-40 mt-0.5">{fecha(l.createdAt)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {ESTADOS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={guardando === l.id || l.status === e.id}
                    onClick={() => cambiar(l, { status: e.id })}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-100 ${
                      l.status === e.id ? e.clase : 'bg-black/[0.05] opacity-50 hover:opacity-90'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>

              <textarea
                defaultValue={l.notes ?? ''}
                placeholder="Notas de la llamada…"
                rows={2}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (l.notes ?? '')) cambiar(l, { notes: v || null });
                }}
                className="w-full rounded-lg border border-black/10 bg-transparent px-2.5 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
