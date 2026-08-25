import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, ScanLine, Trash2, XCircle } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useBarcodeCamera } from '@/hooks/useBarcodeCamera';
import { playScannerSound } from './shopSounds';

/**
 * Puerta de un evento: escanear entradas y ver quién ya entró.
 *
 * Es la pantalla del rol Verificador, y también la usa el local para llevar la lista. El
 * escaneo se resuelve SIEMPRE contra el servidor (no contra una copia en memoria): dos
 * verificadores en la misma puerta tienen que ver la misma verdad, y es lo único que detecta
 * de verdad una entrada repetida.
 */

interface EventoResumen {
  id: string;
  nombre: string;
  fecha: string | null;
  hora: string | null;
  cupo: number | null;
  emitidas: number;
  verificadas: number;
}

interface TicketFila {
  id: string;
  accessToken: string;
  puesto: number;
  titular: string | null;
  telefono: string | null;
  precio: number;
  usada: boolean;
  usadaEl: string | null;
}

type Resultado = { tipo: 'OK' | 'REPETIDA' | 'INVALIDA'; mensaje: string; detalle?: string };

const ESTILO: Record<Resultado['tipo'], { bg: string; texto: string; Icono: typeof CheckCircle2 }> = {
  OK: { bg: 'bg-emerald-500', texto: 'text-white', Icono: CheckCircle2 },
  REPETIDA: { bg: 'bg-amber-500', texto: 'text-white', Icono: AlertTriangle },
  INVALIDA: { bg: 'bg-red-600', texto: 'text-white', Icono: XCircle },
};

