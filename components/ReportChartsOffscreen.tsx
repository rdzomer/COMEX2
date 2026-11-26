import React from 'react';
import {
  AnnualBarChart, AnnualPoint, PriceLineChart, PricePoint, TradeBalanceChart, RollingSumChart, CountryTreemap,
  ShareStackedChart, MonthlyImportsChart, YearCompareChart,
} from './charts/ChartKit.tsx';
import { CountryDataRecord } from '../types.ts';
import { Metric, ShareEvolution, MonthPoint } from '../utils/fichaExtras.ts';
import {
  PrecoVolumeChart, CascataChart, EfeitosChart, CalendarioHeatmap, ConcentracaoChart, HhiChart, PenetracaoChart, MapaUf, RankingUfChart,
} from './charts/AnaliticasKit.tsx';
import { JanelasChart, Base100Chart, PrecoMensalChart, CascataToneladasChart } from './charts/NovasKit.tsx';
import { LinhaJanela, PontoBase100, PontoPrecoMensal, LinhaCascataT } from '../utils/novas.ts';
import { PontoBolha, linhasCascata, LinhaDecomposicao, Calendario, PontoConcentracao, PontoPenetracao, LinhaUf } from '../utils/analiticas.ts';

/** Campos comuns: título no Word, nota de fonte e, opcionalmente, uma tabela logo abaixo do gráfico. */
interface Common {
  id: string;
  heading: string;
  source?: string;
  tableAfter?: { heading?: string; columns: string[]; rows: (string | number)[][]; source?: string };
  /** Tamanho próprio da imagem (padrão 960 × 460). */
  w?: number; h?: number;
  /** 'nfe': vai para a parte de NF-e da ficha, depois das tabelas. */
  grupo?: 'nfe';
  /** Análise do catálogo a que o gráfico pertence (define a ordem na ficha). */
  analise: string;
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
  | { kind: 'bolhas'; pontos: PontoBolha[]; precoMedio: number | null; rotulo0: string; rotulo1: string }
  | { kind: 'cascata'; rows: ReturnType<typeof linhasCascata> }
  | { kind: 'efeitos'; linhas: LinhaDecomposicao[] }
  | { kind: 'calendario'; cal: Calendario; unit: string }
  | { kind: 'concentracao'; data: PontoConcentracao[] }
  | { kind: 'hhi'; data: PontoConcentracao[] }
  | { kind: 'penetracao'; data: PontoPenetracao[] }
  | { kind: 'mapaUf'; linhas: LinhaUf[] }
  | { kind: 'rankingUf'; linhas: LinhaUf[] }
  | { kind: 'janelas'; linhas: LinhaJanela[] }
  | { kind: 'base100'; pontos: PontoBase100[] }
  | { kind: 'precoMensal'; pontos: PontoPrecoMensal[]; janela: number }
  | { kind: 'cascataT'; rows: LinhaCascataT[] }
);

const W = 960;

/** Renderiza os gráficos da ficha em tamanho fixo, fora da tela, para virarem imagens no Word. */
const ReportChartsOffscreen: React.FC<{ charts: ReportChartSpec[] }> = ({ charts }) => (
  <div style={{ background: '#fff' }}>
    {charts.map(c => {
      const w = c.w ?? W;
      const h = c.h ?? (c.kind === 'treemap' ? 600 : 460);
      return (
        <div key={c.id} data-export-id={c.id} data-w={w} data-h={h} style={{ width: w, height: h, position: 'relative', background: '#fff' }}>
          {c.kind === 'bar' && <AnnualBarChart data={c.data} flow={c.flow} unitLabel={c.unitLabel} width={W} height={h} />}
          {c.kind === 'price' && <PriceLineChart data={c.data} country={c.country} width={W} height={h} />}
          {c.kind === 'balance' && <TradeBalanceChart data={c.data} width={W} height={h} />}
          {c.kind === 'rolling' && <RollingSumChart data={c.data} width={W} height={h} />}
          {c.kind === 'treemap' && <CountryTreemap data={c.countries} flow={c.flow} metric={c.metric} unitLabel={c.unitLabel} width={W} height={h} />}
          {c.kind === 'share' && <ShareStackedChart evo={c.evo} colors={c.colors} unit={c.unit} flow={c.flow} width={W} height={h} />}
          {c.kind === 'monthly' && <MonthlyImportsChart points={c.points} unit={c.unit} width={W} height={h} />}
          {c.kind === 'yearCompare' && <YearCompareChart years={c.years} data={c.data} unit={c.unit} partialYears={c.partialYears} width={W} height={h} />}
          {c.kind === 'bolhas' && <PrecoVolumeChart pontos={c.pontos} precoMedio={c.precoMedio} rotulo0={c.rotulo0} rotulo1={c.rotulo1} width={w} height={h} />}
          {c.kind === 'cascata' && <CascataChart rows={c.rows} width={w} height={h} />}
          {c.kind === 'efeitos' && <EfeitosChart linhas={c.linhas} width={w} height={h} />}
          {c.kind === 'calendario' && <CalendarioHeatmap cal={c.cal} unit={c.unit} width={w} />}
          {c.kind === 'concentracao' && <ConcentracaoChart data={c.data} width={w} height={h} />}
          {c.kind === 'hhi' && <HhiChart data={c.data} width={w} height={h} />}
          {c.kind === 'penetracao' && <PenetracaoChart data={c.data} width={w} height={h} />}
          {c.kind === 'mapaUf' && <MapaUf linhas={c.linhas} width={w} />}
          {c.kind === 'rankingUf' && <RankingUfChart linhas={c.linhas} width={w} height={h} />}
          {c.kind === 'janelas' && <JanelasChart linhas={c.linhas} width={w} height={h} />}
          {c.kind === 'base100' && <Base100Chart pontos={c.pontos} width={w} height={h} />}
          {c.kind === 'precoMensal' && <PrecoMensalChart pontos={c.pontos} janela={c.janela} width={w} height={h} />}
          {c.kind === 'cascataT' && <CascataToneladasChart rows={c.rows} width={w} height={h} />}
        </div>
      );
    })}
  </div>
);

export default ReportChartsOffscreen;
