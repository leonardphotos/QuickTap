import { LiveOrdersCounter } from '@/components/master/LiveOrdersCounter';
import { MaskedAmount } from '@/components/master/MaskedAmount';
import { MoneyVisibilityToggle } from '@/components/master/MoneyVisibilityToggle';
import { QuickTapRevenueDialog } from '@/components/master/QuickTapRevenueDialog';
import { ServerHealthCard } from '@/components/master/ServerHealthCard';
import { SmsBalanceCard } from '@/components/master/SmsBalanceCard';
import { VpsCapacityBar } from '@/components/master/VpsCapacityBar';
import { masterApi } from '@/api/client';
import { formatBase, formatBsAbsolute } from '@/utils/format';
import { ArrowRight, Building2, CircleDollarSign, Clock3, Receipt, Sparkles, Store, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MASTER_OPERATION_LINKS } from './master-nav';
import { canAccessMasterLink } from './master-nav';
import { useMasterAuth } from '@/context/MasterAuthContext.shared';

interface Summary {
  month: { revenueBs: string; revenueUsd: string };
  quickTap: { revenueBs: string; revenueUsd: string };
  restaurantOwners: number;
  totalRestaurants: number;
  activeRestaurants: number;
  restaurantCounts: { active: number; inactive: number; expiring: number };
  newSignupsToday: number;
  ordersAllTime: number;
  ordersAllTimeUsd: string;
  ordersAllTimeBs: string;
}

interface PlanRequestRow {
  id: string;
  kind: 'SIGNUP' | 'RENEWAL';
  plan: string;
  priceUsd: string;
  contactName: string;
  restaurantName: string | null;
  createdAt: string;
  restaurant: { name: string } | null;
}

interface QrNfcRequestRow {
  id: string;
  quantity: number;
  totalPriceUsd: string;
  contactName: string;
  createdAt: string;
  restaurant: { name: string };
}

const QUICK_PATHS = new Set([
  '/master/live',
  '/master/restaurants',
  '/master/proofs',
  '/master/qrnfc-requests',
  '/master/quotes',
  '/master/catalog-ai',
]);
const QUICK_ACTIONS = MASTER_OPERATION_LINKS.filter((item) => QUICK_PATHS.has(item.to));

