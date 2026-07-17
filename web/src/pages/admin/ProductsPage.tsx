import { useEffect, useState } from 'react';
import { Pencil, Plus, Tag } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Category, Kitchen, Product } from '../../types';
import { CURRENCY_SYMBOLS, formatBase } from '../../utils/format';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard } from '@/components/ui/texture-card';
import { ProductFormDialog } from '@/components/admin/ProductFormDialog';
import { CategoryDialog } from '@/components/admin/CategoryDialog';

export default function ProductsPage() {
  const { restaurant } = useAuth();
  const currencySymbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  function load() {
    api.get('/products').then((res) => setProducts(res.data.data));
    api.get('/categories').then((res) => setCategories(res.data.data));
    api.get('/kitchens').then((res) => setKitchens(res.data.data));
  }

  useEffect(load, []);

  async function toggleAvailable(p: Product) {
    await api.patch(`/products/${p.id}`, { isAvailable: !p.isAvailable });
    load();
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar este producto?')) return;
    await api.delete(`/products/${id}`);
    load();
  }

  function openCreate() {
    setEditingProduct(null);
    setProductDialogOpen(true);
  }

  function openEdit(p: Product) {
    setEditingProduct(p);
    setProductDialogOpen(true);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Productos</h1>

      <div className="flex gap-3">
        <TextureButton variant="brand" size="default" className="!w-auto px-4 flex items-center gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </TextureButton>
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto px-4 flex items-center gap-1.5"
          onClick={() => setCategoryDialogOpen(true)}
        >
          <Tag className="h-4 w-4" /> Nueva categoría
        </TextureButton>
      </div>

      <TextureCard>
        <ul className="divide-y divide-brand-950/10">
          {products.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-brand-950/5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-brand-950 truncate">
                    {p.name} <span className="text-brand-950/40 font-normal">· {p.category?.name}</span>
                  </p>
                  <p className="text-brand-950/60 font-light">{formatBase(p.price, currencySymbol)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => toggleAvailable(p)}
                  className={`text-xs px-2 py-1 rounded-full font-medium ${p.isAvailable ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}
                >
                  {p.isAvailable ? 'Disponible' : 'Agotado'}
                </button>
                <button onClick={() => openEdit(p)} className="text-brand-500 hover:text-brand-600 flex items-center gap-1">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button onClick={() => remove(p.id)} className="text-red-500 hover:text-red-600">
                  Borrar
                </button>
              </div>
            </li>
          ))}
          {products.length === 0 && (
            <li className="px-4 py-6 text-center text-brand-950/40 text-sm font-light">Sin productos aún.</li>
          )}
        </ul>
      </TextureCard>

      <ProductFormDialog
        open={productDialogOpen}
        onOpenChange={setProductDialogOpen}
        categories={categories}
        kitchens={kitchens}
        product={editingProduct}
        currencySymbol={currencySymbol}
        onSaved={load}
      />
      <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} categories={categories} onChanged={load} />
    </div>
  );
}
