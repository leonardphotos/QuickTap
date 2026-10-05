import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { masterApi } from '@/api/client';
import { CalendarClock, Calculator, LandPlot, Plus, Store, Utensils, Warehouse } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHOP_RUBROS } from '@/data/shopRubros';
import { useMasterAuth } from '@/context/MasterAuthContext.shared';
import { canManageRestaurant } from '@/utils/master-rbac';

interface MasterRestaurant {
  id: string;
  slug: string;
  name: string;
  businessType: 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE' | 'APPOINTMENTS';
  isActive: boolean;
  subscriptionStatus: 'TRIALING' | 'ACTIVE';
  subscriptionPlan: string | null;
  billingCycle: string | null;
  periodEnd: string;
  createdAt: string;
  locked: boolean;
  daysRemaining: number;
  _count: { users: number; tables: number; orders: number; companies: number };
}

type Vertical = 'RESTAURANT' | 'SHOP' | 'SPORTS_CLUB' | 'ADMIN_OFFICE' | 'APPOINTMENTS';
type VerticalOption = Vertical | 'WAREHOUSE';

interface CreateBusinessForm {
  restaurantName: string;
  slug: string;
  businessType: Vertical;
  shopRubro: string;
  whatsappPhone: string;
  baseCurrency: 'USD' | 'EUR';
  ownerName: string;
  email: string;
  password: string;
}

const EMPTY_BUSINESS: CreateBusinessForm = {
  restaurantName: '',
  slug: '',
  businessType: 'RESTAURANT',
  shopRubro: '',
  whatsappPhone: '',
  baseCurrency: 'USD',
  ownerName: '',
  email: '',
  password: '',
};

const CREATE_VERTICALS: { id: VerticalOption; label: string; description: string; icon: typeof Store; disabled?: boolean }[] = [
  { id: 'RESTAURANT', label: 'Restaurante', description: 'Mesas, comandas, cocina y delivery.', icon: Utensils },
  { id: 'SHOP', label: 'Local comercial', description: 'Punto de venta, variantes e inventario.', icon: Store },
  { id: 'SPORTS_CLUB', label: 'Canchas', description: 'Reservas, accesos y consumo deportivo.', icon: LandPlot },
  { id: 'ADMIN_OFFICE', label: 'Administración', description: 'Contabilidad para una o varias empresas.', icon: Calculator },
  { id: 'APPOINTMENTS', label: 'Citas', description: 'Agenda profesional, solicitudes, servicios y pagos.', icon: CalendarClock },
  { id: 'WAREHOUSE', label: 'Almacenes', description: 'Vertical en preparación.', icon: Warehouse, disabled: true },
];

const UNLIMITED_YEAR = 2099;

function hasUnlimitedAccess(restaurant: MasterRestaurant) {
  return new Date(restaurant.periodEnd).getUTCFullYear() >= UNLIMITED_YEAR;
}

/**
 * Prioridad de cobro para el Dashboard maestro:
 * 1. cuentas vigentes, desde la que vence primero;
 * 2. cuentas ilimitadas;
 * 3. cuentas vencidas o bloqueadas, al final.
 *
 * El segundo criterio mantiene estable y predecible el orden dentro de cada grupo.
 */
