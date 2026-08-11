import { useEffect, useRef, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBase } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/roles';
import type { UserRole } from '@/types';
import { CashSessionReceipt, PAYMENT_METHOD_LABELS, type CashSessionData, type CashSessionSummary } from './CashSessionReceipt';
import { OpenComandasDialog } from './OpenComandasDialog';

// CASH_USD faltaba: sin él no había forma de declarar el efectivo en dólares al abrir, así que
// al cerrar siempre aparecía como sobrante. Es el enum PaymentMethod completo (ver schema.prisma).
const PAYMENT_METHODS = ['CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'];

/** Botón "Abrir Caja" / "Cerrar Caja", visible en todas las pestañas de Administración. */
export function CashSessionControl() {
  const { restaurant } = useAuth();
  const [session, setSession] = useState<CashSessionData | null | undefined>(undefined);
  const [showOpen, setShowOpen] = useState(false);
  // Snapshot separado del que se abre al hacer clic en "Cerrar Caja": si se
  // usara `session` directo, el refresco de `load()` al confirmar el cierre
  // (que pasa a null) desmontaría el diálogo antes de poder mostrar el PDF.
  const [closingSession, setClosingSession] = useState<CashSessionData | null>(null);

  function load() {
    api
      .get('/cash-sessions/current')
      .then((res) => setSession(res.data.data))
      .catch(() => setSession(null));
  }

  useEffect(load, []);

  if (session === undefined || !restaurant) return null;

  return (
    <>
      <OpenComandasDialog />
      {!session && (
        <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setShowOpen(true)}>
          <Unlock className="h-3.5 w-3.5" /> Abrir Caja
        </TextureButton>
      )}
      {session && (
        <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={() => setClosingSession(session)}>
          <Lock className="h-3.5 w-3.5" /> Cerrar Caja
          <span className="text-[10px] text-brand-950/40 font-normal ml-1">
            {session.openedByUser
              ? `abierta por ${session.openedByUser.name} (${ROLE_LABELS[session.openedByUser.role as UserRole] ?? session.openedByUser.role}) · `
              : ''}
            {new Date(session.openedAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}{' '}
            {new Date(session.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </TextureButton>
      )}

      {showOpen && (
        <OpenCashDialog
          onClose={() => setShowOpen(false)}
          onOpened={() => {
            setShowOpen(false);
            load();
          }}
        />
      )}
      {closingSession && (
        <CloseCashDialog
          session={closingSession}
          restaurantName={restaurant.name}
          currency={restaurant.baseCurrency}
          onClose={() => setClosingSession(null)}
          onClosed={() => load()}
        />
      )}
    </>
  );
}

function OpenCashDialog({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const openingBalances = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, Number(amounts[m]) || 0]));
      await api.post('/cash-sessions/open', { openingBalances });
      onOpened();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo abrir la caja.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abrir caja</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-brand-950/50">¿Cuánto hay en caja ahora mismo, por método de pago?</p>
          <div className="space-y-2.5">
            {PAYMENT_METHODS.map((m) => (
              <div key={m} className="flex items-center justify-between gap-3">
                <label className="text-sm text-brand-950/70">{PAYMENT_METHOD_LABELS[m]}</label>
                <input
                  value={amounts[m] ?? ''}
                  onChange={(e) => setAmounts((prev) => ({ ...prev, [m]: e.target.value.replace(/[^0-9.]/g, '') }))}
                  placeholder="0.00"
                  className="w-28 text-sm text-right border border-brand-950/15 rounded-lg px-2.5 py-1.5"
                />
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <TextureButton variant="brand" size="default" disabled={saving} onClick={submit} className="disabled:opacity-50">
            {saving ? 'Abriendo…' : 'Abrir caja'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CloseCashDialog({
  session,
  restaurantName,
  currency,
  onClose,
  onClosed,
}: {
  session: CashSessionData;
  restaurantName: string;
  currency: 'USD' | 'EUR';
  onClose: () => void;
  onClosed: () => void;
}) {
  const [preview, setPreview] = useState<CashSessionSummary | null>(null);
  const [closed, setClosed] = useState<CashSessionData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Arqueo: lo que el cajero cuenta de verdad. Arranca apagado a propósito — el cierre de
  // siempre (solo resumen, sin contar) sigue siendo válido y es un paso menos para quien no
  // hace arqueo. Al encenderlo se compara contra lo esperado y se guarda el descuadre.
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const receiptRef = useRef<HTMLDivElement>(null);
  const symbol = currency === 'USD' ? '$' : '€';

  /** Solo se cuentan los métodos donde el turno espera algo: pedirle al cajero que cuente
   * ocho gavetas vacías es la forma más rápida de que deje de hacer el arqueo.
   *
   * Se ordena por PAYMENT_METHODS y no por el orden que trae el servidor (el del enum de
   * Prisma): así el cajero ve las gavetas en el MISMO orden en que las declaró al abrir. */
  const methodsToCount = preview
    ? PAYMENT_METHODS.map((m) => [m, preview.expectedByMethod?.[m] ?? '0'] as const).filter(
        ([, v]) => Number(v) !== 0,
      )
    : [];
  const totalDifference = methodsToCount.reduce(
    (acc, [m, expected]) => acc + ((Number(counted[m]) || 0) - Number(expected)),
    0,
  );

  useEffect(() => {
    api
      .get(`/cash-sessions/${session.id}/preview`)
      .then((res) => setPreview(res.data.data.summary))
      .catch((e) => setError(e.response?.data?.error ?? 'No se pudo cargar el movimiento del turno.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  async function confirmClose() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/cash-sessions/${session.id}/close`, {
        countedBalances: counting
          ? Object.fromEntries(methodsToCount.map(([m]) => [m, Number(counted[m]) || 0]))
          : null,
      });
      setClosed(res.data.data);
      onClosed();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo cerrar la caja.');
    } finally {
      setSaving(false);
    }
  }

  async function download() {
    if (!receiptRef.current) return;
    // Import dinámico: html2canvas + jsPDF pesan ~600KB, no tiene sentido
    // que carguen en cada visita a Administración si nunca se descarga un cierre.
    const { downloadElementAsPdf } = await import('@/utils/pdf');
    await downloadElementAsPdf(receiptRef.current, `cierre-caja-${closed?.closeNumber ?? session.id}.pdf`);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{closed ? 'Caja cerrada' : 'Cerrar caja'}</DialogTitle>
        </DialogHeader>

        {!closed && (
          <div className="space-y-4">
            {!preview && !error && <p className="text-sm text-brand-950/40">Cargando movimiento del turno…</p>}
            {preview && (
              <>
                <div>
                  <p className="text-xs font-semibold text-brand-950/70 mb-1.5">Ventas por método</p>
                  <div className="text-sm space-y-1">
                    {Object.entries(preview.paymentsByMethod).map(([m, row]) => (
                      <div key={m} className="flex justify-between text-brand-950/80">
                        <span>
                          {PAYMENT_METHOD_LABELS[m] ?? m} ({row.count})
                        </span>
                        <span>{formatBase(row.amountBase, symbol)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-sm flex justify-between text-brand-950/80 border-t border-brand-950/10 pt-2">
                  <span>Ingresos manuales</span>
                  <span>+{formatBase(preview.movements.totalIncome, symbol)}</span>
                </div>
                <div className="text-sm flex justify-between text-brand-950/80">
                  <span>Egresos manuales</span>
                  <span>−{formatBase(preview.movements.totalExpense, symbol)}</span>
                </div>
                <div className="text-base font-semibold flex justify-between text-brand-950 border-t border-brand-950/10 pt-2">
                  <span>Total neto del turno</span>
                  <span>{formatBase(preview.totalNet, symbol)}</span>
                </div>

                {methodsToCount.length > 0 && (
                  <div className="border-t border-brand-950/10 pt-3">
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={counting}
                        onChange={(e) => setCounting(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-brand-950">Hacer arqueo</span>
                        <span className="block text-xs font-light text-brand-950/50">
                          Cuenta el dinero físico y compáralo con lo que debería haber.
                        </span>
                      </span>
                    </label>

                    {counting && (
                      <div className="mt-3 space-y-2">
                        {methodsToCount.map(([method, expected]) => {
                          const diff = (Number(counted[method]) || 0) - Number(expected);
                          return (
                            <div key={method} className="flex items-center gap-2">
                              <span className="flex-1 min-w-0 truncate text-sm text-brand-950/80">
                                {PAYMENT_METHOD_LABELS[method] ?? method}
                                <span className="text-brand-950/40 font-light"> · esperado {formatBase(expected, symbol)}</span>
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={counted[method] ?? ''}
                                onChange={(e) => setCounted((c) => ({ ...c, [method]: e.target.value }))}
                                placeholder="0.00"
                                className="w-24 shrink-0 rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                              />
                              <span
                                className={`w-16 shrink-0 text-right text-xs font-semibold ${
                                  Math.abs(diff) < 0.005
                                    ? 'text-brand-950/35'
                                    : diff > 0
                                      ? 'text-amber-600'
                                      : 'text-red-600'
                                }`}
                              >
                                {Math.abs(diff) < 0.005 ? '—' : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`}
                              </span>
                            </div>
                          );
                        })}
                        <div className="flex justify-between border-t border-brand-950/[0.06] pt-2 text-sm font-semibold">
                          <span className="text-brand-950">
                            {Math.abs(totalDifference) < 0.005
                              ? 'Cuadra exacto'
                              : totalDifference > 0
                                ? 'Sobra'
                                : 'Falta'}
                          </span>
                          <span
                            className={
                              Math.abs(totalDifference) < 0.005
                                ? 'text-emerald-600'
                                : totalDifference > 0
                                  ? 'text-amber-600'
                                  : 'text-red-600'
                            }
                          >
                            {Math.abs(totalDifference) < 0.005 ? '✓' : formatBase(Math.abs(totalDifference), symbol)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <TextureButton
              variant="brand"
              size="default"
              disabled={saving || !preview}
              onClick={confirmClose}
              className="disabled:opacity-50"
            >
              {saving ? 'Cerrando…' : 'Confirmar cierre'}
            </TextureButton>
          </div>
        )}

        {closed && (
          <div className="space-y-4">
            <p className="text-sm text-brand-950/70">
              Cierre #{closed.closeNumber} generado correctamente. Descarga el comprobante para tu registro.
            </p>
            <TextureButton variant="brand" size="default" onClick={download}>
              Descargar cierre (PDF)
            </TextureButton>
            <div className="fixed -left-[9999px] top-0">
              <CashSessionReceipt ref={receiptRef} session={closed} restaurantName={restaurantName} currency={currency} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
