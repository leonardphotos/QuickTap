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
 * comercial no tiene. Administrador (mismo acceso que el dueño, sin poder borrar la cuenta),
 * Cajero (cobra, sin ver márgenes — ver canSeeMoney en ShopLayout) y Verificador (solo escanea
 * el QR de las entradas en la puerta de un evento — Tickera → Verificar). */
const SHOP_ASSIGNABLE_ROLES: UserRole[] = ['ADMIN', 'CASHIER', 'VERIFICADOR'];

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
  const [editDraft, setEditDraft] = useState<{
    role: UserRole;
    isActive: boolean;
    isServiceProvider: boolean;
    commissionPercent: string;
    // Datos de cobro propios del profesional: en barbería el cliente le paga directo a él.
    pmTelefono: string;
    pmBanco: string;
    pmCedula: string;
    pmTitular: string;
    zelleCorreo: string;
  } | null>(null);
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
    const pm = s.paymentMethodsConfig?.MOBILE_PAYMENT;
    const zelle = s.paymentMethodsConfig?.ZELLE;
    setEditingId(s.id);
    setEditDraft({
      role: s.role,
      isActive: s.isActive,
      isServiceProvider: s.isServiceProvider ?? false,
      commissionPercent: s.commissionPercent != null ? String(s.commissionPercent) : '',
      pmTelefono: pm?.telefono ?? '',
      pmBanco: pm?.banco ?? '',
      pmCedula: pm?.cedula ?? '',
      pmTitular: pm?.titular ?? '',
      zelleCorreo: zelle?.correo ?? '',
    });
  }

  async function saveEdit(id: string) {
    if (!editDraft) return;
    setSavingEdit(true);
    setError(null);
    try {
      const { pmTelefono, pmBanco, pmCedula, pmTitular, zelleCorreo, commissionPercent, ...rest } = editDraft;
      // Solo se manda el método que tenga datos cargados: un objeto vacío haría que el POS
      // creyera que el barbero tiene cobro propio y mostrara una pantalla en blanco.
      const paymentMethodsConfig: Record<string, Record<string, unknown>> = {};
      if (pmTelefono.trim()) {
        paymentMethodsConfig.MOBILE_PAYMENT = {
          enabled: true,
          telefono: pmTelefono.trim(),
          banco: pmBanco.trim(),
          cedula: pmCedula.trim(),
          titular: pmTitular.trim(),
        };
      }
      if (zelleCorreo.trim()) {
        paymentMethodsConfig.ZELLE = { enabled: true, correo: zelleCorreo.trim(), titular: pmTitular.trim() };
      }
      await api.patch(`/team/${id}`, {
        ...rest,
        commissionPercent: commissionPercent.trim() === '' ? null : Number(commissionPercent.replace(',', '.')),
        paymentMethodsConfig: Object.keys(paymentMethodsConfig).length > 0 ? paymentMethodsConfig : null,
      });
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

                <label className="flex items-center gap-2 text-xs text-brand-950/70">
                  <input
                    type="checkbox"
                    checked={editDraft.isServiceProvider}
                    onChange={(e) => setEditDraft({ ...editDraft, isServiceProvider: e.target.checked })}
                    className="h-4 w-4 rounded border-brand-950/20"
                  />
                  Presta servicios (barbero/estilista) — aparece en "Atendido por" al cobrar
                </label>

                {editDraft.isServiceProvider && (
                  <div className="rounded-xl bg-brand-950/[0.03] border border-brand-950/10 p-3 space-y-2.5">
                    <label className="block text-xs">
                      <span className="text-brand-950/60">Comisión que se lleva (%)</span>
                      <input
                        value={editDraft.commissionPercent}
                        onChange={(e) => setEditDraft({ ...editDraft, commissionPercent: e.target.value })}
                        placeholder="50"
                        inputMode="decimal"
                        className="mt-1 w-24 border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <span className="ml-2 text-brand-950/40">del monto de sus servicios</span>
                    </label>

                    <div>
                      <p className="text-xs font-semibold text-brand-950 mb-1">Sus datos de cobro</p>
                      <p className="text-[11px] text-brand-950/45 mb-2">
                        Al cobrar un servicio suyo se muestran ESTOS datos, no los del local — el cliente le paga
                        directo. La venta igual queda registrada acá.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={editDraft.pmTelefono}
                          onChange={(e) => setEditDraft({ ...editDraft, pmTelefono: e.target.value })}
                          placeholder="Pago Móvil: teléfono"
                          className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                        />
                        <input
                          value={editDraft.pmBanco}
                          onChange={(e) => setEditDraft({ ...editDraft, pmBanco: e.target.value })}
                          placeholder="Banco"
                          className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                        />
                        <input
                          value={editDraft.pmCedula}
                          onChange={(e) => setEditDraft({ ...editDraft, pmCedula: e.target.value })}
                          placeholder="Cédula"
                          className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                        />
                        <input
                          value={editDraft.pmTitular}
                          onChange={(e) => setEditDraft({ ...editDraft, pmTitular: e.target.value })}
                          placeholder="Titular"
                          className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm"
                        />
                        <input
                          value={editDraft.zelleCorreo}
                          onChange={(e) => setEditDraft({ ...editDraft, zelleCorreo: e.target.value })}
                          placeholder="Zelle: correo (opcional)"
                          className="border border-brand-950/15 rounded-lg px-2 py-1.5 text-sm col-span-2"
                        />
                      </div>
                    </div>
                  </div>
                )}

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
                    {s.isServiceProvider && ` · presta servicios${s.commissionPercent ? ` (${s.commissionPercent}%)` : ''}`}
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
