import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { officeApi, type Asiento, type Contacto, type Cuenta, type Empresa } from './officeApi';
import { money } from './officeFormat';

interface Linea {
  accountId: string;
  lado: 'debe' | 'haber';
  monto: string;
  detail: string;
  contactId: string;
}

const LINEA_VACIA: Linea = { accountId: '', lado: 'debe', monto: '', detail: '', contactId: '' };

/**
 * Libro diario: los asientos cargados y el formulario para registrar uno nuevo.
 *
 * El formulario va EN LA PÁGINA y no en una ventana flotante. Cargar un asiento no es confirmar
 * algo: hay que elegir cuentas, repartir montos y verificar que cuadre, mirando el listado de
 * arriba. Un modal que tapa la pantalla convierte eso en un ir y venir.
 */
export default function OfficeAsientosPage({ empresa }: { empresa: Empresa }) {
  const [asientos, setAsientos] = useState<Asiento[] | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([{ ...LINEA_VACIA }, { ...LINEA_VACIA, lado: 'haber' }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    officeApi.asientos(empresa.id, buscar.trim() ? { buscar: buscar.trim() } : undefined).then(setAsientos);
  }
  useEffect(cargar, [empresa.id, buscar]);
  useEffect(() => {
    officeApi.cuentas(empresa.id).then((c) => setCuentas(c.filter((x) => x.postable && x.active)));
    officeApi.contactos(empresa.id).then(setContactos);
  }, [empresa.id]);

  const m = money.bind(null, empresa);

  // El cuadre se calcula mientras se escribe: descubrir el descuadre al guardar obliga a
  // rehacer la cuenta mental desde cero.
  const totalDebe = useMemo(
    () => lineas.filter((l) => l.lado === 'debe').reduce((s, l) => s + (Number(l.monto.replace(',', '.')) || 0), 0),
    [lineas],
  );
  const totalHaber = useMemo(
    () => lineas.filter((l) => l.lado === 'haber').reduce((s, l) => s + (Number(l.monto.replace(',', '.')) || 0), 0),
    [lineas],
  );
  const diferencia = Math.round((totalDebe - totalHaber) * 100) / 100;
  const cuadra = diferencia === 0 && totalDebe > 0;

  function actualizar(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await officeApi.crearAsiento(empresa.id, {
        date: fecha,
        description: descripcion.trim(),
        reference: referencia.trim() || undefined,
        lines: lineas
          .filter((l) => l.accountId && Number(l.monto.replace(',', '.')) > 0)
          .map((l) => ({
            accountId: l.accountId,
            debit: l.lado === 'debe' ? Number(l.monto.replace(',', '.')) : 0,
            credit: l.lado === 'haber' ? Number(l.monto.replace(',', '.')) : 0,
            detail: l.detail.trim() || undefined,
            contactId: l.contactId || undefined,
          })),
      });
      setDescripcion('');
      setReferencia('');
      setLineas([{ ...LINEA_VACIA }, { ...LINEA_VACIA, lado: 'haber' }]);
      setAbierto(false);
      cargar();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo registrar el asiento.');
    } finally {
      setGuardando(false);
    }
  }

  async function anular(a: Asiento) {
    const motivo = prompt(`¿Por qué se anula el asiento ${a.numero}?`);
    if (!motivo?.trim()) return;
    await officeApi.anularAsiento(empresa.id, a.id, motivo.trim());
    cargar();
  }

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Libro diario</h1>
          <p className="mt-0.5 text-[13.5px] text-brand-950/50">Todo lo que se registró en {empresa.nombre}.</p>
        </div>
        {!abierto && (
          <TextureButton variant="brand" size="default" className="!w-auto" onClick={() => setAbierto(true)}>
            <Plus className="h-4 w-4" /> Nuevo asiento
          </TextureButton>
        )}
      </div>

      {abierto && (
        <div className="mb-6 rounded-2xl border border-brand-950/[0.08] bg-[#FAFAF9] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="text-[15px] font-semibold">Nuevo asiento</p>
            <button type="button" onClick={() => setAbierto(false)} className="text-brand-950/35 hover:text-brand-950">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <label className="block text-sm">
              <span className="text-brand-950/65">Fecha</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-brand-950/65">Descripción</span>
              <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Venta de mostrador" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/65">Referencia</span>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Factura 0123" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            {lineas.map((l, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_auto_130px_1fr_auto]">
                <label className="block text-xs">
                  <span className="text-brand-950/50">Cuenta</span>
                  <select value={l.accountId} onChange={(e) => actualizar(i, 'accountId', e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-2 text-sm">
                    <option value="">Elegir…</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                    ))}
                  </select>
                </label>
                <div className="flex overflow-hidden rounded-lg border border-brand-950/15">
                  {(['debe', 'haber'] as const).map((lado) => (
                    <button
                      key={lado}
                      type="button"
                      onClick={() => actualizar(i, 'lado', lado)}
                      className={`px-3 py-2 text-[12.5px] capitalize ${l.lado === lado ? 'bg-brand-950 text-white' : 'text-brand-950/55 hover:bg-brand-950/[0.04]'}`}
                    >
                      {lado}
                    </button>
                  ))}
                </div>
                <label className="block text-xs">
                  <span className="text-brand-950/50">Monto</span>
                  <input type="number" step="0.01" value={l.monto} onChange={(e) => actualizar(i, 'monto', e.target.value)} placeholder="0.00" className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-2 text-sm tabular-nums" />
                </label>
                <label className="block text-xs">
                  <span className="text-brand-950/50">Contacto (opcional)</span>
                  <select value={l.contactId} onChange={(e) => actualizar(i, 'contactId', e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-2.5 py-2 text-sm">
                    <option value="">—</option>
                    {contactos.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setLineas((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev))}
                  disabled={lineas.length <= 2}
                  className="mb-1 p-2 text-brand-950/25 hover:text-red-600 disabled:opacity-30"
                  title="Quitar línea"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setLineas((p) => [...p, { ...LINEA_VACIA }])} className="mt-2 flex items-center gap-1 text-[12.5px] text-brand-500 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Agregar línea
          </button>

          {/* El cuadre, en vivo. */}
          <div className={`mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl px-3 py-2.5 text-[13px] ${cuadra ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
            <span>Debe <strong className="tabular-nums">{m(totalDebe)}</strong></span>
            <span>Haber <strong className="tabular-nums">{m(totalHaber)}</strong></span>
            <span className="font-medium">
              {cuadra ? 'El asiento cuadra' : totalDebe === 0 ? 'Falta cargar los montos' : `Diferencia de ${m(Math.abs(diferencia))}`}
            </span>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          <div className="mt-4 flex gap-2">
            <TextureButton variant="brand" size="default" className="!w-auto disabled:opacity-40" disabled={guardando || !cuadra || !descripcion.trim()} onClick={guardar}>
              {guardando ? 'Registrando…' : 'Registrar asiento'}
            </TextureButton>
            <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setAbierto(false)}>
              Cancelar
            </TextureButton>
          </div>
        </div>
      )}

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-950/30" />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por descripción o referencia…" className="w-full rounded-lg border border-brand-950/15 py-2 pl-9 pr-3 text-sm" />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-950/[0.08]">
        {asientos === null ? (
          <p className="p-6 text-sm text-brand-950/40">Cargando…</p>
        ) : asientos.length === 0 ? (
          <p className="p-6 text-sm text-brand-950/40">Sin asientos todavía.</p>
        ) : (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-brand-950/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-brand-950/35">
                <th className="px-4 py-2.5">N.º</th>
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5">Descripción</th>
                <th className="px-4 py-2.5">Referencia</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5 text-right">Monto</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {asientos.map((a) => (
                <>
                  <tr
                    key={a.id}
                    onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                    className="cursor-pointer border-b border-brand-950/[0.04] hover:bg-brand-950/[0.02]"
                  >
                    <td className="px-4 py-3 tabular-nums text-brand-950/45">{a.numero}</td>
                    <td className="px-4 py-3 tabular-nums text-brand-950/65">{new Date(a.fecha).toLocaleDateString('es-VE')}</td>
                    <td className="px-4 py-3">{a.descripcion}</td>
                    <td className="px-4 py-3 text-brand-950/45">{a.referencia ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.anulado ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {a.anulado ? 'Anulado' : 'Registrado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{m(a.total)}</td>
                    <td className="px-4 py-3 text-right">
                      {!a.anulado && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); void anular(a); }} className="text-[12px] text-brand-950/40 hover:text-red-600">
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandido === a.id && (
                    <tr key={`${a.id}-det`} className="bg-[#FAFAF9]">
                      <td colSpan={7} className="px-4 py-3">
                        <table className="w-full text-[12.5px]">
                          <tbody>
                            {a.lineas.map((l, i) => (
                              <tr key={i}>
                                <td className="py-1 pr-4 text-brand-950/70">{l.cuenta}</td>
                                <td className="py-1 pr-4 text-brand-950/40">{l.contacto ?? l.detalle ?? ''}</td>
                                <td className="py-1 pr-4 text-right tabular-nums">{Number(l.debe) > 0 ? m(l.debe) : ''}</td>
                                <td className="py-1 text-right tabular-nums text-brand-950/60">{Number(l.haber) > 0 ? m(l.haber) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
