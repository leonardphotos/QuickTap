import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { StaffMember, UserRole } from '@/types';
import { ASSIGNABLE_TEAM_ROLES, ROLE_LABELS } from '@/utils/roles';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';

const emptyForm = { name: '', email: '', password: '', role: 'WAITER' as UserRole };

export function TeamSection() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/team').then((res) => setStaff(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/team', form);
      setForm(emptyForm);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear el usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar a este miembro del equipo?')) return;
    await api.delete(`/team/${id}`);
    load();
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Equipo</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Crea usuarios para tu personal y asígnales un rol. Mesero y Cocina solo ven Cocina y Órdenes de Mesa.
          Pantalla muestra ambas en una sola vista horizontal, ideal para un monitor o TV.
        </p>
      </TextureCardHeader>
      <TextureCardContent className="space-y-4">
        <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            type="email"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <input
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Contraseña"
            type="password"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          >
            {ASSIGNABLE_TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          <TextureButton
            variant="brand"
            size="default"
            disabled={saving}
            className="!w-auto px-4 disabled:opacity-50 sm:col-span-2"
          >
            {saving ? 'Creando…' : 'Crear usuario'}
          </TextureButton>
        </form>

        <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium text-brand-950">{s.name}</p>
                <p className="text-xs text-brand-950/40">
                  {s.email} · {ROLE_LABELS[s.role]}
                </p>
              </div>
              <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-600 text-xs shrink-0">
                Eliminar
              </button>
            </li>
          ))}
          {staff.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin personal aún.</li>
          )}
        </ul>
      </TextureCardContent>
    </TextureCard>
  );
}
