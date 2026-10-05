import { AnimatedTabs, AnimatedTab } from '@/components/ui/animated-tabs';
import { TableEditDialog } from '@/components/admin/TableEditDialog';
import { TableGuestsDialog } from '@/components/admin/TableGuestsDialog';
import { ZoneDialog } from '@/components/admin/ZoneDialog';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';
import { Toast } from '@/components/ui/toast';
import { Copy,Download,MapPin,Pencil,Plus,Search,Trash2,Users } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { FormEvent } from 'react';
import { useEffect,useMemo,useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext.shared';
import { useCopyToast } from '../../hooks/useCopyToast';
import type { TableItem,Zone } from '../../types';

const ALL_TAB = 'all';
const UNZONED_TAB = 'unzoned';

export default function TablesPage() {
  const { restaurant } = useAuth();
  const [tables, setTables] = useState<(TableItem & { guestTotal?: number })[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [number, setNumber] = useState('');
  const [bulk, setBulk] = useState(false);
  const [quantity, setQuantity] = useState(5);
  const [start, setStart] = useState(1);
  const [prefix, setPrefix] = useState('Mesa');
  const [zoneId, setZoneId] = useState('');
  const [seats, setSeats] = useState('4');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [zoneDialogOpen, setZoneDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [search, setSearch] = useState('');
  const [guestTable, setGuestTable] = useState<TableItem | null>(null);
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
      await api.post(bulk ? '/tables/bulk' : '/tables', bulk ? { prefix, start, quantity, zoneId, seats: Number(seats) || 4 } : { number, zoneId: zoneId || undefined, seats: Number(seats) || 4 });
      setShowSuccess(true);
      load();
      setTimeout(() => {
        setOpen(false);
        setShowSuccess(false);
        setNumber('');
        setZoneId('');
        setSeats('4');
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
      const { downloadAllTableQrCodes } = await import('../../utils/qr-zip');
      await downloadAllTableQrCodes(tables, restaurant.slug);
    } finally {
      setDownloading(false);
    }
  }

  const hasUnzoned = tables.some((t) => !t.zoneId);

  const filteredTables = useMemo(() => {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return tables.filter(t => (activeTab === ALL_TAB || (activeTab === UNZONED_TAB ? !t.zoneId : t.zoneId === activeTab)) && normalize(`${t.number} ${t.zone?.name ?? ''}`).includes(normalize(search.trim())));
  }, [tables, activeTab, search]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 rounded-3xl border border-border bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div><p className="mb-2 font-semibold uppercase tracking-widest text-brand-600 text-xs">Organiza tu salón</p><h1 className="text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">Mesas y códigos QR</h1><p className="mt-2 text-muted-foreground text-base">Distribuye tus mesas por zona y comparte su menú.</p></div>
        <dl className="flex shrink-0 gap-6 rounded-2xl bg-accent px-5 py-4 text-brand-950"><div><dt className="text-xs text-muted-foreground">Mesas</dt><dd className="text-2xl font-semibold">{tables.length}</dd></div><div><dt className="text-xs text-muted-foreground">Zonas</dt><dd className="text-2xl font-semibold">{zones.length}</dd></div><div><dt className="text-xs text-muted-foreground">Sillas</dt><dd className="text-2xl font-semibold">{tables.reduce((sum,t) => sum + (t.seats ?? 0), 0)}</dd></div></dl>
      </header>

      <div className="flex flex-wrap gap-3 items-center rounded-2xl border border-border bg-white p-4">
        {/* Diálogo centrado, el mismo del resto del panel. Antes esto era un popover anclado
            al botón, con alto y ancho fijos: en una tablet se desbordaba hacia la izquierda y
            quedaba medio tapado por la barra lateral, y el teclado en pantalla le comía el
            resto. Centrado no depende de dónde esté el botón ni de cuánta pantalla quede. */}
        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5"
          onClick={() => { setBulk(false); setError(null); setOpen(true); }}
        >
          <Plus className="h-4 w-4" /> Nueva mesa
        </TextureButton>
        <TextureButton variant="brand" className="!w-auto" onClick={() => { setBulk(true); setError(null); setZoneId(zones.some(z => z.id === activeTab) ? activeTab : ''); setOpen(true); }}>Crear mesas por zona</TextureButton>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{bulk ? 'Crear mesas por zona' : 'Nueva mesa'}</DialogTitle>
            </DialogHeader>
            {showSuccess ? (
              <div className="py-8 text-center">
                <p className="text-2xl">✅</p>
                <p className="mt-2 font-medium text-brand-950 text-base">¡Listo!</p>
                <p className="font-light text-brand-950/50 text-base">{bulk ? `${quantity} mesas creadas.` : `"${number}" creada.`}</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                {bulk ? <>
                  <label className="text-sm font-medium">Prefijo<input maxLength={25} value={prefix} onChange={e => setPrefix(e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-base" /></label>
                  <label className="text-sm font-medium">Número inicial<input type="number" min={1} max={99999} required value={start} onChange={e => setStart(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-2 text-base" /></label>
                  <label className="text-sm font-medium">Cantidad de mesas<input type="number" min={1} max={100} required value={quantity} onChange={e => setQuantity(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-2 text-base" /></label>
                  <p className="text-muted-foreground text-xs">Se crearán {prefix} {start} a {prefix} {start + quantity - 1}, con un QR individual por mesa.</p>
                </> : <label className="block text-sm font-medium">
                  <span className="text-xs text-brand-950/60">Nombre o número</span>
                  <input
                    autoFocus
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="ej: 5, Terraza-1"
                    className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
                    required
                  />
                </label>}
                <label className="block text-sm font-medium">
                  <span className="text-xs text-brand-950/60">Zona</span>
                  <select
                    required={bulk}
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
                  >
                    <option value="">{bulk ? 'Selecciona una zona' : 'Sin zona'}</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  <span className="text-xs text-brand-950/60">Sillas</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-brand-950/15 px-3 py-2 text-brand-950 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-400/40 text-base"
                  />
                </label>
                {error && <div className="text-xs text-red-600"><p>{error}</p>{error.includes('plan') && <a href="/admin/billing" className="underline">Ver planes y límites</a>}</div>}
                <TextureButton variant="brand" size="default" disabled={saving} className="!w-auto disabled:opacity-50">
                  {saving ? 'Agregando…' : 'Agregar'}
                </TextureButton>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5"
          onClick={() => setZoneDialogOpen(true)}
        >
          <MapPin className="h-4 w-4" /> Gestionar zonas
        </TextureButton>

        <TextureButton
          variant="minimal"
          size="default"
          className="!w-auto flex items-center gap-1.5 disabled:opacity-50"
          onClick={downloadAll}
          disabled={downloading || tables.length === 0}
        >
          <Download className="h-4 w-4" /> {downloading ? 'Generando…' : 'Descargar todos los QR'}
        </TextureButton>
      </div>

      <label className="flex max-w-lg items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium"><Search aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground"/><input aria-label="Buscar mesa o zona" placeholder="Buscar mesa o zona…" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent outline-none text-base"/></label>
      {tables.length > 0 && (
        <AnimatedTabs tone="dark" className="flex gap-1.5  pb-1">
          <AnimatedTab active={activeTab === ALL_TAB}
            onClick={() => setActiveTab(ALL_TAB)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === ALL_TAB ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
            }`}
          >
            Todas · {tables.length}
          </AnimatedTab>
          {zones.map((z) => (
            <AnimatedTab active={activeTab === z.id}
              key={z.id}
              onClick={() => setActiveTab(z.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === z.id ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              {z.name} · {tables.filter(t => t.zoneId === z.id).length}
            </AnimatedTab>
          ))}
          {hasUnzoned && (
            <AnimatedTab active={activeTab === UNZONED_TAB}
              onClick={() => setActiveTab(UNZONED_TAB)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === UNZONED_TAB ? 'bg-brand-950 text-white' : 'bg-brand-950/[0.06] text-brand-950/60 hover:bg-brand-950/10'
              }`}
            >
              Sin zona
            </AnimatedTab>
          )}
        </AnimatedTabs>
      )}

      <p className="text-muted-foreground text-xs" role="status">{filteredTables.length} mesas en esta vista</p>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredTables.map((t) => (
            <li key={t.id} className="min-w-0 rounded-2xl border border-border bg-white p-5">
              <div className="flex items-start gap-4">
              <button
                onClick={() => copy(menuUrl(t.qrToken), 'Enlace de mesa copiado')}
                title="Copiar enlace de la mesa"
                aria-label={`Copiar enlace de mesa ${t.number}`}
                className="shrink-0 rounded-xl border border-border bg-white p-2 focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                <QRCodeSVG value={menuUrl(t.qrToken)} size={64} marginSize={2} fgColor="#061F46" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-brand-950 break-words">{t.number}</p>
                <p className="mt-1 text-muted-foreground break-words text-xs">{t.zone?.name ?? 'Sin zona'}</p>
                <p className="mt-3 flex items-center gap-1.5 text-muted-foreground text-xs"><Users className="h-3.5 w-3.5"/>{t.seats ?? 0} sillas</p>
              </div>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
              <button type="button" onClick={() => copy(menuUrl(t.qrToken), 'Enlace de mesa copiado')} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-2 text-xs font-medium text-brand-950 hover:bg-brand-500/20"><Copy className="h-4 w-4"/>Copiar enlace</button>
              <button
                onClick={() => setEditingTable(t)}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-brand-600 hover:bg-accent shrink-0"
                aria-label={`Editar mesa ${t.number}`}
                title="Cambiar nombre / zona"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(t.id)} className="flex h-11 w-11 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 shrink-0" title="Borrar mesa" aria-label={`Borrar mesa ${t.number}`}>
                <Trash2 className="h-4 w-4" />
              </button>
              </div>
              <button type="button" onClick={() => setGuestTable(t)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm text-brand-600"><Users className="h-4 w-4"/>{t.guestTotal ?? 0} comensales registrados · Ver historial</button>
            </li>
          ))}
          {filteredTables.length === 0 && (
            <li className="col-span-full rounded-2xl border border-dashed border-border bg-white px-4 py-12 text-center text-muted-foreground text-sm">
              {tables.length === 0 ? 'Crea tu primera mesa o agrega varias mesas por zona para comenzar.' : search ? 'No encontramos mesas con esa búsqueda.' : 'No hay mesas en esta zona.'}
            </li>
          )}
        </ul>

      <ZoneDialog open={zoneDialogOpen} onOpenChange={setZoneDialogOpen} zones={zones} onChanged={load} />
      <TableGuestsDialog table={guestTable} onClose={() => { setGuestTable(null); load(); }} />
      <TableEditDialog table={editingTable} zones={zones} onOpenChange={(o) => !o && setEditingTable(null)} onSaved={load} />
      <Toast message={toastMessage} />
    </div>
  );
}
