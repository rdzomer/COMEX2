import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NcmInput from './components/NcmInput.tsx';
import DataTable, { Column, VarCell } from './components/DataTable.tsx';
import FileUpload from './components/FileUpload.tsx';
import Section from './components/Section.tsx';
import SurgeAnalysisConfigurator from './components/SurgeAnalysisConfigurator.tsx';
import SurgeAnalysisDisplay from './components/SurgeAnalysisDisplay.tsx';
import { ChartCard, KpiCard, Button, SegmentedControl, SectionPicker, Swatch, Icons } from './components/ui.tsx';
import { AnnualBarChart, PriceLineChart, TradeBalanceChart, RollingSumChart, CountryTreemap, COLORS } from './components/charts/ChartKit.tsx';
import ReportChartsOffscreen, { ReportChartSpec } from './components/ReportChartsOffscreen.tsx';

import { fetchLastUpdateData, fetchNcmDescription, fetchNcmUnit, fetchComexData, fetchMonthlyComexData, fetchCountryData } from './services/comexApiService.ts';
import { parseCgimDinteExcelForFiltering, parseNfeExcel, downloadWorkbook } from './services/excelService.ts';
import {
  processAnnualTradeData, sortAnnualRows, createYearSummary, buildMonthlySeries, buildTwelveMonthSummary,
  processNfeSalesData, processNfeCnaData, ensureVendasInternas, analyzeImportSurge,
} from './utils/dataProcessing.ts';
import { formatIntegerPtBR, formatDecimalPtBR, formatNcmCode, formatPercentagePtBR, getMonthNamePtBR, pad2 } from './utils/formatting.ts';
import { elementToPng } from './utils/chartToImage.ts';
import {
  LastUpdateData, NcmDetails, ProcessedTradeData, ApiFilter, Period, CountryPeriodData, CgimNcmInfo,
  EntityContactInfo, NfeData, SectionVisibility, MonthlyComexStatRecord, SurgeAnalysisConfig, SurgeAnalysisResult,
} from './types.ts';

const initialSectionVisibility: SectionVisibility = {
  showAnnualCharts: true,
  showResumedHistoricalData: true,
  showAnnualVariationSummary: true,
  showFullHistoricalData: true,
  showRollingSumImportChart: true,
  showSurgeAnalysis: true,
  showCountryData: true,
  showExcelAnalysis: true,
};

const SOURCE_COMEX = 'Fonte: Comex Stat/MDIC. Elaboração própria.';
const SOURCE_NFE = 'Fonte: Dados da Nota Fiscal Eletrônica (NF-e) da RFB, disponibilizados pela SECEX.';
const SOURCE_CGIM = 'Fonte: Arquivo 20241011_NCMs-CGIM-DINTE.xlsx';
const EXP_IMP = ["metricFOB", "metricKG", "metricStatistic"];
const IMP_METRICS = ["metricFOB", "metricFreight", "metricInsurance", "metricCIF", "metricKG", "metricStatistic"];

type StepStatus = 'pending' | 'running' | 'done' | 'error';
interface Step { key: string; label: string; status: StepStatus }

type CgimParsed = Awaited<ReturnType<typeof parseCgimDinteExcelForFiltering>>;

