import { useState } from 'react';
import { ArrowLeft, ChevronDown, ImagePlus, Info, PackagePlus, Plus, Save, X } from 'lucide-react';
import '../proposal.css';
import './inventory-proposal.css';

const units = ['Kilogramo', 'Litro', 'Unidad', 'Caja', 'Botella'];
const categories = ['Proteínas', 'Vegetales', 'Secos', 'Lácteos', 'Bebidas'];

export default function NewInventoryItemProposalPage() {
  const [tab, setTab] = useState<'general' | 'stock' | 'advanced'>('general');
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Proteínas', unit: 'Kilogramo', quantity: '', minimum: '', cost: '', sku: '', expiry: '' });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="qt-proposal inventory-proposal min-h-screen bg-background text-foreground">
      <div className="inventory-proposal-backdrop" />
      <main className="inventory-proposal-dialog" role="dialog" aria-modal="true" aria-labelledby="new-item-title">
        <header className="inventory-proposal-header">
          <div className="flex min-w-0 items-center gap-3">
            <a href="/propuesta/dashboard" className="inventory-back-button" aria-label="Volver al inventario"><ArrowLeft className="h-4 w-4" /></a>
            <div className="min-w-0"><p className="eyebrow">Inventario / Insumos</p><h1 id="new-item-title" className="truncate text-xl font-semibold tracking-tight text-brand-950">Nuevo insumo</h1></div>
          </div>
          <button type="button" className="inventory-close" aria-label="Cerrar" onClick={() => window.history.back()}><X className="h-5 w-5" /></button>
        </header>

        <div className="inventory-proposal-body">
          <section className="inventory-form-column">
            <div className="inventory-intro"><div className="inventory-icon"><PackagePlus className="h-5 w-5" /></div><div><h2>Registra un insumo</h2><p>Completa lo esencial ahora. Podrás ajustar costos y existencias más adelante.</p></div></div>
            <div className="inventory-tabs" role="tablist" aria-label="Secciones del insumo">
              {[['general', 'Información general'], ['stock', 'Stock y costos'], ['advanced', 'Avanzado']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id as typeof tab)}>{label}</button>)}
            </div>
            {tab === 'general' && <div className="inventory-fields">
              <label className="inventory-field inventory-field-wide"><span>Nombre del insumo <b>*</b></span><input autoFocus value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Ej. Pechuga de pollo" /></label>
              <label className="inventory-field"><span>Categoría <b>*</b></span><div className="inventory-select"><select value={form.category} onChange={(e) => update('category', e.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></div></label>
              <label className="inventory-field"><span>Unidad de medida <b>*</b></span><div className="inventory-select"><select value={form.unit} onChange={(e) => update('unit', e.target.value)}>{units.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></div></label>
              <label className="inventory-field inventory-field-wide"><span>Foto del insumo <small>Opcional</small></span><button type="button" className="inventory-upload"><ImagePlus className="h-5 w-5" /><span><strong>Subir una foto</strong><small>PNG, JPG o WEBP · hasta 5 MB</small></span></button></label>
            </div>}
            {tab === 'stock' && <div className="inventory-fields"><label className="inventory-field"><span>Existencia inicial</span><input inputMode="decimal" value={form.quantity} onChange={(e) => update('quantity', e.target.value)} placeholder="0" /></label><label className="inventory-field"><span>Stock mínimo</span><input inputMode="decimal" value={form.minimum} onChange={(e) => update('minimum', e.target.value)} placeholder="0" /></label><label className="inventory-field"><span>Costo por unidad</span><div className="inventory-input-prefix"><span>$</span><input inputMode="decimal" value={form.cost} onChange={(e) => update('cost', e.target.value)} placeholder="0,00" /></div></label><label className="inventory-field"><span>Fecha de vencimiento</span><input type="date" value={form.expiry} onChange={(e) => update('expiry', e.target.value)} /></label></div>}
            {tab === 'advanced' && <div className="inventory-fields"><label className="inventory-field inventory-field-wide"><span>SKU / Código interno</span><input value={form.sku} onChange={(e) => update('sku', e.target.value)} placeholder="Ej. POL-001" /></label><div className="inventory-note"><Info className="h-4 w-4 shrink-0" /><span>Los campos avanzados ayudan a ordenar tu inventario y conectar compras, recetas y reportes.</span></div></div>}
          </section>
          <aside className="inventory-summary"><div className="summary-label">Vista previa</div><div className="summary-photo"><ImagePlus className="h-6 w-6" /><span>Sin foto</span></div><div className="summary-copy"><span className="summary-category">{form.category}</span><h3>{form.name || 'Nombre del insumo'}</h3><p>Se mostrará en tu inventario como una unidad de {form.unit.toLowerCase()}.</p></div><div className="summary-divider" /><div className="summary-row"><span>Existencia inicial</span><strong>{form.quantity || '0'} {form.unit === 'Unidad' ? 'und.' : form.unit.toLowerCase()}</strong></div><div className="summary-row"><span>Costo unitario</span><strong>{form.cost ? `$ ${form.cost}` : 'Pendiente'}</strong></div><div className="summary-tip"><Info className="h-4 w-4 shrink-0" /><span>Podrás editar cualquier dato desde Inventario después de guardar.</span></div></aside>
        </div>
        <footer className="inventory-proposal-footer"><span className="inventory-required">* Campos obligatorios</span><div className="flex items-center gap-2"><a href="/propuesta/dashboard" className="inventory-secondary">Cancelar</a><button type="button" className="inventory-primary" onClick={() => setSaved(true)} disabled={!form.name.trim()}><Save className="h-4 w-4" />{saved ? 'Guardado' : 'Guardar insumo'}</button></div></footer>
        {saved && <div className="inventory-saved" role="status"><span>Insumo guardado</span><button type="button" onClick={() => setSaved(false)}><Plus className="h-4 w-4" /> Crear otro</button></div>}
      </main>
    </div>
  );
}

export { NewInventoryItemProposalPage };
