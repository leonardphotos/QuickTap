import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Upload } from 'lucide-react';
import { api } from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { TextureButton } from '@/components/ui/texture-button';

interface ErrorFila {
  row: number;
  message: string;
}
interface Resultado {
  created: number;
  updated: number;
  errors: ErrorFila[];
}

/**
 * Carga masiva de productos por Excel (Inventario → "Cargar Excel").
 *
 * Pensado sobre todo para quien está migrando desde otro sistema: el archivo NO tiene que ser
 * la plantilla de QuickTap — las columnas se reconocen por nombre y la fila de encabezado se
 * detecta sola aunque el archivo traiga el nombre del negocio y totales arriba de la tabla (ver
 * shop-import.service.ts). Reconoce productos por NOMBRE: reimportar el mismo archivo actualiza
 * precio/costo/categoría en vez de duplicar, y no toca el stock de lo que ya existía.
 */
export function ShopImportProductsDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function descargar() {
    setError(null);
    try {
      const res = await api.get('/shop/products/import-template', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla-productos.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo bajar la plantilla.');
    }
  }

  async function subir(file: File) {
    setSubiendo(true);
    setError(null);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/shop/products/import', fd);
      setResultado(res.data.data);
      if (res.data.data.errors.length === 0) onImported();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'No se pudo leer el archivo.');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const huboErrores = !!resultado && resultado.errors.length > 0;
  const entro = !!resultado && resultado.errors.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cargar productos desde Excel</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-light text-brand-950/60">
          Sirve con la plantilla o con un archivo exportado de otro sistema — las columnas se reconocen por su
          nombre (Nombre, Categoría, Cantidad, Costo, Precio), sin importar el orden. Un producto que ya exista con
          el mismo nombre se actualiza en vez de duplicarse, sin tocar su stock actual.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <TextureButton variant="secondary" size="default" className="!w-auto" onClick={descargar}>
            <Download className="h-4 w-4" /> Descargar plantilla
          </TextureButton>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
            }}
          />
          <TextureButton
            variant="brand"
            size="default"
            className="!w-auto disabled:opacity-50"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> {subiendo ? 'Cargando…' : 'Elegir archivo'}
          </TextureButton>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
        )}

        {entro && (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-800">
              <CheckCircle2 className="h-5 w-5" /> Cargado
            </p>
            <p className="mt-1 text-[13px] text-emerald-900/80">
              {resultado.created} producto{resultado.created === 1 ? '' : 's'} nuevo{resultado.created === 1 ? '' : 's'}
              {resultado.updated > 0 && `, ${resultado.updated} actualizado${resultado.updated === 1 ? '' : 's'}`}.
            </p>
          </div>
        )}

        {huboErrores && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
              <AlertTriangle className="h-5 w-5" /> No se cargó nada
            </p>
            <p className="mt-1 text-[13px] text-amber-900/75">
              Corrige {resultado.errors.length === 1 ? 'esta fila' : `estas ${resultado.errors.length} filas`} y vuelve a subir el archivo.
            </p>
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-[12.5px] text-amber-900/80">
              {resultado.errors.map((e, i) => (
                <li key={i}>Fila {e.row}: {e.message}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <TextureButton variant="minimal" size="default" className="!w-auto" onClick={onClose}>
            {entro ? 'Listo' : 'Cerrar'}
          </TextureButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