const App: React.FC = () => {
  const [ncmCode, setNcmCode] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const loading = steps.some(s => s.status === 'running' || s.status === 'pending');
  const requestId = useRef(0);

  const [lastUpdateData, setLastUpdateData] = useState<LastUpdateData | null>(null);
  const [ncmDetails, setNcmDetails] = useState<NcmDetails | null>(null);
  const [annualRows, setAnnualRows] = useState<ProcessedTradeData[]>([]);
  const [rawMonthlyImportData, setRawMonthlyImportData] = useState<MonthlyComexStatRecord[]>([]);
  const [countryPeriods, setCountryPeriods] = useState<CountryPeriodData[]>([]);

  const [cgimFile, setCgimFile] = useState<File | null>(null);
  const [nfeFile, setNfeFile] = useState<File | null>(null);
  const [cgimParsed, setCgimParsed] = useState<CgimParsed | null>(null);
  const [nfeAll, setNfeAll] = useState<NfeData[] | null>(null);
  const [fileBusy, setFileBusy] = useState<'cgim' | 'nfe' | null>(null);

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(initialSectionVisibility);
  const [surgeAnalysisResult, setSurgeAnalysisResult] = useState<SurgeAnalysisResult | null>(null);
  const [countryPeriodIdx, setCountryPeriodIdx] = useState<'0' | '1'>('1');
  const [countryMetric, setCountryMetric] = useState<'metricFOB' | 'metricKG'>('metricFOB');
  const [exportingWord, setExportingWord] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const setStep = (key: string, status: StepStatus) => setSteps(prev => prev.map(s => (s.key === key ? { ...s, status } : s)));

  // ---------------------------------------------------------------------------
  // Carregamento dos dados da API
  // ---------------------------------------------------------------------------
  const handleNcmSubmit = async (code: string) => {
    const myId = ++requestId.current;
    const alive = () => requestId.current === myId;
    setNcmCode(code);
    setErrors([]);
    setLastUpdateData(null);
    setNcmDetails(null);
    setAnnualRows([]);
    setRawMonthlyImportData([]);
    setCountryPeriods([]);
    setSurgeAnalysisResult(null);
    setSteps([
      { key: 'basic', label: 'Descrição, unidade e data de atualização', status: 'running' },
      { key: 'annual', label: 'Séries anuais desde 2004', status: 'pending' },
      { key: 'monthly', label: 'Importações mensais desde 2019', status: 'pending' },
      { key: 'country', label: 'Dados por país', status: 'pending' },
    ]);
    const fail = (key: string, msg: string, e: unknown) => {
      console.error(msg, e);
      if (!alive()) return;
      setStep(key, 'error');
      setErrors(prev => [...prev, msg]);
    };

    const [upd, desc, unit] = await Promise.all([fetchLastUpdateData(), fetchNcmDescription(code), fetchNcmUnit(code)]);
    if (!alive()) return;
    const details: NcmDetails = { description: desc, unit };
    setLastUpdateData(upd);
    setNcmDetails(details);
    if (!upd.year || !upd.month) {
      fail('basic', 'Não foi possível obter a data de atualização da API Comex Stat. Tente novamente em alguns instantes.', null);
      setSteps(prev => prev.map(s => (s.status === 'pending' ? { ...s, status: 'error' } : s)));
      return;
    }
    setStep('basic', 'done');
    const Y = upd.year, M = upd.month, MM = pad2(M);
    const filters: ApiFilter[] = [{ filter: 'ncm', values: [code] }];

    const annual = (async () => {
      setStep('annual', 'running');
      try {
        const full: Period = { from: '2004-01', to: `${Y}-${MM}` };
        const prevYtd: Period = { from: `${Y - 1}-01`, to: `${Y - 1}-${MM}` };
        const [exp, imp, expPrev, impPrev] = await Promise.all([
          fetchComexData('export', full, filters, EXP_IMP, ['ncm']),
          fetchComexData('import', full, filters, IMP_METRICS, ['ncm']),
          M < 12 ? fetchComexData('export', prevYtd, filters, EXP_IMP, ['ncm']) : Promise.resolve([]),
          M < 12 ? fetchComexData('import', prevYtd, filters, IMP_METRICS, ['ncm']) : Promise.resolve([]),
        ]);
        if (!alive()) return;
        const rows = processAnnualTradeData(exp, imp, code, details, upd);
        // Notebook (células 6–8): mesmo período do ano anterior, só quando o ano corrente está incompleto
        const prevRows = M < 12 ? processAnnualTradeData(expPrev, impPrev, code, details, upd, 'prevYtd') : [];
        if (M < 12 && prevRows.length === 0) {
          prevRows.push(...processAnnualTradeData([{ year: Y - 1 }], [], code, details, upd, 'prevYtd'));
        }
        setAnnualRows(sortAnnualRows([...rows, ...prevRows]));
        setStep('annual', 'done');
      } catch (e) { fail('annual', 'Falha ao carregar as séries anuais da API Comex Stat.', e); }
    })();

    const monthly = (async () => {
      setStep('monthly', 'running');
      try {
        const data = await fetchMonthlyComexData('import', { from: '2019-01', to: `${Y}-${MM}` }, filters, ['metricFOB', 'metricKG']);
        if (!alive()) return;
        setRawMonthlyImportData(data);
        setStep('monthly', 'done');
      } catch (e) { fail('monthly', 'Falha ao carregar os dados mensais de importação.', e); }
    })();

    const countries = (async () => {
      setStep('country', 'running');
      try {
        const prevPeriod: Period = { from: `${Y - 1}-01`, to: `${Y - 1}-12` };
        const ytdPeriod: Period = { from: `${Y}-01`, to: `${Y}-${MM}` };
        const [pe, pi, ye, yi] = await Promise.all([
          fetchCountryData(code, 'export', prevPeriod),
          fetchCountryData(code, 'import', prevPeriod),
          fetchCountryData(code, 'export', ytdPeriod),
          fetchCountryData(code, 'import', ytdPeriod),
        ]);
        if (!alive()) return;
        setCountryPeriods([
          { label: String(Y - 1), period: prevPeriod, exports: pe, imports: pi },
          { label: M < 12 ? `${Y} (até ${getMonthNamePtBR(M)})` : String(Y), period: ytdPeriod, exports: ye, imports: yi },
        ]);
        setStep('country', 'done');
      } catch (e) { fail('country', 'Falha ao carregar os dados por país.', e); }
    })();

    await Promise.all([annual, monthly, countries]);
  };

  // ---------------------------------------------------------------------------
  // Planilhas enviadas pelo usuário (lidas uma vez, filtradas pela NCM atual)
  // ---------------------------------------------------------------------------
  const handleCgimFile = async (file: File) => {
    setFileBusy('cgim');
    try {
      setCgimParsed(await parseCgimDinteExcelForFiltering(file));
      setCgimFile(file);
    } catch (e) {
      alert(`Erro ao processar a planilha CGIM/DINTE: ${(e as Error).message}`);
    }
    setFileBusy(null);
  };
  const handleNfeFile = async (file: File) => {
    setFileBusy('nfe');
    try {
      setNfeAll(await parseNfeExcel(file));
      setNfeFile(file);
    } catch (e) {
      alert(`Erro ao processar a planilha de NF-e: ${(e as Error).message}`);
    }
    setFileBusy(null);
  };

  const cgimInfo: CgimNcmInfo | null = useMemo(
    () => (cgimParsed && ncmCode ? cgimParsed.cgimData.find(r => r.NCM === ncmCode) ?? null : null),
    [cgimParsed, ncmCode],
  );
  const entityContacts: EntityContactInfo[] = useMemo(
    () => (cgimParsed && ncmCode ? cgimParsed.entityData.filter(r => r.NCM === ncmCode) : []),
    [cgimParsed, ncmCode],
  );
  const entityColumnsUsed = useMemo(() => {
    if (!cgimParsed) return [];
    return cgimParsed.entityColumns.filter(c => entityContacts.some(r => r[c]));
  }, [cgimParsed, entityContacts]);
  const nfeForNcm: NfeData[] = useMemo(
    () => (nfeAll && ncmCode ? ensureVendasInternas(nfeAll.filter(r => r.ncm_8d === ncmCode)).sort((a, b) => (a.ano || 0) - (b.ano || 0)) : []),
    [nfeAll, ncmCode],
  );
  const nfeSalesTable = useMemo(() => processNfeSalesData(nfeForNcm), [nfeForNcm]);
  const nfeCnaTable = useMemo(() => processNfeCnaData(nfeForNcm), [nfeForNcm]);

  // ---------------------------------------------------------------------------
  // Dados derivados
  // ---------------------------------------------------------------------------
  const Y = lastUpdateData?.year ?? null;
  const M = lastUpdateData?.month ?? null;
  const partialYear = M !== null && M < 12;

  const resumedRows = annualRows;
  const importSummary = useMemo(() => createYearSummary(annualRows, 'import'), [annualRows]);
  const exportSummary = useMemo(() => createYearSummary(annualRows, 'export'), [annualRows]);

  const monthlySeries = useMemo(
    () => (Y && M && rawMonthlyImportData.length ? buildMonthlySeries(rawMonthlyImportData, Y, M) : []),
    [rawMonthlyImportData, Y, M],
  );
  const twelveMonth = useMemo(() => buildTwelveMonthSummary(monthlySeries), [monthlySeries]);
  const rollingChartData = useMemo(
    () => monthlySeries.filter(p => p.rollingKG !== null).map(p => ({ name: p.yearMonth, value: p.rollingKG as number })),
    [monthlySeries],
  );

  const since2010 = annualRows.filter(r => (r.yearNumeric ?? 0) >= 2010);
  const barData = (key: keyof ProcessedTradeData) => since2010.map(r => ({ name: r.year, value: (r[key] as number) || 0, kind: r.kind }));
  const priceData = since2010.map(r => ({ name: r.year, imp: r['Preço Médio Importação (US$/KG)'] ?? null, exp: r['Preço Médio Exportação (US$/KG)'] ?? null }));
  const balanceData = annualRows.filter(r => r.kind !== 'prevYtd').map(r => ({
    name: r.year, exp: r['Exportações (US$ FOB)'] || 0, impNeg: -(r['Importações (US$ FOB)'] || 0), balance: r['Balança Comercial (FOB)'] || 0,
  }));

  // KPIs: período mais recente vs mesmo período do ano anterior
  const kpi = useMemo(() => {
    if (!annualRows.length) return null;
    const cur = annualRows.find(r => r.kind === 'ytd') ?? [...annualRows].reverse().find(r => r.kind === 'full');
    if (!cur) return null;
    const base = cur.kind === 'ytd' ? annualRows.find(r => r.kind === 'prevYtd') : annualRows.find(r => r.kind === 'full' && r.yearNumeric === cur.yearNumeric! - 1);
    const d = (k: keyof ProcessedTradeData) => {
      const a = cur[k] as number | null, b = base?.[k] as number | null | undefined;
      return a !== null && a !== undefined && b ? ((a - b) / b) * 100 : null;
    };
    return { cur, base, d };
  }, [annualRows]);

  const ncmStr = ncmCode ? `NCM ${formatNcmCode(ncmCode)}` : '';
  const periodLabel = (r?: ProcessedTradeData) => r ? (r.kind === 'ytd' ? `jan–${getMonthNamePtBR(M!).slice(0, 3)}/${r.yearNumeric}` : String(r.yearNumeric)) : '';

  // ---------------------------------------------------------------------------
  // Análise de surto (inalterada)
  // ---------------------------------------------------------------------------
  const [surgeLoading, setSurgeLoading] = useState(false);
  const handleCalculateSurge = useCallback((config: SurgeAnalysisConfig) => {
    if (!rawMonthlyImportData.length) {
      setSurgeAnalysisResult({ error: 'Dados mensais não estão disponíveis. Verifique se a NCM foi carregada e se a API retornou dados.', currentPeriod: {} as any, previousPeriods: [], averagePreviousKg: 0, percentageChange: 0, isSurge: false });
      return;
    }
    setSurgeLoading(true);
    try {
      setSurgeAnalysisResult(analyzeImportSurge(rawMonthlyImportData, config.startYear, config.startMonth, config.endYear, config.endMonth, lastUpdateData));
    } catch (e) {
      setSurgeAnalysisResult({ error: `Erro ao calcular análise de surto: ${(e as Error).message}`, currentPeriod: {} as any, previousPeriods: [], averagePreviousKg: 0, percentageChange: 0, isSurge: false });
    }
    setSurgeLoading(false);
  }, [rawMonthlyImportData, lastUpdateData]);

  // ---------------------------------------------------------------------------
  // Definições de tabelas
  // ---------------------------------------------------------------------------
  const fullColumns: Column[] = [
    { key: 'year', header: 'Ano', LTR: true },
    { key: 'Exportações (US$ FOB)', header: 'Exp (US$ FOB)' },
    { key: 'Exportações (KG)', header: 'Exp (KG)' },
    { key: 'Exportações (Qtd Estatística)', header: 'Exp (Qtd Est.)' },
    { key: 'Importações (US$ FOB)', header: 'Imp (US$ FOB)' },
    { key: 'Importações (KG)', header: 'Imp (KG)' },
    { key: 'Importações (Qtd Estatística)', header: 'Imp (Qtd Est.)' },
    { key: 'Balança Comercial (FOB)', header: 'Balança (FOB)' },
    { key: 'Balança Comercial (KG)', header: 'Balança (KG)' },
    { key: 'Balança Comercial (Qtd Estatística)', header: 'Balança (Qtd Est.)' },
    { key: 'Importações (CIF USD)', header: 'Imp (CIF US$)' },
    { key: 'Importações (Frete USD)', header: 'Imp (Frete US$)' },
    { key: 'Importações (Seguro USD)', header: 'Imp (Seguro US$)' },
    { key: 'Preço Médio Exportação (US$ FOB/Ton)', header: 'P. médio Exp (US$/t)' },
    { key: 'Preço Médio Importação (US$ FOB/Ton)', header: 'P. médio Imp (US$/t)' },
    { key: 'Preço Médio Exportação (US$/Qtd Est)', header: 'P. médio Exp (US$/Qtd Est)' },
    { key: 'Preço Médio Importação (US$/Qtd Est)', header: 'P. médio Imp (US$/Qtd Est)' },
  ];
  const fullFormatters = Object.fromEntries(fullColumns.slice(1).map(c => [c.key, c.key.startsWith('Preço') ? formatDecimalPtBR : formatIntegerPtBR]));

  const resumedColumns: Column[] = [
    { key: 'year', header: 'Ano', LTR: true },
    { key: 'Exportações (US$ FOB)', header: 'Exp (US$ FOB)' },
    { key: 'Exportações (KG)', header: 'Exp (KG)' },
    { key: 'Importações (US$ FOB)', header: 'Imp (US$ FOB)' },
    { key: 'Importações (KG)', header: 'Imp (KG)' },
    { key: 'Balança Comercial (FOB)', header: 'Balança (FOB)' },
    { key: 'Balança Comercial (KG)', header: 'Balança (KG)' },
  ];
  const resumedFormatters = Object.fromEntries(resumedColumns.slice(1).map(c => [c.key, formatIntegerPtBR]));

  const summaryCols = (flow: 'import' | 'export'): Column[] => flow === 'import' ? [
    { key: 'Ano', header: 'Ano', LTR: true },
    { key: 'Importações (US$ FOB)', header: 'Imp (US$ FOB)' },
    { key: 'Var. (%) Imp (US$ FOB)', header: 'Var. %' },
    { key: 'Importações (kg)', header: 'Imp (kg)' },
    { key: 'Var. (%) Imp (kg)', header: 'Var. %' },
    { key: 'Preço médio Importação (US$ FOB/Ton)', header: 'Preço médio (US$/t)' },
    { key: 'Var. (%) Preço médio Imp', header: 'Var. %' },
  ] : [
    { key: 'Ano', header: 'Ano', LTR: true },
    { key: 'Exportações (US$ FOB)', header: 'Exp (US$ FOB)' },
    { key: 'Var. (%) Exp (US$ FOB)', header: 'Var. %' },
    { key: 'Exportações (kg)', header: 'Exp (kg)' },
    { key: 'Var. (%) Exp (kg)', header: 'Var. %' },
    { key: 'Preço médio Exp (US$ FOB/Ton)', header: 'Preço médio (US$/t)' },
    { key: 'Var. (%) Preço médio Exp', header: 'Var. %' },
  ];
  const summaryFormatters = (flow: 'import' | 'export') => {
    const cols = summaryCols(flow);
    return Object.fromEntries(cols.slice(1).map(c => [
      c.key,
      c.key.startsWith('Var') ? (v: number | null) => <VarCell value={v} /> : c.key.startsWith('Preço') ? formatDecimalPtBR : formatIntegerPtBR,
    ]));
  };

  const countryColumns: Column[] = [
    { key: 'country', header: 'País', LTR: true },
    { key: 'metricFOB', header: 'US$ FOB' },
    { key: 'representatividadeFOB', header: 'Part. FOB' },
    { key: 'metricKG', header: 'kg' },
    { key: 'representatividadeKG', header: 'Part. kg' },
  ];
  const countryFormatters = {
    metricFOB: formatIntegerPtBR,
    metricKG: formatIntegerPtBR,
    representatividadeFOB: (v: number) => `${formatDecimalPtBR(v)}%`,
    representatividadeKG: (v: number) => `${formatDecimalPtBR(v)}%`,
  };

  const twelveRows = twelveMonth?.blocks ?? [];
  const cgimColumns: Column[] = ['Departamento Responsável', 'Coordenação-Geral Responsável', 'Agrupamento', 'Setores', 'Subsetores', 'Produtos'].map(k => ({ key: k, header: k, LTR: true }));

  const nfeFullColumns: Column[] = [
    ['ano', 'Ano'], ['valor_producao', 'Valor produção'], ['qtd_tributavel_producao', 'Qtd produção'], ['valor_exp', 'Valor exp.'],
    ['qtd_tributavel_exp', 'Qtd exp.'], ['valor_cif_imp_dolar', 'Imp. CIF (US$)'], ['qtd_tributavel_imp', 'Qtd imp.'],
    ['cambio_dolar_medio', 'Câmbio médio'], ['valor_cif_imp_reais', 'Imp. CIF (R$)'], ['coeficiente_penetracao_imp_valor', 'Coef. pen. imp (valor)'],
    ['coeficiente_penetracao_imp_qtd', 'Coef. pen. imp (qtd)'], ['coeficiente_exp_valor', 'Coef. exp (valor)'], ['coeficiente_exp_qtd', 'Coef. exp (qtd)'],
    ['consumo_nacional_aparente_valor', 'CNA (valor)'], ['consumo_nacional_aparente_qtd', 'CNA (qtd)'], ['disponibilidade_total_valor', 'Disp. total (valor)'],
    ['disponibilidade_total_qtd', 'Disp. total (qtd)'], ['Vendas internas (KG)', 'Vendas internas (kg)'],
  ].map(([key, header]) => ({ key, header, LTR: key === 'ano' }));
  const nfeFullFormatters = Object.fromEntries(nfeFullColumns.slice(1).map(c => [c.key, /coef|cambio/.test(c.key) ? formatDecimalPtBR : formatIntegerPtBR]));
  const nfeSalesColumns: Column[] = ['ano', 'Vendas totais (Kg)', 'Δ Vendas totais (%)', 'Vendas internas (KG)', 'Δ Vendas internas (%)', 'Exportações (Kg)', 'Δ Exportações (%)'].map(k => ({ key: k, header: k === 'ano' ? 'Ano' : k, LTR: k === 'ano' }));
  const nfeCnaColumns: Column[] = ['ano', 'Vendas internas (KG)', 'Δ Vendas internas (%)', 'Importações (Kg)', 'Δ Importações (%)', 'CNA (Kg)', 'Δ CNA (%)', 'Coeficiente de importação (%)'].map(k => ({ key: k, header: k === 'ano' ? 'Ano' : k, LTR: k === 'ano' }));

  // ---------------------------------------------------------------------------
  // Exportação para Excel (notebook: Output_comex_*, Dados_importacoes_12_meses, Resumo_importacoes_12_meses, Dados_por_pais_*)
  // ---------------------------------------------------------------------------
  const handleExportExcel = () => {
    if (!ncmCode) return;
    try {
      const fullSheetCols: [string, string][] = [
        ['year', 'Ano'], ['Código NCM', 'Código NCM'], ['Descrição NCM', 'Descrição'], ['Unidade Estatística', 'Unidade Estatística'],
        ...fullColumns.slice(1).map(c => [c.key, c.key] as [string, string]),
      ];
      const pctOrNull = (v: unknown) => (typeof v === 'number' ? v / 100 : null);
      const summaryRows = (rows: typeof importSummary) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'kind').map(([k, v]) => [k, k.startsWith('Var') ? pctOrNull(v) : v])));
      const sheets = [
        { name: 'Consolidado', rows: annualRows, columns: fullSheetCols },
        { name: 'Resumido', rows: annualRows, columns: resumedColumns.map(c => [c.key, c.key === 'year' ? 'Ano' : c.key] as [string, string]) },
        { name: 'Resumo Importações', rows: summaryRows(importSummary) },
        { name: 'Resumo Exportações', rows: summaryRows(exportSummary) },
        { name: 'Importações mensais', rows: monthlySeries.map(p => ({ 'Mês': p.yearMonth, 'Importações (KG)': p.metricKG, 'Importações (US$ FOB)': p.metricFOB, 'Soma móvel 12 meses (KG)': p.rollingKG })) },
        { name: 'Soma período (12m)', rows: twelveRows.map(b => ({ 'Período': b.periodo, 'Data de Início': b.dataInicio, 'Data Final': b.dataFinal, 'Importação KG': b.importacaoKg })) },
        { name: 'Comparações 12m', rows: (twelveMonth?.comparisons ?? []).map(c => ({ 'Comparação': c.comparacao, 'Resultado': c.resultado })) },
        ...countryPeriods.flatMap(cp => [
          { name: `Exportações ${cp.label}`, rows: cp.exports.map(r => ({ 'País': r.country, 'US$ FOB': r.metricFOB, 'KG': r.metricKG, 'Representatividade FOB (%)': r.representatividadeFOB, 'Representatividade KG (%)': r.representatividadeKG })) },
          { name: `Importações ${cp.label}`, rows: cp.imports.map(r => ({ 'País': r.country, 'US$ FOB': r.metricFOB, 'KG': r.metricKG, 'Representatividade FOB (%)': r.representatividadeFOB, 'Representatividade KG (%)': r.representatividadeKG })) },
        ]),
        ...(cgimInfo ? [{ name: 'CGIM-DINTE', rows: [cgimInfo] }] : []),
        ...(entityContacts.length ? [{ name: 'Entidades', rows: entityContacts }] : []),
        ...(nfeForNcm.length ? [{ name: 'NF-e', rows: nfeForNcm }] : []),
      ];
      downloadWorkbook(`Comex_NCM_${ncmCode}_${Y ?? ''}${M ? pad2(M) : ''}.xlsx`, sheets);
    } catch (e) {
      alert(`Não foi possível gerar o Excel: ${(e as Error).message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // Ficha individual da NCM (Word) — notebook, célula 44
  // ---------------------------------------------------------------------------
  const reportCharts: ReportChartSpec[] = useMemo(() => {
    if (!ncmCode || !annualRows.length) return [];
    const list: ReportChartSpec[] = [];
    const y0 = since2010[0]?.yearNumeric ?? 2010;
    if (sectionVisibility.showAnnualCharts) {
      list.push(
        { id: 'impKg', heading: `Gráfico - Importações (KG) da ${ncmStr}`, kind: 'bar', flow: 'import', data: barData('Importações (KG)'), unitLabel: 'Importações (kg)' },
        { id: 'impFob', heading: `Gráfico - Importações (US$ FOB) da ${ncmStr}`, kind: 'bar', flow: 'import', data: barData('Importações (US$ FOB)'), unitLabel: 'Importações (US$ FOB)' },
        { id: 'expKg', heading: `Gráfico - Exportações (KG) da ${ncmStr}`, kind: 'bar', flow: 'export', data: barData('Exportações (KG)'), unitLabel: 'Exportações (kg)' },
        { id: 'expFob', heading: `Gráfico - Exportações (US$ FOB) da ${ncmStr}`, kind: 'bar', flow: 'export', data: barData('Exportações (US$ FOB)'), unitLabel: 'Exportações (US$ FOB)' },
        { id: 'prices', heading: `Gráfico - Preços Médios de Importação e Exportação (US$ FOB/kg) da ${ncmStr} (${y0}–${Y})`, kind: 'price', data: priceData },
      );
    }
    if (sectionVisibility.showRollingSumImportChart && rollingChartData.length) {
      list.push({ id: 'rolling', heading: `Gráfico - Importações Acumuladas nos Últimos 12 Meses (em KG) da ${ncmStr}`, kind: 'rolling', data: rollingChartData });
    }
    if (sectionVisibility.showAnnualCharts) {
      list.push({ id: 'balance', heading: `Gráfico - Exportação, Importação e Balança Comercial (${ncmStr})`, kind: 'balance', data: balanceData });
    }
    if (sectionVisibility.showCountryData) {
      countryPeriods.forEach((cp, idx) => {
        // Notebook: em dezembro, os treemaps do ano anterior ficam de fora da ficha
        if (idx === 0 && M === 12) return;
        const lbl = idx === 0 ? cp.label : `${Y} até o mês ${pad2(M!)}`;
        list.push(
          { id: `tm-imp-fob-${idx}`, heading: `Treemap - Origem das Importações (US$ FOB) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'import', metric: 'metricFOB', countries: cp.imports },
          { id: `tm-exp-fob-${idx}`, heading: `Treemap - Destino das Exportações (US$ FOB) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'export', metric: 'metricFOB', countries: cp.exports },
          { id: `tm-imp-kg-${idx}`, heading: `Treemap - Origem das Importações (KG) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'import', metric: 'metricKG', countries: cp.imports },
          { id: `tm-exp-kg-${idx}`, heading: `Treemap - Destino das Exportações (KG) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'export', metric: 'metricKG', countries: cp.exports },
        );
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncmCode, annualRows, rollingChartData, countryPeriods, sectionVisibility, Y, M]);

  const offscreenRef = useRef<HTMLDivElement>(null);
  const [renderOffscreen, setRenderOffscreen] = useState(false);

  const handleExportWord = () => {
    setExportError(null);
    setExportingWord(true);
    setRenderOffscreen(true);
  };

  useEffect(() => {
    if (!renderOffscreen) return;
    let cancelled = false;
    (async () => {
      try {
        await new Promise(r => setTimeout(r, 600)); // espera o Recharts desenhar
        const root = offscreenRef.current;
        if (!root || cancelled) return;
        const images: Record<string, { png: Uint8Array; width: number; height: number }> = {};
        for (const spec of reportCharts) {
          const el = root.querySelector(`[data-export-id="${spec.id}"]`) as HTMLElement | null;
          if (!el) continue;
          const w = Number(el.dataset.w), h = Number(el.dataset.h);
          images[spec.id] = { png: await elementToPng(el, w, h), width: w, height: h };
        }
        await generateWord(images);
      } catch (e) {
        console.error(e);
        setExportError(`Não foi possível gerar a ficha: ${(e as Error).message}`);
      } finally {
        if (!cancelled) { setRenderOffscreen(false); setExportingWord(false); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderOffscreen]);

  const generateWord = async (images: Record<string, { png: Uint8Array; width: number; height: number }>) => {
    if (!ncmCode) return;
    const { buildWordReport } = await import('./services/reportService.ts');
    type Item = import('./services/reportService.ts').ReportItem;
    const items: Item[] = [];
    const fi = (v: unknown) => (typeof v === 'number' ? formatIntegerPtBR(v) : '');
    const fd = (v: unknown) => (typeof v === 'number' ? formatDecimalPtBR(v) : '');
    const fp = (v: unknown) => (typeof v === 'number' ? formatPercentagePtBR(v) : '');

    if (sectionVisibility.showExcelAnalysis) {
      if (!cgimParsed) {
        items.push({ type: 'text', text: 'Planilha CGIM/DINTE não carregada: informações de competência e entidades não incluídas.', italic: true });
      } else {
        if (cgimInfo) items.push({ type: 'table', table: { columns: cgimColumns.map(c => c.header), rows: [cgimColumns.map(c => (cgimInfo as any)[c.key] ?? '')] } });
        else items.push({ type: 'text', text: 'Produto não é de competência da CGIM.' });
        if (entityContacts.length) {
          const cols = ['Aba', ...entityColumnsUsed];
          items.push({ type: 'table', table: { columns: cols, rows: entityContacts.map(r => cols.map(c => r[c] ?? '')) } });
        } else {
          items.push({ type: 'text', text: 'Ainda não há informação sobre a entidade responsável por esse produto (vide arquivo excel 20241011_NCMs-CGIM-DINTE.xlsx).' });
        }
      }
    }
    if (sectionVisibility.showResumedHistoricalData) {
      items.push({ type: 'table', table: {
        heading: 'Dados anuais resumidos',
        columns: ['Ano', 'Exportações (US$ FOB)', 'Exportações (KG)', 'Importações (US$ FOB)', 'Importações (KG)', 'Balança Comercial (FOB)', 'Balança Comercial (KG)'],
        rows: annualRows.map(r => [r.year, fi(r['Exportações (US$ FOB)']), fi(r['Exportações (KG)']), fi(r['Importações (US$ FOB)']), fi(r['Importações (KG)']), fi(r['Balança Comercial (FOB)']), fi(r['Balança Comercial (KG)'])]),
        source: SOURCE_COMEX,
      } });
    }
    if (sectionVisibility.showAnnualVariationSummary) {
      const tbl = (heading: string, flow: 'import' | 'export', rows: typeof importSummary) => {
        const cols = summaryCols(flow);
        const full = flow === 'import'
          ? ['Ano', 'Importações (US$ FOB)', 'Var. (%) Imp (US$ FOB)', 'Importações (kg)', 'Var. (%) Imp (kg)', 'Preço médio Importação (US$ FOB/Ton)', 'Var. (%) Preço médio Imp']
          : ['Ano', 'Exportações (US$ FOB)', 'Var. (%) Exp (US$ FOB)', 'Exportações (kg)', 'Var. (%) Exp (kg)', 'Preço médio Exp (US$ FOB/Ton)', 'Var. (%) Preço médio Exp'];
        items.push({ type: 'table', table: {
          heading, columns: full, source: SOURCE_COMEX,
          rows: rows.map(r => cols.map(c => c.key === 'Ano' ? r.Ano : c.key.startsWith('Var') ? fp(r[c.key]) : c.key.startsWith('Preço') ? fd(r[c.key]) : fi(r[c.key]))),
        } });
      };
      tbl('Quadro resumo das Exportações', 'export', exportSummary);
      tbl('Quadro resumo das Importações', 'import', importSummary);
    }
    if (sectionVisibility.showRollingSumImportChart && twelveMonth) {
      items.push({ type: 'table', table: {
        heading: 'Resumo das Importações dos 12 meses',
        columns: ['Período', 'Data de Início', 'Data Final', 'Importação KG'],
        rows: [
          ...twelveMonth.blocks.map(b => [b.periodo, b.dataInicio, b.dataFinal, fi(b.importacaoKg)]),
          ['', '', '', ''],
          ['Comparação', 'Resultado (%)', '', ''],
          ...twelveMonth.comparisons.map(c => [c.comparacao, c.resultado === null ? '' : formatPercentagePtBR(c.resultado * 100), '', '']),
        ],
        source: 'Fonte: Elaboração própria a partir dos dados de Comex Stat.',
      } });
    }
    reportCharts.forEach(spec => {
      const img = images[spec.id];
      if (img) items.push({ type: 'image', image: { heading: spec.heading, ...img } });
    });
    if (sectionVisibility.showExcelAnalysis) {
      items.push({ type: 'pagebreak' });
      if (!nfeAll) {
        items.push({ type: 'text', text: 'Planilha de NF-e não carregada: vendas da indústria nacional e consumo nacional aparente não incluídos.', italic: true });
      } else {
        items.push({ type: 'table', table: { heading: 'Vendas da Indústria Nacional', columns: nfeSalesColumns.map(c => c.header), rows: nfeSalesTable.map(r => nfeSalesColumns.map(c => (r as any)[c.key] ?? '')), source: SOURCE_NFE, emptyMessage: 'Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.' } });
        items.push({ type: 'table', table: { heading: 'Consumo Nacional Aparente', columns: nfeCnaColumns.map(c => c.header), rows: nfeCnaTable.map(r => nfeCnaColumns.map(c => (r as any)[c.key] ?? '')), source: SOURCE_NFE, emptyMessage: 'Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.' } });
      }
    }
    items.push({ type: 'pagebreak' });
    items.push({ type: 'text', text: `Relatório gerado em: ${new Date().toLocaleDateString('pt-BR')}` });

    const subtitle = `Unidade estatística: ${ncmDetails?.unit ?? '–'} · Dados Comex Stat atualizados até ${pad2(M!)}/${Y}`;
    const blob = await buildWordReport(`${ncmStr} - ${ncmDetails?.description ?? ''}`, subtitle, items);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ficha_individual_da_NCM_${ncmCode}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  const dataReady = !!ncmCode && annualRows.length > 0;
  const hasAnyTrade = annualRows.some(r => (r['Importações (US$ FOB)'] || 0) + (r['Exportações (US$ FOB)'] || 0) > 0);
  const nav = [
    { id: 'visao-geral', label: 'Visão geral', show: true },
    { id: 'series-anuais', label: 'Séries anuais', show: sectionVisibility.showAnnualCharts || sectionVisibility.showResumedHistoricalData || sectionVisibility.showAnnualVariationSummary || sectionVisibility.showFullHistoricalData },
    { id: 'doze-meses', label: '12 meses', show: sectionVisibility.showRollingSumImportChart },
    { id: 'surto', label: 'Surto', show: sectionVisibility.showSurgeAnalysis },
    { id: 'paises', label: 'Países', show: sectionVisibility.showCountryData },
    { id: 'planilhas', label: 'CGIM e NF-e', show: sectionVisibility.showExcelAnalysis },
  ].filter(n => n.show);

  const partialNote = partialYear && M ? (
    <span>
      <Swatch color={COLORS.impPrevYtd} label={`${Y! - 1} (jan–${getMonthNamePtBR(M).slice(0, 3)})`} />
      <Swatch color={COLORS.impYtd} label={`${Y} (jan–${getMonthNamePtBR(M).slice(0, 3)})`} />
      tons claros = períodos parciais
    </span>
  ) : undefined;
  const partialNoteExp = partialYear && M ? (
    <span>
      <Swatch color={COLORS.expPrevYtd} label={`${Y! - 1} (jan–${getMonthNamePtBR(M).slice(0, 3)})`} />
      <Swatch color={COLORS.expYtd} label={`${Y} (jan–${getMonthNamePtBR(M).slice(0, 3)})`} />
      tons claros = períodos parciais
    </span>
  ) : undefined;

  const cp = countryPeriods[Number(countryPeriodIdx)];

  return (
    <div className="min-h-screen">
      {/* Barra superior */}
      <header className="sticky top-0 z-30 bg-brand-900 text-white shadow">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3 md:px-8">
          <button onClick={() => window.location.reload()} className="flex items-center gap-2.5 text-left" title="Início">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-bold">CS</span>
            <span>
              <span className="block text-sm font-semibold leading-tight">Analisador Comex Stat NCM</span>
              <span className="block text-[11px] leading-tight text-white/60">Ficha individual da NCM</span>
            </span>
          </button>
          {ncmCode && <div className="ml-auto w-full md:w-auto md:min-w-[22rem]"><NcmInput onSubmit={handleNcmSubmit} loading={loading} /></div>}
        </div>
        {dataReady && (
          <nav className="border-t border-white/10 bg-brand-900/95">
            <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 md:px-8">
              {nav.map(n => (
                <a key={n.id} href={`#${n.id}`} className="whitespace-nowrap px-3 py-2 text-xs font-medium text-white/70 hover:text-white">{n.label}</a>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* Tela inicial */}
        {!ncmCode && (
          <div className="mx-auto mt-10 max-w-2xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Ficha de comércio exterior por NCM</h1>
            <p className="mt-3 text-slate-600">Séries históricas desde 2004, importações acumuladas em 12 meses, análise de surto, origem e destino por país e a Ficha individual em Word, com dados da API Comex Stat (MDIC).</p>
            <div className="mt-8 flex justify-center"><NcmInput onSubmit={handleNcmSubmit} loading={loading} variant="hero" /></div>
            <p className="mt-3 text-xs text-slate-500">Aceita o código com ou sem pontos: 7213.10.00 ou 72131000.</p>
          </div>
        )}

        {/* Progresso */}
        {ncmCode && loading && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-800">Consultando a API Comex Stat para {ncmStr}…</p>
            <p className="mb-3 text-xs text-slate-500">A API limita o número de consultas; pode levar até um minuto.</p>
            <ul className="space-y-1.5">
              {steps.map(s => (
                <li key={s.key} className="flex items-center gap-2 text-sm">
                  {s.status === 'done' ? <span className="text-emerald-600">✓</span>
                    : s.status === 'error' ? <span className="text-red-600">✕</span>
                    : s.status === 'running' ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                    : <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-slate-200" />}
                  <span className={s.status === 'pending' ? 'text-slate-400' : 'text-slate-700'}>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errors.map(e => <p key={e}>{e}</p>)}
            <p className="mt-1 text-red-600/80">As demais seções foram carregadas normalmente. Para tentar de novo, clique em Analisar.</p>
          </div>
        )}

        {/* Visão geral */}
        {ncmCode && ncmDetails && (
          <section id="visao-geral" className="mb-6">
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">{ncmStr}</p>
                <h1 className="mt-1 text-xl font-semibold leading-snug text-slate-900">{ncmDetails.description ?? 'Descrição indisponível'}</h1>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-500">
                  <span>Unidade estatística: <b className="font-medium text-slate-700">{ncmDetails.unit ?? '–'}</b></span>
                  {M && Y && <span>Dados atualizados até <b className="font-medium text-slate-700">{getMonthNamePtBR(M)} de {Y}</b>{lastUpdateData?.date && ` (atualização em ${lastUpdateData.date})`}</span>}
                  {cgimInfo?.['Coordenação-Geral Responsável'] && <span>Competência: <b className="font-medium text-slate-700">{cgimInfo['Coordenação-Geral Responsável']}</b></span>}
                </div>
              </div>
              {dataReady && (
                <div className="flex flex-wrap items-center gap-2">
                  <SectionPicker visibility={sectionVisibility} onChange={setSectionVisibility} />
                  <Button onClick={handleExportExcel} icon={Icons.excel}>Excel</Button>
                  <Button variant="primary" onClick={handleExportWord} disabled={exportingWord} icon={Icons.word}>
                    {exportingWord ? 'Gerando ficha…' : 'Ficha em Word'}
                  </Button>
                </div>
              )}
            </div>
            {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}

            {kpi && (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                <KpiCard label={`Importações · ${periodLabel(kpi.cur)}`} value={formatIntegerPtBR((kpi.cur['Importações (US$ FOB)'] || 0) / 1e6 >= 1 ? (kpi.cur['Importações (US$ FOB)'] || 0) / 1e6 : (kpi.cur['Importações (US$ FOB)'] || 0) / 1e3)} unit={(kpi.cur['Importações (US$ FOB)'] || 0) >= 1e6 ? 'US$ mi' : 'US$ mil'} delta={kpi.d('Importações (US$ FOB)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label={`Importações (kg) · ${periodLabel(kpi.cur)}`} value={formatIntegerPtBR((kpi.cur['Importações (KG)'] || 0) / 1e3)} unit="t" delta={kpi.d('Importações (KG)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label={`Exportações · ${periodLabel(kpi.cur)}`} value={formatIntegerPtBR((kpi.cur['Exportações (US$ FOB)'] || 0) / 1e6 >= 1 ? (kpi.cur['Exportações (US$ FOB)'] || 0) / 1e6 : (kpi.cur['Exportações (US$ FOB)'] || 0) / 1e3)} unit={(kpi.cur['Exportações (US$ FOB)'] || 0) >= 1e6 ? 'US$ mi' : 'US$ mil'} delta={kpi.d('Exportações (US$ FOB)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label={`Balança comercial · ${periodLabel(kpi.cur)}`} value={formatIntegerPtBR(Math.abs(kpi.cur['Balança Comercial (FOB)'] || 0) >= 1e6 ? (kpi.cur['Balança Comercial (FOB)'] || 0) / 1e6 : (kpi.cur['Balança Comercial (FOB)'] || 0) / 1e3)} unit={Math.abs(kpi.cur['Balança Comercial (FOB)'] || 0) >= 1e6 ? 'US$ mi' : 'US$ mil'} hint={(kpi.cur['Balança Comercial (FOB)'] || 0) >= 0 ? 'superávit' : 'déficit'} />
                <KpiCard label="Preço médio de importação" value={formatDecimalPtBR(kpi.cur['Preço Médio Importação (US$/KG)'] ?? null)} unit="US$/kg" delta={kpi.d('Preço Médio Importação (US$/KG)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label="Importações · últimos 12 meses" value={twelveMonth ? formatIntegerPtBR(twelveMonth.blocks[0].importacaoKg / 1e3) : '–'} unit="t" delta={twelveMonth?.comparisons[0].resultado != null ? twelveMonth.comparisons[0].resultado * 100 : null} deltaLabel="vs 12 meses anteriores" />
              </div>
            )}
            {dataReady && !hasAnyTrade && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A API não retornou importações nem exportações para esta NCM no período. Confira se o código está correto e vigente.</p>
            )}
          </section>
        )}

        {dataReady && (
          <>
            {/* Séries anuais */}
            {nav.some(n => n.id === 'series-anuais') && (
              <div id="series-anuais">
                {sectionVisibility.showAnnualCharts && (
                  <Section title="Gráficos anuais" description={`Desde ${since2010[0]?.yearNumeric ?? 2010}. Importações em laranja, exportações em azul.`}>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <ChartCard title={`Importações (kg) da ${ncmStr}`} legend={partialNote}><AnnualBarChart data={barData('Importações (KG)')} flow="import" unitLabel="Importações (kg)" /></ChartCard>
                      <ChartCard title={`Importações (US$ FOB) da ${ncmStr}`} legend={partialNote}><AnnualBarChart data={barData('Importações (US$ FOB)')} flow="import" unitLabel="Importações (US$ FOB)" /></ChartCard>
                      <ChartCard title={`Exportações (kg) da ${ncmStr}`} legend={partialNoteExp}><AnnualBarChart data={barData('Exportações (KG)')} flow="export" unitLabel="Exportações (kg)" /></ChartCard>
                      <ChartCard title={`Exportações (US$ FOB) da ${ncmStr}`} legend={partialNoteExp}><AnnualBarChart data={barData('Exportações (US$ FOB)')} flow="export" unitLabel="Exportações (US$ FOB)" /></ChartCard>
                      <ChartCard title="Preços médios de importação e exportação (US$ FOB/kg)"><PriceLineChart data={priceData} /></ChartCard>
                      <ChartCard title="Exportação, importação e balança comercial (US$ FOB)" subtitle="Importações representadas abaixo do zero"><TradeBalanceChart data={balanceData} /></ChartCard>
                    </div>
                  </Section>
                )}
                {sectionVisibility.showResumedHistoricalData && (
                  <Section title="Dados anuais resumidos" description="Linhas destacadas são períodos parciais (até o último mês disponível).">
                    <DataTable data={resumedRows} columns={resumedColumns} formatters={resumedFormatters} source={SOURCE_COMEX} />
                  </Section>
                )}
                {sectionVisibility.showAnnualVariationSummary && (
                  <Section title="Quadros resumo de variação anual" description={partialYear ? `O período parcial de ${Y} é comparado com o mesmo período de ${Y! - 1}.` : undefined}>
                    <div className="grid gap-4 xl:grid-cols-2">
                      <DataTable title="Quadro resumo das Exportações" data={exportSummary} columns={summaryCols('export')} formatters={summaryFormatters('export')} source={SOURCE_COMEX} />
                      <DataTable title="Quadro resumo das Importações" data={importSummary} columns={summaryCols('import')} formatters={summaryFormatters('import')} source={SOURCE_COMEX} />
                    </div>
                  </Section>
                )}
                {sectionVisibility.showFullHistoricalData && (
                  <Section title="Dados anuais completos" description="Todas as métricas desde 2004, incluindo CIF, frete, seguro e preços médios." defaultOpen={false}>
                    <DataTable data={annualRows} columns={fullColumns} formatters={fullFormatters} source={SOURCE_COMEX} compact />
                  </Section>
                )}
              </div>
            )}

            {/* 12 meses */}
            {sectionVisibility.showRollingSumImportChart && (
              <Section id="doze-meses" title="Importações acumuladas em 12 meses" description="Soma móvel de 12 meses (kg) e comparação de blocos de 12 meses (P1 a P5, P5 = mais recente).">
                {rollingChartData.length ? (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <ChartCard className="lg:col-span-2" title={`Importações acumuladas nos últimos 12 meses (kg) – ${ncmStr}`}>
                      <RollingSumChart data={rollingChartData} />
                    </ChartCard>
                    <div className="space-y-4">
                      <DataTable title="Soma por período de 12 meses" data={twelveRows} compact stickyFirstColumn={false}
                        columns={[{ key: 'periodo', header: 'Período', LTR: true }, { key: 'dataInicio', header: 'Início', LTR: true }, { key: 'dataFinal', header: 'Fim', LTR: true }, { key: 'importacaoKg', header: 'Importação (kg)' }]}
                        formatters={{ importacaoKg: formatIntegerPtBR }} />
                      <DataTable title="Comparações" data={twelveMonth?.comparisons ?? []} compact stickyFirstColumn={false}
                        columns={[{ key: 'comparacao', header: 'Comparação', LTR: true }, { key: 'resultado', header: 'Resultado' }]}
                        formatters={{ resultado: (v: number | null) => <VarCell value={v === null ? null : v * 100} /> }}
                        source="Fonte: Elaboração própria a partir dos dados de Comex Stat." />
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A API Comex Stat não retornou dados mensais de importação para esta NCM.</p>
                )}
              </Section>
            )}

            {/* Surto */}
            {sectionVisibility.showSurgeAnalysis && (
              <Section id="surto" title="Análise de surto de importação" description="Compara o volume importado no período escolhido com a média dos mesmos meses nos 3 anos anteriores.">
                <SurgeAnalysisConfigurator onCalculate={handleCalculateSurge} isLoading={surgeLoading} lastUpdateData={lastUpdateData} />
                <SurgeAnalysisDisplay result={surgeAnalysisResult} isLoading={surgeLoading} />
              </Section>
            )}

            {/* Países */}
            {sectionVisibility.showCountryData && countryPeriods.length > 0 && cp && (
              <Section
                id="paises"
                title="Origem das importações e destino das exportações"
                description="Participação de cada país. Cores mais escuras = maior participação."
                actions={
                  <>
                    <SegmentedControl value={countryPeriodIdx} onChange={setCountryPeriodIdx} options={countryPeriods.map((p, i) => ({ value: String(i) as '0' | '1', label: p.label }))} />
                    <SegmentedControl value={countryMetric} onChange={setCountryMetric} options={[{ value: 'metricFOB', label: 'US$ FOB' }, { value: 'metricKG', label: 'kg' }]} />
                  </>
                }
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard title={`Origem das importações · ${cp.label} (${countryMetric === 'metricFOB' ? 'US$ FOB' : 'kg'})`}>
                    <CountryTreemap data={cp.imports} flow="import" metric={countryMetric} />
                  </ChartCard>
                  <ChartCard title={`Destino das exportações · ${cp.label} (${countryMetric === 'metricFOB' ? 'US$ FOB' : 'kg'})`}>
                    <CountryTreemap data={cp.exports} flow="export" metric={countryMetric} />
                  </ChartCard>
                  <DataTable title={`Importações por país · ${cp.label}`} data={cp.imports} columns={countryColumns} formatters={countryFormatters} source={SOURCE_COMEX} compact />
                  <DataTable title={`Exportações por país · ${cp.label}`} data={cp.exports} columns={countryColumns} formatters={countryFormatters} source={SOURCE_COMEX} compact />
                </div>
              </Section>
            )}
          </>
        )}

        {/* Planilhas */}
        {ncmCode && !loading && sectionVisibility.showExcelAnalysis && (
          <Section id="planilhas" title="Competência CGIM, entidades e dados de NF-e" description="Envie as planilhas internas; elas são lidas apenas no seu navegador e não são enviadas a nenhum servidor.">
            <div className="grid gap-4 md:grid-cols-2">
              <FileUpload label="Planilha CGIM/DINTE" hint="Ex.: 20241011_NCMs-CGIM-DINTE.xlsx (aba NCMs-CGIM-DINTE e abas das entidades)" onFileUpload={handleCgimFile} loading={fileBusy === 'cgim'} fileName={cgimFile?.name} />
              <FileUpload label="Planilha de NF-e (SECEX/RFB)" hint="Ex.: dados_nfe_2016_2025_ajustado.xlsx (aba Dados)" onFileUpload={handleNfeFile} loading={fileBusy === 'nfe'} fileName={nfeFile?.name} />
            </div>
            {cgimParsed && (
              <>
                {cgimInfo
                  ? <DataTable title={`Competência CGIM/DINTE · ${ncmStr}`} data={[cgimInfo]} columns={cgimColumns} source={SOURCE_CGIM} stickyFirstColumn={false} />
                  : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Produto não é de competência da CGIM.</p>}
                {entityContacts.length
                  ? <DataTable title={`Entidades responsáveis · ${ncmStr}`} data={entityContacts} columns={[{ key: 'Aba', header: 'Aba', LTR: true }, ...entityColumnsUsed.map(c => ({ key: c, header: c, LTR: true }))]} source={SOURCE_CGIM} compact />
                  : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Não há informação sobre a entidade responsável por esse produto na planilha enviada.</p>}
                {cgimParsed.missingSheets.length > 0 && <p className="text-xs text-slate-500">Abas não encontradas na planilha: {cgimParsed.missingSheets.join(', ')}.</p>}
              </>
            )}
            {nfeAll && (
              nfeForNcm.length ? (
                <>
                  <DataTable title={`Vendas da indústria nacional · ${ncmStr}`} data={nfeSalesTable} columns={nfeSalesColumns} source={SOURCE_NFE} />
                  <DataTable title={`Consumo nacional aparente · ${ncmStr}`} data={nfeCnaTable} columns={nfeCnaColumns} source={SOURCE_NFE} />
                  <Section title="Dados completos de NF-e" defaultOpen={false}>
                    <DataTable data={nfeForNcm} columns={nfeFullColumns} formatters={nfeFullFormatters} source={SOURCE_NFE} compact />
                  </Section>
                </>
              ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.</p>
            )}
          </Section>
        )}
      </main>

      <footer className="mt-6 border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Dados da API Comex Stat (MDIC) e de planilhas enviadas pelo usuário. · © {new Date().getFullYear()} Analisador Comex Stat NCM
      </footer>

      {renderOffscreen && (
        <div ref={offscreenRef} aria-hidden style={{ position: 'fixed', left: -20000, top: 0, width: 1000, pointerEvents: 'none' }}>
          <ReportChartsOffscreen charts={reportCharts} />
        </div>
      )}
    </div>
  );
};

export default App;
