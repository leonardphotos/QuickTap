import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, UtensilsCrossed, X } from 'lucide-react';
import type { Product } from '@/types';
import { formatBase } from '@/utils/format';
import './order-workspace.css';

const TONES = ['mint', 'peach', 'lilac', 'blue', 'rose', 'sand'];
function productTone(id: string) {
  return TONES[Array.from(id).reduce((value, char) => value + char.charCodeAt(0), 0) % TONES.length];
}

/** Catálogo compartido: conserva la misma experiencia al crear y editar pedidos. */
export function OrderMenuCatalog({ products, symbol, quantityFor, onSelect, disabled = false }: {
  products: Product[];
  symbol: string;
  quantityFor: (productId: string) => number;
  onSelect: (product: Product) => void;
  disabled?: boolean;
}) {
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const categoryNames = useMemo(() => [...new Set(products.map(p => p.category?.name ?? 'Sin categoría'))].sort((a, b) => a.localeCompare(b, 'es')), [products]);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const [categoryEdges, setCategoryEdges] = useState({ overflow: false, left: false, right: false });
  useEffect(() => {
    const element = categoriesRef.current;
    if (!element) return;
    const update = () => {
      const maxScroll = element.scrollWidth - element.clientWidth;
      const next = { overflow: maxScroll > 2, left: element.scrollLeft > 2, right: element.scrollLeft < maxScroll - 2 };
      setCategoryEdges(previous => previous.overflow === next.overflow && previous.left === next.left && previous.right === next.right ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [categoryNames]);
  function scrollCategories(direction: number) {
    const element = categoriesRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(120, element.clientWidth * 0.75), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  const filteredProducts = products.filter(p => (!categoryFilter || (p.category?.name ?? 'Sin categoría') === categoryFilter) && p.name.toLowerCase().includes(productSearch.trim().toLowerCase()));
  return <section className="order-menu" aria-label="Menú de productos">
    <div className="order-menu-toolbar">
      <div className="order-menu-search">
        <Search size={18} aria-hidden="true" />
        <input aria-label="Buscar producto" placeholder="Buscar producto…" value={productSearch} onChange={event => setProductSearch(event.target.value)} />
        {productSearch && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setProductSearch('')}><X size={16} /></button>}
      </div>
      <div className="order-menu-category-nav" data-overflow={categoryEdges.overflow}>
        {categoryEdges.overflow && <button type="button" className="order-category-arrow" aria-label="Ver categorías anteriores" disabled={!categoryEdges.left} onClick={() => scrollCategories(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>}
        <div className="order-category-window" data-left={categoryEdges.left} data-right={categoryEdges.right}>
          <div ref={categoriesRef} className="order-menu-categories" aria-label="Categorías">
            {[null, ...categoryNames].map(category => <button type="button" key={category ?? '__all'} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)} onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })}>{category ?? 'Todos'}</button>)}
          </div>
        </div>
        {categoryEdges.overflow && <button type="button" className="order-category-arrow" aria-label="Ver más categorías" disabled={!categoryEdges.right} onClick={() => scrollCategories(1)}><ChevronRight size={18} aria-hidden="true" /></button>}
      </div>
    </div>
    <div className="order-menu-grid">
      {filteredProducts.map(product => {
        const quantity = quantityFor(product.id);
        return <button type="button" key={product.id} disabled={disabled} onClick={() => onSelect(product)} className={`order-product order-product--${productTone(product.id)}`} data-selected={quantity > 0} aria-label={`${product.name}, ${formatBase(product.price, symbol)}${quantity ? `, ${quantity} en el pedido` : ''}`}>
          <div className="order-product-image">
            {product.photoUrl ? <img src={product.photoUrl} alt="" loading="lazy" decoding="async" /> : <div className="order-product-placeholder"><UtensilsCrossed aria-hidden="true" /><span>{product.category?.name ?? 'Del menú'}</span></div>}
          </div>
          {quantity > 0 && <span className="order-product-quantity">{quantity}</span>}
          <div className="order-product-info"><span className="order-product-name">{product.name}</span><div className="order-product-bottom"><strong>{formatBase(product.price, symbol)}</strong><span className="order-product-add" aria-hidden="true"><Plus size={21} /></span></div></div>
        </button>;
      })}
    </div>
    {filteredProducts.length === 0 && <div className="order-menu-empty"><Search size={28} aria-hidden="true" /><p>No encontramos productos</p><span>Prueba otro nombre o cambia de categoría.</span></div>}
  </section>;
}
