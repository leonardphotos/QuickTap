import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '@/api/client';
import type { StaffMember, UserRole } from '@/types';
import { ROLE_LABELS } from '@/utils/roles';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard, TextureCardHeader, TextureCardTitle, TextureCardContent } from '@/components/ui/texture-card';
import { PasswordInput } from '@/components/ui/password-input';

/** Roles asignables desde Shop: a diferencia del Equipo de restaurante, acá no tiene sentido
 * ofrecer Mesero/Cocina/Pantalla/Comanda/Numero — son conceptos de mesas/cocina que un local
 * comercial no tiene. Solo Administrador (mismo acceso que el dueño, sin poder borrar la cuenta)
 * y Cajero (cobra, sin ver márgenes — ver canSeeMoney en ShopLayout). */
const SHOP_ASSIGNABLE_ROLES: UserRole[] = ['ADMIN', 'CASHIER'];

const emptyForm = { name: '', email: '', password: '', role: 'CASHIER' as UserRole };

/**
 * Gestión de equipo para QuickTap Shop — hasta ahora esta pantalla no existía para negocios de
 * tipo SHOP: AdminLayout intercepta la ruta antes de llegar a /admin/team (que además está hecha
 * pensando en roles de restaurante), así que un dueño de Local Comercial no tenía forma de crear
 * usuarios para su personal. El backend (/team) ya es genérico por-restaurante, así que esto es
 * solo una vista distinta sobre la misma API, con la lista de roles recortada.
 */
export function ShopTeamSection() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ role: UserRole; isActive: boolean } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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

  function startEdit(s: StaffMember) {
    setEditingId(s.id);
    setEditDraft({ role: s.role, isActive: s.isActive });
  }

  async function saveEdit(id: string) {
    if (!editDraft) return;
    setSavingEdit(true);
    setError(null);
    try {
      await api.patch(`/team/${id}`, editDraft);
      setEditingId(null);
      setEditDraft(null);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo guardar el cambio.');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <TextureCard>
      <TextureCardHeader className="px-6">
        <TextureCardTitle className="pl-0">Equipo</TextureCardTitle>
        <p className="text-sm text-brand-950/60 font-light">
          Crea usuarios para tu personal. Administrador ve márgenes y costos; Cajero solo puede cobrar.
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
          <PasswordInput
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Contraseña"
            className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          >
            {SHOP_ASSIGNABLE_ROLES.map((r) => (
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
            className="!w-auto disabled:opacity-50 sm:col-span-2"
          >
            {saving ? 'Creando…' : 'Crear usuario'}
          </TextureButton>
        </form>

        <ul className="divide-y divide-brand-950/10 rounded-xl border border-brand-950/10">
          {staff.map((s) =>
            editingId === s.id && editDraft ? (
              <li key={s.id} className="space-y-2 px-3 py-3 text-sm">
                <p className="font-medium text-brand-950">{s.name}</p>
                <select
                  value={editDraft.role}
                  onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value as UserRole })}
                  className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-sm"
                >
                  {SHOP_ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-xs text-brand-950/70">
                  <input
                    type="checkbox"
                    checked={editDraft.isActive}
                    onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-brand-950/20"
                  />
                  Activo
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <TextureButton
                    variant="brand"
                    size="sm"
                    className="!w-auto disabled:opacity-50"
                    disabled={savingEdit}
                    onClick={() => saveEdit(s.id)}
                  >
                    {savingEdit ? 'Guardando…' : 'Guardar'}
                  </TextureButton>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft(null);
                    }}
                    className="text-xs text-brand-950/50"
                  >
                    Cancelar
                  </button>
                </div>
              </li>
            ) : (
              <li key={s.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 truncate">
                    {s.name}
                    {!s.isActive && <span className="font-normal text-brand-950/40"> (inactivo)</span>}
                  </p>
                  <p className="text-xs text-brand-950/40 truncate">
                    {s.email} · {ROLE_LABELS[s.role]}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(s)} className="text-brand-500 hover:text-brand-400 text-xs">
                    Editar
                  </button>
                  <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-600 text-xs">
                    Eliminar
                  </button>
                </div>
              </li>
            ),
          )}
          {staff.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin personal aún.</li>
          )}
        </ul>
      </TextureCardContent>
    </TextureCard>
  );
}
