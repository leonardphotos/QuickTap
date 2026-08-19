import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CloudOff, Loader2 } from 'lucide-react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { CURRENCY_SYMBOLS, formatBase } from '@/utils/format';
import { TextureButton } from '@/components/ui/texture-button';

/**
 * Pedidos que se tomaron sin internet y no se pudieron subir tal cual, porque algo cambió en la
 * nube mientras tanto (se cobró y cerró la cuenta, se borró la mesa o un producto).
 *
 * La regla es la que se acordó: gana lo que ya estaba en la nube, y lo descartado se muestra
 * acá completo para que una persona decida. A propósito no hay botón de "aplicar igual":
 * reinsertarlo a ciegas podría cobrar dos veces una cuenta ya cerrada. Si hay que cobrarlo, se
 * carga a mano con estos datos a la vista.
 */

interface ConflictItem {
  productName: string;
  variantName: string | null;
  quantity: number;
  lineTotal: string;
  note: string | null;
  modifiers: { name: string; quantity: number }[];
}

interface Conflict {
  id: string;
  kind: 'SESSION_CLOSED' | 'TABLE_MISSING' | 'PRODUCT_MISSING' | 'OTHER';
  offlineTicketRef: string | null;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  payload: {
    customerName: string | null;
    totalBase: string;
    createdAt: string;
    items: ConflictItem[];
  };
}

const KIND_LABEL: Record<Conflict['kind'], string> = {
  SESSION_CLOSED: 'La cuenta ya se había cerrado',
  TABLE_MISSING: 'La mesa ya no existe',
  PRODUCT_MISSING: 'Un producto ya no existe',
  OTHER: 'No se pudo subir',
};

export default function SyncConflictsPage() {
  const { restaurant } = useAuth();
  const symbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  function load() {
    api.get('/offline/conflicts').then((res) => setConflicts(res.data.data));
  }

  useEffect(load, []);

  async function resolve(id: string) {
    setResolving(id);
    try {
      await api.patch(`/offline/conflicts/${id}/resolve`);
      load();
    } finally {
      setResolving(null);
    }
  }

  if (!conflicts) return <p className="font-light text-brand-950/50">Cargando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Pedidos por revisar</h1>
        <p className="mt-2 max-w-2xl text-sm font-light text-brand-950/60">
          Pedidos que se tomaron mientras no había internet y no se pudieron guardar tal cual,
          porque algo cambió mientras tanto. Revisa cada uno y decide si hay que cargarlo a mano.
        </p>
      </div>

      {conflicts.length === 0 ? (
        <div className="rounded-3xl border border-brand-950/10 bg-white p-10 text-center shadow-sm">
          <CloudOff className="mx-auto h-8 w-8 text-brand-950/20" />
          <p className="mt-3 font-medium text-brand-950">No hay nada por revisar</p>
          <p className="mt-1 text-sm font-light text-brand-950/50">
            Todo lo que se tomó sin conexión se guardó correctamente.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => (
            <li key={c.id} className="rounded-2xl border border-amber-300/60 bg-amber-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-brand-950">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    {KIND_LABEL[c.kind]}
                    {c.offlineTicketRef && (
                      <span className="rounded-full bg-brand-950/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-950/60">
                        Comanda {c.offlineTicketRef}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-brand-950/70">{c.reason}</p>
                </div>
                <TextureButton
                  variant="secondary"
                  size="sm"
                  className="!w-auto shrink-0"
                  disabled={resolving === c.id}
                  onClick={() => resolve(c.id)}
                >
                  {resolving === c.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  )}
                  Marcar revisado
                </TextureButton>
              </div>

              <div className="mt-3 rounded-xl border border-brand-950/10 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/40">
                  Lo que se pidió
                  {c.payload.customerName ? ` · ${c.payload.customerName}` : ''}
                </p>
                <ul className="mt-2 space-y-1">
                  {c.payload.items.map((i, idx) => (
                    <li key={idx} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-brand-950">
                        {i.quantity}× {i.productName}
                        {i.variantName ? ` (${i.variantName})` : ''}
                        {i.modifiers.length > 0 && (
                          <span className="text-brand-950/50">
                            {' — '}
                            {i.modifiers.map((m) => (m.quantity > 1 ? `${m.name} x${m.quantity}` : m.name)).join(', ')}
                          </span>
                        )}
                        {i.note && <span className="italic text-brand-950/40"> · {i.note}</span>}
                      </span>
                      <span className="shrink-0 tabular-nums text-brand-950/60">
                        {formatBase(i.lineTotal, symbol)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-brand-950/[0.06] pt-2 text-right text-sm font-bold text-brand-950">
                  Total {formatBase(c.payload.totalBase, symbol)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
