import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { formatBase } from '@/utils/format';
import { MaskedAmount } from '@/components/master/MaskedAmount';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';
import { TextureButton } from '@/components/ui/texture-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasswordInput } from '@/components/ui/password-input';
import { WhatsappPhoneInput } from '@/components/ui/whatsapp-phone-input';

interface RestaurantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface RestaurantBranch {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
}

interface RestaurantDetail {
  id: string;
  slug: string;
  name: string;
  whatsappPhone: string | null;
  rif: string | null;
  ivaEnabled: boolean;
  parentRestaurantId: string | null;
  customMonthlyPriceUsd: string | null;
  branches: RestaurantBranch[];
  fiscalInvoicingConfig: { enabled: boolean; environment: string; username: string; updatedAt: string } | null;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: string;
  createdAt: string;
  suspended: boolean;
  locked: boolean;
  daysRemaining: number;
  users: RestaurantUser[];
  _count: { products: number; tables: number; orders: number };
  recentOrders: {
    id: string;
    orderNumber: number;
    channel: string;
    status: string;
    currency: string;
    totalBase: string;
    createdAt: string;
  }[];
}

// SUCURSALES/DELIVERY_SUCURSALES son planes legados (ya no se ofrecen a clientes nuevos, ver
// CLAUDE.md) — se mantienen acá solo para poder seguir gestionando a los restaurantes que ya
// los tienen activos.
const PLAN_OPTIONS = ['DELIVERY', 'PRO', 'ELITE', 'SUCURSALES', 'DELIVERY_SUCURSALES'] as const;
const PLAN_OPTION_LABELS: Record<(typeof PLAN_OPTIONS)[number], string> = {
  DELIVERY: 'DELIVERY — Solo Delivery',
  PRO: 'PRO — Plan Pro',
  ELITE: 'ELITE — Plan Elite',
  SUCURSALES: 'SUCURSALES — Plan Sucursales (legado)',
  DELIVERY_SUCURSALES: 'DELIVERY_SUCURSALES — Delivery Sucursales (legado)',
};
const CYCLE_OPTIONS = ['MONTHLY', 'QUARTERLY', 'SEMIANNUAL'] as const;
const BRANCH_PLAN_OPTIONS = ['DELIVERY', 'PRO', 'ELITE', 'SUCURSALES', 'DELIVERY_SUCURSALES'] as const;

