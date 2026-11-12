import React from 'react';
import { AnnualBarChart, AnnualPoint, PriceLineChart, TradeBalanceChart, RollingSumChart, CountryTreemap } from './charts/ChartKit.tsx';
import { CountryDataRecord } from '../types.ts';

export type ReportChartSpec =
  | { id: string; heading: string; kind: 'bar'; flow: 'import' | 'export'; data: AnnualPoint[]; unitLabel: string }
  | { id: string; heading: string; kind: 'price'; data: { name: string; imp: number | null; exp: number | null }[] }
  | { id: string; heading: string; kind: 'balance'; data: { name: string; exp: number; impNeg: number; balance: number }[] }
  | { id: string; heading: string; kind: 'rolling'; data: { name: string; value: number }[] }
  | { id: string; heading: string; kind: 'treemap'; flow: 'import' | 'export'; metric: 'metricFOB' | 'metricKG'; countries: CountryDataRecord[] };

const W = 960;

/** Renderiza os gráficos da ficha em tamanho fixo, fora da tela, para virarem imagens no Word. */
const ReportChartsOffscreen: React.FC<{ charts: ReportChartSpec[] }> = ({ charts }) => (
  <div style={{ background: '#fff' }}>
    {charts.map(c => {
      const h = c.kind === 'treemap' ? 600 : 460;
      return (
        <div key={c.id} data-export-id={c.id} data-w={W} data-h={h} style={{ width: W, height: h, position: 'relative', background: '#fff' }}>
          {c.kind === 'bar' && <AnnualBarChart data={c.data} flow={c.flow} unitLabel={c.unitLabel} width={W} height={h} />}
          {c.kind === 'price' && <PriceLineChart data={c.data} width={W} height={h} />}
          {c.kind === 'balance' && <TradeBalanceChart data={c.data} width={W} height={h} />}
          {c.kind === 'rolling' && <RollingSumChart data={c.data} width={W} height={h} />}
          {c.kind === 'treemap' && <CountryTreemap data={c.countries} flow={c.flow} metric={c.metric} width={W} height={h} />}
        </div>
      );
    })}
  </div>
);

export default ReportChartsOffscreen;
