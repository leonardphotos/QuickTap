import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, MapPin, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { TableItem, Zone } from '../../types';
import { PopoverForm, PopoverFormButton, PopoverFormSuccess } from '@/components/ui/popover-form';
import { TextureButton } from '@/components/ui/texture-button';
import { TextureCard } from '@/components/ui/texture-card';
import { Toast } from '@/components/ui/toast';
import { ZoneDialog } from '@/components/admin/ZoneDialog';
import { TableEditDialog } from '@/components/admin/TableEditDialog';
import { downloadAllTableQrCodes } from '../../utils/qr-zip';
import { useCopyToast } from '../../hooks/useCopyToast';

const ALL_TAB = 'all';
const UNZONED_TAB = 'unzoned';

export default function TablesPage() {
  const { restaurant } = useAuth();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [number, setNumber] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const { copy, toastMessage } = useCopyToast();

  function load() {
    api.get('/tables').then((res) => setTables(res.data.data));
    api.get('/zones').then((res) => setZones(res.data.data));
  }

  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/tables', { number, zoneId: zoneId || undefined });
      setShowSuccess(true);
      load();
      setTimeout(() => {
        setOpen(false);
        setShowSuccess(false);
        setNumber('');
        setZoneId('');
      }, 1100);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo crear la mesa.');
    } finally {
      setSaving(false);
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

  async function downloadAll() {
    if (!restaurant) return;
    setDownloading(true);
    try {
      await downloadAllTableQrCodes(tables, restaurant.slug);
    } finally {
      setDownloading(false);
    }
  }

  const hasUnzoned = tables.some((t) => !t.zoneId);

  const filteredTables = useMemo(() => {
    if (activeTab === ALL_TAB) return tables;
    if (activeTab === UNZONED_TAB) return tables.filter((t) => !t.zoneId);
    return tables.filter((t) => t.zoneId === activeTab);
  }, [tables, activeTab]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight text-brand-950">Mesas / Códigos QR</h1>

      <div className="flex flex-wrap gap-3 items-center">
        <PopoverForm
          title="Nueva mesa"
          open={open}
          setOpen={setOpen}
          showSuccess={showSuccess}
          width="320px"
          height="240px"
          openChild={
            <form onSubmit={onSubmit} className="p-4 h-full flex flex-col gap-3">
              <input
                autoFocus
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="ej: 5, Terraza-1"
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
                required
              />
              <select
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                className="border border-brand-950/15 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400/40 focus:border-brand-500"
              >
                <option value="">Sin zona</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <PopoverFormButton loading={saving} text="Agregar" />
            </form>
          }
          successChild={<PopoverFormSuccess title="¡Listo!" description={`Mesa "${number}" creada.`} />}
        />

        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto px-4 flex items-center gap-1.5"
          onClick={() => setZoneDialogOpen(true)}
        >
          <MapPin className="h-4 w-4" /> Zona
        </TextureButton>

        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto px-4 flex items-center gap-1.5 disabled:opacity-50"
          onClick={downloadAll}
          disabled={downloading || tables.length === 0}
        >
          <Download className="h-4 w-4" /> {downloading ? 'Generando…' : 'QRs'}
        </TextureButton>
      </div>

      {tables.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab(ALL_TAB)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === ALL_TAB ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            Todas
          </button>
          {zones.map((z) => (
            <button
              key={z.id}
              onClick={() => setActiveTab(z.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === z.id ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {z.name}
            </button>
          ))}
          {hasUnzoned && (
            <button
              onClick={() => setActiveTab(UNZONED_TAB)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === UNZONED_TAB ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              Sin zona
            </button>
          )}
        </div>
      )}

      <TextureCard>
        <ul className="divide-y divide-brand-950/10">
          {filteredTables.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <button
                onClick={() => copy(menuUrl(t.qrToken), 'Enlace de mesa copiado')}
                title="Copiar enlace de la mesa"
                className="shrink-0 rounded-md overflow-hidden hover:opacity-70 transition-opacity"
              >
                <QRCodeSVG value={menuUrl(t.qrToken)} size={36} fgColor="#001B43" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-brand-950 truncate">Mesa {t.number}</p>
                {t.zone && <p className="text-xs text-brand-950/40 truncate">{t.zone.name}</p>}
              </div>
              <button
                onClick={() => setEditingTable(t)}
                className="text-brand-500 hover:text-brand-600 shrink-0"
                title="Cambiar nombre / zona"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(t.id)} className="text-red-500 hover:text-red-600 shrink-0" title="Borrar mesa">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {filteredTables.length === 0 && (
            <li className="px-4 py-6 text-center text-brand-950/40 text-sm font-light">
              {tables.length === 0 ? 'Sin mesas aún.' : 'No hay mesas en esta zona.'}
            </li>
          )}
        </ul>
      </TextureCard>

      <ZoneDialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen} zones={zones} onChanged={load} />
      <TableEditDialog table={editingTable} zones={zones} onOpenChange={(o) => !o && setEditingTable(null)} onSaved={load} />
      <Toast message={toastMessage} />
    </div>
  );
}
