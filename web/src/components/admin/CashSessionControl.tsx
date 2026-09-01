import { useEffect, useRef, useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlinePanel } from './InlinePanel';
import { formatBase } from '@/utils/format';
import { ROLE_LABELS } from '@/utils/roles';
import type { UserRole } from '@/types';
import { CashSessionReceipt, PAYMENT_METHOD_LABELS, type CashSessionData, type CashSessionSummary } from './CashSessionReceipt';
import { OpenComandasDialog } from './OpenComandasDialog';

/** Cuenta bancaria vista desde el cierre de caja: solo lo necesario para el traspaso. */
interface VaultAccount {
  id: string;
  name: string;
  currency: 'BASE' | 'BS';
  isPettyCash: boolean;
  isVault: boolean;
  balance: string;
}

// CASH_USD faltaba: sin él no había forma de declarar el efectivo en dólares al abrir, así que
// al cerrar siempre aparecía como sobrante. Es el enum PaymentMethod completo (ver schema.prisma).
const PAYMENT_METHODS = ['CASH', 'CASH_USD', 'MOBILE_PAYMENT', 'ZELLE', 'CARD', 'BINANCE', 'PAYPAL', 'TRANSFER'];

/** Estado de la caja (sesión actual) + recarga — usado tanto por `CashSessionControl` (ventana
 * flotante, resto de la app) como por `CashSessionPanel` (en línea, Administración). */
function useCashSession() {
  const [session, setSession] = useState<CashSessionData | null | undefined>(undefined);

  function load() {
    api
      .get('/cash-sessions/current')
      .then((res) => setSession(res.data.data))
      .catch(() => setSession(null));
  }

  useEffect(load, []);

  return { session, reload: load };
}

/** Los dos botones ("Abrir Caja" / "Cerrar Caja"), idénticos sin importar si lo que abren
 * al hacer click es una ventana flotante o un panel en línea. */
