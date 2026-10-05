import { api } from '@/api/client';
import { AssignTablesDialog } from '@/components/admin/AssignTablesDialog';
import { SetWaiterPinDialog } from '@/components/admin/SetWaiterPinDialog';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';
import { WhatsappPhoneInput } from '@/components/ui/whatsapp-phone-input';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard,TextureCardContent,TextureCardHeader,TextureCardTitle } from '@/components/ui/texture-card';
import { useAuth } from '@/context/AuthContext.shared';
import type { StaffMember,UserRole } from '@/types';
import { ASSIGNABLE_TEAM_ROLES,ROLE_LABELS } from '@/utils/roles';
import type { FormEvent } from 'react';
import { useEffect,useState } from 'react';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'WAITER' as UserRole,
  canAccessInventory: false,
  cashierFullAccess: false,
  // Segundo inicio de sesión (tablet compartida): el PIN de este mesero, opcional acá mismo —
  // sin esto había que crear el usuario y aparte abrir "PIN" en la lista, uno por uno.
  pin: '',
  whatsappPhone: '',
};

const INVENTORY_ELIGIBLE_ROLES: UserRole[] = ['CASHIER', 'WAITER', 'KITCHEN'];

export function TeamSection() {
  const { restaurant } = useAuth();
  // Verificador es la puerta de un evento y solo existe en Local Comercial: en un restaurante
  // no tendría a dónde entrar (el panel de restaurantes lo mandaría a Cocina, que no le toca).
  const rolesAsignables = ASSIGNABLE_TEAM_ROLES.filter(
    (r) => ((r !== 'CANCHA' && r !== 'COACH') || restaurant?.businessType === 'SPORTS_CLUB')
      && (r !== 'VERIFICADOR' || restaurant?.businessType === 'SHOP'),
  );
  const isDemo = restaurant?.isDemo ?? false;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    role: UserRole;
    isActive: boolean;
    canAccessInventory: boolean;
    cashierFullAccess: boolean;
    whatsappPhone: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [assigningTablesFor, setAssigningTablesFor] = useState<StaffMember | null>(null);
  const [settingPinFor, setSettingPinFor] = useState<StaffMember | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<{ name: string; password: string } | null>(null);

  function load() {
    api.get('/team').then((res) => setStaff(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      // Mesero: solo nombre + clave — el correo/clave se generan solos en el backend (ver
      // team.service.ts create()). Mandar '' rompería la validación de email del resto de roles.
      const payload =
        form.role === 'WAITER'
          ? { name: form.name, role: form.role, pin: form.pin, canAccessInventory: form.canAccessInventory }
          : { ...form, email: form.email.trim(), pin: undefined, whatsappPhone: form.role === 'MOTORIZADO' ? form.whatsappPhone : undefined };
      await api.post('/team', payload);
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

  async function resetPassword(member: StaffMember) {
    if (!confirm(`¿Restablecer la clave de ${member.name}? La anterior dejará de funcionar.`)) return;
    setError(null);
    try {
      const { data } = await api.post(`/team/${member.id}/reset-password`, {});
      setResetPasswordResult({ name: member.name, password: data.data.temporaryPassword });
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo restablecer la clave.');
    }
  }

  function startEdit(s: StaffMember) {
    setEditingId(s.id);
    setEditDraft({ role: s.role, isActive: s.isActive, canAccessInventory: s.canAccessInventory, cashierFullAccess: s.cashierFullAccess, whatsappPhone: s.whatsappPhone ?? '' });
  }

  async function saveEdit(id: string) {
    if (!editDraft) return;
    setSavingEdit(true);
    setError(null);
    try {
      await api.patch(`/team/${id}`, {
        ...editDraft,
        whatsappPhone: editDraft.role === 'MOTORIZADO' ? editDraft.whatsappPhone : undefined,
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
        <p className="text-brand-950/60 font-light text-base">
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
            className="border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
            required
          />
          {form.role !== 'WAITER' && (
            <>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                type="email"
                className="border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
                required
              />
              <PasswordInput
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Contraseña"
                className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                required
              />
            </>
          )}
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="border border-brand-950/15 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
          >
            {rolesAsignables.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {form.role === 'WAITER' && (
            <label className="block sm:col-span-2 text-sm font-medium">
              <span className="text-xs text-brand-950/60">
                Clave de 4 dígitos — con esto entra a la Tablet de Meseros, no necesita email ni contraseña.
              </span>
              <input
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/[^0-9]/g, '').slice(0, 4) })}
                placeholder="4 dígitos, ej: 1234"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                className="mt-1 w-full sm:w-40 rounded-lg border border-brand-950/15 px-3 py-2 text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500 text-base"
                required
              />
            </label>
          )}
          {form.role === 'MOTORIZADO' && (
            <label className="block sm:col-span-2 text-sm font-medium">
              <span className="mb-1 block text-xs text-brand-950/60">Teléfono del motorizado</span>
              <WhatsappPhoneInput
                value={form.whatsappPhone}
                onChange={(whatsappPhone) => setForm({ ...form, whatsappPhone })}
              />
            </label>
          )}
          {INVENTORY_ELIGIBLE_ROLES.includes(form.role) && (
            <label className="flex items-center gap-2 text-brand-950/70 sm:col-span-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.canAccessInventory}
                onChange={(e) => setForm({ ...form, canAccessInventory: e.target.checked })}
                className="h-4 w-4 rounded border-brand-950/20"
              />
              Dar acceso a Inventario
            </label>
          )}
          {form.role === 'CASHIER' && (
            <label className="flex items-center gap-2 text-brand-950/70 sm:col-span-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={form.cashierFullAccess}
                onChange={(e) => setForm({ ...form, cashierFullAccess: e.target.checked })}
                className="h-4 w-4 rounded border-brand-950/20"
              />
              Dar acceso completo (Administración, Productos, Mesas…) — sin esto, el Cajero solo ve lo mismo que
              Mesero, más abrir/cerrar caja y los movimientos del día por método de pago.
            </label>
          )}
          {error && <p className="text-red-600 sm:col-span-2 text-base">{error}</p>}
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
                <p className="font-medium text-brand-950 text-base">{s.name}</p>
                {isDemo ? (
                  <p className="text-brand-950/50 font-light text-xs">
                    El rol no se puede cambiar en el entorno demo ({ROLE_LABELS[editDraft.role]}).
                  </p>
                ) : (
                  <select
                    value={editDraft.role}
                    onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value as UserRole })}
                    className="w-full border border-brand-950/15 rounded-lg px-2.5 py-1.5 text-base"
                  >
                    {rolesAsignables.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                )}
                {INVENTORY_ELIGIBLE_ROLES.includes(editDraft.role) && (
                  <label className="flex items-center gap-2 text-brand-950/70 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={editDraft.canAccessInventory}
                      onChange={(e) => setEditDraft({ ...editDraft, canAccessInventory: e.target.checked })}
                      className="h-4 w-4 rounded border-brand-950/20"
                    />
                    Dar acceso a Inventario
                  </label>
                )}
                {editDraft.role === 'MOTORIZADO' && (
                  <label className="block text-brand-950/70 text-sm font-medium">
                    Teléfono del motorizado
                    <div className="mt-1">
                      <WhatsappPhoneInput
                        value={editDraft.whatsappPhone}
                        onChange={(whatsappPhone) => setEditDraft({ ...editDraft, whatsappPhone })}
                      />
                    </div>
                  </label>
                )}
                {editDraft.role === 'CASHIER' && (
                  <label className="flex items-center gap-2 text-brand-950/70 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={editDraft.cashierFullAccess}
                      onChange={(e) => setEditDraft({ ...editDraft, cashierFullAccess: e.target.checked })}
                      className="h-4 w-4 rounded border-brand-950/20"
                    />
                    Dar acceso completo (Administración, Productos, Mesas…)
                  </label>
                )}
                <label className="flex items-center gap-2 text-brand-950/70 text-sm font-medium">
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
                  <p className="font-medium text-brand-950 truncate text-base">
                    {s.name}
                    {!s.isActive && <span className="font-normal text-brand-950/40"> (inactivo)</span>}
                  </p>
                  <p className="text-brand-950/40 truncate text-xs">
                    {s.email} · {ROLE_LABELS[s.role]}
                    {INVENTORY_ELIGIBLE_ROLES.includes(s.role) && s.canAccessInventory && ' · Inventario'}
                    {s.role === 'CASHIER' && s.cashierFullAccess && ' · Acceso completo'}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {s.role === 'WAITER' && (
                    <button
                      onClick={() => setAssigningTablesFor(s)}
                      className="text-brand-500 hover:text-brand-400 text-xs"
                    >
                      Asignar mesas
                    </button>
                  )}
                  {s.role === 'WAITER' && (
                    <button
                      onClick={() => setSettingPinFor(s)}
                      className="text-brand-500 hover:text-brand-400 text-xs"
                    >
                      PIN{s.hasLockPin ? '' : ' (sin configurar)'}
                    </button>
                  )}
                  {s.role !== 'WAITER' && (
                    <button onClick={() => resetPassword(s)} className="text-brand-500 hover:text-brand-400 text-xs">
                      Restablecer clave
                    </button>
                  )}
                  <button onClick={() => startEdit(s)} className="text-brand-500 hover:text-brand-400 text-xs">
                    Editar
                  </button>
                  {!isDemo && (
                    <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-600 text-xs">
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            ),
          )}
          {staff.length === 0 && (
            <li className="px-3 py-4 text-center text-brand-950/40 text-sm font-light">Sin personal aún.</li>
          )}
        </ul>
      </TextureCardContent>
      {assigningTablesFor && (
        <AssignTablesDialog waiter={assigningTablesFor} onClose={() => setAssigningTablesFor(null)} />
      )}
      {settingPinFor && (
        <SetWaiterPinDialog waiter={settingPinFor} onClose={() => setSettingPinFor(null)} onSaved={load} />
      )}
      {resetPasswordResult && (
        <Dialog open onOpenChange={(open) => !open && setResetPasswordResult(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Nueva clave de {resetPasswordResult.name}</DialogTitle>
            </DialogHeader>
            <p className="text-brand-950/60 text-base">Guárdala ahora: no se mostrará nuevamente.</p>
            <div className="rounded-xl bg-brand-950/[0.06] px-4 py-3 font-mono text-lg font-bold tracking-wide text-brand-950 break-all select-all">
              {resetPasswordResult.password}
            </div>
            <TextureButton
              variant="brand"
              size="default"
              onClick={() => navigator.clipboard?.writeText(resetPasswordResult.password)}
            >
              Copiar clave
            </TextureButton>
          </DialogContent>
        </Dialog>
      )}
    </TextureCard>
  );
}
