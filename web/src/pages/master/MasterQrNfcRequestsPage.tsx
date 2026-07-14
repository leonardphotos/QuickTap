import { useEffect, useState } from 'react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

interface QrNfcRequestRow {
  id: string;
  quantity: number;
  unitPriceUsd: string;
  totalPriceUsd: string;
  status: 'PENDING' | 'APPROVED';
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  createdAt: string;
  restaurant: { id: string; name: string; slug: string };
}

export default function MasterQrNfcRequestsPage() {
  const [status, setStatus] = useState<'PENDING' | 'APPROVED'>('PENDING');
  const [requests, setRequests] = useState<QrNfcRequestRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    masterApi.get('/master/qr-nfc-requests', { params: { status } }).then((res) => setRequests(res.data.data));
  }

  useEffect(load, [status]);

  async function approve(req: QrNfcRequestRow) {
    setBusyId(req.id);
    setError(null);
    try {
      await masterApi.post(`/master/qr-nfc-requests/${req.id}/approve`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Solicitud QRNFC</h1>

      <div className="flex gap-2">
        {(['PENDING', 'APPROVED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              status === s ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
            }`}
          >
            {s === 'PENDING' ? 'Pendientes' : 'Atendidas'}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {requests?.length === 0 && <p className="text-sm text-brand-950/40 font-light">Sin solicitudes aquí.</p>}

      <div className="space-y-4">
        {requests?.map((req) => (
          <div key={req.id} className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-brand-950">
                  {req.quantity} unidades · ${req.totalPriceUsd} (${req.unitPriceUsd} c/u)
                </p>
                <p className="text-sm text-brand-950/60 font-light">
                  {req.restaurant.name} (/{req.restaurant.slug})
                </p>
                <p className="text-xs text-brand-950/40 font-light mt-0.5">
                  {req.contactName} · {req.contactEmail} {req.contactPhone && `· ${req.contactPhone}`}
                  {' · '}
                  {new Date(req.createdAt).toLocaleString('es-VE')}
                </p>
              </div>

              {req.status === 'PENDING' && (
                <TextureButton
                  variant="brand"
                  size="sm"
                  disabled={busyId === req.id}
                  className="!w-auto px-4 disabled:opacity-50 shrink-0"
                  onClick={() => approve(req)}
                >
                  {busyId === req.id ? 'Guardando…' : 'Marcar atendida'}
                </TextureButton>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
