import { useRef, useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { TextureButton } from '@/components/ui/texture-button';
import { ReportReceipt, REPORT_AREA_LABELS, type ReportData, type ReportKind } from './ReportReceipt';

function todayStr(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

type ReportRangeOption = 'day' | 'week' | 'month' | 'year' | 'custom';

const RANGE_OPTION_LABELS: Record<ReportRangeOption, string> = {
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
  custom: 'Personalizado',
};

const RANGE_PERIOD_LABELS: Record<Exclude<ReportRangeOption, 'custom'>, string> = {
  day: 'Hoy',
  week: 'Esta semana',
  month: 'Este mes',
  year: 'Este año',
};

/** Elige área de Administración + período, genera el reporte. Sin resultado todavía —
 * `ReportResult` es el siguiente paso una vez generado. Usado por Administración dentro de
 * un InlinePanel (Restaurantes es el único vertical con este botón por ahora). */
export function ReportPickerForm({ onGenerated }: { onGenerated: (report: ReportData, dateLabel: string) => void }) {
  const [area, setArea] = useState<ReportKind>('general');
  const [rangeOption, setRangeOption] = useState<ReportRangeOption>('day');
  const [date, setDate] = useState(todayStr());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeParams = rangeOption === 'custom' ? { date } : { range: rangeOption };
  const dateLabel = rangeOption === 'custom' ? new Date(date + 'T12:00:00').toLocaleDateString('es-VE') : RANGE_PERIOD_LABELS[rangeOption];

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      if (area === 'general') {
        const [historyRes, movementsRes] = await Promise.all([
          api.get('/orders/history', { params: { ...rangeParams, pageSize: 100 } }),
          api.get('/movements', { params: rangeParams }),
        ]);
        onGenerated(
          {
            kind: 'general',
            data: {
              totalBase: historyRes.data.data.totalBase,
              totalBs: historyRes.data.data.totalBs,
              totalOrders: historyRes.data.data.total,
              incomeBase: movementsRes.data.data.totalIncome,
              expenseBase: movementsRes.data.data.totalExpense,
              orders: historyRes.data.data.orders.map((o: any) => ({
                orderNumber: o.orderNumber,
                channel: o.channel,
                paymentMethod: o.paymentMethod,
                totalBase: o.totalBase,
                createdAt: o.createdAt,
              })),
            },
          },
          dateLabel,
        );
      } else if (area === 'products') {
        const res = await api.get('/orders/reports/products', { params: rangeParams });
        onGenerated({ kind: 'products', data: res.data.data }, dateLabel);
      } else if (area === 'delivery') {
        const res = await api.get('/orders/reports/couriers', { params: rangeParams });
        onGenerated({ kind: 'delivery', data: res.data.data }, dateLabel);
      } else if (area === 'payments') {
        const res = await api.get('/orders/reports/payment-methods', { params: rangeParams });
        onGenerated({ kind: 'payments', data: res.data.data }, dateLabel);
      } else {
        const res = await api.get('/orders/history', { params: { ...rangeParams, pageSize: 100 } });
        onGenerated(
          {
            kind: 'history',
            data: res.data.data.orders.map((o: any) => ({
              orderNumber: o.orderNumber,
              channel: o.channel,
              paymentMethod: o.paymentMethod,
              totalBase: o.totalBase,
              createdAt: o.createdAt,
            })),
          },
          dateLabel,
        );
      }
    } catch (e: any) {
      setError(e.response?.data?.error ?? 'No se pudo generar el reporte.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Área</p>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as ReportKind)}
          className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
        >
          {(Object.keys(REPORT_AREA_LABELS) as ReportKind[]).map((k) => (
            <option key={k} value={k}>
              {REPORT_AREA_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-medium text-brand-950/50 mb-1.5">Período</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(RANGE_OPTION_LABELS) as ReportRangeOption[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRangeOption(r)}
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                rangeOption === r ? 'bg-brand-500 text-white' : 'bg-brand-950/[0.06] text-brand-950/50'
              }`}
            >
              {RANGE_OPTION_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {rangeOption === 'custom' && (
        <div>
          <p className="text-xs font-medium text-brand-950/50 mb-1.5">Fecha exacta</p>
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm border border-brand-950/15 rounded-lg px-2.5 py-1.5"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <TextureButton variant="brand" size="default" disabled={generating} onClick={generate} className="disabled:opacity-50">
        {generating ? 'Generando…' : 'Generar reporte'}
      </TextureButton>
    </div>
  );
}

/** Pantalla de "descargar PDF" tras generar un reporte — segundo paso de `ReportPickerForm`. */
export function ReportResult({ report, dateLabel, area }: { report: ReportData; dateLabel: string; area: ReportKind }) {
  const { restaurant } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);

  async function download() {
    if (!receiptRef.current) return;
    const { downloadElementAsPdf } = await import('@/utils/pdf');
    await downloadElementAsPdf(receiptRef.current, `reporte-${area}-${dateLabel}.pdf`);
  }

  if (!restaurant) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-brand-950/70">
        Reporte de {REPORT_AREA_LABELS[report.kind]} del {dateLabel} listo. Descarga el PDF para tu registro.
      </p>
      <TextureButton variant="brand" size="default" onClick={download}>
        Descargar reporte (PDF)
      </TextureButton>
      <div className="fixed -left-[9999px] top-0">
        <ReportReceipt ref={receiptRef} restaurantName={restaurant.name} currency={restaurant.baseCurrency} dateLabel={dateLabel} report={report} />
      </div>
    </div>
  );
}
