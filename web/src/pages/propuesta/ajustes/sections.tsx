import { Check, Pencil, Plus, ShieldCheck } from 'lucide-react';
import { businessHours, brandColor, paymentMethodsConfig, planInfo, teamMembers } from './data';

/** Tarjeta base consistente con el resto de las propuestas: borde sutil, fondo blanco, radios grandes. */
function Card({ title, description, action, children }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_8px_30px_#20272004]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-brand-950">{title}</h3>
          {description && <p className="mt-0.5 text-sm font-light text-brand-950/50">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-brand-950/50">{label}</span>
      <input
        defaultValue={value}
        className="w-full rounded-xl border border-brand-950/10 bg-brand-950/[0.015] px-3.5 py-2.5 text-sm text-brand-950 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
      />
    </label>
  );
}

function Toggle({ checked }: { checked: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-brand-950/15'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export function NegocioSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Datos del negocio" description="Esto es lo que ven tus clientes en el menú y los recibos.">
        <div className="space-y-3">
          <Field label="Nombre del negocio" value="La Casona Grill" />
          <Field label="Teléfono de contacto" value="+58 414 123 4567" />
          <Field label="Dirección" value="Av. Francisco de Miranda, Chacao" />
        </div>
      </Card>

      <Card title="Horario de atención" description="Se muestra en tu menú público." action={<button className="text-xs font-medium text-brand-500">Editar</button>}>
        <ul className="divide-y divide-brand-950/[0.06]">
          {businessHours.map((h) => (
            <li key={h.day} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-brand-950/70">{h.day}</span>
              <span className="font-medium tabular-nums text-brand-950">
                {h.open} – {h.close}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Acceso directo de escritorio" description="Crea un ícono para abrir el panel sin pasar por el navegador.">
        <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-950/15 py-3 text-sm font-medium text-brand-950/60 transition-colors hover:bg-brand-950/[0.02]">
          <Plus className="h-4 w-4" />
          Crear acceso directo
        </button>
      </Card>
    </div>
  );
}

export function PlanSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-2xl bg-gradient-to-br from-brand-950 to-brand-900 p-6 text-white">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">Plan actual</p>
            <p className="mt-1 text-2xl font-semibold">{planInfo.name}</p>
          </div>
          <p className="text-right text-2xl font-bold tabular-nums">
            ${planInfo.priceUsd}
            <span className="block text-xs font-normal text-white/50">por mes</span>
          </p>
        </div>
        <ul className="mb-5 grid grid-cols-2 gap-2.5">
          {planInfo.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-white/80">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
              {f}
            </li>
          ))}
        </ul>
        <p className="rounded-xl bg-white/10 px-3.5 py-2.5 text-xs text-white/70">
          Tu plan renueva en <span className="font-semibold text-white">{planInfo.renewsIn} días</span> · pago automático
          desactivado
        </p>
      </div>

      <Card title="Cambiar de plan" description="Compara y elige el que se ajuste a tu negocio.">
        <button className="mb-3 w-full rounded-xl bg-brand-950 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-900">
          Ver planes disponibles
        </button>
        <button className="w-full rounded-xl border border-brand-950/10 py-2.5 text-sm font-medium text-brand-950/70 transition-colors hover:bg-brand-950/[0.03]">
          Ir a facturación
        </button>
      </Card>
    </div>
  );
}

