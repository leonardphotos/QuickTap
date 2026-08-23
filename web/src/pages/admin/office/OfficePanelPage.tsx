import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react';
import { officeApi, type Asiento, type Empresa, type Panel, type Reportes } from './officeApi';
import { mesCorto, money } from './officeFormat';
import type { OfficeScreen } from './OfficeLayout';

/**
 * Panel de la empresa activa: lo que un administrador mira todos los días antes de entrar a
 * cargar nada — cómo viene el mes, cómo viene el año, y qué se registró último.
 */
export default function OfficePanelPage({ empresa, onIrA }: { empresa: Empresa; onIrA: (s: OfficeScreen) => void }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [reportes, setReportes] = useState<Reportes | null>(null);
  const [ultimos, setUltimos] = useState<Asiento[]>([]);

  useEffect(() => {
    setPanel(null);
    officeApi.panel(empresa.id).then(setPanel).catch(() => setPanel(null));
    officeApi.reportes(empresa.id).then(setReportes).catch(() => setReportes(null));
    officeApi.asientos(empresa.id).then((a) => setUltimos(a.slice(0, 6))).catch(() => setUltimos([]));
  }, [empresa.id]);

  const m = money.bind(null, empresa);
  const resultado = Number(panel?.mes.resultado ?? 0);

  // Escala del gráfico: el mes más alto del propio período. Una escala fija dejaría un año
  // flojo pegado al piso y no se leería nada.
  const maxSerie = useMemo(
    () => Math.max(1, ...(panel?.serie ?? []).flatMap((s) => [s.ingresos, s.gastos])),
    [panel],
  );

  // Composición del gasto: las cinco cuentas que más pesan, el resto agrupado. Más de seis
  // porciones en una dona no se distinguen.
  const gastos = useMemo(() => {
    const filas = (reportes?.balanceComprobacion ?? [])
      .filter((f) => f.kind === 'EXPENSE' && Number(f.saldo) > 0)
      .sort((a, b) => Number(b.saldo) - Number(a.saldo));
    const top = filas.slice(0, 5).map((f) => ({ nombre: f.name, valor: Number(f.saldo) }));
    const resto = filas.slice(5).reduce((s, f) => s + Number(f.saldo), 0);
    if (resto > 0) top.push({ nombre: 'Otros', valor: resto });
    return top;
  }, [reportes]);

  const totalGastos = gastos.reduce((s, g) => s + g.valor, 0);
  const COLORES = ['#2563EB', '#F97316', '#10B981', '#A855F7', '#EF4444', '#94A3B8'];

  return (
    <div className="p-5 sm:p-7">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">{empresa.nombre}</h1>
        <p className="mt-0.5 text-[13.5px] text-brand-950/50">
          {empresa.rif ? `${empresa.rif} · ` : ''}Libros en {empresa.moneda}
          {reportes && Number(reportes.balanceGeneral.descuadre) !== 0 && (
            <span className="ml-2 rounded-md bg-red-50 px-2 py-0.5 text-[12px] font-medium text-red-700">
              Balance descuadrado en {m(reportes.balanceGeneral.descuadre)}
            </span>
          )}
        </p>
      </div>

      {/* ---------- Indicadores ---------- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Ingresos del mes', valor: m(panel?.mes.ingresos ?? 0), icon: TrendingUp, tono: 'text-emerald-600 bg-emerald-50' },
          { label: 'Gastos del mes', valor: m(panel?.mes.gastos ?? 0), icon: TrendingDown, tono: 'text-rose-600 bg-rose-50' },
          {
            label: 'Resultado del mes',
            valor: m(panel?.mes.resultado ?? 0),
            icon: Wallet,
            tono: resultado >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50',
          },
          { label: 'Asientos registrados', valor: String(panel?.asientos ?? 0), icon: BookOpen, tono: 'text-brand-500 bg-brand-500/10' },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-brand-950/[0.08] p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-medium text-brand-950/45">{c.label}</span>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.tono}`}>
                <c.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums">{c.valor}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---------- Ingresos vs gastos ---------- */}
        <div className="rounded-2xl border border-brand-950/[0.08] p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[15px] font-semibold">Ingresos y gastos</p>
              <p className="text-[12.5px] text-brand-950/45">Últimos 12 meses</p>
            </div>
            <div className="flex gap-3 text-[12px]">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Ingresos</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-400" /> Gastos</span>
            </div>
          </div>
          <div className="flex h-48 items-end gap-1.5">
            {(panel?.serie ?? []).map((s) => (
              <div key={s.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-40 w-full items-end justify-center gap-[3px]">
                  <div
                    className="w-1/2 rounded-t bg-emerald-500/85"
                    style={{ height: `${Math.max(s.ingresos > 0 ? 2 : 0, (s.ingresos / maxSerie) * 100)}%` }}
                    title={`${mesCorto(s.mes)}: ${m(s.ingresos)} de ingresos`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-rose-400/85"
                    style={{ height: `${Math.max(s.gastos > 0 ? 2 : 0, (s.gastos / maxSerie) * 100)}%` }}
                    title={`${mesCorto(s.mes)}: ${m(s.gastos)} de gastos`}
                  />
                </div>
                <span className="truncate text-[10px] text-brand-950/35">{mesCorto(s.mes)}</span>
              </div>
            ))}
            {(!panel || panel.serie.length === 0) && (
              <p className="w-full self-center text-center text-sm text-brand-950/35">Sin movimientos todavía.</p>
            )}
          </div>
        </div>

        {/* ---------- Composición del gasto ---------- */}
        <div className="rounded-2xl border border-brand-950/[0.08] p-5">
          <p className="text-[15px] font-semibold">En qué se va el dinero</p>
          <p className="mb-4 text-[12.5px] text-brand-950/45">Gastos acumulados por cuenta</p>
          {totalGastos === 0 ? (
            <p className="py-10 text-center text-sm text-brand-950/35">Sin gastos registrados.</p>
          ) : (
            <>
              <div className="mx-auto mb-4 h-36 w-36">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" role="img" aria-label="Composición del gasto por cuenta">
                  {(() => {
                    let acumulado = 0;
                    const R = 15.9155;
                    const circ = 2 * Math.PI * R;
                    return gastos.map((g, i) => {
                      const frac = g.valor / totalGastos;
                      const el = (
                        <circle
                          key={g.nombre}
                          cx="18" cy="18" r={R}
                          fill="none"
                          stroke={COLORES[i % COLORES.length]}
                          strokeWidth="4.2"
                          strokeDasharray={`${frac * circ} ${circ}`}
                          strokeDashoffset={-acumulado * circ}
                        />
                      );
                      acumulado += frac;
                      return el;
                    });
                  })()}
                </svg>
              </div>
              <ul className="flex flex-col gap-1.5">
                {gastos.map((g, i) => (
                  <li key={g.nombre} className="flex items-center gap-2 text-[12.5px]">
                    <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
                    <span className="min-w-0 flex-1 truncate text-brand-950/65">{g.nombre}</span>
                    <span className="shrink-0 tabular-nums text-brand-950/45">{((g.valor / totalGastos) * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* ---------- Últimos asientos ---------- */}
      <div className="mt-4 rounded-2xl border border-brand-950/[0.08] p-5">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-semibold">Últimos asientos</p>
          <button type="button" onClick={() => onIrA('asientos')} className="flex items-center gap-1 text-[12.5px] text-brand-500 hover:underline">
            Ver todos <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {ultimos.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-950/35">Todavía no has registrado ningún asiento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-brand-950/35">
                  <th className="pb-2 pr-3">N.º</th>
                  <th className="pb-2 pr-3">Fecha</th>
                  <th className="pb-2 pr-3">Descripción</th>
                  <th className="pb-2 pr-3">Estado</th>
                  <th className="pb-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {ultimos.map((a) => (
                  <tr key={a.id} className="border-t border-brand-950/[0.05]">
                    <td className="py-2.5 pr-3 tabular-nums text-brand-950/45">{a.numero}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-brand-950/60">
                      {new Date(a.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="py-2.5 pr-3">{a.descripcion}</td>
                    <td className="py-2.5 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.anulado ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {a.anulado ? 'Anulado' : 'Registrado'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums">{m(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-brand-950/35">
        <Users className="h-3.5 w-3.5" /> {panel?.contactos ?? 0} clientes y proveedores registrados
      </p>
    </div>
  );
}
