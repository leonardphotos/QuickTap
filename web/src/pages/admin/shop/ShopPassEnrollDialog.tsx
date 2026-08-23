import { useState } from 'react';
import { api } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Alta de un cliente en QuickTap Pass desde el cobro, con su plan de cuotas.
 *
 * Dos pasos a propósito: primero quién es (la cédula es obligatoria porque es su clave para
 * entrar al portal), y recién después cómo va a pagar. Pedir todo junto en una sola pantalla
 * larga hace que el cajero se pierda con el cliente esperando en el mostrador.
 */

const FRECUENCIAS = [
  { id: 'SEMANAL', label: 'Semanal', dias: 7 },
  { id: 'QUINCENAL', label: 'Cada 15 días', dias: 15 },
  { id: 'MENSUAL', label: 'Mensual', dias: 30 },
  { id: 'TRIMESTRAL', label: 'Cada 3 meses', dias: 90 },
  { id: 'SEMESTRAL', label: 'Cada 6 meses', dias: 180 },
] as const;

interface Props {
  /** Saldo que se va a financiar (lo que queda por pagar de la venta). */
  saldo: number;
  money: (n: number) => string;
  moneyBs: (n: number) => string | null;
  onClose: () => void;
  /** Devuelve los datos ya validados para que el cobro siga su curso. */
  onListo: (r: {
    cliente: { name: string; phone: string; idNumber: string; email: string };
    plan: { cantidad: number; frecuencia: string; recargoPorcentaje: number; primeraFecha: string };
  }) => void;
}

export function ShopPassEnrollDialog({ saldo, money, moneyBs, onClose, onListo }: Props) {
  const [paso, setPaso] = useState<'cliente' | 'plan'>('cliente');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');

  const [cantidad, setCantidad] = useState('3');
  const [frecuencia, setFrecuencia] = useState<string>('MENSUAL');
  const [recargo, setRecargo] = useState('0');

  const cuotas = Math.max(1, Number(cantidad) || 1);
  const pct = Math.max(0, Number(recargo) || 0);
  const totalConRecargo = Math.round(saldo * (1 + pct / 100) * 100) / 100;
  // Mismo reparto que el backend (shop-installments.service): el sobrante del redondeo va a la
  // PRIMERA cuota, para que la suma cuadre exacta. Se replica acá para que lo que el cajero le
  // muestra al cliente sea idéntico a lo que se va a crear, centavo por centavo.
  const base = Math.floor((totalConRecargo / cuotas) * 100) / 100;
  const sobrante = Math.round((totalConRecargo - base * cuotas) * 100) / 100;
  const dias = FRECUENCIAS.find((f) => f.id === frecuencia)?.dias ?? 30;
  const primeraFecha = new Date(Date.now() + dias * 86400000).toLocaleDateString('en-CA');

  const inicio = Date.parse(`${primeraFecha}T00:00:00Z`);
  const detalleCuotas = Array.from({ length: cuotas }, (_, i) => ({
    numero: i + 1,
    monto: i === 0 ? Math.round((base + sobrante) * 100) / 100 : base,
    fecha: new Date(inicio + i * dias * 86400000).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }),
  }));

  async function siguiente() {
    if (name.trim().length < 2) return setError('Escribe el nombre del cliente.');
    if (phone.replace(/\D/g, '').length < 7) return setError('Escribe el teléfono.');
    if (idNumber.trim().length < 5) return setError('La cédula es obligatoria: es su clave para entrar al portal.');
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('El correo no parece válido.');
    setError(null);
    setGuardando(true);
    try {
      await api.post('/shop/pass/enroll', {
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        idNumber: idNumber.trim(),
        email: email.trim() || undefined,
      });
      setPaso('plan');
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo registrar al cliente.');
    } finally {
      setGuardando(false);
    }
  }

  function confirmar() {
    if (cuotas < 2) return setError('Un plan de cuotas necesita al menos 2.');
    setError(null);
    onListo({
      cliente: { name: name.trim(), phone: phone.replace(/\D/g, ''), idNumber: idNumber.trim(), email: email.trim() },
      plan: { cantidad: cuotas, frecuencia, recargoPorcentaje: pct, primeraFecha },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{paso === 'cliente' ? 'Agregar cliente a QuickTap Pass' : 'Plan de cuotas'}</DialogTitle>
        </DialogHeader>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {paso === 'cliente' ? (
          <div className="space-y-3">
            <p className="text-[11px] font-light text-brand-950/50">
              Con estos datos el cliente entra a quicktap.club/pass a ver lo que debe y a reportar
              sus abonos. Su clave es la cédula.
            </p>
            <label className="block text-sm">
              <span className="text-brand-950/70">Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-brand-950/70">Correo</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="opcional" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-brand-950/70">Teléfono</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0414-1234567" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/70">Cédula</span>
                <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="V-12345678" className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
              </label>
            </div>
            <TextureButton variant="brand" size="default" disabled={guardando} onClick={siguiente}>
              {guardando ? 'Registrando…' : 'Continuar'}
            </TextureButton>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-brand-950/70">Cuotas</span>
                <input type="number" min={2} max={60} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="text-brand-950/70">Recargo por financiar (%)</span>
                <input type="number" min={0} step="0.5" value={recargo} onChange={(e) => setRecargo(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2" />
              </label>
            </div>

            <div className="text-sm">
              <span className="text-brand-950/70">Cada cuánto vence</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {FRECUENCIAS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFrecuencia(f.id)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      frecuencia === f.id ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Lo que va a pagar, antes de confirmar: el recargo se ve como monto y no solo como
                porcentaje, que es lo que el cliente pregunta. */}
            <div className="rounded-xl bg-brand-950/[0.04] px-3 py-2.5">
              <div className="flex justify-between text-[12px] text-brand-950/60">
                <span>Saldo</span>
                <span className="tabular-nums">{money(saldo)}</span>
              </div>
              {pct > 0 && (
                <div className="flex justify-between text-[12px] text-brand-950/60">
                  <span>Recargo ({pct}%)</span>
                  <span className="tabular-nums">{money(totalConRecargo - saldo)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-brand-950/10 pt-1 text-sm font-bold text-brand-950">
                <span>Total a pagar</span>
                <span className="tabular-nums">{money(totalConRecargo)}</span>
              </div>
              {/* Cuota por cuota, con su fecha y el monto en las dos monedas: es lo que el
                  cajero le lee al cliente antes de cerrar el trato. */}
              <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg bg-white px-3 py-2">
                {detalleCuotas.map((c) => (
                  <div key={c.numero} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="font-light text-brand-950/55">
                      Cuota {c.numero} · {c.fecha}
                    </span>
                    <span className="tabular-nums font-semibold text-brand-950">
                      {money(c.monto)}
                      {moneyBs(c.monto) && (
                        <span className="font-normal text-brand-950/55"> · {moneyBs(c.monto)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <TextureButton variant="minimal" size="default" className="!w-auto" onClick={() => setPaso('cliente')}>
                Atrás
              </TextureButton>
              <TextureButton variant="brand" size="default" onClick={confirmar}>
                Cobrar a cuotas
              </TextureButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