export function PagosSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Tasa cambiaria" description="Tus precios están en USD, convertidos a Bs con la tasa BCV.">
        <div className="mb-4 flex gap-2">
          {['Dólares ($)', 'Euros (€)'].map((c, i) => (
            <button
              key={c}
              className={`flex-1 rounded-lg border py-2 text-sm transition-colors ${
                i === 0 ? 'border-brand-950 bg-brand-950 text-white' : 'border-brand-950/15 bg-white text-brand-950/70'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-brand-950/[0.03] p-3.5 text-sm">
          <p>
            Tasa BCV vigente: <span className="font-semibold">Bs 98,45</span> / $1
          </p>
          <p className="mt-1 text-xs font-light text-brand-950/50">Actualizada hace 2 horas</p>
        </div>
      </Card>

      <Card title="Métodos de pago" description="Los que aceptas al cobrar un pedido." action={<button className="text-xs font-medium text-brand-500">Agregar</button>}>
        <ul className="divide-y divide-brand-950/[0.06]">
          {paymentMethodsConfig.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-950">{m.label}</p>
                <p className="truncate text-xs font-light text-brand-950/45">{m.detail}</p>
              </div>
              <Toggle checked={m.enabled} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function EquipoSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <Card title="Equipo" description={`${teamMembers.length} personas con acceso al panel.`} action={<button className="flex items-center gap-1.5 rounded-lg bg-brand-950 px-3 py-1.5 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" />Invitar</button>}>
        <ul className="divide-y divide-brand-950/[0.06]">
          {teamMembers.map((m) => (
            <li key={m.name} className="flex items-center gap-3 py-2.5">
              <div className="relative shrink-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-600">
                  {m.initials}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                    m.online ? 'bg-emerald-500' : 'bg-brand-950/20'
                  }`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-brand-950">{m.name}</p>
                <p className="truncate text-xs font-light text-brand-950/45">{m.role}</p>
              </div>
              <button className="rounded-lg p-1.5 text-brand-950/35 transition-colors hover:bg-brand-950/[0.04] hover:text-brand-950/70">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Seguridad" description="Protege acciones sensibles del día a día.">
        <div className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl bg-brand-950/[0.03] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-brand-950">PIN para anular pedidos</p>
              <p className="text-xs font-light text-brand-950/50">Pide un código de 4 dígitos</p>
            </div>
            <Toggle checked />
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-brand-950/[0.03] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-brand-950">Bloqueo automático</p>
              <p className="text-xs font-light text-brand-950/50">Tras 5 min sin actividad</p>
            </div>
            <Toggle checked={false} />
          </div>
        </div>
      </Card>
    </div>
  );
}

export function AparienciaSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Color de marca" description="Se aplica a tu menú público y recibos.">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl border border-black/10" style={{ backgroundColor: brandColor }} />
          <input
            defaultValue={brandColor}
            className="flex-1 rounded-xl border border-brand-950/10 bg-brand-950/[0.015] px-3.5 py-2.5 text-sm uppercase tabular-nums text-brand-950 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
          />
        </div>
        <div className="mt-3 flex gap-2">
          {['#2f6b4f', '#b4472a', '#1f4e79', '#8a4fae', '#c98a1c'].map((c) => (
            <button key={c} className="h-7 w-7 rounded-full border border-black/10" style={{ backgroundColor: c }} aria-label={`Usar ${c}`} />
          ))}
        </div>
      </Card>

      <Card title="Imagen de portada" description="Se ve al abrir tu menú desde el QR de mesa.">
        <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-dashed border-brand-950/15 bg-brand-950/[0.02] text-sm font-light text-brand-950/40">
          Sin imagen · 1200×675 recomendado
        </div>
      </Card>
    </div>
  );
}

export function ImpresionSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Impresora de comandas" description="Dónde se imprimen los pedidos de cocina.">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-900">Epson TM-T20 conectada</p>
            <p className="text-xs font-light text-emerald-700/70">Estación: Barra principal</p>
          </div>
        </div>
      </Card>

      <Card title="Modo sin conexión" description="Sigue tomando pedidos aunque se caiga internet.">
        <div className="flex items-center justify-between rounded-xl bg-brand-950/[0.03] p-3.5">
          <div>
            <p className="text-sm font-medium text-brand-950">Respaldo local activado</p>
            <p className="text-xs font-light text-brand-950/50">Sincroniza al volver la conexión</p>
          </div>
          <Toggle checked />
        </div>
      </Card>
    </div>
  );
}