export default function MasterSummaryPage() {
  const { admin } = useMasterAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [proofs, setProofs] = useState<PlanRequestRow[] | null>(null);
  const [qrNfc, setQrNfc] = useState<QrNfcRequestRow[] | null>(null);
  const [showQuickTapDetail, setShowQuickTapDetail] = useState(false);

  function loadSummary() {
    masterApi.get('/master/summary').then((res) => setSummary(res.data.data));
  }

  useEffect(() => {
    loadSummary();
    Promise.all([
      masterApi.get('/master/plan-requests', { params: { kind: 'SIGNUP', status: 'PENDING' } }),
      masterApi.get('/master/plan-requests', { params: { kind: 'RENEWAL', status: 'PENDING' } }),
    ]).then(([signup, renewal]) => setProofs([...signup.data.data, ...renewal.data.data]));
    masterApi.get('/master/qr-nfc-requests', { params: { status: 'PENDING' } }).then((res) => setQrNfc(res.data.data));
  }, []);

  if (!summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-2xl border border-brand-950/[0.06] bg-white" />
        ))}
      </div>
    );
  }

  const pendingProofs = proofs?.length ?? 0;
  const pendingQr = qrNfc?.length ?? 0;
  const pendingByPath: Record<string, number | undefined> = {
    '/master/proofs': proofs?.length,
    '/master/qrnfc-requests': qrNfc?.length,
  };

  return (
    <div className="flex flex-col gap-6 [&>section]:order-2">
      <section className="master-summary-hero !order-0 relative rounded-3xl border border-slate-200/70 bg-white px-6 py-7 text-slate-900 sm:px-8">
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="font-semibold uppercase tracking-[0.2em] text-brand-500 text-xs">Visión general de la plataforma</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Tu plataforma, de un vistazo.</h1>
            <p className="mt-2 max-w-xl font-light leading-6 text-gray-900 text-base">
              Revisa la operación, atiende pendientes y entra a cualquier local sin perder tiempo buscando herramientas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeroAction to="/master/restaurants" icon={Store} label="Ver locales" />
            {admin && ['ADMIN', 'MANAGER', 'FINANCE'].includes(admin.role) && <HeroAction to="/master/proofs" icon={Receipt} label="Aprobar pagos" badge={pendingProofs} />}
            {admin && ['ADMIN', 'MANAGER', 'SUPPORT'].includes(admin.role) && <HeroAction to="/master/catalog-ai" icon={Sparkles} label="Cargar catálogo" primary />}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={CircleDollarSign}
          label="Ingresos QuickTap"
          value={<MaskedAmount value={formatBase(summary.quickTap.revenueUsd, '$')} />}
          caption="este mes"
          accent
          onClick={admin && ['ADMIN', 'MANAGER', 'FINANCE'].includes(admin.role) ? () => setShowQuickTapDetail(true) : undefined}
        />
        <KpiCard icon={Building2} label="Locales activos" value={summary.activeRestaurants} caption={`de ${summary.totalRestaurants} registrados`} />
        <KpiCard icon={Users} label="Dueños registrados" value={summary.restaurantOwners} caption="en la plataforma" />
        <KpiCard icon={Store} label="Nuevos hoy" value={summary.newSignupsToday} caption="registros recientes" />
        <KpiCard icon={Clock3} label="Por atender" value={pendingProofs + pendingQr} caption={`${pendingProofs} pagos · ${pendingQr} QR/NFC`} warning={pendingProofs + pendingQr > 0} />
      </section>

      <section className="rounded-[24px] border border-brand-950/[0.07] bg-white p-4 shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)] sm:p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="font-semibold tracking-tight text-brand-950 text-base">Accesos rápidos</p>
            <p className="mt-0.5 font-light text-brand-950/45 text-xs">Las tareas más frecuentes del equipo QuickTap.</p>
          </div>
          <span className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-brand-950/30 sm:block">Un toque</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {QUICK_ACTIONS.filter((item) => admin && canAccessMasterLink(admin.role, item)).map((item, index) => {
            const pending = pendingByPath[item.to];
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{ animationDelay: `${index * 35}ms` }}
                className="group relative flex min-h-28 animate-[window-pop_220ms_var(--ease-out-strong)_both] flex-col justify-between rounded-2xl border border-brand-950/[0.07] bg-[#f8faff] p-4 transition-[border-color,box-shadow,transform] duration-150 ease-out-strong hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-[0_14px_30px_-22px_rgba(0,105,210,0.5)] active:scale-[0.98] motion-reduce:animate-none motion-reduce:transform-none"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/[0.1] text-brand-500 transition-colors duration-150 group-hover:bg-brand-500 group-hover:text-white">
                  <item.icon className="h-[17px] w-[17px]" />
                </span>
                <span>
                  <span className="block text-[12.5px] font-semibold text-brand-950">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] font-light leading-4 text-brand-950/42">{item.hint}</span>
                </span>
                {pending !== undefined && pending > 0 && (
                  <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-sm">
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="!order-1 grid gap-4 md:!order-2 xl:grid-cols-[1.45fr_0.85fr]">
        <LiveOrdersCounter
          initial={summary.ordersAllTime}
          initialUsd={summary.ordersAllTimeUsd}
          initialBs={summary.ordersAllTimeBs}
          initialRestaurantCounts={summary.restaurantCounts}
        />
        <div className="rounded-[24px] border border-brand-950/[0.07] bg-white p-5 shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="font-semibold tracking-tight text-brand-950 text-base">Pendientes</p>
              <p className="font-light text-brand-950/45 text-xs">Prioridad operativa</p>
            </div>
            <span className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs font-semibold ${pendingProofs + pendingQr > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              {pendingProofs + pendingQr}
            </span>
          </div>
          <div className="space-y-2.5">
            <PendingSummaryLink to="/master/proofs" icon={Receipt} label="Comprobantes de pago" count={pendingProofs} />
            <PendingSummaryLink to="/master/qrnfc-requests" icon={Sparkles} label="Solicitudes QR/NFC" count={pendingQr} />
          </div>
          <div className="mt-4 border-t border-brand-950/[0.07] pt-4">
            <SmsBalanceCard />
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="Solicitudes recientes" subtitle="Lo próximo que necesita respuesta del equipo." />
        <div className="grid gap-4 lg:grid-cols-2">
          <PendingCard
            title="Comprobantes de pago"
            to="/master/proofs"
            items={proofs?.map((item) => ({
              id: item.id,
              primary: `${item.contactName} · ${item.restaurant?.name ?? item.restaurantName ?? 'sin restaurante'}`,
              secondary: <>{item.plan} · <MaskedAmount value={`$${item.priceUsd}`} /> · {new Date(item.createdAt).toLocaleDateString('es-VE')}</>,
            })) ?? null}
            emptyLabel="Sin comprobantes pendientes."
          />
          <PendingCard
            title="Solicitudes QR/NFC"
            to="/master/qrnfc-requests"
            items={qrNfc?.map((item) => ({
              id: item.id,
              primary: `${item.contactName} · ${item.restaurant.name}`,
              secondary: <>{item.quantity} unidades · <MaskedAmount value={`$${item.totalPriceUsd}`} /> · {new Date(item.createdAt).toLocaleDateString('es-VE')}</>,
            })) ?? null}
            emptyLabel="Sin solicitudes pendientes."
          />
        </div>
      </section>

      <section>
        <SectionHeading title="Infraestructura" subtitle="Capacidad y salud técnica de QuickTap en tiempo real." />
        <div className="grid gap-4 xl:grid-cols-2">
          <VpsCapacityBar />
          <ServerHealthCard canRefresh={admin?.role === 'ADMIN'} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <SectionHeading title="Ingresos del mes" subtitle="Movimiento procesado y facturación propia de QuickTap." compact />
          <MoneyVisibilityToggle />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RevenueCard
            eyebrow="Movimiento de los restaurantes"
            usd={summary.month.revenueUsd}
            bs={summary.month.revenueBs}
          />
          <RevenueCard
            eyebrow="Ingresos de QuickTap"
            usd={summary.quickTap.revenueUsd}
            bs={summary.quickTap.revenueBs}
            onClick={() => setShowQuickTapDetail(true)}
          />
        </div>
      </section>

      {showQuickTapDetail && admin && ['ADMIN', 'MANAGER', 'FINANCE'].includes(admin.role) && <QuickTapRevenueDialog onClose={() => setShowQuickTapDetail(false)} onChanged={loadSummary} />}
    </div>
  );
}

function HeroAction({ to, icon: Icon, label, badge, primary = false }: { to: string; icon: typeof Store; label: string; badge?: number; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-[background-color,transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] ${
        primary ? 'bg-brand-500 text-white hover:bg-brand-500' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{badge}</span>
      )}
    </Link>
  );
}

