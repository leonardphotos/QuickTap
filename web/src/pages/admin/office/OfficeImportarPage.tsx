import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Upload } from 'lucide-react';
import { TextureButton } from '@/components/ui/texture-button';
import { officeApi, type Empresa } from './officeApi';

interface ErrorFila {
  hoja: string;
  row: number;
  message: string;
}
interface Resultado {
  cuentas: number;
  cuentasActualizadas?: number;
  contactos: number;
  asientos: number;
  errors: ErrorFila[];
}

const HOJAS = [
  {
    nombre: 'Cuentas',
    que: 'El plan de cuentas.',
    campos: 'Código · Nombre · Tipo · Recibe asientos · Cuenta padre',
    nota: 'El código es el que usan los asientos. Las cuentas de agrupación llevan "No" en "Recibe asientos".',
  },
  {
    nombre: 'Contactos',
    que: 'Clientes, proveedores y empleados.',
    campos: 'Nombre · RIF o cédula · Teléfono · Correo · Dirección · Cliente · Proveedor · Empleado · Notas',
    nota: 'Se reconocen por el nombre: si ya existe, se actualizan sus datos en vez de duplicarlo.',
  },
  {
    nombre: 'Asientos',
    que: 'El libro diario.',
    campos: 'N° asiento · Fecha · Descripción · Referencia · Cuenta · Detalle · Contacto · Debe · Haber',
    nota: 'Un asiento ocupa varias filas con el MISMO número en la primera columna. Debe y Haber tienen que dar igual.',
  },
];

/**
 * Carga masiva del vertical Administrativo.
 *
 * Sin ventanas flotantes, como el resto del panel: la plantilla se baja, se edita en Excel y
 * se sube acá mismo. El resultado —y sobre todo los errores— se muestran en la página, porque
 * una lista de veinte filas mal cargadas no cabe en un aviso emergente.
 */
export default function OfficeImportarPage({ empresa, onCargado }: { empresa: Empresa; onCargado: () => void }) {
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Pasa por el cliente autenticado: la ruta lleva el JWT del panel, no se puede abrir suelta. */
  async function descargar() {
    setError(null);
    try {
      const blob = await officeApi.plantilla(empresa.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plantilla-${empresa.nombre.replace(/[^\w-]+/g, '-').toLowerCase()}.xlsx`;
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
    setArchivo(file.name);
    try {
      const data = await officeApi.importar(empresa.id, file);
      setResultado(data);
      if (data.errors.length === 0) onCargado();
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
    <div className="p-5 sm:p-7">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Cargar desde Excel</h1>
        <p className="mt-0.5 text-[13.5px] text-brand-950/50">
          Un solo archivo con las tres hojas de {empresa.nombre}. Se revisa entero antes de guardar: si una fila
          está mal, no entra nada.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Paso 1 */}
        <section className="rounded-2xl border border-brand-950/10 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-950/40">Paso 1</p>
          <h2 className="mt-1 text-[15px] font-semibold">Baja la plantilla</h2>
          <p className="mt-1 text-[13px] font-light leading-relaxed text-brand-950/60">
            Viene con las columnas listas y ya llena con lo que la empresa tiene cargado, así que también sirve de
            respaldo: la bajas, la editas y la vuelves a subir.
          </p>
          <TextureButton variant="secondary" size="default" className="mt-4 !w-auto" onClick={descargar}>
            <Download className="h-4 w-4" /> Descargar plantilla
          </TextureButton>
        </section>

        {/* Paso 2 */}
        <section className="rounded-2xl border border-brand-950/10 bg-white p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-950/40">Paso 2</p>
          <h2 className="mt-1 text-[15px] font-semibold">Súbela llena</h2>
          <p className="mt-1 text-[13px] font-light leading-relaxed text-brand-950/60">
            Archivo .xlsx, hasta 5 MB. Los asientos se agregan a los que ya existen: borra de la hoja los que ya
            estén cargados para no duplicarlos.
          </p>
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
            className="mt-4 !w-auto disabled:opacity-50"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> {subiendo ? 'Cargando…' : 'Elegir archivo'}
          </TextureButton>
          {archivo && <p className="mt-2 text-[12px] text-brand-950/45">{archivo}</p>}
        </section>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</p>
      )}

      {entro && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-800">
            <CheckCircle2 className="h-5 w-5" /> Cargado
          </p>
          <ul className="mt-2 space-y-0.5 text-[13px] text-emerald-900/80">
            <li>{resultado.cuentas} cuentas nuevas{resultado.cuentasActualizadas ? `, ${resultado.cuentasActualizadas} actualizadas` : ''}</li>
            <li>{resultado.contactos} contactos</li>
            <li>{resultado.asientos} asientos</li>
          </ul>
        </div>
      )}

      {huboErrores && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-amber-900">
            <AlertTriangle className="h-5 w-5" /> No se cargó nada
          </p>
          <p className="mt-1 text-[13px] text-amber-900/75">
            Corrige estas {resultado.errors.length === 1 ? 'línea' : `${resultado.errors.length} líneas`} en el archivo
            y vuelve a subirlo.
          </p>
          <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-amber-200 bg-white">
            <table className="w-full text-left text-[12.5px]">
              <thead className="sticky top-0 bg-amber-100/70 text-amber-900">
                <tr>
                  <th className="px-3 py-2 font-semibold">Hoja</th>
                  <th className="px-3 py-2 font-semibold">Fila</th>
                  <th className="px-3 py-2 font-semibold">Qué pasa</th>
                </tr>
              </thead>
              <tbody>
                {resultado.errors.map((e, i) => (
                  <tr key={i} className="border-t border-amber-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-brand-950/60">{e.hoja}</td>
                    {/* Fila 0 = el problema no está en una línea suelta sino entre varias. */}
                    <td className="px-3 py-1.5 text-brand-950/60">{e.row > 0 ? e.row : '—'}</td>
                    <td className="px-3 py-1.5">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="mt-4 rounded-2xl border border-brand-950/10 bg-white p-5">
        <h2 className="text-[15px] font-semibold">Qué lleva cada hoja</h2>
        <div className="mt-3 space-y-3">
          {HOJAS.map((h) => (
            <div key={h.nombre} className="rounded-xl bg-brand-950/[0.03] px-4 py-3">
              <p className="text-[13.5px] font-semibold">
                {h.nombre} <span className="font-light text-brand-950/50">— {h.que}</span>
              </p>
              <p className="mt-1 font-mono text-[11.5px] leading-relaxed text-brand-950/55">{h.campos}</p>
              <p className="mt-1 text-[12.5px] font-light text-brand-950/60">{h.nota}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] font-light text-brand-950/50">
          Puedes subir un archivo con solo una de las hojas llena — por ejemplo, únicamente asientos sobre un plan de
          cuentas que ya cargaste.
        </p>
      </section>
    </div>
  );
}
