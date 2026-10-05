import { Bell, ChevronDown, ClipboardList, Filter, MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProposalSidebar } from '../dashboard/ProposalSidebar';
import { orderStats, orderTabs, proposalOrders, statusMeta, tabStatus, type OrderTab } from './data';
import './orders-proposal.css';

export default function OrdersProposalPage() {
  const [tab, setTab] = useState<OrderTab>('Todos');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => proposalOrders.filter((order) => {
    const matchesTab = tab === 'Todos' || order.status === tabStatus[tab];
    const haystack = `${order.id} ${order.customer} ${order.table}`.toLowerCase();
    return matchesTab && haystack.includes(query.toLowerCase());
  }), [query, tab]);

  return <div className="qt-proposal orders-proposal"><ProposalSidebar active="pedidos" />
    <main className="orders-main">
      <header className="orders-topbar"><div className="orders-breadcrumb"><span>Operación</span><b>/</b><strong>Pedidos</strong></div><div className="orders-top-actions"><button className="orders-icon-button" aria-label="Notificaciones"><Bell size={18}/><i /></button><div className="orders-user"><span>RC</span><div><strong>Restaurante Casa</strong><small>Administrador</small></div><ChevronDown size={16}/></div></div></header>
      <div className="orders-content">
        <section className="orders-heading"><div><p className="orders-kicker">CENTRO DE OPERACIONES</p><h1>Pedidos</h1><p className="orders-subtitle">Gestiona los pedidos y mantén el servicio en movimiento.</p></div><button className="orders-primary"><Plus size={18}/> Crear pedido</button></section>
        <div className="orders-stat-grid">{orderStats.map((stat) => <article className={`orders-stat orders-stat--${stat.tone}`} key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.detail}</small></article>)}</div>
        <section className="orders-board"><div className="orders-board-head"><div><h2>Pedidos en curso</h2><p>Actualizado hace unos segundos</p></div><button className="orders-filter"><SlidersHorizontal size={16}/> Filtros <span>2</span></button></div>
          <div className="orders-controls"><div className="orders-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por cliente, mesa o pedido" /></div><div className="orders-tabs">{orderTabs.map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}{item === 'Todos' && <em>18</em>}</button>)}</div></div>
          <div className="orders-list">{filtered.map((order) => <article className="order-row" key={order.id}><div className="order-avatar">{order.initials}</div><div className="order-main-info"><div className="order-title"><strong>{order.id}</strong><span className={`order-status order-status--${statusMeta[order.status].tone}`}>{statusMeta[order.status].label}</span></div><h3>{order.customer}</h3><p>{order.table} <b>·</b> {order.channel} <b>·</b> {order.time}</p></div><div className="order-items">{order.items.map((item) => <span key={item}>{item}</span>)}</div><div className="order-total"><small>Total</small><strong>{order.total}</strong></div><button className="order-more" aria-label={`Más opciones ${order.id}`}><MoreHorizontal size={18}/></button></article>)}{filtered.length === 0 && <div className="orders-empty"><ClipboardList size={30}/><strong>No encontramos pedidos</strong><span>Prueba con otro término de búsqueda.</span></div>}</div>
        </section>
      </div>
    </main>
  </div>;
}