export default function ShopTicketsPage() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState<EventoResumen[] | null>(null);
  const [eventoId, setEventoId] = useState<string>('');
  const [lista, setLista] = useState<{ total: number; verificadas: number; tickets: TicketFila[] } | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [busca, setBusca] = useState('');
  const [borrando, setBorrando] = useState<string | null>(null);
  // El lector dispara el mismo código muchas veces por segundo mientras el QR esté encuadrado:
  // sin esto, un solo escaneo mandaría decenas de peticiones y la primera marcaría la entrada
  // y las siguientes la reportarían como repetida.
  const ultimoRef = useRef<string>('');
  const ocupadoRef = useRef(false);

  function cargarEventos() {
    api.get('/shop/tickets/events').then((r) => {
      const evs: EventoResumen[] = r.data.data;
      setEventos(evs);
      setEventoId((prev) => prev || evs.find((e) => e.emitidas > 0)?.id || evs[0]?.id || '');
    });
  }
  useEffect(cargarEventos, []);

  function cargarLista(id = eventoId) {
    if (!id) return;
    api.get('/shop/tickets', { params: { productId: id } }).then((r) => setLista(r.data.data));
  }
  useEffect(() => {
    setLista(null);
    cargarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

  async function verificar(codigo: string) {
    if (ocupadoRef.current) return;
    ocupadoRef.current = true;
    try {
      // El QR puede traer la URL completa si alguien lo generó así: se queda con el token.
      const token = codigo.trim().replace(/^.*\/entrada\//, '');
      const { data } = await api.post('/shop/tickets/check-in', { accessToken: token });
      const r = data.data;
      setResultado({
        tipo: r.resultado,
        mensaje: r.mensaje,
        detalle: r.ticket ? `${r.ticket.evento}${r.ticket.titular ? ` · ${r.ticket.titular}` : ''}` : undefined,
      });
      playScannerSound();
      cargarLista();
      cargarEventos();
    } catch {
      setResultado({ tipo: 'INVALIDA', mensaje: 'No se pudo verificar. Intenta de nuevo.' });
    } finally {
      // Un respiro antes de aceptar el siguiente: da tiempo a apartar el teléfono del código
      // que se acaba de leer.
      setTimeout(() => {
        ocupadoRef.current = false;
        ultimoRef.current = '';
      }, 1500);
    }
  }

  const { videoRef, cameraError } = useBarcodeCamera(escaneando, (codigo) => {
    if (codigo === ultimoRef.current) return;
    ultimoRef.current = codigo;
    verificar(codigo);
  });

  async function deshacer(id: string) {
    if (!window.confirm('¿Marcar esta entrada como NO usada? Solo si la verificaste por error.')) return;
    await api.post(`/shop/tickets/${id}/undo`).catch(() => undefined);
    cargarLista();
    cargarEventos();
  }

  /**
   * Saca al asistente de la lista. Se avisa lo que NO hace: la venta queda cobrada, así que
   * quien borra por una cancelación real tiene que devolver la venta aparte.
   */
  async function eliminar(id: string, nombre: string | null, puesto: number) {
    const quien = nombre?.trim() ? `${nombre.trim()} (puesto ${puesto})` : `el puesto ${puesto}`;
    if (
      !window.confirm(
        `¿Eliminar a ${quien}?\n\nSu entrada deja de servir en la puerta y el cupo vuelve a estar a la venta. La venta sigue cobrada: si la persona canceló, devuélvela desde el historial.`,
      )
    ) {
      return;
    }
    setBorrando(id);
    try {
      await api.delete(`/shop/tickets/${id}`);
      cargarLista();
      cargarEventos();
    } catch (e: any) {
      // El mensaje del servidor a la cara: el "no se pudo" genérico escondió un 403 de rol
      // y costó diagnosticarlo desde el otro lado de la pantalla.
      window.alert(e?.response?.data?.error ?? 'No se pudo eliminar la entrada. Intenta de nuevo.');
    } finally {
      setBorrando(null);
    }
  }

  const evento = eventos?.find((e) => e.id === eventoId) ?? null;
  const visibles = (lista?.tickets ?? []).filter((t) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return (
      String(t.puesto).includes(q) ||
      (t.titular ?? '').toLowerCase().includes(q) ||
      (t.telefono ?? '').includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand-950">Entradas</h1>
        <p className="text-sm font-light text-brand-950/50">
          Escanea el código de cada asistente en la puerta. Una entrada ya usada se avisa al momento.
        </p>
      </div>

      {eventos?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-brand-950/15 py-10 text-center text-sm font-light text-brand-950/40">
          Todavía no hay eventos. Créalos en Inventario, en la categoría Tickets.
        </p>
      )}

      {eventos && eventos.length > 0 && (
        <label className="block text-sm">
          <span className="text-brand-950/70">Evento</span>
          <select
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 sm:max-w-md"
          >
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
                {e.fecha ? ` · ${e.fecha.split('-').reverse().join('/')}` : ''}
                {` · ${e.verificadas}/${e.emitidas}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {evento && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-950/[0.08] bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-950">{evento.nombre}</p>
              <p className="text-xs font-light text-brand-950/50">
                {evento.fecha?.split('-').reverse().join('/')}
                {evento.hora && ` · ${evento.hora}`}
                {` · ${evento.emitidas} entradas emitidas`}
                {evento.cupo != null && ` de ${evento.cupo} puestos`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-brand-950">
                {evento.verificadas}
                <span className="text-base font-medium text-brand-950/40">/{evento.emitidas}</span>
              </p>
              <p className="text-[11px] font-light text-brand-950/45">ya entraron</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setResultado(null);
                setEscaneando((s) => !s);
              }}
              className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
                escaneando ? 'bg-brand-950' : 'bg-brand-500 hover:bg-brand-600'
              }`}
            >
              <ScanLine className="h-4 w-4" /> {escaneando ? 'Detener' : 'Escanear'}
            </button>
          </div>

          {escaneando && (
            <div className="overflow-hidden rounded-2xl bg-black">
              <div className="relative">
                <video ref={videoRef} className="h-[46vh] w-full object-cover" playsInline muted />
                {/* Mira de encuadre */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-40 rounded-2xl border-2 border-white/70" />
                </div>
                {cameraError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm text-white/80">
                    {cameraError}
                  </div>
                )}
              </div>
              {resultado && (
                <div
                  className={`flex items-center gap-3 px-5 py-4 ${ESTILO[resultado.tipo].bg} ${ESTILO[resultado.tipo].texto}`}
                >
                  {(() => {
                    const { Icono } = ESTILO[resultado.tipo];
                    return <Icono className="h-7 w-7 shrink-0" />;
                  })()}
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold leading-tight">{resultado.mensaje}</p>
                    {resultado.detalle && <p className="truncate text-[12px] opacity-90">{resultado.detalle}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-brand-950">Asistentes</h2>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por puesto, nombre o teléfono"
                className="w-full max-w-xs rounded-lg border border-brand-950/15 px-3 py-1.5 text-sm"
              />
            </div>

            {lista === null && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}
            {lista?.tickets.length === 0 && (
              <p className="rounded-2xl border border-dashed border-brand-950/15 py-8 text-center text-sm font-light text-brand-950/40">
                Todavía no se ha vendido ninguna entrada de este evento.
              </p>
            )}

            <div className="space-y-1.5">
              {visibles.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    t.usada ? 'border-emerald-200 bg-emerald-50/60' : 'border-brand-950/[0.08] bg-white'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${
                      t.usada ? 'bg-emerald-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60'
                    }`}
                  >
                    {t.puesto}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-950">{t.titular ?? 'Sin nombre'}</p>
                    <p className="text-[11px] font-light text-brand-950/45">
                      {t.telefono ?? 'sin teléfono'}
                      {t.usada && t.usadaEl && ` · entró ${new Date(t.usadaEl).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  {/* El Verificador está en la puerta: solo marca entradas, no las deshace ni
                      las borra — borrar devuelve un cupo a la venta. */}
                  {user?.role !== 'VERIFICADOR' && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {t.usada && (
                        <button
                          type="button"
                          onClick={() => deshacer(t.id)}
                          title="Marcar como no usada"
                          className="rounded-lg p-1.5 text-brand-950/35 transition-colors hover:bg-brand-950/[0.06] hover:text-brand-950/70"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={borrando === t.id}
                        onClick={() => eliminar(t.id, t.titular, t.puesto)}
                        title="Eliminar asistente"
                        className="rounded-lg p-1.5 text-brand-950/35 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
