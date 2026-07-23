import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';
import { useCopyToast } from '@/hooks/useCopyToast';
import { Toast } from '@/components/ui/toast';
import { MaskedAmount } from '@/components/master/MaskedAmount';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';

type ProofStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAYMENT_NOT_RECEIVED';

interface PlanRequestRow {
  id: string;
  kind: 'SIGNUP' | 'RENEWAL';
  status: ProofStatus;
  restaurantId: string | null;
  plan: string;
  billingCycle: string;
  priceUsd: string;
  promoCode: string | null;
  discountPercent: number | null;
  paymentMethod: string;
  paymentReference: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  restaurantName: string | null;
  createdAt: string;
  restaurant: { id: string; name: string; slug: string } | null;
}

interface RestaurantOption {
  id: string;
  name: string;
  slug: string;
}

const TABS = [
  { kind: 'SIGNUP' as const, label: 'Comprobantes de pago por inscripción' },
  { kind: 'RENEWAL' as const, label: 'Comprobantes de pago por mensualidad' },
];

const STATUS_TABS: { value: ProofStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Activadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'PAYMENT_NOT_RECEIVED', label: 'Pago no recibido' },
];

export default function MasterProofsPage() {
  const { copy, toastMessage } = useCopyToast();
  const [kind, setKind] = useState<'SIGNUP' | 'RENEWAL'>('SIGNUP');
  const [status, setStatus] = useState<ProofStatus>('PENDING');
  const [requests, setRequests] = useState<PlanRequestRow[] | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantOption[] | null>(null);
  const [linking, setLinking] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Tras aceptar/rechazar/marcar pago no recibido, o al pedir reenviar el aviso,
  // guardamos aquí el enlace listo para mostrar el confirm "¿Enviar por WhatsApp?".
  const [pendingWhatsapp, setPendingWhatsapp] = useState<Record<string, string | null>>({});

  // Cuántas solicitudes PENDIENTES hay en CADA pestaña (inscripción/mensualidad), sin importar
  // cuál esté abierta ahora — así nunca pasa que una solicitud "no llegue" simplemente porque
  // quedó en la otra pestaña (ej: un restaurante ya autenticado pidiendo Sucursales crea una
  // solicitud "por mensualidad", no "por inscripción").
  const [pendingCounts, setPendingCounts] = useState<Record<'SIGNUP' | 'RENEWAL', number>>({ SIGNUP: 0, RENEWAL: 0 });

  function load() {
    masterApi.get('/master/plan-requests', { params: { kind, status } }).then((res) => setRequests(res.data.data));
  }

  function loadPendingCounts() {
    Promise.all([
      masterApi.get('/master/plan-requests', { params: { kind: 'SIGNUP', status: 'PENDING' } }),
      masterApi.get('/master/plan-requests', { params: { kind: 'RENEWAL', status: 'PENDING' } }),
    ]).then(([signup, renewal]) => {
      setPendingCounts({ SIGNUP: signup.data.data.length, RENEWAL: renewal.data.data.length });
    });
  }

  useEffect(load, [kind, status]);
  useEffect(loadPendingCounts, []);
  useEffect(() => {
    masterApi.get('/master/restaurants').then((res) => setRestaurants(res.data.data));
  }, []);

  async function approve(req: PlanRequestRow) {
    setBusyId(req.id);
    setError(null);
    try {
      const restaurantId = req.restaurantId ?? linking[req.id];
      const { data } = await masterApi.post(
        `/master/plan-requests/${req.id}/approve`,
        restaurantId ? { restaurantId } : {},
      );
      setPendingWhatsapp((p) => ({ ...p, [req.id]: data.data.whatsappUrl }));
      load();
      loadPendingCounts();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo activar.');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(req: PlanRequestRow, newStatus: 'REJECTED' | 'PAYMENT_NOT_RECEIVED') {
    setBusyId(req.id);
    setError(null);
    try {
      const { data } = await masterApi.post(`/master/plan-requests/${req.id}/reject`, { status: newStatus });
      setPendingWhatsapp((p) => ({ ...p, [req.id]: data.data.whatsappUrl }));
      load();
      loadPendingCounts();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(req: PlanRequestRow) {
    if (!window.confirm('¿Eliminar esta solicitud de pago? Esta acción no se puede deshacer.')) return;
    setBusyId(req.id);
    setError(null);
    try {
      await masterApi.delete(`/master/plan-requests/${req.id}`);
      load();
      loadPendingCounts();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar.');
    } finally {
      setBusyId(null);
    }
  }

  async function askResendWhatsapp(req: PlanRequestRow) {
    setBusyId(req.id);
    setError(null);
    try {
      const { data } = await masterApi.post(`/master/plan-requests/${req.id}/whatsapp-link`);
      setPendingWhatsapp((p) => ({ ...p, [req.id]: data.data.whatsappUrl }));
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo generar el mensaje.');
    } finally {
      setBusyId(null);
    }
  }

  function sendWhatsapp(id: string) {
    const url = pendingWhatsapp[id];
    if (url) window.open(url, '_blank');
    setPendingWhatsapp((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  function dismissWhatsapp(id: string) {
    setPendingWhatsapp((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Comprobantes de pago</h1>
        <MoneyVisibilityToggle />
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setKind(t.kind)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              kind === t.kind
                ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {t.label}
            {pendingCounts[t.kind] > 0 && (
              <span
                className={`text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center ${
                  kind === t.kind ? 'bg-white text-brand-600' : 'bg-red-500 text-white'
                }`}
              >
                {pendingCounts[t.kind]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s.value}
            onClick={() => setStatus(s.value)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              status === s.value
                ? 'bg-brand-500 text-white shadow-[0_10px_24px_-8px_rgba(5,108,242,0.5)]'
                : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {requests?.length === 0 && <p className="text-sm text-brand-950/40 font-light">Sin solicitudes aquí.</p>}

      <div className="space-y-4">
        {requests?.map((req) => (
          <div key={req.id} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5 flex flex-col sm:flex-row gap-4">
            <div className="shrink-0 h-24 w-24 rounded-xl bg-brand-950/[0.06] flex flex-col items-center justify-center gap-1 px-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-brand-950/40 font-medium">N.° referencia</p>
              <p className="text-sm font-semibold text-brand-950 break-all leading-tight">{req.paymentReference}</p>
              <button
                type="button"
                onClick={() => copy(req.paymentReference, 'Referencia copiada')}
                aria-label="Copiar número de referencia"
                className="text-brand-950/40 hover:text-brand-500 transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-brand-950">
                {req.plan} · {req.billingCycle} · <MaskedAmount value={`$${req.priceUsd}`} />
                {req.promoCode && <span className="text-emerald-600"> ({req.promoCode} -{req.discountPercent}%)</span>}
              </p>
              <p className="text-sm text-brand-950/60 font-light">
                {req.contactName} · {req.contactEmail} {req.contactPhone && `· ${req.contactPhone}`}
              </p>
              <p className="text-xs text-brand-950/40 font-light mt-0.5">
                {req.restaurant ? (
                  <>Restaurante: {req.restaurant.name}</>
                ) : (
                  <>Restaurante propuesto: {req.restaurantName ?? '(sin indicar)'}</>
                )}
                {' · '}
                {req.paymentMethod} · {new Date(req.createdAt).toLocaleString('es-VE')}
              </p>

              {req.status === 'PENDING' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!req.restaurantId && (
                    <select
                      value={linking[req.id] ?? ''}
                      onChange={(e) => setLinking({ ...linking, [req.id]: e.target.value })}
                      className="border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                    >
                      <option value="">Vincular a restaurante…</option>
                      {restaurants?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (/{r.slug})
                        </option>
                      ))}
                    </select>
                  )}
                  <TextureButton
                    variant="brand"
                    size="sm"
                    disabled={busyId === req.id || (!req.restaurantId && !linking[req.id])}
                    className="!w-auto disabled:opacity-50"
                    onClick={() => approve(req)}
                  >
                    {busyId === req.id ? 'Guardando…' : 'Activar cuenta'}
                  </TextureButton>
                  <TextureButton
                    variant="secondary"
                    size="sm"
                    disabled={busyId === req.id}
                    className="!w-auto disabled:opacity-50"
                    onClick={() => reject(req, 'PAYMENT_NOT_RECEIVED')}
                  >
                    Pago no recibido
                  </TextureButton>
                  <TextureButton
                    variant="destructive"
                    size="sm"
                    disabled={busyId === req.id}
                    className="!w-auto disabled:opacity-50"
                    onClick={() => reject(req, 'REJECTED')}
                  >
                    Rechazar
                  </TextureButton>
                  <button
                    onClick={() => remove(req)}
                    disabled={busyId === req.id}
                    className="text-xs font-medium text-red-600/70 hover:text-red-600 disabled:opacity-50 px-2"
                  >
                    Eliminar
                  </button>
                </div>
              )}

              {req.status !== 'PENDING' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      req.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : req.status === 'REJECTED'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {req.status === 'APPROVED' && 'Activada'}
                    {req.status === 'REJECTED' && 'Rechazada'}
                    {req.status === 'PAYMENT_NOT_RECEIVED' && 'Pago no recibido'}
                  </span>
                  {req.contactPhone && pendingWhatsapp[req.id] === undefined && (
                    <button
                      onClick={() => askResendWhatsapp(req)}
                      disabled={busyId === req.id}
                      className="text-xs font-medium text-brand-500 hover:underline disabled:opacity-50"
                    >
                      Enviar mensaje por WhatsApp
                    </button>
                  )}
                  {req.status !== 'APPROVED' && (
                    <button
                      onClick={() => remove(req)}
                      disabled={busyId === req.id}
                      className="text-xs font-medium text-red-600/70 hover:text-red-600 disabled:opacity-50 px-2"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              )}

              {pendingWhatsapp[req.id] !== undefined && (
                <div className="mt-3 rounded-xl bg-brand-950/[0.04] p-3 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-brand-950">¿Desea enviar el mensaje vía WhatsApp?</p>
                  <div className="flex gap-2 ml-auto">
                    <TextureButton
                      variant="brand"
                      size="sm"
                      disabled={!pendingWhatsapp[req.id]}
                      className="!w-auto disabled:opacity-50"
                      onClick={() => sendWhatsapp(req.id)}
                    >
                      Sí, enviar
                    </TextureButton>
                    <TextureButton
                      variant="minimal"
                      size="sm"
                      className="!w-auto"
                      onClick={() => dismissWhatsapp(req.id)}
                    >
                      No
                    </TextureButton>
                  </div>
                  {!pendingWhatsapp[req.id] && (
                    <p className="text-xs text-brand-950/40 w-full">
                      Esta solicitud no tiene teléfono de contacto registrado.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Toast message={toastMessage} />
    </div>
  );
}
