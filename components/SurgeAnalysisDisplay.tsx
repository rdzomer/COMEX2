import React from 'react';
import { SurgeAnalysisResult } from '../types.ts';
import { formatIntegerPtBR, formatDecimalPtBR } from '../utils/formatting.ts';

interface SurgeAnalysisDisplayProps {
  result: SurgeAnalysisResult | null;
  isLoading: boolean;
}

const SurgeAnalysisDisplay: React.FC<SurgeAnalysisDisplayProps> = ({ result, isLoading }) => {
  if (isLoading) return <p className="p-4 text-center text-sm text-slate-500">Calculando análise de surto…</p>;
  if (!result) return <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Escolha o período e clique em “Analisar surto” para ver o resultado.</p>;
  if (result.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-semibold">Não foi possível concluir a análise de surto</p>
        <p>{result.error}</p>
      </div>
    );
  }

  const max = Math.max(result.currentPeriod.sumKg, ...result.previousPeriods.map(p => p.sumKg), result.averagePreviousKg * 1.3, 1);
  const rows = [
    ...[...result.previousPeriods].reverse().map(p => ({ label: p.periodLabel, kg: p.sumKg, current: false })),
    { label: result.currentPeriod.periodLabel, kg: result.currentPeriod.sumKg, current: true },
  ];
  const threshold = result.averagePreviousKg * 1.3;
  const pctText = result.percentageChange === Infinity ? '+∞%' : `${result.percentageChange > 0 ? '+' : ''}${formatDecimalPtBR(result.percentageChange)}%`;

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className={`rounded-xl border p-5 lg:col-span-2 ${result.isSurge ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${result.isSurge ? 'text-red-700' : 'text-emerald-700'}`}>
          {result.isSurge ? '⚠ Surto de importação detectado' : '✓ Sem surto de importação'}
        </p>
        <p className="mt-2 text-4xl font-bold tabular text-slate-900">{pctText}</p>
        <p className="mt-1 text-sm text-slate-600">variação do período analisado em relação à média dos 3 períodos equivalentes anteriores</p>
        <p className="mt-3 text-xs text-slate-500">Critério: volume (kg) ≥ 130% da média dos 3 períodos anteriores.</p>
      </div>
      <div className="lg:col-span-3">
        <p className="mb-3 text-sm font-semibold text-slate-700">Importações (kg) por período</p>
        <div className="space-y-2.5">
          {rows.map(r => (
            <div key={r.label} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
              <span className={`truncate capitalize ${r.current ? 'font-semibold text-slate-900' : 'text-slate-600'}`} title={r.label}>{r.label}</span>
              <div className="relative h-5 rounded bg-slate-100">
                <div className="h-5 rounded" style={{ width: `${(r.kg / max) * 100}%`, background: r.current ? '#eb6834' : '#cbd5e1' }} />
                <div className="absolute top-[-3px] h-[26px] w-0.5 bg-slate-700" style={{ left: `${(threshold / max) * 100}%` }} title="Limite de 130% da média" />
              </div>
              <span className="tabular text-slate-700">{formatIntegerPtBR(r.kg)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Média dos 3 períodos anteriores: <b className="tabular text-slate-700">{formatIntegerPtBR(result.averagePreviousKg)} kg</b> · linha vertical = limite de 130% ({formatIntegerPtBR(threshold)} kg)
        </p>
      </div>
    </div>
  );
};

export default SurgeAnalysisDisplay;