function compareBySubscriptionPriority(a: MasterRestaurant, b: MasterRestaurant) {
  const priority = (restaurant: MasterRestaurant) => {
    if (restaurant.locked) return 2;
    if (hasUnlimitedAccess(restaurant)) return 1;
    return 0;
  };

  const groupDifference = priority(a) - priority(b);
  if (groupDifference !== 0) return groupDifference;

  if (!a.locked && !hasUnlimitedAccess(a)) {
    const expiryDifference = new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime();
    if (expiryDifference !== 0) return expiryDifference;
  }

  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

const VERTICALES: { id: Vertical; label: string; vacio: string }[] = [
  { id: 'RESTAURANT', label: 'Restaurantes', vacio: 'Todavía no hay restaurantes.' },
  { id: 'SHOP', label: 'Locales Comerciales', vacio: 'Todavía no hay locales comerciales.' },
  { id: 'SPORTS_CLUB', label: 'Canchas', vacio: 'Todavía no hay clubes de canchas.' },
  { id: 'ADMIN_OFFICE', label: 'Administración', vacio: 'Todavía no hay cuentas de administración.' },
  { id: 'APPOINTMENTS', label: 'Citas', vacio: 'Todavía no hay negocios de citas.' },
];

export default function MasterRestaurantsPage() {
  const { admin } = useMasterAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restaurants, setRestaurants] = useState<MasterRestaurant[] | null>(null);
  const [vertical, setVertical] = useState<Vertical>('RESTAURANT');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateBusinessForm>(EMPTY_BUSINESS);
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const mayCreate = !!admin && canManageRestaurant(admin.role);

  function loadRestaurants() {
    return masterApi.get('/master/restaurants').then((res) => setRestaurants(res.data.data));
  }

  useEffect(() => {
    void loadRestaurants();
  }, []);

  useEffect(() => {
    if (searchParams.get('crear') === '1' && mayCreate) setShowCreate(true);
  }, [mayCreate, searchParams]);

  function slugify(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  function resetCreateDialog(open: boolean) {
    setShowCreate(open);
    if (!open) {
      setForm(EMPTY_BUSINESS);
      setSlugEdited(false);
      setCreateError(null);
      if (searchParams.has('crear')) setSearchParams({}, { replace: true });
    }
  }

  async function createBusiness(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await masterApi.post('/master/restaurants', {
        ...form,
        shopRubro: form.businessType === 'SHOP' ? form.shopRubro : undefined,
        whatsappPhone: form.whatsappPhone || undefined,
      });
      const createdVertical = form.businessType;
      await loadRestaurants();
      setVertical(createdVertical);
      resetCreateDialog(false);
    } catch (error: any) {
      setCreateError(error.response?.data?.error ?? 'No se pudo crear el negocio.');
    } finally {
      setCreating(false);
    }
  }

  if (!restaurants) return <p className="text-brand-950/50 font-light text-base">Cargando…</p>;

  const filtered = restaurants
    .filter((r) => r.businessType === vertical)
    .sort(compareBySubscriptionPriority);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Locales</h1>
            <p className="mt-1 font-light text-brand-950/45 text-base">Administra todos los negocios de la plataforma.</p>
          </div>
          {mayCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_-14px_rgba(5,151,242,.9)] transition-[background-color,transform] hover:bg-brand-500 active:scale-[.98]"
            >
              <Plus className="h-4 w-4" /> Crear nuevo negocio
            </button>
          )}
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-brand-950/10 bg-brand-950/[0.03] p-1 mt-4">
          {VERTICALES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVertical(v.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                vertical === v.id ? 'bg-white text-brand-950 shadow-sm' : 'text-brand-950/50 hover:text-brand-950/80'
              }`}
            >
              {v.label} ({restaurants.filter((r) => r.businessType === v.id).length})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-brand-950/40 font-light text-base">
          {VERTICALES.find((v) => v.id === vertical)?.vacio}
        </p>
      )}

      <div className="rounded-2xl border border-brand-950/10 bg-white shadow-sm divide-y divide-brand-950/[0.06]">
        {filtered.map((r) => (
          <Link
            key={r.id}
            to={`/master/restaurants/${r.id}`}
            className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-brand-950/[0.02] transition-colors"
          >
            <div className="min-w-0">
              <p className="font-medium text-brand-950 truncate text-base">{r.name}</p>
              <p className="text-brand-950/40 font-light truncate text-xs">/{r.slug}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 text-xs text-brand-950/50 font-light">
              <span>{r._count.users} usuarios</span>
              {r.businessType === 'ADMIN_OFFICE' ? (
                <span>{r._count.companies} empresa{r._count.companies === 1 ? '' : 's'}</span>
              ) : (
                <>
                  <span>{r._count.tables} mesas</span>
                  <span>{r._count.orders} pedidos</span>
                </>
              )}
              <StatusBadge r={r} />
            </div>
          </Link>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={resetCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear nuevo negocio</DialogTitle>
            <DialogDescription>Elige la vertical y crea el acceso inicial del dueño. Comenzará con 15 días de prueba.</DialogDescription>
          </DialogHeader>

          <form onSubmit={createBusiness} className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {CREATE_VERTICALS.map((option) => {
                const Icon = option.icon;
                const selected = form.businessType === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      if (option.id === 'WAREHOUSE') return;
                      const businessType = option.id as Vertical;
                      setForm((current) => ({
                        ...current,
                        businessType,
                        shopRubro: businessType === 'SHOP' ? current.shopRubro || SHOP_RUBROS[0]?.id || '' : '',
                      }));
                    }}
                    className={`relative flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                      option.disabled
                        ? 'cursor-not-allowed border-brand-950/[0.06] bg-brand-950/[0.025] opacity-55'
                        : selected
                          ? 'border-brand-500 bg-brand-500/[0.07]'
                          : 'border-brand-950/[0.08] hover:border-brand-500/35 hover:bg-brand-500/[0.025]'
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-brand-500 text-white' : 'bg-brand-500/10 text-brand-500'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-brand-950">{option.label}</span>
                      <span className="mt-0.5 block text-[11px] font-light leading-4 text-brand-950/45">{option.description}</span>
                    </span>
                    {option.disabled && <span className="absolute right-2 top-2 rounded-full bg-brand-950/[0.06] px-2 py-0.5 text-[9px] font-semibold text-brand-950/45">Próximamente</span>}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">Nombre del negocio</span>
                <input
                  required
                  value={form.restaurantName}
                  onChange={(event) => {
                    const restaurantName = event.target.value;
                    setForm((current) => ({ ...current, restaurantName, slug: slugEdited ? current.slug : slugify(restaurantName) }));
                  }}
                  className="w-full rounded-xl border border-brand-950/10 px-3.5 py-2.5 outline-none transition-colors focus:border-brand-500 text-base"
                  placeholder="Nombre del negocio"
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">Enlace</span>
                <div className="flex items-center rounded-xl border border-brand-950/10 focus-within:border-brand-500">
                  <span className="pl-3 text-xs text-brand-950/35">quicktap.club/r/</span>
                  <input
                    required
                    minLength={3}
                    value={form.slug}
                    onChange={(event) => {
                      setSlugEdited(true);
                      setForm((current) => ({ ...current, slug: slugify(event.target.value) }));
                    }}
                    className="min-w-0 flex-1 bg-transparent px-1 py-2.5 pr-3 outline-none text-base"
                    placeholder="mi-negocio"
                  />
                </div>
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">Moneda base</span>
                <select value={form.baseCurrency} onChange={(event) => setForm((current) => ({ ...current, baseCurrency: event.target.value as 'USD' | 'EUR' }))} className="w-full rounded-xl border border-brand-950/10 bg-white px-3.5 py-2.5 outline-none focus:border-brand-500 text-base">
                  <option value="USD">Dólares ($)</option>
                  <option value="EUR">Euros (€)</option>
                </select>
              </label>
              {form.businessType === 'SHOP' && (
                <label className="space-y-1.5 sm:col-span-2 text-sm font-medium">
                  <span className="text-xs font-medium text-brand-950/65">Rubro del local</span>
                  <select required value={form.shopRubro} onChange={(event) => setForm((current) => ({ ...current, shopRubro: event.target.value }))} className="w-full rounded-xl border border-brand-950/10 bg-white px-3.5 py-2.5 outline-none focus:border-brand-500 text-base">
                    {SHOP_RUBROS.map((rubro) => <option key={rubro.id} value={rubro.id}>{rubro.emoji} {rubro.label}</option>)}
                  </select>
                </label>
              )}
              <label className="space-y-1.5 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">Nombre del dueño</span>
                <input required value={form.ownerName} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} className="w-full rounded-xl border border-brand-950/10 px-3.5 py-2.5 outline-none focus:border-brand-500 text-base" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">WhatsApp</span>
                <input value={form.whatsappPhone} onChange={(event) => setForm((current) => ({ ...current, whatsappPhone: event.target.value }))} className="w-full rounded-xl border border-brand-950/10 px-3.5 py-2.5 outline-none focus:border-brand-500 text-base" placeholder="0412 1234567" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">Correo de acceso</span>
                <input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="w-full rounded-xl border border-brand-950/10 px-3.5 py-2.5 outline-none focus:border-brand-500 text-base" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span className="text-xs font-medium text-brand-950/65">Contraseña inicial</span>
                <input required type="password" minLength={6} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className="w-full rounded-xl border border-brand-950/10 px-3.5 py-2.5 outline-none focus:border-brand-500 text-base" />
              </label>
            </div>

            {createError && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-red-700 text-base">{createError}</p>}

            <DialogFooter>
              <button type="button" onClick={() => resetCreateDialog(false)} className="rounded-xl border border-brand-950/10 px-4 py-2.5 text-sm font-medium text-brand-950/60">Cancelar</button>
              <button disabled={creating} type="submit" className="rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {creating ? 'Creando…' : 'Crear negocio'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ r }: { r: MasterRestaurant }) {
  if (r.locked) {
    return <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-1 font-medium">Bloqueada</span>;
  }
  if (hasUnlimitedAccess(r)) {
    return <span className="rounded-full bg-sky-100 text-brand-500 px-2.5 py-1 font-medium">Ilimitado</span>;
  }
  if (r.subscriptionStatus === 'TRIALING') {
    return (
      <span className="rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-medium">
        Prueba · {r.daysRemaining}d
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 font-medium">
      {r.subscriptionPlan} · {r.daysRemaining}d
    </span>
  );
}
