import { useState } from 'react';
import { FileText, Image as ImageIcon, Paperclip, X } from 'lucide-react';
import { api } from '@/api/client';

export interface DocumentAttachment {
  url: string;
  name: string;
  type: 'image' | 'pdf';
  /** 'ORDER' = cargado al emitir la orden; 'PAYMENT' = cargado al registrar el pago. */
  stage?: 'ORDER' | 'PAYMENT';
}

/**
 * Adjuntos de un documento administrativo (factura, planilla de retención, comprobante de
 * transferencia): acepta fotos y PDF, sube cada archivo al endpoint indicado y devuelve la
 * lista al formulario que lo usa. Varios archivos a la vez, porque un pago real casi nunca
 * viene con un solo papel.
 */
export function DocumentAttachmentsField({
  uploadUrl,
  value,
  onChange,
  label = 'Documentos y comprobantes',
  hint = 'Fotos o PDF: factura, retenciones, comprobante de la transferencia.',
  stage,
  max = 10,
}: {
  uploadUrl: string;
  value: DocumentAttachment[];
  onChange: (next: DocumentAttachment[]) => void;
  label?: string;
  hint?: string;
  stage?: 'ORDER' | 'PAYMENT';
  max?: number;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList) {
    setError(null);
    const room = max - value.length;
    if (room <= 0) {
      setError(`Máximo ${max} archivos.`);
      return;
    }
    setUploading(true);
    const uploaded: DocumentAttachment[] = [];
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post(uploadUrl, form);
        uploaded.push({ ...(res.data.data as DocumentAttachment), stage });
      }
      onChange([...value, ...uploaded]);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'No se pudo subir el archivo.');
      if (uploaded.length) onChange([...value, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-950/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-brand-950/70">{label}</p>
          <p className="text-[11px] font-light text-brand-950/45">{hint}</p>
        </div>
        <label className="shrink-0 cursor-pointer text-xs font-medium text-brand-500 hover:text-brand-600">
          {uploading ? 'Subiendo…' : 'Adjuntar'}
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

      {value.length > 0 && (
        <ul className="mt-2 space-y-1">
          {value.map((a) => (
            <li key={a.url} className="flex items-center gap-2 rounded-lg bg-brand-950/[0.03] px-2.5 py-1.5">
              {a.type === 'pdf' ? (
                <FileText className="h-3.5 w-3.5 shrink-0 text-brand-950/40" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5 shrink-0 text-brand-950/40" />
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-xs text-brand-950/70 hover:text-brand-500 hover:underline"
              >
                {a.name}
              </a>
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.url !== a.url))}
                className="shrink-0 text-brand-950/30 hover:text-red-600"
                aria-label={`Quitar ${a.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Solo lectura: los soportes ya guardados de un documento, para su detalle. */
export function DocumentAttachmentsList({ attachments }: { attachments: DocumentAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Paperclip className="h-3.5 w-3.5 text-brand-950/30" />
      {attachments.map((a) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-brand-950/[0.05] px-2 py-0.5 text-[11px] text-brand-950/60 hover:text-brand-500"
        >
          {a.type === 'pdf' ? <FileText className="h-3 w-3 shrink-0" /> : <ImageIcon className="h-3 w-3 shrink-0" />}
          <span className="truncate">{a.name}</span>
        </a>
      ))}
    </div>
  );
}
