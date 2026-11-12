import React from 'react';

export interface Column { key: string; header: string; LTR?: boolean }

interface DataTableProps {
  title?: string;
  subtitle?: string;
  data: Record<string, any>[];
  columns: Column[];
  formatters?: Record<string, (value: any, row: Record<string, any>) => React.ReactNode>;
  source?: string;
  stickyFirstColumn?: boolean;
  compact?: boolean;
}

const DataTable: React.FC<DataTableProps> = ({ title, subtitle, data, columns, formatters, source, stickyFirstColumn = true, compact }) => {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {title && <h3 className="font-semibold text-slate-800">{title}</h3>}
        <p className="mt-1 text-sm text-slate-500">Nenhum dado disponível.</p>
      </div>
    );
  }
  const pad = compact ? 'px-3 py-1.5' : 'px-4 py-2.5';
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {title && (
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      )}
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {columns.map((col, ci) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`${pad} whitespace-nowrap border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${col.LTR ? 'text-left' : 'text-right'} ${stickyFirstColumn && ci === 0 ? 'sticky left-0 z-20 bg-slate-50' : ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => {
              const partial = row.kind === 'ytd' || row.kind === 'prevYtd';
              const bg = partial ? 'bg-amber-50/60' : 'bg-white';
              return (
                <tr key={rowIndex} className={`${bg} border-b border-slate-100 last:border-0 hover:bg-brand-50/60`}>
                  {columns.map((col, ci) => {
                    const v = row[col.key];
                    const content = formatters?.[col.key]
                      ? formatters[col.key](v, row)
                      : v === undefined || v === null || v === '' ? '–' : String(v);
                    const negative = typeof v === 'number' && v < 0;
                    return (
                      <td
                        key={col.key}
                        className={`${pad} whitespace-nowrap tabular ${col.LTR ? 'text-left' : 'text-right'} ${negative ? 'text-red-600' : 'text-slate-700'} ${ci === 0 ? 'font-medium text-slate-900' : ''} ${stickyFirstColumn && ci === 0 ? `sticky left-0 ${bg}` : ''}`}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {source && <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">{source}</p>}
    </div>
  );
};

/** Variação percentual com seta; texto em tom neutro, seta indica direção. */
export function VarCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || isNaN(value)) return <span className="text-slate-300">–</span>;
  if (!isFinite(value)) return <span>N/A</span>;
  const up = value > 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={up ? 'text-emerald-600' : value < 0 ? 'text-red-600' : 'text-slate-400'} aria-hidden>{up ? '▲' : value < 0 ? '▼' : '•'}</span>
      {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%
    </span>
  );
}

export default DataTable;
