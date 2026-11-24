import React from 'react';
import {
  AnnualBarChart, AnnualPoint, PriceLineChart, PricePoint, TradeBalanceChart, RollingSumChart, CountryTreemap,
  ShareStackedChart, MonthlyImportsChart, YearCompareChart,
} from './charts/ChartKit.tsx';
import { CountryDataRecord } from '../types.ts';
import { Metric, ShareEvolution, MonthPoint } from '../utils/fichaExtras.ts';

/** Campos comuns: título no Word, nota de fonte e, opcionalmente, uma tabela logo abaixo do gráfico. */
interface Common {
  id: string;
  heading: string;
  source?: string;
  tableAfter?: { heading?: string; columns: string[]; rows: (string | number)[][]; source?: string };
}

export type ReportChartSpec = Common & (
  | { kind: 'bar'; flow: 'import' | 'export'; data: AnnualPoint[]; unitLabel: string }
  | { kind: 'price'; data: PricePoint[]; country?: string | null }
  | { kind: 'balance'; data: { name: string; exp: number; impNeg: number; balance: number }[] }
  | { kind: 'rolling'; data: { name: string; value: number }[] }
  | { kind: 'treemap'; flow: 'import' | 'export'; metric: Metric; unitLabel?: string; countries: CountryDataRecord[] }
  | { kind: 'share'; flow: 'import' | 'export'; evo: ShareEvolution; colors: Record<string, string>; unit: string }
  | { kind: 'monthly'; points: MonthPoint[]; unit: string }
  | { kind: 'yearCompare'; years: number[]; data: Record<string, number | string | null>[]; unit: string; partialYears: number[] }
);

const W = 960;

/** Renderiza os gráficos da ficha em tamanho fixo, fora da tela, para virarem imagens no Word. */
const ReportChartsOffscreen: React.FC<{ charts: ReportChartSpec[] }> = ({ charts }) => (
  <div style={{ background: '#fff' }}>
    {charts.map(c => {
      const h = c.kind === 'treemap' ? 600 : 460;
      return (
        <div key={c.id} data-export-id={c.id} data-w={W} data-h={h} style={{ width: W, height: h, position: 'relative', background: '#fff' }}>
          {c.kind === 'bar' && <AnnualBarChart data={c.data} flow={c.flow} unitLabel={c.unitLabel} width={W} height={h} />}
          {c.kind === 'price' && <PriceLineChart data={c.data} country={c.country} width={W} height={h} />}
          {c.kind === 'balance' && <TradeBalanceChart data={c.data} width={W} height={h} />}
          {c.kind === 'rolling' && <RollingSumChart data={c.data} width={W} height={h} />}
          {c.kind === 'treemap' && <CountryTreemap data={c.countries} flow={c.flow} metric={c.metric} unitLabel={c.unitLabel} width={W} height={h} />}
          {c.kind === 'share' && <ShareStackedChart evo={c.evo} colors={c.colors} unit={c.unit} flow={c.flow} width={W} height={h} />}
          {c.kind === 'monthly' && <MonthlyImportsChart points={c.points} unit={c.unit} width={W} height={h} />}
          {c.kind === 'yearCompare' && <YearCompareChart years={c.years} data={c.data} unit={c.unit} partialYears={c.partialYears} width={W} height={h} />}
        </div>
      );
    })}
  </div>
);

export default ReportChartsOffscreen;