function CashSessionButtons({ session, onOpen, onClose }: { session: CashSessionData | null; onOpen: () => void; onClose: () => void }) {
  if (!session) {
    return (
      <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={onOpen}>
        <Unlock className="h-3.5 w-3.5" /> Abrir Caja
      </TextureButton>
    );
  }
  return (
    <TextureButton variant="secondary" size="sm" className="!w-auto" onClick={onClose}>
      <Lock className="h-3.5 w-3.5" /> Cerrar Caja
      <span className="text-[10px] text-brand-950/40 font-normal ml-1">
        {session.openedByUser
          ? `abierta por ${session.openedByUser.name} (${ROLE_LABELS[session.openedByUser.role as UserRole] ?? session.openedByUser.role}) · `
          : ''}
        {new Date(session.openedAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}{' '}
        {new Date(session.openedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </TextureButton>
  );
}

/** Botón "Abrir Caja" / "Cerrar Caja" con ventana flotante — usado fuera de Administración
 * (AdminLayout para cajero restringido, tablet de mesero, y Canchas fuera de su pestaña de
 * Administración). Dentro de Administración se usa `CashSessionPanel` en su lugar. */
export function CashSessionControl() {
  const { restaurant } = useAuth();
  const { session, reload } = useCashSession();
  const [showOpen, setShowOpen] = useState(false);
  // Snapshot separado del que se abre al hacer clic en "Cerrar Caja": si se usara `session`
  // directo, el refresco de `reload()` al confirmar el cierre (que pasa a null) desmontaría
  // el diálogo antes de poder mostrar el PDF.
  const [closingSession, setClosingSession] = useState<CashSessionData | null>(null);
  // Levantado fuera de CloseCashForm solo para poder cambiar el DialogTitle ("Cerrar caja" →
  // "Caja cerrada") — el resto del estado del cierre sigue viviendo dentro del form.
  const [closedSession, setClosedSession] = useState<CashSessionData | null>(null);

  if (session === undefined || !restaurant) return null;

  return (
    <>
      <OpenComandasDialog />
      <CashSessionButtons session={session} onOpen={() => setShowOpen(true)} onClose={() => setClosingSession(session)} />

      {showOpen && (
        <Dialog open onOpenChange={(o) => !o && setShowOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Abrir caja</DialogTitle>
            </DialogHeader>
            <OpenCashForm
              onOpened={() => {
                setShowOpen(false);
                reload();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {closingSession && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o) {
              setClosingSession(null);
              setClosedSession(null);
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{closedSession ? 'Caja cerrada' : 'Cerrar caja'}</DialogTitle>
            </DialogHeader>
            <CloseCashForm
              session={closingSession}
              restaurantName={restaurant.name}
              currency={restaurant.baseCurrency}
              rateBs={restaurant.exchangeRate?.rateBs ?? null}
              closed={closedSession}
              onClosed={(c) => {
                setClosedSession(c);
                reload();
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Igual que `CashSessionControl`, pero abre/cierra caja como panel en línea (Administración) —
 * ver InlinePanel. Mismo hook, mismos botones, mismos formularios; solo cambia la envoltura. */
export function CashSessionPanel() {
  const { restaurant } = useAuth();
  const { session, reload } = useCashSession();
  const [showOpen, setShowOpen] = useState(false);
  const [closingSession, setClosingSession] = useState<CashSessionData | null>(null);
  const [closedSession, setClosedSession] = useState<CashSessionData | null>(null);

  if (session === undefined || !restaurant) return null;

  return (
    <>
      <OpenComandasDialog />
      <CashSessionButtons session={session} onOpen={() => setShowOpen(true)} onClose={() => setClosingSession(session)} />

      {showOpen && (
        // w-full: CashSessionPanel vive dentro de una fila flex de botones en la cabecera de
        // Administración — sin esto, el panel se encoge al ancho de un ítem flex más y queda
        // apretujado junto a los botones en vez de ocupar su propia línea completa.
        <div className="w-full">
          <InlinePanel title="Abrir caja" onClose={() => setShowOpen(false)}>
            <OpenCashForm
              onOpened={() => {
                setShowOpen(false);
                reload();
              }}
            />
          </InlinePanel>
        </div>
      )}
      {closingSession && (
        <div className="w-full">
          <InlinePanel
            title={closedSession ? 'Caja cerrada' : 'Cerrar caja'}
            onClose={() => {
              setClosingSession(null);
              setClosedSession(null);
            }}
            size="wide"
          >
            <CloseCashForm
              session={closingSession}
              restaurantName={restaurant.name}
              currency={restaurant.baseCurrency}
              rateBs={restaurant.exchangeRate?.rateBs ?? null}
              closed={closedSession}
              onClosed={(c) => {
                setClosedSession(c);
                reload();
              }}
            />
          </InlinePanel>
        </div>
      )}
    </>
  );
}

function OpenCashForm({ onOpened }: { onOpened: () => void }) {
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
  );
}

/** Cuerpo del cierre de caja (preview del turno, arqueo opcional, confirmar, descargar PDF) —
 * sin cáscara de diálogo. `closed`/`onClosed` están controlados por quien lo envuelve
 * (Dialog o InlinePanel) porque ambos necesitan saber cuándo pasó para cambiar su título. */
function CloseCashForm({
  session,
  restaurantName,
  currency,
  rateBs,
  closed,
  onClosed,
}: {
  session: CashSessionData;
  restaurantName: string;
  currency: 'USD' | 'EUR';
  rateBs: string | null;
  closed: CashSessionData | null;
  onClosed: (closed: CashSessionData) => void;
}) {
  const [preview, setPreview] = useState<CashSessionSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Arqueo: lo que el cajero cuenta de verdad. Arranca apagado a propósito — el cierre de
  // siempre (solo resumen, sin contar) sigue siendo válido y es un paso menos para quien no
  // hace arqueo. Al encenderlo se compara contra lo esperado y se guarda el descuadre.
  const [counting, setCounting] = useState(false);
  const [counted, setCounted] = useState<Record<string, string>>({});
  // Traspaso a bóveda: cuánto efectivo sale de cada cuenta de caja hacia la bóveda al cerrar.
  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [vaultId, setVaultId] = useState('');
  const [vaultAmounts, setVaultAmounts] = useState<Record<string, string>>({});
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
  // Origen del traspaso: la caja chica (efectivo del día). Si no hay ninguna marcada, se
  // ofrecen todas las cuentas que no son bóveda para no dejar al cajero sin opción.
  const vaults = accounts.filter((a) => a.isVault);
  const cashAccounts = accounts.filter((a) => !a.isVault && (a.isPettyCash || accounts.every((x) => !x.isPettyCash)));
  const totalDifference = methodsToCount.reduce(
    (acc, [m, expected]) => acc + ((Number(counted[m]) || 0) - Number(expected)),
    0,
  );

  // Cuentas de efectivo (origen) y bóvedas (destino) para el traspaso del cierre.
  useEffect(() => {
    api
      .get('/bank-accounts')
      .then((res) => {
        const rows = (res.data.data.accounts ?? res.data.data) as VaultAccount[];
        setAccounts(rows);
        setVaultId(rows.find((a) => a.isVault)?.id ?? '');
      })
      .catch(() => setAccounts([]));
  }, []);

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
      const transfers = vaultId
        ? cashAccounts
            .map((a) => ({ fromAccountId: a.id, toAccountId: vaultId, amount: Number(vaultAmounts[a.id]) || 0 }))
            .filter((t) => t.amount > 0)
        : [];
      const res = await api.post(`/cash-sessions/${session.id}/close`, {
        countedBalances: counting
          ? Object.fromEntries(methodsToCount.map(([m]) => [m, Number(counted[m]) || 0]))
          : null,
        vaultTransfers: transfers.length > 0 ? transfers : undefined,
      });
      // El cierre ya quedó hecho aunque un traspaso falle: se avisa sin borrar el cierre.
      const failures: string[] = res.data.data.vaultErrors ?? [];
      if (failures.length > 0) setError(`Caja cerrada, pero el traspaso a bóveda falló: ${failures.join(' · ')}`);
      onClosed(res.data.data);
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

  const [printing, setPrinting] = useState(false);

  // El PDF queda como respaldo descargable; esto es la copia en papel para archivar junto a la
  // gaveta — sale por la impresora de Caja ("Nota de entrega" en la estación de impresión, ver
  // cashSessionService.printClosing), no por el diálogo de impresión del navegador.
  async function printClosing() {
    if (!closed) return;
    setPrinting(true);
    try {
      await api.post(`/cash-sessions/${closed.id}/print`);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <>
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
              {/* Propina: su propio segmento, no es venta del restaurante — no entra al total neto. */}
              {preview.tipsByMethod && Number(preview.totalTips) > 0 && (
                <div className="border-t border-brand-950/10 pt-2">
                  <p className="text-xs font-semibold text-brand-950/70 mb-1.5">Propinas del turno</p>
                  <div className="text-sm space-y-1">
                    {Object.entries(preview.tipsByMethod)
                      .filter(([, v]) => Number(v) > 0)
                      .map(([m, v]) => (
                        <div key={m} className="flex justify-between text-brand-950/80">
                          <span>{PAYMENT_METHOD_LABELS[m] ?? m}</span>
                          <span>{formatBase(v, symbol)}</span>
                        </div>
                      ))}
                    <div className="flex justify-between font-medium text-brand-950">
                      <span>Total propinas</span>
                      <span>{formatBase(preview.totalTips ?? '0', symbol)}</span>
                    </div>
                  </div>
                </div>
              )}
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

              {/* Traspaso a bóveda: el efectivo que el cajero entrega al cerrar el turno.
                  Sale de la caja y entra a la bóveda como transferencia entre cuentas, con
                  el número de cierre como concepto. */}
              {vaults.length > 0 && cashAccounts.length > 0 && (
                  <div className="rounded-xl border border-brand-950/10 p-3">
                    <p className="text-sm font-medium text-brand-950">Traspaso a bóveda (opcional)</p>
                    <p className="mt-0.5 text-xs font-light text-brand-950/50">
                      Cuánto efectivo sale de la caja y se guarda en la bóveda al cerrar este turno.
                    </p>
                    {vaults.length > 1 && (
                      <select
                        value={vaultId}
                        onChange={(e) => setVaultId(e.target.value)}
                        className="mt-2 w-full rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm"
                      >
                        {vaults.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="mt-2 space-y-2">
                      {cashAccounts.map((a) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm text-brand-950/80">
                            {a.name}
                            <span className="font-light text-brand-950/40">
                              {' '}
                              · saldo {a.currency === 'BS' ? 'Bs ' : symbol}
                              {Number(a.balance).toFixed(2)}
                            </span>
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={vaultAmounts[a.id] ?? ''}
                            onChange={(e) => setVaultAmounts((v) => ({ ...v, [a.id]: e.target.value }))}
                            placeholder="0.00"
                            className="w-28 shrink-0 rounded-lg border border-brand-950/15 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
                          />
                        </div>
                      ))}
                    </div>
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
          <div className="flex flex-wrap gap-2">
            <TextureButton variant="brand" size="default" onClick={download}>
              Descargar cierre (PDF)
            </TextureButton>
            <TextureButton variant="secondary" size="default" onClick={printClosing} disabled={printing}>
              {printing ? 'Enviando…' : 'Imprimir (Nota de entrega)'}
            </TextureButton>
          </div>
          <div className="fixed -left-[9999px] top-0">
            <CashSessionReceipt ref={receiptRef} session={closed} restaurantName={restaurantName} currency={currency} rateBs={rateBs} />
          </div>
        </div>
      )}
    </>
  );
}
