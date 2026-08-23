import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { officeApi, type Empresa, type Reportes } from './officeApi';
import { COLOR_TIPO, NOMBRE_TIPO, money } from './officeFormat';

/**
 * Los tres reportes que se piden siempre: balance de comprobación, estado de resultados y
 * balance general.
 *
 * El descuadre se muestra en vez de esconderse. Si activo no iguala a pasivo más patrimonio más
 * el resultado, hay un asiento mal cargado, y un reporte que lo disimula es peor que no tenerlo.
 */
export default function OfficeReportesPage({ empresa }: { empresa: Empresa }) {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [rep, setRep] = useState<Reportes | null>(null);

  useEffect(() => {
    const params: Record<string, string> = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    officeApi.reportes(empresa.id, params).then(setRep).catch(() => setRep(null));
  }, [empresa.id, desde, hasta]);

  const m = money.bind(null, empresa);
  const descuadre = Number(rep?.balanceGeneral.descuadre ?? 0);
  const resultado = Number(rep?.estadoResultados.resultado ?? 0);

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Reportes</h1>
          <p className="mt-0.5 text-[13.5px] text-brand-950/50">
            {desde || hasta ? 'Del período elegido.' : 'Desde que se abrieron los libros.'}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="block text-xs">
            <span className="text-brand-950/50">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="block text-xs">
            <span className="text-brand-950/50">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 rounded-lg border border-brand-950/15 px-2.5 py-1.5 text-sm" />
          </label>
        </div>
      </div>

      {descuadre !== 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-[13px] text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El balance no cuadra por <strong>{m(descuadre)}</strong>. Hay un asiento mal cargado: revisa el libro diario
            del período.
          </span>
        </div>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        {/* ---------- Estado de resultados ---------- */}
        <div className="rounded-2xl border border-brand-950/[0.08] p-5">
          <p className="mb-4 text-[15px] font-semibold">Estado de resultados</p>
          <dl className="flex flex-col gap-2.5 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-brand-950/60">Ingresos</dt>
              <dd className="tabular-nums font-medium text-emerald-700">{m(rep?.estadoResultados.ingresos ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-950/60">Gastos</dt>
              <dd className="tabular-nums font-medium text-rose-700">{m(rep?.estadoResultados.gastos ?? 0)}</dd>
            </div>
            <div className="flex justify-between border-t border-brand-950/[0.08] pt-2.5">
              <dt className="font-medium">Resultado del período</dt>
              <dd className={`tabular-nums text-[17px] font-semibold ${resultado >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {m(rep?.estadoResultados.resultado ?? 0)}
              </dd>
            </div>
            <div className="flex justify-between text-[12.5px] text-brand-950/45">
              <dt>Margen sobre ingresos</dt>
              <dd className="tabular-nums">{rep?.estadoResultados.margen ?? '0.0'}%</dd>
            </div>
          </dl>
        </div>

        {/* ---------- Balance general ---------- */}
        <div className="rounded-2xl border border-brand-950/[0.08] p-5">
          <p className="mb-4 text-[15px] font-semibold">Balance general</p>
          <dl className="flex flex-col gap-2.5 text-[14px]">
            <div className="flex justify-between">
              <dt className="text-brand-950/60">Activo</dt>
              <dd className="tabular-nums font-medium">{m(rep?.balanceGeneral.activo ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-950/60">Pasivo</dt>
              <dd className="tabular-nums font-medium">{m(rep?.balanceGeneral.pasivo ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-950/60">Patrimonio</dt>
              <dd className="tabular-nums font-medium">{m(rep?.balanceGeneral.patrimonio ?? 0)}</dd>
            </div>
            <div className="flex justify-between text-[12.5px] text-brand-950/45">
              {/* Hasta que no se cierra el ejercicio, la ganancia todavía no está en el patrimonio. */}
              <dt>Resultado del período (aún sin capitalizar)</dt>
              <dd className="tabular-nums">{m(rep?.balanceGeneral.resultadoDelPeriodo ?? 0)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* ---------- Balance de comprobación ---------- */}
      <div className="overflow-hidden rounded-2xl border border-brand-950/[0.08]">
        <div className="flex items-baseline justify-between gap-2 border-b border-brand-950/[0.06] px-4 py-3">
          <p className="text-[15px] font-semibold">Balance de comprobación</p>
          <p className="text-[12.5px] tabular-nums text-brand-950/45">
            Debe {m(rep?.totales.debe ?? 0)} · Haber {m(rep?.totales.haber ?? 0)}
          </p>
        </div>
        {!rep || rep.balanceComprobacion.length === 0 ? (
          <p className="p-6 text-sm text-brand-950/40">Sin movimientos en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-brand-950/[0.06] text-left text-[11px] font-semibold uppercase tracking-wider text-brand-950/35">
                  <th className="px-4 py-2.5">Cuenta</th>
                  <th className="px-4 py-2.5">Naturaleza</th>
                  <th className="px-4 py-2.5 text-right">Debe</th>
                  <th className="px-4 py-2.5 text-right">Haber</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {rep.balanceComprobacion.map((f) => (
                  <tr key={f.code} className="border-b border-brand-950/[0.04]">
                    <td className="px-4 py-2.5">
                      <span className="tabular-nums text-brand-950/40">{f.code}</span> {f.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COLOR_TIPO[f.kind]}`}>{NOMBRE_TIPO[f.kind]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-950/55">{Number(f.debe) ? m(f.debe) : '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-brand-950/55">{Number(f.haber) ? m(f.haber) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{m(f.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
