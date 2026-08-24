import { useEffect, useState } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import { api } from '@/api/client';

/**
 * Ventana "QuickTap Wallet" del panel del local.
 *
 * Dos cosas en una pantalla: los abonos que los clientes reportaron y esperan verificación
 * —arriba, porque es lo que hay que atender— y debajo la lista de todos los deudores.
 *
 * Verificar es lo único que mueve dinero: hasta que el local aprueba, el abono reportado no
 * existe para las cuentas del negocio.
 */

interface Pendiente {
  id: string;
  cliente: string;
  telefono: string | null;
  monto: number;
  metodo: string;
  comprobante: string | null;
  reportadoEl: string;
  installmentId: string | null;
}

interface Deudor {
  nombre: string;
  telefono: string;
  total: number;
  abonado: number;
  saldo: number;
  compras: number;
  cuotasVencidas: number;
}

const money = (n: number) => `$${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METODOS: Record<string, string> = {
  pagoMovil: 'Pago Móvil',
  MOBILE_PAYMENT: 'Pago Móvil',
  zelle: 'Zelle',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  binance: 'Binance',
};

export default function ShopWalletPage() {
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [deudores, setDeudores] = useState<Deudor[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    api.get('/shop/wallet/pending').then((r) => setPendientes(r.data.data)).catch(() => setPendientes([]));
    api.get('/shop/wallet/debtors').then((r) => setDeudores(r.data.data)).catch(() => setDeudores([]));
  }
  useEffect(cargar, []);

  async function aprobar(id: string) {
    setOcupado(id);
    setError(null);
    try {
      await api.post(`/shop/wallet/${id}/approve`);
      cargar();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo verificar el abono.');
    } finally {
      setOcupado(null);
    }
  }

  async function rechazar(id: string) {
    const motivo = window.prompt('¿Por qué lo rechazas? El cliente verá este motivo.');
    if (!motivo?.trim()) return;
    setOcupado(id);
    setError(null);
    try {
      await api.post(`/shop/wallet/${id}/reject`, { motivo: motivo.trim() });
      cargar();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo rechazar el abono.');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-brand-950">QuickTap Wallet</h1>
        <p className="text-sm font-light text-brand-950/50">
          Abonos que tus clientes reportaron desde su portal, y el estado de sus deudas.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-brand-950">
          Por verificar {pendientes && pendientes.length > 0 && `(${pendientes.length})`}
        </h2>
        {pendientes === null && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}
        {pendientes?.length === 0 && (
          <p className="rounded-2xl border border-brand-950/[0.06] bg-white px-4 py-6 text-center text-sm font-light text-brand-950/40">
            No hay abonos esperando verificación.
          </p>
        )}
        <div className="space-y-2">
          {pendientes?.map((p) => (
            <div key={p.id} className="rounded-2xl border border-amber-300/50 bg-amber-50/50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand-950">{p.cliente}</p>
                  <p className="text-xs font-light text-brand-950/50">
                    {p.telefono ?? 'sin teléfono'} · {METODOS[p.metodo] ?? p.metodo}
                    {p.installmentId && ' · imputado a una cuota'}
                  </p>
                  <p className="text-[11px] font-light text-brand-950/40">
                    {new Date(p.reportadoEl).toLocaleString('es-VE')}
                  </p>
                </div>
                <p className="text-lg font-bold tabular-nums text-brand-950">{money(p.monto)}</p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {p.comprobante ? (
                  <a
                    href={p.comprobante}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-950/15 bg-white px-3 py-1.5 text-xs font-medium text-brand-950"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver comprobante
                  </a>
                ) : (
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-light text-brand-950/40">
                    Sin comprobante
                  </span>
                )}
                <button
                  onClick={() => aprobar(p.id)}
                  disabled={ocupado === p.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" /> {ocupado === p.id ? 'Verificando…' : 'Verificar y sumar'}
                </button>
                <button
                  onClick={() => rechazar(p.id)}
                  disabled={ocupado === p.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-brand-950">
          Clientes con deuda {deudores && deudores.length > 0 && `(${deudores.length})`}
        </h2>
        {deudores?.length === 0 && (
          <p className="rounded-2xl border border-brand-950/[0.06] bg-white px-4 py-6 text-center text-sm font-light text-brand-950/40">
            Nadie te debe. 🎉
          </p>
        )}
        <div className="space-y-2">
          {deudores?.map((d) => (
            <div key={d.telefono} className="rounded-2xl border border-brand-950/[0.06] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand-950">{d.nombre}</p>
                  <p className="text-xs font-light text-brand-950/50">
                    {d.telefono} · {d.compras} compra{d.compras === 1 ? '' : 's'}
                    {d.cuotasVencidas > 0 && (
                      <span className="ml-1 font-medium text-red-600">
                        · {d.cuotasVencidas} cuota{d.cuotasVencidas === 1 ? '' : 's'} vencida
                        {d.cuotasVencidas === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold tabular-nums text-brand-950">{money(d.saldo)}</p>
                  <p className="text-[11px] font-light text-brand-950/40">de {money(d.total)}</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-950/[0.07]">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${d.total > 0 ? Math.min(100, Math.round((d.abonado / d.total) * 100)) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
