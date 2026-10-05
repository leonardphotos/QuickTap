import { api, getToken } from '@/api/client';
import { useAuth } from '@/context/AuthContext.shared';
import { apiOrigin } from '@/utils/apiOrigin';
import { CURRENCY_SYMBOLS, formatBase, formatBsAbsolute } from '@/utils/format';
import { hasFeature, daysRemaining } from '@/utils/subscription';
import { GeneralKpisCard } from '@/components/admin/GeneralKpisCard';
import { TodayOrdersList } from '@/components/admin/TodayOrdersList';
import { TopProductsCard } from '@/components/admin/TopProductsCard';
import { DemoNotificationSoundsSection } from '@/components/admin/DemoNotificationSoundsSection';
import { CheckCircle2, CircleDollarSign, ClipboardList, Plus, Receipt, ShoppingCart, Sparkles, UtensilsCrossed, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import type { Currency } from '@/types';
import { canManageTeam } from '@/utils/roles';
import { dashboardQuickActionLinks } from './nav-links';
import './RestaurantDesktopDashboard.css';

export interface Summary {
  ordersCount: number; totalBase: string; totalBs: string; currency: Currency;
  tipBase: string; avgTicketBase: string;
  byHour: { hour: number; totalBase: string; ordersCount: number }[];
}

export function RestaurantDesktopDashboard({
  previewSummary,
  onAddExpense,
  onAddPurchase,
}: {
  previewSummary?: Summary;
  onAddExpense?: () => void;
  onAddPurchase?: () => void;
}) {
  const { restaurant, user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(previewSummary ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (previewSummary) return;
    let active = true;
    const load = () => api.get('/orders/summary/today').then(({ data }) => {
      if (active) { setSummary(data.data); setFailed(false); }
    }).catch(() => { if (active) setFailed(true); });
    void load();
    const socket = io(apiOrigin() || '/', { auth: { token: getToken() } });
    socket.on('order:new', load); socket.on('order:updated', load); socket.on('connect', load);
    return () => { active = false; socket.disconnect(); };
  }, [previewSummary]);
  if (!restaurant) return null;
  const symbol = CURRENCY_SYMBOLS[summary?.currency ?? restaurant.baseCurrency];
  const money = (value?: string) => value === undefined ? '—' : formatBase(value, symbol);
  const hours = Array.from({ length: 24 }, (_, hour) => summary?.byHour.find((item) => item.hour === hour) ?? { hour, totalBase: '0', ordersCount: 0 });
  const maxSales = Math.max(1, ...hours.map((item) => Number(item.totalBase)));
  const maxOrders = Math.max(1, ...hours.map((item) => item.ordersCount));
  const points = hours.map((item, index) => `${index * 10},${70 - item.ordersCount / maxOrders * 55}`).join(' ');
  // El dashboard de escritorio usa la misma fuente de acciones rápidas que móvil.
  // Antes esta lista estaba fija en cuatro accesos, por lo que restaurantes como
  // Cotufas no veían Productos, Inventario, Administración, Reservas, etc.
  const quickActions = dashboardQuickActionLinks(
    user?.role,
    restaurant,
    user?.canAccessInventory,
    user?.cashierFullAccess,
  ).map((item) => item.to === '/admin/table-orders' ? { ...item, label: 'Abrir cuenta de mesa', icon: Plus } : item);
  return <div className="restaurant-desktop-dashboard">
    <header className="rd-toolbar"><div><span className="rd-eyebrow">RESTAURANTE</span><h1>Resumen del negocio</h1></div><span>{new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Caracas' })}</span></header>
    {failed && <p role="alert" className="rd-error text-xs">No se pudieron actualizar las ventas. Revisa la conexión.</p>}
    <div className="rd-top-grid">
      <section className="rd-welcome">
        <Link to="/admin/billing" className="rd-plan"><CheckCircle2 size={16} /> Plan {restaurant.subscriptionPlan} · {Math.max(0, daysRemaining(restaurant.periodEnd))} días restantes</Link>
        <div className="rd-welcome-copy"><h2>Hola, {user?.name?.split(' ')[0] ?? 'equipo'}</h2><p>Así va el servicio en {restaurant.name}</p></div>
        <div className="rd-welcome-actions">
          <Link to="/admin/comandas"><ClipboardList size={17} /> Ver pedidos</Link>
          {canManageTeam(user?.role) && <>
            <button type="button" onClick={onAddExpense}><CircleDollarSign size={17} /> Agregar gasto</button>
            <button type="button" className="rd-action-primary" onClick={onAddPurchase}><ShoppingCart size={17} /> Agregar compra</button>
          </>}
        </div>
        <div className="rd-welcome-art" aria-hidden="true"><UtensilsCrossed /><Receipt /><Wallet /></div>
      </section>
      <section className="rd-mini rd-rose"><span>Pedidos de hoy</span><Receipt className="rd-mini-icon" /><strong>{summary?.ordersCount ?? '—'}</strong><p>Pedidos completados</p><div className="rd-mini-bars" aria-label="Pedidos por hora">{hours.filter((_, index) => index % 3 === 0).map((item) => <span key={item.hour} style={{ height: `${4 + item.ordersCount / maxOrders * 48}px` }} title={`${item.hour}:00 · ${item.ordersCount} pedidos`} />)}</div></section>
      <section className="rd-mini rd-teal"><span>Ticket promedio</span><Wallet className="rd-mini-icon" /><strong>{money(summary?.avgTicketBase)}</strong><p>Por pedido completado</p><svg viewBox="0 0 230 80" role="img" aria-label="Evolución de pedidos por hora"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" /></svg></section>
    </div>
    <div className="rd-main-grid">
      <div className="rd-dashboard-column rd-existing">
        <section className="rd-panel rd-sales"><div className="rd-panel-title"><div><h2>Ventas de hoy</h2><p>Ingresos por hora · hora de Caracas</p></div><span className="rd-legend">● Ventas ({symbol})</span></div>
          <div className="rd-chart" role="img" aria-label="Ventas por hora del día"><div className="rd-chart-grid"><span>{money(String(maxSales))}</span><span>{money(String(maxSales / 2))}</span><span>{money('0')}</span></div><div className="rd-chart-bars">{hours.map((item) => <div key={item.hour} title={`${item.hour}:00 · ${money(item.totalBase)}`}><i style={{ height: `${Number(item.totalBase) / maxSales * 100}%` }} /><small>{item.hour % 3 === 0 ? `${item.hour}h` : ''}</small></div>)}</div></div>
          <div className="rd-sales-totals"><div><span>Total vendido</span><strong>{money(summary?.totalBase)}</strong></div><div><span>Equivalente en Bs</span><strong>{summary ? formatBsAbsolute(summary.totalBs) : '—'}</strong></div><div><span>Propinas</span><strong>{money(summary?.tipBase)}</strong></div></div>
        </section>
        {!previewSummary && hasFeature(restaurant, 'administration') && restaurant.subscriptionPlan !== 'OPERATIONS' && <div className="rd-kpi-inset"><GeneralKpisCard /></div>}
        {!previewSummary && hasFeature(restaurant, 'administration') && <TodayOrdersList />}
      </div>
      <div className="rd-dashboard-column rd-existing">
        <section className="rd-panel"><h2>Acciones rápidas</h2><div className="rd-highlight"><Sparkles size={22}/><span>Propinas de hoy</span><strong>{money(summary?.tipBase)}</strong></div><div className="rd-actions">{quickActions.map(({ to, label, icon: Icon }) => <Link key={to} to={to}><span><Icon size={20}/></span>{label}<span className="rd-arrow">↗</span></Link>)}</div></section>
        {!previewSummary && hasFeature(restaurant, 'administration') && <TopProductsCard />}
      </div>
    </div>
    {restaurant.slug === 'demo' && <div className="rd-existing rd-demo"><DemoNotificationSoundsSection /></div>}
    <footer className="rd-footer"><span>QuickTap · {restaurant.name}</span><a href={`/r/${restaurant.slug}`} target="_blank" rel="noreferrer">Ver menú público ↗</a></footer>
  </div>;
}