function KpiCard({ icon: Icon, label, value, caption, accent = false, warning = false, onClick }: { icon: typeof Store; label: string; value: ReactNode; caption: string; accent?: boolean; warning?: boolean; onClick?: () => void }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accent ? 'bg-brand-500 text-white' : warning ? 'bg-amber-100 text-amber-700' : 'bg-brand-500/[0.09] text-brand-500'}`}>
          <Icon className="h-[17px] w-[17px]" />
        </span>
        {onClick && <ArrowRight className="h-4 w-4 text-brand-950/24" />}
      </div>
      <p className="mt-4 font-medium text-brand-950/48 text-xs">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tracking-[-0.035em] tabular-nums ${warning ? 'text-amber-700' : 'text-brand-950'}`}>{value}</p>
      <p className="mt-0.5 font-light text-brand-950/38 text-xs">{caption}</p>
    </>
  );

  const className = "min-h-36 rounded-2xl border border-brand-950/[0.07] bg-white p-4 text-left shadow-[0_14px_35px_-32px_rgba(0,27,67,0.45)] transition-[border-color,box-shadow,transform] duration-150 ease-out-strong";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} hover:-translate-y-0.5 hover:border-brand-500/30 active:scale-[0.985]`}>{content}</button>
  ) : <div className={className}>{content}</div>;
}

function PendingSummaryLink({ to, icon: Icon, label, count }: { to: string; icon: typeof Receipt; label: string; count: number }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-2xl border border-brand-950/[0.06] bg-[#f8faff] p-3.5 transition-[border-color,transform] duration-150 ease-out-strong hover:border-brand-500/25 active:scale-[0.985]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-brand-500 shadow-sm"><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-brand-950">{label}</span>
        <span className="block text-[10px] font-light text-brand-950/40">{count > 0 ? 'Requiere revisión' : 'Todo al día'}</span>
      </span>
      <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-semibold ${count > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>{count}</span>
    </Link>
  );
}

function SectionHeading({ title, subtitle, compact = false }: { title: string; subtitle: string; compact?: boolean }) {
  return (
    <div className={compact ? 'min-w-0 flex-1' : 'mb-3'}>
      <h2 className="text-base font-semibold tracking-tight text-brand-950">{title}</h2>
      <p className="mt-0.5 font-light text-brand-950/44 text-xs">{subtitle}</p>
    </div>
  );
}

function PendingCard({ title, to, items, emptyLabel }: { title: string; to: string; items: { id: string; primary: string; secondary: ReactNode }[] | null; emptyLabel: string }) {
  return (
    <div className="rounded-[24px] border border-brand-950/[0.07] bg-white p-5 shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-brand-950 text-base">
          {title}
          {!!items?.length && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[9px] font-bold text-white">{items.length}</span>}
        </p>
        <Link to={to} className="flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:text-brand-600">Ver todo <ArrowRight className="h-3 w-3" /></Link>
      </div>
      {items === null && <p className="font-light text-brand-950/40 text-xs">Cargando…</p>}
      {items?.length === 0 && <p className="rounded-xl bg-emerald-50 px-3 py-3 font-light text-emerald-700 text-xs">{emptyLabel}</p>}
      <ul className="divide-y divide-brand-950/[0.06]">
        {items?.slice(0, 4).map((item) => (
          <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
            <p className="truncate font-medium text-brand-950 text-xs">{item.primary}</p>
            <p className="mt-0.5 font-light text-brand-950/45 text-base">{item.secondary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevenueCard({ eyebrow, usd, bs, onClick }: { eyebrow: string; usd: string; bs: string; onClick?: () => void }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold uppercase tracking-[0.12em] text-brand-950/40 text-xs">{eyebrow}</p>
        {onClick && <span className="text-[10px] font-medium text-brand-500">Ver detalle</span>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div><p className="text-2xl font-semibold tracking-tight text-brand-950"><MaskedAmount value={formatBase(usd, '$')} /></p><p className="mt-1 font-light text-brand-950/42 text-xs">En dólares</p></div>
        <div><p className="text-2xl font-semibold tracking-tight text-brand-950"><MaskedAmount value={formatBsAbsolute(bs)} /></p><p className="mt-1 font-light text-brand-950/42 text-xs">En bolívares</p></div>
      </div>
    </>
  );
  const className = "rounded-[24px] border border-brand-950/[0.07] bg-white p-5 text-left shadow-[0_16px_45px_-38px_rgba(0,27,67,0.42)]";
  return onClick ? <button type="button" onClick={onClick} className={`${className} w-full transition-[border-color,transform] duration-150 ease-out-strong hover:border-brand-500/30 active:scale-[0.99]`}>{body}</button> : <div className={className}>{body}</div>;
}
