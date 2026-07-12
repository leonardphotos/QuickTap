import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Category, Product } from '../../types';
import { CURRENCY_SYMBOLS, formatBase } from '../../utils/format';

const emptyForm = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  photoUrl: '',
  isStar: false,
  isPromo: false,
  isHouseSpecial: false,
};

export default function ProductsPage() {
  const { restaurant } = useAuth();
  const currencySymbol = restaurant ? CURRENCY_SYMBOLS[restaurant.baseCurrency] : '$';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api.get('/products').then((res) => setProducts(res.data.data));
    api.get('/categories').then((res) => setCategories(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/products', {
        ...form,
        price: Number(form.price),
        photoUrl: form.photoUrl || undefined,
        description: form.description || undefined,
      });
      setForm(emptyForm);
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear el producto.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAvailable(p: Product) {
    await api.patch(`/products/${p.id}`, { isAvailable: !p.isAvailable });
    load();
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar este producto?')) return;
    await api.delete(`/products/${id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-950">Productos</h1>

      <form onSubmit={onSubmit} className="bg-white border border-brand-950/10 rounded-xl p-4 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          >
            <option value="">Categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder={`Precio en ${currencySymbol}`}
            type="number"
            step="0.01"
            min="0"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
            required
          />
          <input
            value={form.photoUrl}
            onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
            placeholder="URL de foto (opcional)"
            className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          />
        </div>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Descripción (opcional)"
          className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
        />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.isStar} onChange={(e) => setForm({ ...form, isStar: e.target.checked })} />
            ⭐ Producto Estrella
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={form.isPromo} onChange={(e) => setForm({ ...form, isPromo: e.target.checked })} />
            🔥 Promoción
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={form.isHouseSpecial}
              onChange={(e) => setForm({ ...form, isHouseSpecial: e.target.checked })}
            />
            👨‍🍳 Recomendación de la Casa
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={saving}
          className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-800 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Crear producto'}
        </button>
      </form>

      <ul className="bg-white rounded-xl border border-brand-950/10 divide-y divide-brand-950/10">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm gap-3">
            <div>
              <p className="font-medium text-brand-950">
                {p.name} <span className="text-brand-950/40 font-normal">· {p.category?.name}</span>
              </p>
              <p className="text-brand-950/60 font-light">{formatBase(p.price, currencySymbol)}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => toggleAvailable(p)}
                className={`text-xs px-2 py-1 rounded-full font-medium ${p.isAvailable ? 'bg-brand-400/15 text-brand-800' : 'bg-brand-950/10 text-brand-950/50'}`}
              >
                {p.isAvailable ? 'Disponible' : 'Agotado'}
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
    </div>
  );
}
