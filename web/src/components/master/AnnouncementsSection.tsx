import { useEffect, useState } from 'react';
import { Megaphone, Send, Trash2 } from 'lucide-react';
import { masterApi } from '@/api/client';
import { TextureButton } from '@/components/ui/texture-button';

type BusinessType = 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB';

interface Announcement {
  id: string;
  message: string;
  targetBusinessType: BusinessType | null;
  status: 'DRAFT' | 'SENT';
  sentAt: string | null;
  sentCount: number | null;
  createdAt: string;
}

const TARGET_LABELS: Record<'ALL' | BusinessType, string> = {
  ALL: 'Todos los negocios',
  RESTAURANT: 'Solo restaurantes',
  SHOP: 'Solo locales comerciales',
  SPORTS_CLUB: 'Solo clubes de canchas',
};

/**
 * Cada actualización que se hace en el producto genera acá un borrador editable — se revisa el
 * texto, se elige a quién va (según si el cambio aplica a restaurantes, a locales, o a ambos), y
 * se manda desde este mismo panel. El envío reutiliza la cola seria del chatbot maestro
 * (masterWhatsappBotService.broadcast — uno a la vez, ~30s aleatorios) así que no hace falta
 * supervisarlo: se dispara y se procesa solo en segundo plano.
 */
export function AnnouncementsSection() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { message: string; targetBusinessType: BusinessType | null }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    masterApi.get('/master/announcements').then((res) => {
      const list: Announcement[] = res.data.data;
      setItems(list);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const a of list) {
          if (!next[a.id]) next[a.id] = { message: a.message, targetBusinessType: a.targetBusinessType };
        }
        return next;
      });
    });
  }

  useEffect(load, []);

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    try {
      await masterApi.patch(`/master/announcements/${id}`, draft);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo guardar.');
    } finally {
      setSavingId(null);
    }
  }

  async function send(id: string) {
    const draft = drafts[id];
    const target = draft ? TARGET_LABELS[draft.targetBusinessType ?? 'ALL'] : '';
    if (!confirm(`¿Mandar este aviso a: ${target}? No se puede deshacer.`)) return;
    setSendingId(id);
    setError(null);
    try {
      // Guarda cualquier edición pendiente antes de mandar, para no perderla.
      if (draft) await masterApi.patch(`/master/announcements/${id}`, draft);
      await masterApi.post(`/master/announcements/${id}/send`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo enviar.');
    } finally {
      setSendingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Descartar este borrador?')) return;
    setDeletingId(id);
    setError(null);
    try {
      await masterApi.delete(`/master/announcements/${id}`);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo borrar.');
    } finally {
      setDeletingId(null);
    }
  }

  if (!items) return null;

  return (
    <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
      <div>
        <p className="text-sm font-medium text-brand-950 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-emerald-600" /> Anuncios de actualizaciones
        </p>
        <p className="text-xs text-brand-950/50 font-light mt-0.5">
          Cada cambio que se hace en el producto queda acá como borrador — revisa el texto, elige a
          quién va, y mándalo cuando quieras. El envío es uno a la vez para no parecer spam, así que
          no hace falta supervisarlo.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {items.length === 0 && <p className="text-sm text-brand-950/40 font-light text-center py-4">No hay avisos todavía.</p>}

      <div className="space-y-4">
        {items.map((a) => {
          const draft = drafts[a.id] ?? { message: a.message, targetBusinessType: a.targetBusinessType };
          const isDraft = a.status === 'DRAFT';
          const changed = isDraft && (draft.message !== a.message || draft.targetBusinessType !== a.targetBusinessType);
          return (
            <div key={a.id} className="rounded-xl border border-brand-950/10 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isDraft ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isDraft ? 'Borrador' : `Enviado a ${a.sentCount ?? 0}`}
                </span>
                <span className="text-[11px] text-brand-950/40">
                  {new Date(isDraft ? a.createdAt : (a.sentAt ?? a.createdAt)).toLocaleString('es-VE')}
                </span>
              </div>

              <textarea
                value={draft.message}
                onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: { ...draft, message: e.target.value } }))}
                readOnly={!isDraft}
                rows={5}
                className={`w-full text-sm border border-brand-950/15 rounded-lg px-3 py-2 font-mono ${
                  isDraft ? 'focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500' : 'bg-brand-950/[0.03] text-brand-950/60'
                }`}
              />

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={draft.targetBusinessType ?? 'ALL'}
                  disabled={!isDraft}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [a.id]: { ...draft, targetBusinessType: e.target.value === 'ALL' ? null : (e.target.value as BusinessType) },
                    }))
                  }
                  className="text-xs border border-brand-950/15 rounded-lg px-2 py-1.5 bg-white disabled:bg-brand-950/[0.03] disabled:text-brand-950/50"
                >
                  {(['ALL', 'RESTAURANT', 'SHOP'] as const).map((v) => (
                    <option key={v} value={v}>
                      {TARGET_LABELS[v]}
                    </option>
                  ))}
                </select>

                {isDraft && (
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      disabled={deletingId === a.id}
                      className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Descartar
                    </button>
                    <TextureButton
                      variant="secondary"
                      size="sm"
                      className="!w-auto disabled:opacity-50"
                      disabled={!changed || savingId === a.id}
                      onClick={() => save(a.id)}
                    >
                      {savingId === a.id ? 'Guardando…' : 'Guardar'}
                    </TextureButton>
                    <TextureButton
                      variant="success"
                      size="sm"
                      className="!w-auto flex items-center gap-1.5 disabled:opacity-50"
                      disabled={sendingId === a.id}
                      onClick={() => send(a.id)}
                    >
                      <Send className="h-3.5 w-3.5" /> {sendingId === a.id ? 'Enviando…' : 'Enviar'}
                    </TextureButton>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
