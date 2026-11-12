export interface LastUpdateData {
  date: string | null;
  year: number | null;
  month: number | null;
}

export interface NcmDetails {
  description: string | null;
  unit: string | null;
}

export interface ComexStatRecord {
  year: number;
  month?: number;
  coNcm?: string;
  ncm?: string;
  country?: string;
  metricFOB?: number;
  metricKG?: number;
  metricStatistic?: number;
  metricFreight?: number;
  metricInsurance?: number;
  metricCIF?: number;
  [key: string]: any;
}

export interface MonthlyComexStatRecord {
  year: number;
  month: number;
  metricFOB?: number;
  metricKG?: number;
  [key: string]: any;
}

/** 'full' = ano fechado; 'ytd' = ano corrente até o mês; 'prevYtd' = mesmo período do ano anterior */
export type YearRowKind = 'full' | 'ytd' | 'prevYtd';

export interface ProcessedTradeData {
  year: string; // "YYYY" ou "YYYY (Até mês XX)"
  yearNumeric?: number;
  kind?: YearRowKind;
  'Código NCM'?: string;
  'Descrição NCM'?: string;
  'Unidade Estatística'?: string;
  'Exportações (US$ FOB)'?: number;
  'Exportações (KG)'?: number;
  'Exportações (Qtd Estatística)'?: number;
  'Importações (US$ FOB)'?: number;
  'Importações (KG)'?: number;
  'Importações (Qtd Estatística)'?: number;
  'Balança Comercial (FOB)'?: number;
  'Balança Comercial (KG)'?: number;
  'Balança Comercial (Qtd Estatística)'?: number;
  'Importações (CIF USD)'?: number;
  'Importações (Frete USD)'?: number;
  'Importações (Seguro USD)'?: number;
  'Preço Médio Exportação (US$ FOB/Ton)'?: number | null;
  'Preço Médio Importação (US$ FOB/Ton)'?: number | null;
  'Preço Médio Exportação (US$/Qtd Est)'?: number | null;
  'Preço Médio Importação (US$/Qtd Est)'?: number | null;
  'Preço Médio Exportação (US$/KG)'?: number | null;
  'Preço Médio Importação (US$/KG)'?: number | null;
}

export type FlowType = "import" | "export";

export interface ApiFilter {
  filter: string;
  values: string[];
}

export interface Period {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
}

export interface CountryDataRecord {
  country: string;
  metricFOB: number;
  metricKG: number;
  representatividadeFOB?: number;
  representatividadeKG?: number;
}

export interface CountryPeriodData {
  label: string;      // ex.: "2025" ou "2026 (até mês 10)"
  period: Period;
  imports: CountryDataRecord[];
  exports: CountryDataRecord[];
}

export interface CgimNcmInfo {
  'NCM'?: string;
  'Departamento Responsável'?: string;
  'Coordenação-Geral Responsável'?: string;
  'Agrupamento'?: string;
  'Setores'?: string;
  'Subsetores'?: string;
  'Produtos'?: string;
}

/** Linha de contato de entidade: colunas A e T:AE da aba, com cabeçalhos da própria planilha */
export type EntityContactInfo = Record<string, string> & { 'Aba': string; 'NCM': string };

export interface NfeData {
  ano?: number;
  ncm_8d?: string;
  valor_producao?: number;
  qtd_tributavel_producao?: number;
  valor_exp?: number;
  qtd_tributavel_exp?: number;
  valor_cif_imp_dolar?: number;
  qtd_tributavel_imp?: number;
  cambio_dolar_medio?: number;
  valor_cif_imp_reais?: number;
  coeficiente_penetracao_imp_valor?: number;
  coeficiente_penetracao_imp_qtd?: number;
  coeficiente_exp_valor?: number;
  coeficiente_exp_qtd?: number;
  consumo_nacional_aparente_valor?: number;
  consumo_nacional_aparente_qtd?: number;
  disponibilidade_total_valor?: number;
  disponibilidade_total_qtd?: number;
  'Vendas internas (KG)'?: number;
}

export interface FormattedNfeSalesData {
  ano?: number;
  'Vendas totais (Kg)'?: string;
  'Δ Vendas totais (%)'?: string;
  'Vendas internas (KG)'?: string;
  'Δ Vendas internas (%)'?: string;
  'Exportações (Kg)'?: string;
  'Δ Exportações (%)'?: string;
}

export interface FormattedNfeCnaData {
  ano?: number;
  'Vendas internas (KG)'?: string;
  'Δ Vendas internas (%)'?: string;
  'Importações (Kg)'?: string;
  'Δ Importações (%)'?: string;
  'CNA (Kg)'?: string;
  'Δ CNA (%)'?: string;
  'Coeficiente de importação (%)'?: string;
}

export interface YearSummaryData {
  'Ano': string;
  kind?: YearRowKind;
  [key: string]: number | string | undefined | null;
}

export interface ChartDataPoint {
  name: string;
  [key: string]: any;
}

export interface MonthlySeriesPoint {
  yearMonth: string; // YYYY-MM
  year: number;
  month: number;
  metricKG: number;
  metricFOB: number;
  rollingKG: number | null; // soma móvel 12m (null nos 11 primeiros meses)
}

export interface RollingSumDataPoint {
  yearMonth: string;
  rollingFOB?: number | null;
  rollingKG?: number | null;
}

export interface TwelveMonthBlock {
  periodo: string;     // P1..P5 (P5 = mais recente)
  dataInicio: string;  // ex.: "nov/25"
  dataFinal: string;   // ex.: "out/26"
  importacaoKg: number;
}

export interface TwelveMonthComparison {
  comparacao: string;
  resultado: number | null; // fração (0,25 = 25%)
}

export interface TwelveMonthSummary {
  blocks: TwelveMonthBlock[];        // em ordem P5, P4, ..., P1 (como no notebook)
  comparisons: TwelveMonthComparison[];
}

export interface SectionVisibility {
  showFullHistoricalData: boolean;
  showResumedHistoricalData: boolean;
  showAnnualVariationSummary: boolean;
  showAnnualCharts: boolean;
  showRollingSumImportChart: boolean;
  showSurgeAnalysis: boolean;
  showCountryData: boolean;
  showExcelAnalysis: boolean;
}

// Análise de surto
export interface SurgeAnalysisConfig {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
}

export interface SurgeAnalysisPeriodValues {
  periodLabel: string;
  startDate: string;
  endDate: string;
  sumKg: number;
  year: number;
}

export interface SurgeAnalysisResult {
  currentPeriod: SurgeAnalysisPeriodValues;
  previousPeriods: SurgeAnalysisPeriodValues[];
  averagePreviousKg: number;
  percentageChange: number;
  isSurge: boolean;
  error?: string;
}
