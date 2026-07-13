import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

interface PlanRequestRow {
  id: string;
  kind: 'SIGNUP' | 'RENEWAL';
  status: 'PENDING' | 'APPROVED';
  restaurantId: string | null;
  plan: string;
  billingCycle: string;
  priceUsd: string;
  promoCode: string | null;
  discountPercent: number | null;
  paymentMethod: string;
  proofUrl: string;
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

export default function MasterProofsPage() {
  const [kind, setKind] = useState<'SIGNUP' | 'RENEWAL'>('SIGNUP');
  const [status, setStatus] = useState<'PENDING' | 'APPROVED'>('PENDING');
  const [requests, setRequests] = useState<PlanRequestRow[] | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantOption[] | null>(null);
  const [linking, setLinking] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    masterApi.get('/master/plan-requests', { params: { kind, status } }).then((res) => setRequests(res.data.data));
  }

  useEffect(load, [kind, status]);
  useEffect(() => {
    masterApi.get('/master/restaurants').then((res) => setRestaurants(res.data.data));
  }, []);

  async function approve(req: PlanRequestRow) {
    setBusyId(req.id);
    setError(null);
    try {
      const restaurantId = req.restaurantId ?? linking[req.id];
      await masterApi.post(`/master/plan-requests/${req.id}/approve`, restaurantId ? { restaurantId } : {});
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo activar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Comprobantes de pago</h1>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setKind(t.kind)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              kind === t.kind ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {(['PENDING', 'APPROVED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              status === s ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {s === 'PENDING' ? 'Pendientes' : 'Activadas'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {requests?.length === 0 && <p className="text-sm text-brand-950/40 font-light">Sin comprobantes aquí.</p>}

      <div className="space-y-4">
        {requests?.map((req) => (
          <div key={req.id} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5 flex flex-col sm:flex-row gap-4">
            <a href={req.proofUrl} target="_blank" rel="noreferrer" className="shrink-0">
              {req.proofUrl.endsWith('.pdf') ? (
                <div className="h-24 w-24 rounded-xl bg-brand-950/[0.06] flex items-center justify-center text-xs text-brand-950/50 font-medium">
                  PDF
                </div>
              ) : (
                <img src={req.proofUrl} alt="Comprobante" className="h-24 w-24 rounded-xl object-cover" />
              )}
            </a>

            <div className="flex-1 min-w-0">
              <p className="font-medium text-brand-950">
                {req.plan} · {req.billingCycle} · ${req.priceUsd}
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
                    className="!w-auto px-4 disabled:opacity-50"
                    onClick={() => approve(req)}
                  >
                    {busyId === req.id ? 'Activando…' : 'Activar cuenta'}
                  </TextureButton>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
