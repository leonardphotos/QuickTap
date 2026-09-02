import { useCallback, useEffect, useState } from 'react';
import { Loader2, Star, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { canManagePartners } from '@/utils/roles';
import { formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { crmApi, type CrmCustomer } from './crmApi';

type Rango = 'day' | 'week' | 'month' | 'year';
const RANGOS: { id: Rango; label: string }[] = [
  { id: 'day', label: 'Hoy' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
  { id: 'year', label: 'Año' },
];

interface ConsumoSocio {
  nombre: string;
  telefono: string | null;
  pedidos: number;
  costoBase: string;
  ventaEquivalenteBase: string;
}
interface ReporteSocios {
  resumen: { pedidos: number; costoBase: string; ventaEquivalenteBase: string };
  socios: ConsumoSocio[];
  productos: { name: string; cantidad: number; costoBase: string }[];
}

/**
 * Socios: gente de la casa que consume a cuenta.
 *
 * Lo que consumen NO es una venta — no entra en ventas, ticket promedio, utilidad ni cierre
 * de caja — pero sí sale del inventario, porque la comida se gastó igual. Por eso el reporte
 * de acá va valorado a COSTO: es lo que de verdad le costó al local, no un ingreso perdido.
 */
export function PartnersSection() {
  const { user, restaurant } = useAuth();
  const symbol = restaurant?.currencySymbol ?? '$';
  const puedeGestionar = canManagePartners(user?.role);

  const [socios, setSocios] = useState<CrmCustomer[]>([]);
  const [rango, setRango] = useState<Rango>('month');
  const [reporte, setReporte] = useState<ReporteSocios | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alta: se busca entre los clientes que ya existen y se marca, en vez de crear un duplicado.
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [candidatos, setCandidatos] = useState<CrmCustomer[]>([]);
  const [guardando, setGuardando] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([
      crmApi.customers({ partner: 'only' }),
      api.get(`/orders/reports/partner-consumption`, { params: { range: rango } }).then((r) => r.data.data),
    ])
      .then(([lista, rep]) => {
        setSocios(lista.customers);
        setReporte(rep);
        setError(null);
      })
      .catch((err) => setError(err.response?.data?.error ?? 'No se pudo cargar los socios.'))
      .finally(() => setCargando(false));
  }, [rango]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!buscando) return;
    const t = setTimeout(() => {
      crmApi
        .customers({ search: busqueda.trim() || undefined, partner: 'exclude' })
        .then((d) => setCandidatos(d.customers.slice(0, 12)))
        .catch(() => setCandidatos([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, buscando]);

  async function marcar(c: CrmCustomer, esSocio: boolean) {
    setGuardando(c.id);
    try {
      await crmApi.updateCustomer(c.id, { isPartner: esSocio });
      setBuscando(false);
      setBusqueda('');
      cargar();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setGuardando(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-violet-900 flex items-center gap-1.5">
          <Star className="h-4 w-4" /> Socios
        </p>
        <p className="text-xs text-violet-900/70 font-light leading-relaxed mt-1">
          Consumen a cuenta. Lo que se llevan <span className="font-semibold">no cuenta como venta</span> y no entra en
          administración, pero <span className="font-semibold">sí se descuenta del inventario</span>. Solo un dueño o
          administrador puede agregarlos.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-max items-center gap-1 rounded-full bg-brand-950/[0.05] p-1">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRango(r.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                rango === r.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {puedeGestionar && !buscando && (
          <TextureButton variant="brand" size="sm" className="!w-auto" onClick={() => setBuscando(true)}>
            <UserPlus className="h-4 w-4 mr-1.5" /> Agregar socio
          </TextureButton>
        )}
      </div>

      {buscando && (
        <div className="rounded-2xl border border-brand-950/10 p-3 space-y-2">
          <p className="text-xs font-semibold text-brand-950/50">
            Busca al cliente y márcalo como socio. Si no existe todavía, créalo primero en Clientes.
          </p>
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, teléfono o cédula…"
            className="w-full text-sm border border-brand-950/15 rounded-lg px-3 py-2"
          />
          <div className="max-h-56 overflow-y-auto rounded-xl border border-brand-950/10 divide-y divide-brand-950/10">
            {candidatos.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={guardando === c.id}
                onClick={() => marcar(c, true)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50 disabled:opacity-50 flex items-center justify-between gap-2"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-brand-950 truncate">{c.name}</span>
                  <span className="block text-xs text-brand-950/50 truncate">
                    {c.phone}
                    {c.idNumber ? ` · ${c.idNumber}` : ''}
                  </span>
                </span>
                <span className="text-xs font-semibold text-violet-600 shrink-0">
                  {guardando === c.id ? 'Guardando…' : 'Hacer socio'}
                </span>
              </button>
            ))}
            {candidatos.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-brand-950/40 font-light">Sin resultados.</p>
            )}
          </div>
          <TextureButton variant="minimal" size="sm" className="!w-auto" onClick={() => setBuscando(false)}>
            Cancelar
          </TextureButton>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-brand-950/30" />
        </div>
      ) : (
        <>
          {reporte && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Cifra titulo="Pedidos del período" valor={String(reporte.resumen.pedidos)} />
              <Cifra
                titulo="Costo real"
                valor={formatBase(reporte.resumen.costoBase, symbol)}
                nota="Lo que salió del inventario"
                destacado
              />
              <Cifra
                titulo="A precio de carta"
                valor={formatBase(reporte.resumen.ventaEquivalenteBase, symbol)}
                nota="Referencia, no es plata perdida"
              />
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-brand-950">Socios ({socios.length})</p>
            {socios.length === 0 ? (
              <p className="text-sm text-brand-950/40 font-light">
                Todavía no hay socios. {puedeGestionar ? 'Usa "Agregar socio".' : 'Solo un administrador puede agregarlos.'}
              </p>
            ) : (
              <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/10 overflow-hidden">
                {socios.map((s) => {
                  const consumo = reporte?.socios.find((x) => x.telefono === s.phone);
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-brand-950 truncate">{s.name}</p>
                        <p className="text-xs text-brand-950/50 truncate">
                          {s.phone}
                          {s.idNumber ? ` · ${s.idNumber}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-brand-950">
                          {formatBase(consumo?.costoBase ?? '0.00', symbol)}
                        </p>
                        <p className="text-[10px] text-brand-950/40">{consumo?.pedidos ?? 0} pedidos</p>
                      </div>
                      {puedeGestionar && (
                        <button
                          type="button"
                          disabled={guardando === s.id}
                          onClick={() => marcar(s, false)}
                          title="Quitar como socio"
                          aria-label={`Quitar a ${s.name} como socio`}
                          className="shrink-0 text-brand-950/25 hover:text-red-500 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {puedeGestionar && socios.length > 0 && (
              <p className="text-[11px] font-light text-brand-950/40">
                Quitar a alguien como socio no borra su ficha ni cambia lo que ya consumió: los pedidos viejos siguen
                siendo consumo interno.
              </p>
            )}
          </div>

          {reporte && reporte.productos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-brand-950">Qué consumieron</p>
              <div className="rounded-2xl border border-brand-950/10 divide-y divide-brand-950/10 overflow-hidden">
                {reporte.productos.slice(0, 15).map((p) => (
                  <div key={p.name} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-brand-950 truncate">{p.name}</span>
                    <span className="text-xs text-brand-950/50 shrink-0 tabular-nums">
                      {p.cantidad} · {formatBase(p.costoBase, symbol)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, nota, destacado }: { titulo: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${destacado ? 'border-violet-200 bg-violet-50/60' : 'border-brand-950/10'}`}>
      <p className="text-[11px] font-medium text-brand-950/50">{titulo}</p>
      <p className={`text-lg font-bold tabular-nums ${destacado ? 'text-violet-900' : 'text-brand-950'}`}>{valor}</p>
      {nota && <p className="text-[10px] font-light text-brand-950/40 leading-tight mt-0.5">{nota}</p>}
    </div>
  );
}
