import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Plan de cuotas de una venta fiada, desde Cuentas por Cobrar.
 *
 * Si la venta todavía no tiene plan, se arma: cantidad de cuotas, fecha de la primera, mora y
 * aviso previo. Si ya lo tiene, se listan las cuotas y se puede corregir monto y fecha de cada
 * una — reacomodar el pago con el cliente es lo normal, y así no hay que anular la venta.
 */

interface Cuota {
  id: string;
  number: number;
  amount: number;
  dueDate: string;
  paidAmount: number;
  lateFeeCharged: number;
  saldo: number;
  estado: 'PAGADA' | 'VENCIDA' | 'POR_VENCER' | 'PENDIENTE';
}

interface Plan {
  id: string;
  lateFeeAmount: number;
  alertDaysBefore: number;
  cuotas: Cuota[];
}

const money = (n: number) => `$${n.toFixed(2)}`;

const COLOR: Record<Cuota['estado'], string> = {
  PAGADA: 'text-emerald-600',
  VENCIDA: 'text-red-600',
  POR_VENCER: 'text-amber-600',
  PENDIENTE: 'text-brand-950/60',
};

const ETIQUETA: Record<Cuota['estado'], string> = {
  PAGADA: 'Pagada',
  VENCIDA: 'Vencida',
  POR_VENCER: 'Por vencer',
  PENDIENTE: 'Pendiente',
};

export function ShopInstallmentsDialog({
  saleId,
  saldo,
  onClose,
  onChanged,
}: {
  saleId: string;
  saldo: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const hoy = new Date().toLocaleDateString('en-CA');
  const [cantidad, setCantidad] = useState('3');
  const [primeraFecha, setPrimeraFecha] = useState(hoy);
  const [mora, setMora] = useState('0');
  const [avisoDias, setAvisoDias] = useState('3');

  const [editando, setEditando] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editFecha, setEditFecha] = useState('');

  function cargar() {
    api
      .get(`/shop/sales/${saleId}/installments`)
      .then((r) => setPlan(r.data.data))
      .catch(() => setError('No se pudo cargar el plan.'))
      .finally(() => setCargando(false));
  }
  useEffect(cargar, [saleId]);

  async function crear() {
    setGuardando(true);
    setError(null);
    try {
      await api.post(`/shop/sales/${saleId}/installments`, {
        cantidad: Number(cantidad),
        primeraFecha,
        lateFeeAmount: Number(mora) || 0,
        alertDaysBefore: Number(avisoDias) || 0,
      });
      cargar();
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo crear el plan.');
    } finally {
      setGuardando(false);
    }
  }

  async function guardarCuota(id: string) {
    setGuardando(true);
    setError(null);
    try {
      await api.patch(`/shop/installments/${id}`, {
        ...(editMonto ? { amount: Number(editMonto) } : {}),
        ...(editFecha ? { dueDate: editFecha } : {}),
      });
      setEditando(null);
      cargar();
      onChanged();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar la cuota.');
    } finally {
      setGuardando(false);
    }
  }

  const cuotasNum = Number(cantidad) || 1;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Plan de cuotas</DialogTitle>
        </DialogHeader>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {cargando && <p className="text-sm font-light text-brand-950/40">Cargando…</p>}

        {!cargando && !plan && (
          <div className="space-y-3">
            <p className="text-sm font-light text-brand-950/60">
              Saldo a financiar: <span className="font-semibold text-brand-950">{money(saldo)}</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-brand-950/70">Cuotas</span>
                <input
                  type="number"
                  min={2}
                  max={60}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/70">Primera cuota</span>
                <input
                  type="date"
                  value={primeraFecha}
                  onChange={(e) => setPrimeraFecha(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/70">Mora por cuota vencida</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={mora}
                  onChange={(e) => setMora(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/70">Avisar días antes</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={avisoDias}
                  onChange={(e) => setAvisoDias(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2"
                />
              </label>
            </div>
            <p className="text-[11px] font-light text-brand-950/45">
              Quedarían {cuotasNum} cuotas de ~{money(saldo / Math.max(1, cuotasNum))}, una por mes. La mora y el aviso
              se congelan en este plan: si luego cambias tu política, esta venta conserva lo pactado.
            </p>
            <TextureButton variant="brand" size="default" disabled={guardando} onClick={crear}>
              {guardando ? 'Creando…' : 'Crear plan'}
            </TextureButton>
          </div>
        )}

        {!cargando && plan && (
          <div className="space-y-2">
            <p className="text-[11px] font-light text-brand-950/45">
              Mora {money(plan.lateFeeAmount)} por cuota vencida · aviso {plan.alertDaysBefore} días antes
            </p>
            {plan.cuotas.map((c) => (
              <div key={c.id} className="rounded-xl border border-brand-950/[0.08] px-3 py-2">
                {editando === c.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={editMonto}
                      onChange={(e) => setEditMonto(e.target.value)}
                      className="w-24 rounded-lg border border-brand-950/15 px-2 py-1 text-sm"
                    />
                    <input
                      type="date"
                      value={editFecha}
                      onChange={(e) => setEditFecha(e.target.value)}
                      className="rounded-lg border border-brand-950/15 px-2 py-1 text-sm"
                    />
                    <TextureButton variant="brand" size="sm" className="!w-auto" disabled={guardando} onClick={() => guardarCuota(c.id)}>
                      Guardar
                    </TextureButton>
                    <button onClick={() => setEditando(null)} className="text-sm text-brand-950/40">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-950">
                        Cuota #{c.number} · {new Date(`${c.dueDate}T00:00:00`).toLocaleDateString('es-VE')}
                      </p>
                      <p className={`text-[11px] font-light ${COLOR[c.estado]}`}>
                        {ETIQUETA[c.estado]}
                        {c.lateFeeCharged > 0 && ` · mora ${money(c.lateFeeCharged)}`}
                        {c.paidAmount > 0 && c.estado !== 'PAGADA' && ` · abonado ${money(c.paidAmount)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-brand-950">{money(c.amount)}</span>
                      {c.estado !== 'PAGADA' && (
                        <button
                          onClick={() => {
                            setEditando(c.id);
                            setEditMonto(String(c.amount));
                            setEditFecha(c.dueDate);
                          }}
                          className="text-[11px] font-semibold text-brand-500"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
