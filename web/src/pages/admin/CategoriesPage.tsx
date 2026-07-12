import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api/client';
import type { Category } from '../../types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/categories').then((res) => setCategories(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/categories', { name, priority: categories.length });
      setName('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la categoría.');
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/categories/${id}`);
      load();
    } catch (err: any) {
      alert(err.response?.data?.error ?? 'No se pudo borrar.');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-950">Categorías</h1>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva categoría (ej: Postres)"
          className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          required
        />
        <button className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-800">
          Agregar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="bg-white rounded-xl border border-brand-950/10 divide-y divide-brand-950/10">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {c.name} <span className="text-brand-950/40">({c._count?.products ?? 0} productos)</span>
            </span>
            <button onClick={() => remove(c.id)} className="text-red-500 hover:text-red-600">
              Borrar
            </button>
          </li>
        ))}
        {categories.length === 0 && (
          <li className="px-4 py-6 text-center text-brand-950/40 text-sm font-light">Sin categorías aún.</li>
        )}
      </ul>
    </div>
  );
}
