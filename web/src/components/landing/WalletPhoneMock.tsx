/**
 * Teléfono de mentira con el dashboard del Wallet dibujado en CSS — la pieza visual del
 * banner de la landing y de /wallet/conoce. Es un dibujo, no una captura: así no se
 * desactualiza con cada cambio del portal ni pesa cientos de KB, y los datos son
 * inventados a propósito (nada de un cliente real en la página de venta).
 */
export function WalletPhoneMock({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`w-[290px] select-none rounded-[2.4rem] border border-white/15 bg-[#04070d] p-2.5 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.8)] ${className}`}
    >
      <div className="relative overflow-hidden rounded-[1.9rem] bg-[#070c14] px-5 pb-6 pt-5">
        {/* resplandor de la marca, versión mini */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40"
          style={{
            background:
              'radial-gradient(130% 100% at 80% 0%, rgba(170,212,255,0.35) 0%, rgba(58,136,245,0.22) 30%, rgba(7,12,20,0) 70%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="flex flex-col">
              <img src="/logo/wallet.png" alt="" className="h-4 w-auto" />
              <span className="mt-0.5 text-[5px] font-light tracking-wide text-white/35">by QuickTap</span>
            </span>
            <span className="h-6 w-6 rounded-full bg-white/[0.08]" />
          </div>

          <p className="mt-6 text-[9px] font-medium uppercase tracking-wider text-white/40">Total por pagar</p>
          <p className="mt-1 text-[34px] font-bold leading-none tracking-tight text-white">
            $128<span className="text-[18px] text-white/40">.50</span>
          </p>

          {/* tienda con su cuota a mano */}
          <div className="mt-5 rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3d9bff]/25 text-[9px] font-bold text-[#8cc4ff]">
                US
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-white">Urbana Store</span>
                <span className="block text-[8.5px] font-light text-white/40">3 compras · plan de cuotas</span>
              </span>
              <span className="text-[11px] font-bold text-white">-$45.00</span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[65%] rounded-full bg-emerald-400" />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span>
                <span className="block text-[10px] font-bold tabular-nums text-white">$15.00</span>
                <span className="block text-[8px] font-light text-white/40">Cuota 3 · vence 05 sep</span>
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-[8.5px] font-bold text-[#0a1020]">Pagar</span>
            </div>
          </div>

          {/* entrada de evento */}
          <div className="mt-2.5 flex items-center gap-2.5 rounded-2xl bg-white/[0.05] p-3.5 ring-1 ring-white/[0.06]">
            <span className="grid h-8 w-8 shrink-0 grid-cols-4 gap-[1.5px] rounded-md bg-white p-[3px]">
              {[1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1].map((v, i) => (
                <span key={i} className={`rounded-[1px] ${v ? 'bg-[#0a1020]' : 'bg-transparent'}`} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-white">Reto 11:11 · 3ra edición</span>
              <span className="block text-[8.5px] font-light text-white/40">Entrada · Puesto 12 · 06 nov</span>
            </span>
            <span className="text-[8.5px] font-bold text-emerald-400">100%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
