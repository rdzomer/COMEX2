import { ReactNode, useEffect, useRef, useState } from 'react';
import { SectionVisibility } from '../types.ts';

export function ChartCard({ title, subtitle, children, legend, className = '' }: {
  title: string; subtitle?: string; children: ReactNode; legend?: ReactNode; className?: string;
}) {
  return (
    <figure className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <figcaption className="mb-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </figcaption>
      {children}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-500">{legend}</div>
        <p className="text-[11px] text-slate-400">Fonte: Comex Stat/MDIC. Elaboração própria.</p>
      </div>
    </figure>
  );
}

export function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="mr-3 inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

export function KpiCard({ label, value, unit, delta, deltaLabel, hint }: {
  label: string; value: string; unit?: string; delta?: number | null; deltaLabel?: string; hint?: string;
}) {
  const has = delta !== null && delta !== undefined && isFinite(delta);
  const up = has && delta! > 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>}
      </p>
      {(has || hint) && (
        <p className="mt-1 text-xs text-slate-500">
          {has && (
            <span className={`mr-1 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold tabular ${up ? 'bg-emerald-50 text-emerald-700' : delta! < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
              {up ? '▲' : delta! < 0 ? '▼' : ''} {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(delta!))}%
            </span>
          )}
          {has ? deltaLabel : hint}
        </p>
      )}
    </div>
  );
}

export function Button({ children, onClick, variant = 'secondary', disabled, icon, title }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; icon?: ReactNode; title?: string;
}) {
  const styles = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
    secondary: 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant];
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}>
      {icon}
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SECTION_LABELS: Record<keyof SectionVisibility, string> = {
  showAnnualCharts: 'Gráficos anuais',
  showResumedHistoricalData: 'Dados anuais resumidos',
  showAnnualVariationSummary: 'Quadros resumo (variação anual)',
  showFullHistoricalData: 'Dados anuais completos',
  showRollingSumImportChart: 'Importações em 12 meses (acumulado e P1–P5)',
  showSurgeAnalysis: 'Análise de surto de importação',
  showCountryData: 'Dados por país (tabelas e treemaps)',
  showExcelAnalysis: 'Planilhas CGIM/DINTE e NF-e',
};

export function SectionPicker({ visibility, onChange }: { visibility: SectionVisibility; onChange: (v: SectionVisibility) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const keys = Object.keys(SECTION_LABELS) as (keyof SectionVisibility)[];
  const count = keys.filter(k => visibility[k]).length;
  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen(o => !o)} icon={<svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm3 5A.75.75 0 015.75 9h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 015 9.75zm3 5a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" /></svg>}>
        Seções ({count}/{keys.length})
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-xs text-slate-500">Escolha o que aparece na tela e na Ficha em Word.</p>
          {keys.map(k => (
            <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={visibility[k]} onChange={() => onChange({ ...visibility, [k]: !visibility[k] })} className="h-4 w-4 rounded border-slate-300 accent-brand-500" />
              {SECTION_LABELS[k]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export const Icons = {
  excel: <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" /></svg>,
  word: <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" /><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" /></svg>,
};
