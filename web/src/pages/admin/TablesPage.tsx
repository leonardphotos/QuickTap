import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { TableItem } from '../../types';

export default function TablesPage() {
  const { restaurant } = useAuth();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get('/tables').then((res) => setTables(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/tables', { number });
      setNumber('');
      load();
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la mesa.');
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Borrar esta mesa?')) return;
    await api.delete(`/tables/${id}`);
    load();
  }

  function menuUrl(qrToken: string) {
    return `${window.location.origin}/r/${restaurant!.slug}?mesa=${qrToken}`;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-brand-950">Mesas / Códigos QR</h1>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Número de mesa (ej: 5, Terraza-1)"
          className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
          required
        />
        <button className="bg-brand-500 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-brand-800">
          Agregar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid sm:grid-cols-3 gap-4">
        {tables.map((t) => (
          <div key={t.id} className="bg-white border border-brand-950/10 rounded-xl p-4 text-center space-y-2">
            <p className="font-semibold text-brand-950">Mesa {t.number}</p>
            <QRCodeSVG value={menuUrl(t.qrToken)} size={140} className="mx-auto" fgColor="#001B43" />
            <p className="text-[10px] text-brand-950/40 break-all">{menuUrl(t.qrToken)}</p>
            <button onClick={() => remove(t.id)} className="text-red-500 hover:text-red-600 text-xs">
              Borrar
            </button>
          </div>
        ))}
      </div>
      {tables.length === 0 && (
        <p className="text-sm text-brand-950/40 text-center py-6 font-light">Sin mesas aún.</p>
      )}
    </div>
  );
}
