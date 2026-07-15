import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { DeliveryCourier } from '@/types';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

const emptyForm = { name: '', whatsappPhone: '' };

/** "Equipo de Delivery": repartidores externos (nombre + WhatsApp), para despachar comandas. */
export function DeliveryTeamSection() {
  const [couriers, setCouriers] = useState<DeliveryCourier[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/delivery-couriers').then((res) => setCouriers(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/delivery-couriers', form);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo agregar al repartidor.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar a este repartidor?')) return;
    await api.delete(`/delivery-couriers/${id}`);
    load();
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Equipo de Delivery</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Repartidores a los que puedes despachar una comanda por WhatsApp desde el Dashboard.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre del repartidor"
            required
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          <input
            value={form.whatsappPhone}
            onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
            placeholder="WhatsApp (ej: 584141234567)"
            required
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <TextureButton
            variant="brand"
            size="default"
            disabled={saving}
            className="!w-auto px-4 disabled:opacity-50 sm:col-span-2"
          >
            {saving ? 'Guardando…' : 'Agregar repartidor'}
          </TextureButton>
        </form>

        <div className="divide-y divide-brand-950/[0.06] border-t border-brand-950/[0.06] pt-2">
          {couriers.length === 0 && <p className="text-sm text-brand-950/40 font-light py-3">Sin repartidores todavía.</p>}
          {couriers.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-brand-950">{c.name}</p>
                <p className="text-xs text-brand-950/50 font-light">{c.whatsappPhone}</p>
              </div>
              <button onClick={() => remove(c.id)} className="text-xs text-red-600 hover:text-red-700 shrink-0">
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </TextureCardContent>
    </TextureCard>
  );
}
