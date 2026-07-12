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
      <h1 className="text-xl font-bold text-gray-900">Categorías</h1>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nueva categoría (ej: Postres)"
          className="border rounded-lg px-3 py-2 text-sm flex-1"
          required
        />
        <button className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium">Agregar</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="bg-white rounded-xl border divide-y">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              {c.name} <span className="text-gray-400">({c._count?.products ?? 0} productos)</span>
            </span>
            <button onClick={() => remove(c.id)} className="text-red-500">
              Borrar
            </button>
          </li>
        ))}
        {categories.length === 0 && <li className="px-4 py-6 text-center text-gray-400 text-sm">Sin categorías aún.</li>}
      </ul>
    </div>
  );
}