export default function MasterRestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RestaurantDetail | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [plan, setPlan] = useState<(typeof PLAN_OPTIONS)[number]>('PRO');
  const [cycle, setCycle] = useState<(typeof CYCLE_OPTIONS)[number]>('MONTHLY');
  const [extendDays, setExtendDays] = useState(30);
  const [exactPeriodEnd, setExactPeriodEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<RestaurantUser | null>(null);
  const [showAddBranchDialog, setShowAddBranchDialog] = useState(false);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [fiscalEnvironment, setFiscalEnvironment] = useState<'QA' | 'PRODUCTION'>('QA');
  const [fiscalUsername, setFiscalUsername] = useState('');
  const [fiscalPassword, setFiscalPassword] = useState('');

  function load() {
    masterApi.get(`/master/restaurants/${id}`).then((res) => {
      const data: RestaurantDetail = res.data.data;
      setDetail(data);
      setExactPeriodEnd(data.periodEnd.slice(0, 10));
      if (data.fiscalInvoicingConfig) {
        setFiscalEnvironment(data.fiscalInvoicingConfig.environment as 'QA' | 'PRODUCTION');
        setFiscalUsername(data.fiscalInvoicingConfig.username);
      }
      setCustomPriceInput(data.customMonthlyPriceUsd ?? '');
    });
  }

  useEffect(load, [id]);

  async function activate() {
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.post(`/master/restaurants/${id}/activate`, { plan, billingCycle: cycle });
      setMessage('Suscripción activada/extendida.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo activar.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleIva() {
    if (!detail) return;
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/iva`, { ivaEnabled: !detail.ivaEnabled });
      setMessage(detail.ivaEnabled ? 'IVA desactivado.' : 'IVA activado.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar el IVA.');
    } finally {
      setBusy(false);
    }
  }

  async function saveFiscalInvoicing(enabled: boolean) {
    if (!detail) return;
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/fiscal-invoicing`, {
        enabled,
        environment: fiscalEnvironment,
        ...(fiscalUsername.trim() ? { username: fiscalUsername.trim() } : {}),
        ...(fiscalPassword.trim() ? { password: fiscalPassword.trim() } : {}),
      });
      setMessage(enabled ? 'Facturación fiscal activada.' : 'Facturación fiscal desactivada.');
      setFiscalPassword('');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar la facturación fiscal.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleSuspended() {
    if (!detail) return;
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/suspend`, { suspended: !detail.suspended });
      setMessage(detail.suspended ? 'Cuenta desbloqueada.' : 'Cuenta bloqueada.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  }

  async function applyExtendDays() {
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/extend`, { days: extendDays });
      setMessage(`Vencimiento ajustado ${extendDays >= 0 ? '+' : ''}${extendDays} día(s).`);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo ajustar.');
    } finally {
      setBusy(false);
    }
  }

  async function applyExactPeriodEnd() {
    if (!exactPeriodEnd) return;
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.patch(`/master/restaurants/${id}/period-end`, { periodEnd: exactPeriodEnd });
      setMessage('Fecha de vencimiento actualizada.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar la fecha.');
    } finally {
      setBusy(false);
    }
  }

  async function saveUser(input: { name: string; email: string; password: string }) {
    if (!editingUser) return;
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, string> = {};
      if (input.name.trim()) payload.name = input.name.trim();
      if (input.email.trim()) payload.email = input.email.trim();
      if (input.password.trim()) payload.password = input.password.trim();
      await masterApi.patch(`/master/restaurants/${id}/users/${editingUser.id}`, payload);
      setMessage('Usuario actualizado.');
      setEditingUser(null);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo actualizar el usuario.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCustomPrice() {
    setBusy(true);
    setMessage(null);
    try {
      const trimmed = customPriceInput.trim();
      await masterApi.patch(`/master/restaurants/${id}/custom-price`, {
        customMonthlyPriceUsd: trimmed ? Number(trimmed) : null,
      });
      setMessage(trimmed ? 'Precio mensual guardado.' : 'Precio mensual borrado.');
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo guardar el precio.');
    } finally {
      setBusy(false);
    }
  }

  async function createBranch(input: {
    name: string;
    whatsappPhone: string;
    plan: (typeof BRANCH_PLAN_OPTIONS)[number];
    billingCycle: (typeof CYCLE_OPTIONS)[number];
    copyCatalog: boolean;
  }) {
    setBusy(true);
    setMessage(null);
    try {
      await masterApi.post(`/master/restaurants/${id}/branches`, {
        name: input.name,
        ...(input.whatsappPhone.trim() ? { whatsappPhone: input.whatsappPhone.trim() } : {}),
        plan: input.plan,
        billingCycle: input.billingCycle,
        copyCatalog: input.copyCatalog,
      });
      setMessage('Sucursal creada.');
      setShowAddBranchDialog(false);
      load();
    } catch (err: any) {
      setMessage(err.response?.data?.error ?? 'No se pudo crear la sucursal.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRestaurant() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await masterApi.delete(`/master/restaurants/${id}`);
      navigate('/master');
    } catch (err: any) {
      setDeleteError(err.response?.data?.error ?? 'No se pudo eliminar el restaurante.');
    } finally {
      setDeleting(false);
    }
  }

  if (!detail) return <p className="text-brand-950/50 font-light">Cargando…</p>;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-950">{detail.name}</h1>
        <p className="text-sm text-brand-950/40 font-light">/{detail.slug}</p>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-2">
        <p className="font-semibold text-brand-950 mb-1">Información del local</p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">Nombre: </span>
          {detail.name}
        </p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">Teléfono: </span>
          {detail.whatsappPhone ?? 'No registrado'}
        </p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">Correo: </span>
          {detail.users.find((u) => u.role === 'OWNER')?.email ?? 'No registrado'}
        </p>
        <p className="text-sm text-brand-950/70">
          <span className="text-brand-950/50">RIF: </span>
          {detail.rif?.trim() || 'No registrado'}
        </p>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-brand-950">IVA (16%)</p>
          <p className="text-sm text-brand-950/60 font-light mt-1">
            {detail.rif?.trim()
              ? 'Este restaurante tiene RIF registrado, puedes activarle el IVA.'
              : 'No se puede activar: este restaurante todavía no tiene RIF registrado en Ajustes.'}
          </p>
        </div>
        <TextureButton
          variant={detail.ivaEnabled ? 'destructive' : 'brand'}
          size="sm"
          disabled={busy || (!detail.ivaEnabled && !detail.rif?.trim())}
          className="!w-auto shrink-0 disabled:opacity-50"
          onClick={toggleIva}
        >
          {detail.ivaEnabled ? 'Desactivar IVA' : 'Activar IVA'}
        </TextureButton>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-brand-950">Facturación fiscal (SENIAT — Unidigital)</p>
            <p className="text-sm text-brand-950/60 font-light mt-1">
              {detail.rif?.trim()
                ? 'Cada pedido saldado por completo generará automáticamente una Factura fiscal vía Unidigital.'
                : 'No se puede activar: este restaurante todavía no tiene RIF registrado en Ajustes.'}
            </p>
          </div>
          {detail.fiscalInvoicingConfig?.enabled && (
            <span className="shrink-0 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-semibold px-2.5 py-1">
              Activo
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-brand-950/70 mb-1">Usuario Unidigital</span>
            <input
              type="text"
              value={fiscalUsername}
              onChange={(e) => setFiscalUsername(e.target.value)}
              placeholder="usuario@empresa.com"
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-56"
            />
          </label>
          <label className="text-sm">
            <span className="block text-brand-950/70 mb-1">Contraseña</span>
            <PasswordInput
              value={fiscalPassword}
              onChange={(e) => setFiscalPassword(e.target.value)}
              placeholder={detail.fiscalInvoicingConfig ? 'Dejar en blanco para no cambiarla' : ''}
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-56"
            />
          </label>
          <label className="text-sm">
            <span className="block text-brand-950/70 mb-1">Ambiente</span>
            <select
              value={fiscalEnvironment}
              onChange={(e) => setFiscalEnvironment(e.target.value as 'QA' | 'PRODUCTION')}
              className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            >
              <option value="QA">Pruebas (QA)</option>
              <option value="PRODUCTION">Producción</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <TextureButton
            variant="brand"
            size="sm"
            disabled={busy || !detail.rif?.trim()}
            className="!w-auto disabled:opacity-50"
            onClick={() => saveFiscalInvoicing(true)}
          >
            Guardar y activar
          </TextureButton>
          {detail.fiscalInvoicingConfig?.enabled && (
            <TextureButton
              variant="destructive"
              size="sm"
              disabled={busy}
              className="!w-auto"
              onClick={() => saveFiscalInvoicing(false)}
            >
              Desactivar
            </TextureButton>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-brand-950">Migración desde OlaClick</p>
          <p className="text-sm text-brand-950/60 font-light mt-1">
            Herramienta interna de onboarding — trae el menú del restaurante
            desde su cuenta de OlaClick. El restaurante no ve esta pantalla.
          </p>
        </div>
        <TextureButton
          variant="brand"
          size="sm"
          className="!w-auto shrink-0"
          onClick={() => navigate(`/master/restaurants/${id}/olaclick-import`)}
        >
          Migrar menú
        </TextureButton>
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
        <Stat label="Usuarios" value={detail.users.length} />
        <Stat label="Mesas" value={detail._count.tables} />
        <Stat label="Productos" value={detail._count.products} />
        <Stat label="Pedidos" value={detail._count.orders} />
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-brand-950">Suscripción</p>
            <p className="text-sm text-brand-950/60 font-light mt-1">
              {detail.suspended
                ? 'Bloqueada manualmente desde el Dashboard maestro.'
                : detail.locked
                  ? 'Bloqueada por falta de pago.'
                  : `${detail.subscriptionStatus === 'TRIALING' ? 'En prueba' : `Plan ${detail.subscriptionPlan}`} · vence en ${detail.daysRemaining} día(s) (${new Date(detail.periodEnd).toLocaleDateString('es-VE')}).`}
            </p>
          </div>
          <TextureButton
            variant={detail.suspended ? 'brand' : 'destructive'}
            size="sm"
            disabled={busy}
            className="!w-auto shrink-0"
            onClick={toggleSuspended}
          >
            {detail.suspended ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
          </TextureButton>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Editar plan</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Plan</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as (typeof PLAN_OPTIONS)[number])}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_OPTION_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Ciclo</span>
              <select
                value={cycle}
                onChange={(e) => setCycle(e.target.value as (typeof CYCLE_OPTIONS)[number])}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              >
                {CYCLE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <TextureButton variant="brand" size="default" disabled={busy} className="!w-auto" onClick={activate}>
              {busy ? 'Activando…' : 'Activar / Extender'}
            </TextureButton>
          </div>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Ajustar días de vencimiento</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Días (negativo para recortar)</span>
              <input
                type="number"
                value={extendDays}
                onChange={(e) => setExtendDays(Number(e.target.value))}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-32"
              />
            </label>
            <TextureButton
              variant="minimal"
              size="default"
              disabled={busy}
              className="!w-auto"
              onClick={applyExtendDays}
            >
              {busy ? 'Guardando…' : 'Aplicar'}
            </TextureButton>
          </div>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Establecer fecha exacta de vencimiento</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">Día / mes / año</span>
              <input
                type="date"
                value={exactPeriodEnd}
                onChange={(e) => setExactPeriodEnd(e.target.value)}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <TextureButton
              variant="minimal"
              size="default"
              disabled={busy || !exactPeriodEnd}
              className="!w-auto disabled:opacity-50"
              onClick={applyExactPeriodEnd}
            >
              {busy ? 'Guardando…' : 'Establecer fecha'}
            </TextureButton>
          </div>
        </div>

        {message && <p className="text-sm text-brand-950/70">{message}</p>}
      </div>

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-5">
        <div>
          <p className="font-semibold text-brand-950">Cobro</p>
          <p className="text-sm text-brand-950/60 font-light mt-1">
            Lo que este restaurante paga: su mensualidad y los cargos puntuales que se le sumen
            aparte. El restaurante lo ve desglosado al momento de pagar.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-brand-950/70 mb-2">Precio mensual acordado</p>
          <p className="text-xs text-brand-950/40 font-light mb-2">
            Reemplaza la tarifa pública de su plan. Déjalo vacío para volver a cobrarle el precio
            de lista.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-brand-950/70 mb-1">USD / mes</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={customPriceInput}
                onChange={(e) => setCustomPriceInput(e.target.value)}
                placeholder="Precio de lista"
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-40"
              />
            </label>
            <TextureButton variant="minimal" size="default" disabled={busy} className="!w-auto" onClick={saveCustomPrice}>
              {busy ? 'Guardando…' : 'Guardar precio'}
            </TextureButton>
          </div>
        </div>

        <div className="pt-1 border-t border-brand-950/[0.06]" />

        <AdditionalChargesBlock restaurantId={id!} />
      </div>

      {!detail.parentRestaurantId && (
        <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6 space-y-5">
          <div>
            <p className="font-semibold text-brand-950">Sucursales</p>
            <p className="text-sm text-brand-950/60 font-light mt-1">
              Si todavía no tiene ninguna, crea la primera sucursal — sin pasar por el
              autoservicio del restaurante.
            </p>
          </div>

          {detail.branches.length === 0 ? (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-brand-950/60 font-light">
                Este restaurante todavía no tiene sucursales. Si su plan actual no incluye
                sucursales, se activará automáticamente en el plan elegido al crearla.
              </p>
              <TextureButton
                variant="brand"
                size="sm"
                className="!w-auto shrink-0"
                onClick={() => setShowAddBranchDialog(true)}
              >
                Agregar sucursal
              </TextureButton>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-brand-950/70 mb-2">
                Sucursales ({detail.branches.length})
              </p>
              <ul className="space-y-1.5 text-sm">
                {detail.branches.map((b) => (
                  <li key={b.id} className="flex items-center justify-between">
                    <span className="text-brand-950/80">{b.name}</span>
                    <span className="text-brand-950/40 font-light">/{b.slug}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-brand-950/40 font-light mt-2">
                Sucursales adicionales las agrega el propio restaurante desde su panel.
              </p>
            </div>
          )}
        </div>
      )}

      {showAddBranchDialog && (
        <AddBranchDialog busy={busy} onClose={() => setShowAddBranchDialog(false)} onCreate={createBranch} />
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
        <p className="font-semibold text-brand-950 mb-3">Equipo</p>
        <ul className="space-y-2 text-sm">
          {detail.users.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => setEditingUser(u)}
                className="w-full flex items-center justify-between text-left rounded-lg px-2 py-1.5 -mx-2 hover:bg-brand-950/[0.04] transition-colors"
              >
                <span className="text-brand-950/80">
                  {u.name} <span className="text-brand-950/40 font-light">· {u.email}</span>
                </span>
                <span className="text-xs text-brand-950/50">{u.role}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {editingUser && (
        <EditUserDialog
          user={editingUser}
          busy={busy}
          onClose={() => setEditingUser(null)}
          onSave={saveUser}
        />
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <p className="font-semibold text-brand-950">Pedidos recientes</p>
          <MoneyVisibilityToggle />
        </div>
        {detail.recentOrders.length === 0 ? (
          <p className="text-sm text-brand-950/40 font-light">Sin pedidos todavía.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between">
                <span className="text-brand-950/80">
                  #{o.orderNumber} <span className="text-brand-950/40 font-light">· {o.channel}</span>
                </span>
                <span className="text-brand-950/60">
                  <MaskedAmount value={formatBase(o.totalBase, o.currency === 'USD' ? '$' : '€')} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50/50 shadow-sm p-6 flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-red-700">Zona de peligro</p>
          <p className="text-sm text-red-700/70 font-light mt-1">
            Elimina el restaurante y todos sus datos (usuarios, pedidos, productos, mesas, etc.). No se puede deshacer.
          </p>
        </div>
        <TextureButton
          variant="destructive"
          size="sm"
          className="!w-auto shrink-0"
          onClick={() => setShowDeleteDialog(true)}
        >
          Eliminar restaurante
        </TextureButton>
      </div>

      {showDeleteDialog && (
        <DeleteRestaurantDialog
          slug={detail.slug}
          busy={deleting}
          error={deleteError}
          onClose={() => {
            setShowDeleteDialog(false);
            setDeleteError(null);
          }}
          onConfirm={deleteRestaurant}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold text-brand-950">{value}</p>
      <p className="text-xs text-brand-950/50 font-light">{label}</p>
    </div>
  );
}

function EditUserDialog({
  user,
  busy,
  onClose,
  onSave,
}: {
  user: RestaurantUser;
  busy: boolean;
  onClose: () => void;
  onSave: (input: { name: string; email: string; password: string }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario · {user.role}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Correo</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Nueva contraseña</span>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Dejar en blanco para no cambiarla"
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <TextureButton
            variant="brand"
            size="default"
            disabled={busy}
            className="disabled:opacity-50"
            onClick={() => onSave({ name, email, password })}
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddBranchDialog({
  busy,
  onClose,
  onCreate,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    whatsappPhone: string;
    plan: (typeof BRANCH_PLAN_OPTIONS)[number];
    billingCycle: (typeof CYCLE_OPTIONS)[number];
    copyCatalog: boolean;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [plan, setPlan] = useState<(typeof BRANCH_PLAN_OPTIONS)[number]>('ELITE');
  const [billingCycle, setBillingCycle] = useState<(typeof CYCLE_OPTIONS)[number]>('MONTHLY');
  const [copyCatalog, setCopyCatalog] = useState(false);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar sucursal</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">Nombre de la sucursal</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">WhatsApp (opcional)</span>
            <WhatsappPhoneInput value={whatsappPhone} onChange={setWhatsappPhone} />
          </label>
          <div className="flex gap-3">
            <label className="text-sm flex-1">
              <span className="block text-brand-950/70 mb-1">Plan</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as (typeof BRANCH_PLAN_OPTIONS)[number])}
                className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              >
                {BRANCH_PLAN_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_OPTION_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm flex-1">
              <span className="block text-brand-950/70 mb-1">Ciclo</span>
              <select
                value={billingCycle}
                onChange={(e) => setBillingCycle(e.target.value as (typeof CYCLE_OPTIONS)[number])}
                className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              >
                {CYCLE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-brand-950/40 font-light">
            Solo se aplica si el restaurante todavía no está en un plan con sucursales.
          </p>
          <label className="flex items-center gap-2 text-sm text-brand-950/70">
            <input type="checkbox" checked={copyCatalog} onChange={(e) => setCopyCatalog(e.target.checked)} />
            Copiar catálogo (categorías/productos) de la sede principal
          </label>
          <TextureButton
            variant="brand"
            size="default"
            disabled={busy || !name.trim()}
            className="disabled:opacity-50"
            onClick={() => onCreate({ name: name.trim(), whatsappPhone, plan, billingCycle, copyCatalog })}
          >
            {busy ? 'Creando…' : 'Crear sucursal'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRestaurantDialog({
  slug,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  slug: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [confirmSlug, setConfirmSlug] = useState('');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar restaurante</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-brand-950/70">
            Esto borra el restaurante, su equipo, pedidos, productos, mesas y todo lo demás. No se puede deshacer.
          </p>
          <label className="block text-sm">
            <span className="block text-brand-950/70 mb-1">
              Escribe <span className="font-semibold text-brand-950">{slug}</span> para confirmar
            </span>
            <input
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
              autoFocus
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <TextureButton
            variant="destructive"
            size="default"
            disabled={busy || confirmSlug !== slug}
            className="disabled:opacity-50"
            onClick={onConfirm}
          >
            {busy ? 'Eliminando…' : 'Eliminar definitivamente'}
          </TextureButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AdditionalCharge {
  id: string;
  amountUsd: string;
  description: string;
  chargedAt: string | null;
}

/**
 * "Costos adicionales" del bloque de Cobro: cargos puntuales (setup, QR NFC,
 * diseño…) que se suman a la próxima mensualidad del restaurante. Se listan
 * separados los pendientes de los ya cobrados — un cargo ya cobrado es
 * histórico y no se puede borrar (ver master-restaurants.service.ts).
 */
function AdditionalChargesBlock({ restaurantId }: { restaurantId: string }) {
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    masterApi
      .get(`/master/restaurants/${restaurantId}/additional-charges`)
      .then((res) => setCharges(res.data.data))
      .catch(() => setCharges([]));
  }

  useEffect(load, [restaurantId]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await masterApi.post(`/master/restaurants/${restaurantId}/additional-charges`, {
        amountUsd: Number(amount),
        description: description.trim(),
      });
      setAmount('');
      setDescription('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo agregar el cargo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(chargeId: string) {
    if (!confirm('¿Eliminar este cargo adicional?')) return;
    setError(null);
    try {
      await masterApi.delete(`/master/restaurants/${restaurantId}/additional-charges/${chargeId}`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo eliminar el cargo.');
    }
  }

  const pending = charges.filter((c) => !c.chargedAt);
  const charged = charges.filter((c) => c.chargedAt);
  const pendingTotal = pending.reduce((acc, c) => acc + Number(c.amountUsd), 0);

  return (
    <div>
      <p className="text-sm font-medium text-brand-950/70 mb-2">Costos adicionales</p>
      <p className="text-xs text-brand-950/40 font-light mb-3">
        Se suman a la próxima mensualidad. El restaurante los ve por separado, con su motivo y una
        nota de que no son parte del cobro mensual.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="text-sm">
          <span className="block text-brand-950/70 mb-1">Monto (USD)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-32"
          />
        </label>
        <label className="text-sm flex-1 min-w-[12rem]">
          <span className="block text-brand-950/70 mb-1">Motivo</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej: 20 QR NFC, diseño de menú…"
            className="w-full border border-brand-950/15 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <TextureButton
          variant="minimal"
          size="default"
          disabled={busy || !amount || !description.trim()}
          className="!w-auto disabled:opacity-50"
          onClick={add}
        >
          {busy ? 'Agregando…' : 'Agregar cargo'}
        </TextureButton>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-2">
            Pendientes de cobrar · ${pendingTotal.toFixed(2)}
          </p>
          <ul className="space-y-1.5">
            {pending.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-brand-950/80 min-w-0 truncate">{c.description}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-brand-950">${Number(c.amountUsd).toFixed(2)}</span>
                  <button onClick={() => remove(c.id)} className="text-xs text-red-600 hover:text-red-700">
                    Eliminar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {charged.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-950/40 mb-1.5">Ya cobrados</p>
          <ul className="space-y-1 text-sm">
            {charged.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-brand-950/50">
                <span className="min-w-0 truncate">{c.description}</span>
                <span className="shrink-0 font-light">
                  ${Number(c.amountUsd).toFixed(2)} · {new Date(c.chargedAt!).toLocaleDateString('es-VE')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {charges.length === 0 && (
        <p className="text-sm text-brand-950/40 font-light">Sin cargos adicionales.</p>
      )}
    </div>
  );
}
