import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NcmInput from './components/NcmInput.tsx';
import DataTable, { Column, VarCell } from './components/DataTable.tsx';
import FileUpload from './components/FileUpload.tsx';
import ContactCards from './components/ContactCards.tsx';
import Section from './components/Section.tsx';
import SurgeAnalysisConfigurator from './components/SurgeAnalysisConfigurator.tsx';
import SurgeAnalysisDisplay from './components/SurgeAnalysisDisplay.tsx';
import { ChartCard, KpiCard, Button, SegmentedControl, SectionPicker, Swatch, Icons, MetricSelector, CountryPicker } from './components/ui.tsx';
import { AnnualBarChart, PriceLineChart, PricePoint, TradeBalanceChart, RollingSumChart, CountryTreemap, ShareStackedChart, MonthlyImportsChart, YearCompareChart, COLORS } from './components/charts/ChartKit.tsx';
import CestasView from './components/cestas/CestasView.tsx';
import { AlertasPage } from './components/cestas/AlertasRadar.tsx';
import MetodologiaAlertas from './components/cestas/MetodologiaAlertas.tsx';
import { mercadoDaNfe, salvarMercado } from './utils/mercado.ts';
import ReportChartsOffscreen, { ReportChartSpec } from './components/ReportChartsOffscreen.tsx';

import { fetchLastUpdateData, fetchNcmDescription, fetchNcmUnit, fetchComexData, fetchMonthlyComexData, fetchCountryYearData, fetchUfYearData } from './services/comexApiService.ts';
import { parseCgimDinteExcelForFiltering, parseNfeExcel, downloadWorkbook } from './services/excelService.ts';
import {
  processAnnualTradeData, sortAnnualRows, createYearSummary, buildMonthlySeries, buildTwelveMonthSummary,
  processNfeSalesData, processNfeCnaData, ensureVendasInternas, analyzeImportSurge,
} from './utils/dataProcessing.ts';
import { formatIntegerPtBR, formatDecimalPtBR, formatNcmCode, formatPercentagePtBR, getMonthNamePtBR, pad2, formatCompactPtBR } from './utils/formatting.ts';
import { elementToPng } from './utils/chartToImage.ts';
import {
  Metric, unitName, isKgUnit, metricShort, metricUnit, KG_UNIT_NOTE, countriesForYears, shareKey, tradingCountries,
  countryYearPrice, shareEvolution, countryColors, monthlyWindow, byYearLines, OTHERS,
} from './utils/fichaExtras.ts';
import {
  Comparacao, opcoesComparacao, registrosDaComparacao, paresPorPais, dadosBolhas, decomposicao, linhasCascata, calendario,
  concentracao, penetracao, linhasUf, UfRecord, faixaHhi,
} from './utils/analiticas.ts';
import {
  PrecoVolumeChart, CascataChart, EfeitosChart, CalendarioHeatmap, ConcentracaoChart, HhiChart, PenetracaoChart, MapaUf, RankingUfChart, LOCAIS_BR,
} from './components/charts/AnaliticasKit.tsx';
import {
  LastUpdateData, NcmDetails, ProcessedTradeData, ApiFilter, Period, CountryPeriodData, CgimNcmInfo,
  EntityContactInfo, NfeData, SectionVisibility, MonthlyComexStatRecord, SurgeAnalysisConfig, SurgeAnalysisResult, CountryYearRecord,
} from './types.ts';

const initialSectionVisibility: SectionVisibility = {
  showAnnualCharts: true,
  showResumedHistoricalData: true,
  showAnnualVariationSummary: true,
  showFullHistoricalData: true,
  showRollingSumImportChart: true,
  showSurgeAnalysis: true,
  showCountryData: true,
  showUfData: true,
  showExcelAnalysis: true,
};

const SOURCE_COMEX = 'Fonte: Comex Stat/MDIC. Elaboração própria.';
const SOURCE_NFE = 'Fonte: Dados da Nota Fiscal Eletrônica (NF-e) da RFB, disponibilizados pela SECEX.';
const EXP_IMP = ["metricFOB", "metricKG", "metricStatistic"];
const IMP_METRICS = ["metricFOB", "metricFreight", "metricInsurance", "metricCIF", "metricKG", "metricStatistic"];

type StepStatus = 'pending' | 'running' | 'done' | 'error';
interface Step { key: string; label: string; status: StepStatus }

type CgimParsed = Awaited<ReturnType<typeof parseCgimDinteExcelForFiltering>>;

type Mode = 'ficha' | 'cestas' | 'alertas' | 'metodologia';
const modeFromHash = (): Mode => {
  const h = window.location.hash;
  return h.startsWith('#/metodologia') ? 'metodologia' : h.startsWith('#/alertas') ? 'alertas' : h.startsWith('#/cestas') ? 'cestas' : 'ficha';
};
const alertEntityFromHash = () => window.location.hash.match(/^#\/alertas\/([A-Z0-9_]+)/)?.[1];

const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>(modeFromHash);
  const [alertEntity, setAlertEntity] = useState<string | undefined>(alertEntityFromHash);
  const [ncmCode, setNcmCode] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const loading = steps.some(s => s.status === 'running' || s.status === 'pending');
  const requestId = useRef(0);
  const currentNcmRef = useRef<string | null>(null);

  const [lastUpdateData, setLastUpdateData] = useState<LastUpdateData | null>(null);
  const [ncmDetails, setNcmDetails] = useState<NcmDetails | null>(null);
  const [annualRows, setAnnualRows] = useState<ProcessedTradeData[]>([]);
  const [rawMonthlyImportData, setRawMonthlyImportData] = useState<MonthlyComexStatRecord[]>([]);
  const [countryPeriods, setCountryPeriods] = useState<CountryPeriodData[]>([]);
  // País × ano (desde 2010), consultado uma vez por NCM e reaproveitado pelos seletores
  const [countryYears, setCountryYears] = useState<{ imp: CountryYearRecord[]; exp: CountryYearRecord[]; impPrev: CountryYearRecord[]; expPrev: CountryYearRecord[] } | null>(null);

  const [cgimFile, setCgimFile] = useState<File | null>(null);
  const [nfeFile, setNfeFile] = useState<File | null>(null);
  const [cgimParsed, setCgimParsed] = useState<CgimParsed | null>(null);
  const [nfeAll, setNfeAll] = useState<NfeData[] | null>(null);
  const [fileBusy, setFileBusy] = useState<'cgim' | 'nfe' | null>(null);

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(initialSectionVisibility);
  const [surgeAnalysisResult, setSurgeAnalysisResult] = useState<SurgeAnalysisResult | null>(null);
  const [countryPeriodIdx, setCountryPeriodIdx] = useState<'0' | '1'>('1');
  const [countryMetric, setCountryMetric] = useState<Metric>('metricFOB');
  const [ufData, setUfData] = useState<{ anual: UfRecord[]; ateMes: UfRecord[] } | null>(null);
  const [comparacao, setComparacao] = useState<Comparacao>('ytd');
  const [priceCountry, setPriceCountry] = useState<string | null>(null);
  const [shareMetric, setShareMetric] = useState<Metric>('metricFOB');
  const [monthMetric, setMonthMetric] = useState<Metric>('metricKG');
  const [monthMode, setMonthMode] = useState<'serie' | 'anos'>('serie');
  const [exportingWord, setExportingWord] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const setStep = (key: string, status: StepStatus) => setSteps(prev => prev.map(s => (s.key === key ? { ...s, status } : s)));

  // ---------------------------------------------------------------------------
  // Carregamento dos dados da API
  // ---------------------------------------------------------------------------
  const handleNcmSubmit = async (code: string) => {
    const myId = ++requestId.current;
    currentNcmRef.current = code;
    if (window.location.hash !== `#/ncm/${code}`) window.history.replaceState(null, '', `#/ncm/${code}`);
    setMode('ficha');
    const alive = () => requestId.current === myId;
    setNcmCode(code);
    setErrors([]);
    setLastUpdateData(null);
    setNcmDetails(null);
    setAnnualRows([]);
    setRawMonthlyImportData([]);
    setCountryPeriods([]);
    setCountryYears(null);
    setUfData(null);
    setPriceCountry(null);
    setSurgeAnalysisResult(null);
    setSteps([
      { key: 'basic', label: 'Descrição, unidade e data de atualização', status: 'running' },
      { key: 'annual', label: 'Séries anuais desde 2004', status: 'pending' },
      { key: 'monthly', label: 'Importações mensais desde 2019', status: 'pending' },
      { key: 'country', label: 'Dados por país e ano desde 2010', status: 'pending' },
      { key: 'uf', label: 'Importações por UF', status: 'pending' },
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
        // A API aplica o intervalo de meses a cada ano: para anos completos o período precisa ir até dezembro
        // (como no notebook). O ano corrente vem naturalmente só até o último mês disponível.
        const full: Period = { from: '2004-01', to: `${Y}-12` };
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
        const data = await fetchMonthlyComexData('import', { from: '2019-01', to: `${Y}-${MM}` }, filters, ['metricFOB', 'metricKG', 'metricStatistic']);
        if (!alive()) return;
        setRawMonthlyImportData(data);
        setStep('monthly', 'done');
      } catch (e) { fail('monthly', 'Falha ao carregar os dados mensais de importação.', e); }
    })();

    const countries = (async () => {
      setStep('country', 'running');
      try {
        // Uma consulta por fluxo traz país × ano desde 2010 (anos completos até dezembro; o ano corrente até o último mês).
        // Com o ano incompleto, o mesmo período do ano anterior por país completa a série de preços por país.
        const allYears: Period = { from: '2010-01', to: `${Y}-12` };
        const prevYtd: Period = { from: `${Y - 1}-01`, to: `${Y - 1}-${MM}` };
        const [ex, im, exPrev, imPrev] = await Promise.all([
          fetchCountryYearData(code, 'export', allYears),
          fetchCountryYearData(code, 'import', allYears),
          M < 12 ? fetchCountryYearData(code, 'export', prevYtd) : Promise.resolve([]),
          M < 12 ? fetchCountryYearData(code, 'import', prevYtd) : Promise.resolve([]),
        ]);
        if (!alive()) return;
        setCountryYears({ imp: im, exp: ex, impPrev: imPrev, expPrev: exPrev });
        setCountryPeriods([
          { label: String(Y - 1), period: { from: `${Y - 1}-01`, to: `${Y - 1}-12` }, exports: countriesForYears(ex, [Y - 1]), imports: countriesForYears(im, [Y - 1]) },
          { label: M < 12 ? `${Y} (até ${getMonthNamePtBR(M)})` : String(Y), period: { from: `${Y}-01`, to: `${Y}-${MM}` }, exports: countriesForYears(ex, [Y]), imports: countriesForYears(im, [Y]) },
        ]);
        setStep('country', 'done');
      } catch (e) { fail('country', 'Falha ao carregar os dados por país.', e); }
    })();

    const ufs = (async () => {
      setStep('uf', 'running');
      try {
        // Importações por UF: os dois últimos anos completos e o ano corrente numa consulta, mais o mesmo período do ano anterior
        const [anual, ateMes] = await Promise.all([
          fetchUfYearData(code, 'import', { from: `${Y - 2}-01`, to: `${Y}-12` }),
          M < 12 ? fetchUfYearData(code, 'import', { from: `${Y - 1}-01`, to: `${Y - 1}-${MM}` }) : Promise.resolve([]),
        ]);
        if (!alive()) return;
        setUfData({ anual, ateMes });
        setStep('uf', 'done');
      } catch (e) { fail('uf', 'Falha ao carregar as importações por UF.', e); }
    })();

    await Promise.all([annual, monthly, countries, ufs]);
  };

  // Navegação: #/cestas abre as cestas; #/ncm/XXXXXXXX abre a ficha da NCM
  useEffect(() => {
    const onHash = () => {
      setMode(modeFromHash());
      setAlertEntity(alertEntityFromHash());
      const m = window.location.hash.match(/^#\/ncm\/(\d{8})/);
      if (m && m[1] !== currentNcmRef.current) handleNcmSubmit(m[1]);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { currentNcmRef.current = ncmCode; }, [ncmCode]);
  const goTo = (m: Mode) => { window.location.hash = m === 'cestas' ? '#/cestas' : m === 'alertas' ? '#/alertas' : (ncmCode ? `#/ncm/${ncmCode}` : '#/'); window.scrollTo(0, 0); };
  const openNcmFromCesta = (code: string) => { window.location.hash = `#/ncm/${code}`; window.scrollTo(0, 0); };

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
      const rows = await parseNfeExcel(file);
      setNfeAll(rows);
      salvarMercado(mercadoDaNfe(rows), file.name); // também alimenta o radar de alertas (fica só no navegador)
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
  const priceData: PricePoint[] = useMemo(() => since2010.map(r => {
    const p: PricePoint = {
      name: r.year, imp: r['Preço Médio Importação (US$/KG)'] ?? null, exp: r['Preço Médio Exportação (US$/KG)'] ?? null,
      impKg: r['Importações (KG)'] || 0, expKg: r['Exportações (KG)'] || 0,
    };
    if (priceCountry && countryYears && r.yearNumeric) {
      const prev = r.kind === 'prevYtd';
      const ci = countryYearPrice(prev ? countryYears.impPrev : countryYears.imp, priceCountry, r.yearNumeric);
      const ce = countryYearPrice(prev ? countryYears.expPrev : countryYears.exp, priceCountry, r.yearNumeric);
      Object.assign(p, { impC: ci.price, impCKg: ci.kg, expC: ce.price, expCKg: ce.kg });
    }
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [annualRows, priceCountry, countryYears]);
  const priceCountries = useMemo(() => countryYears ? tradingCountries(countryYears.imp, countryYears.exp, 2010) : [], [countryYears]);

  // Unidade estatística (lida dos dados) e visões por país / mensais
  const uName = unitName(ncmDetails?.unit);
  const kgUnit = isKgUnit(ncmDetails?.unit);
  const SHARE_FROM = 2020;
  const shareImp = useMemo(() => countryYears && Y ? shareEvolution(countryYears.imp, shareMetric, SHARE_FROM, Y, partialYear) : null, [countryYears, shareMetric, Y, partialYear]);
  const shareExp = useMemo(() => countryYears && Y ? shareEvolution(countryYears.exp, shareMetric, SHARE_FROM, Y, partialYear) : null, [countryYears, shareMetric, Y, partialYear]);
  const shareColors = useMemo(() => countryColors(shareImp?.countries ?? [], shareExp?.countries ?? []), [shareImp, shareExp]);
  const monthPoints = useMemo(() => Y && M && rawMonthlyImportData.length ? monthlyWindow(rawMonthlyImportData, monthMetric, Y, M) : [], [rawMonthlyImportData, monthMetric, Y, M]);
  const monthByYear = useMemo(() => byYearLines(monthPoints), [monthPoints]);
  const monthPartialYears = useMemo(() => monthByYear.years.filter(y => monthPoints.filter(p => p.year === y).length < 12), [monthByYear, monthPoints]);
  const monthTitle = `Evolução mensal das importações (últimos 48 meses)`;
  const monthRange = monthPoints.length ? `${monthPoints[0].name} a ${monthPoints[monthPoints.length - 1].name}` : '';
  const partialFootnote = partialYear && M ? `* até o mês ${M} (${getMonthNamePtBR(M)})` : '';

  // ---- Visões analíticas (bolhas, decomposição, calendário, concentração, penetração, UF) ----
  const compOpcoes = useMemo(() => (Y && M ? opcoesComparacao(Y, M) : []), [Y, M]);
  const comp = compOpcoes.find(o => o.chave === comparacao) ?? compOpcoes[0];
  const paresImp = useMemo(() => {
    if (!countryYears || !comp || !Y || !M) return [];
    const r = registrosDaComparacao(comp.chave, Y, M, countryYears.imp, countryYears.impPrev);
    return paresPorPais(r.anterior, r.atual);
  }, [countryYears, comp, Y, M]);
  const bolhas = useMemo(() => dadosBolhas(paresImp, ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']), [paresImp]);
  const decomp = useMemo(() => decomposicao(paresImp), [paresImp]);
  const cascata = useMemo(() => linhasCascata(decomp), [decomp]);
  const cal = useMemo(() => (Y && M && rawMonthlyImportData.length ? calendario(rawMonthlyImportData, monthMetric, 2019, Y, M) : null), [rawMonthlyImportData, monthMetric, Y, M]);
  const conc = useMemo(() => (countryYears && Y ? concentracao(countryYears.imp, shareMetric, 2010, Y, partialYear) : []), [countryYears, shareMetric, Y, partialYear]);
  const pen = useMemo(() => penetracao(nfeForNcm), [nfeForNcm]);
  const ufs = useMemo(() => {
    if (!ufData || !comp || !Y || !M) return null;
    const rec = (y: number, base: UfRecord[]) => base.filter(r => r.year === y);
    const [ant, atu] = comp.chave === 'ytd' && M < 12
      ? [rec(Y - 1, ufData.ateMes), rec(Y, ufData.anual)]
      : M < 12 ? [rec(Y - 2, ufData.anual), rec(Y - 1, ufData.anual)] : [rec(Y - 1, ufData.anual), rec(Y, ufData.anual)];
    return linhasUf(ant, atu, LOCAIS_BR);
  }, [ufData, comp, Y, M]);
  const ComparacaoSelector = () => compOpcoes.length > 1 ? (
    <SegmentedControl<Comparacao> value={comp?.chave ?? 'ano'} onChange={setComparacao} options={compOpcoes.map(o => ({ value: o.chave, label: o.rotulo }))} />
  ) : comp ? <span className="text-xs text-slate-500">{comp.rotulo}</span> : null;
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
  const periodLabel = (r?: ProcessedTradeData) => r ? (r.kind !== 'full' ? `jan–${getMonthNamePtBR(M!).slice(0, 3)}/${r.yearNumeric}` : String(r.yearNumeric)) : '';
  const money = (v: number | undefined) => {
    const x = v || 0, abs = Math.abs(x);
    const [div, unit] = abs >= 1e9 ? [1e9, 'US$ bi'] : abs >= 1e6 ? [1e6, 'US$ mi'] : [1e3, 'US$ mil'];
    const n = x / div;
    return { value: new Intl.NumberFormat('pt-BR', { maximumFractionDigits: Math.abs(n) < 100 ? 1 : 0 }).format(n), unit };
  };
  const tons = (kg: number | undefined) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: (kg || 0) < 1e5 ? 1 : 0 }).format((kg || 0) / 1e3);

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

  // Tabela por país: a métrica escolhida e sua participação primeiro; as outras duas métricas como referência
  const METRIC_HEAD: Record<Metric, string> = { metricFOB: 'US$ FOB', metricKG: 'kg líquido', metricStatistic: `Qtd. estatística (${uName})` };
  const countryColumns: Column[] = [
    { key: 'country', header: 'País', LTR: true },
    { key: countryMetric, header: METRIC_HEAD[countryMetric] },
    { key: shareKey(countryMetric), header: 'Participação' },
    ...(['metricFOB', 'metricKG', 'metricStatistic'] as Metric[]).filter(m => m !== countryMetric).map(m => ({ key: m, header: METRIC_HEAD[m] })),
  ];
  const pct1 = (v: number | null | undefined) => (typeof v === 'number' ? `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%` : '–');
  const countryFormatters = {
    metricFOB: formatIntegerPtBR,
    metricKG: formatIntegerPtBR,
    metricStatistic: formatIntegerPtBR,
    representatividadeFOB: pct1,
    representatividadeKG: pct1,
    representatividadeStat: pct1,
  };
  const sortByMetric = (rows: CountryPeriodData['imports']) => [...rows].filter(r => (r[countryMetric] ?? 0) > 0).sort((a, b) => (b[countryMetric] ?? 0) - (a[countryMetric] ?? 0));

  // Alteração 3: tabela país × ano com as participações
  const shareTable = (evo: NonNullable<typeof shareImp>) => ({
    columns: ['País', ...evo.years.map(y => y.name)],
    rows: evo.countries.map(c => [c, ...evo.years.map(y => (y.empty ? 'sem registro' : pct1(y[c] as number)))]),
  });

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
        { name: 'Importações 48 meses', rows: monthPoints.map(p => ({ 'Mês': p.name, [`Importações (${metricShort(monthMetric, ncmDetails?.unit)})`]: p.value, 'Mesmo mês do ano anterior': p.prevYear, 'Variação (%)': p.yoy === null ? null : p.yoy / 100 })) },
        ...(countryYears ? [
          { name: 'Países por ano', rows: [
            ...countryYears.imp.map(r => ({ 'Fluxo': 'Importação', 'Ano': r.year, 'País': r.country, 'US$ FOB': r.metricFOB, 'KG líquido': r.metricKG, [`Qtd. estatística (${uName})`]: r.metricStatistic })),
            ...countryYears.exp.map(r => ({ 'Fluxo': 'Exportação', 'Ano': r.year, 'País': r.country, 'US$ FOB': r.metricFOB, 'KG líquido': r.metricKG, [`Qtd. estatística (${uName})`]: r.metricStatistic })),
          ].sort((a, b) => a['Fluxo'].localeCompare(b['Fluxo']) || a['Ano'] - b['Ano'] || b['US$ FOB'] - a['US$ FOB']) },
        ] : []),
        ...(comp && decomp.linhas.length ? [{ name: 'Decomposição por país', rows: decomp.linhas.map(l => ({
          'País': l.pais, [`${comp.anterior} (US$ FOB)`]: l.v0, [`${comp.atual} (US$ FOB)`]: l.v1, [`${comp.anterior} (kg)`]: l.q0, [`${comp.atual} (kg)`]: l.q1,
          'Variação (US$)': l.delta, 'Efeito quantidade (US$)': l.efeitoQuantidade, 'Efeito preço (US$)': l.efeitoPreco,
          [`Preço ${comp.anterior} (US$/kg)`]: l.q0 > 0 ? l.v0 / l.q0 : null, [`Preço ${comp.atual} (US$/kg)`]: l.q1 > 0 ? l.v1 / l.q1 : null,
        })) }] : []),
        ...(conc.length ? [{ name: 'Concentração de origem', rows: conc.map(c => ({ 'Ano': c.name, 'Maior fornecedor': c.maiorPais, 'Participação do maior (%)': c.maior, 'Participação dos 3 maiores (%)': c.tres, 'HHI': c.hhi, 'Concentração': faixaHhi(c.hhi) })) }] : []),
        ...(ufs && comp ? [{ name: 'Importações por UF', rows: ufs.linhas.map(l => ({ 'UF': l.uf, [`${comp.anterior} (US$ FOB)`]: l.v0, [`${comp.atual} (US$ FOB)`]: l.v1, [`${comp.atual} (kg)`]: l.q1, 'Participação (%)': l.part, 'Variação (%)': l.varPct })) }] : []),
        ...(cal ? [{ name: 'Calendário mensal', rows: cal.anos.map((a, i) => Object.fromEntries([['Ano', a], ...['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, j) => [m, cal.valores[i][j]])])) }] : []),
        { name: 'Soma período (12m)', rows: twelveRows.map(b => ({ 'Período': b.periodo, 'Data de Início': b.dataInicio, 'Data Final': b.dataFinal, 'Importação KG': b.importacaoKg })) },
        { name: 'Comparações 12m', rows: (twelveMonth?.comparisons ?? []).map(c => ({ 'Comparação': c.comparacao, 'Resultado': c.resultado })) },
        ...countryPeriods.flatMap(cp => [
          { name: `Exportações ${cp.label}`, rows: cp.exports.map(r => ({ 'País': r.country, 'US$ FOB': r.metricFOB, 'KG': r.metricKG, 'Qtd. estatística': r.metricStatistic, 'Representatividade FOB (%)': r.representatividadeFOB, 'Representatividade KG (%)': r.representatividadeKG, 'Representatividade Qtd. estatística (%)': r.representatividadeStat })) },
          { name: `Importações ${cp.label}`, rows: cp.imports.map(r => ({ 'País': r.country, 'US$ FOB': r.metricFOB, 'KG': r.metricKG, 'Qtd. estatística': r.metricStatistic, 'Representatividade FOB (%)': r.representatividadeFOB, 'Representatividade KG (%)': r.representatividadeKG, 'Representatividade Qtd. estatística (%)': r.representatividadeStat })) },
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
        { id: 'prices', heading: `Gráfico - Preços Médios de Importação e Exportação (US$ FOB/kg) da ${ncmStr} (${y0}–${Y})${priceCountry ? ` – todos os países e ${priceCountry}` : ' – todos os países'}`, kind: 'price', data: priceData, country: priceCountry },
      );
    }
    if (sectionVisibility.showRollingSumImportChart && rollingChartData.length) {
      list.push({ id: 'rolling', heading: `Gráfico - Importações Acumuladas nos Últimos 12 Meses (em KG) da ${ncmStr}`, kind: 'rolling', data: rollingChartData });
      if (monthPoints.length) {
        const heading = `Gráfico - ${monthTitle} (${metricShort(monthMetric, ncmDetails?.unit)}) da ${ncmStr}, ${monthRange}${monthMode === 'anos' ? ' – comparação por ano' : ''}`;
        list.push(monthMode === 'serie'
          ? { id: 'monthly48', heading, kind: 'monthly', points: monthPoints, unit: metricUnit(monthMetric, ncmDetails?.unit) }
          : { id: 'monthly48', heading, kind: 'yearCompare', years: monthByYear.years, data: monthByYear.data, unit: metricUnit(monthMetric, ncmDetails?.unit), partialYears: monthPartialYears,
              source: `${SOURCE_COMEX} * ano incompleto na janela de 48 meses.` });
      }
      if (cal) {
        list.push({ id: 'calendario', kind: 'calendario', cal, unit: metricUnit(monthMetric, ncmDetails?.unit), w: 960, h: Math.round(26 + cal.anos.length * 30 + 46),
          heading: `Gráfico - Calendário mensal das importações (${metricShort(monthMetric, ncmDetails?.unit)}) da ${ncmStr}, 2019–${Y}`,
          source: `${SOURCE_COMEX} Contorno escuro: mês acima da média + 2 desvios-padrão do período.` });
      }
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
        // Unidade estatística: entra na ficha quando é a métrica escolhida na tela
        if (countryMetric === 'metricStatistic') {
          const u = metricUnit('metricStatistic', ncmDetails?.unit);
          list.push(
            { id: `tm-imp-st-${idx}`, heading: `Treemap - Origem das Importações (unidade estatística: ${u}) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'import', metric: 'metricStatistic', unitLabel: u, countries: cp.imports },
            { id: `tm-exp-st-${idx}`, heading: `Treemap - Destino das Exportações (unidade estatística: ${u}) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'export', metric: 'metricStatistic', unitLabel: u, countries: cp.exports },
          );
        }
      });
      if (shareImp && shareExp) {
        const m = metricShort(shareMetric, ncmDetails?.unit);
        const src = `${SOURCE_COMEX}${partialFootnote ? ` ${partialFootnote}` : ''}`;
        ([['import', 'Origem das Importações', 'da origem das importações', shareImp], ['export', 'Destino das Exportações', 'do destino das exportações', shareExp]] as const).forEach(([flow, t, tt, evo]) => {
          const tb = shareTable(evo);
          list.push({
            id: `share-${flow}`, kind: 'share', flow, evo, colors: shareColors, unit: metricUnit(shareMetric, ncmDetails?.unit), source: src,
            heading: `Gráfico - Evolução ${tt} por país, participação % (${m}), ${SHARE_FROM}–${Y}${partialYear ? '*' : ''} (${ncmStr})`,
            tableAfter: evo.hasData ? { heading: `${t}: participação por ano (${m})`, columns: tb.columns, rows: tb.rows, source: src } : undefined,
          });
        });
      }
      if (comp && countryYears && bolhas.pontos.length) {
        const src = `${SOURCE_COMEX} Períodos comparados: ${comp.anterior} e ${comp.atual}.`;
        list.push(
          { id: 'bolhas', kind: 'bolhas', pontos: bolhas.pontos, precoMedio: bolhas.precoMedio1, rotulo0: comp.anterior, rotulo1: comp.atual, h: 520, source: src,
            heading: `Gráfico - Preço × volume das importações por país de origem, ${comp.anterior} → ${comp.atual} (${ncmStr})` },
          { id: 'cascata', kind: 'cascata', rows: cascata, h: 440, source: src,
            heading: `Gráfico - Decomposição da variação do valor importado (US$ FOB) por país, ${comp.anterior} → ${comp.atual} (${ncmStr})` },
          { id: 'efeitos', kind: 'efeitos', linhas: decomp.linhas, h: Math.max(260, 60 + decomp.linhas.length * 34), source: src,
            heading: `Gráfico - Efeito quantidade × efeito preço por país, ${comp.anterior} → ${comp.atual} (${ncmStr})`,
            tableAfter: {
              heading: 'Decomposição da variação por país (US$ FOB)', source: src,
              columns: ['País', comp.anterior, comp.atual, 'Variação', 'Efeito quantidade', 'Efeito preço'],
              rows: decomp.linhas.map(l => [l.pais, formatIntegerPtBR(l.v0), formatIntegerPtBR(l.v1), formatIntegerPtBR(l.delta), formatIntegerPtBR(l.efeitoQuantidade), formatIntegerPtBR(l.efeitoPreco)]),
            } },
        );
      }
      if (conc.length) {
        const m = metricShort(shareMetric, ncmDetails?.unit);
        const src = `${SOURCE_COMEX}${partialFootnote ? ` ${partialFootnote}` : ''}`;
        list.push(
          { id: 'concentracao', kind: 'concentracao', data: conc, source: src, heading: `Gráfico - Concentração da origem das importações: maior fornecedor e 3 maiores (${m}) (${ncmStr})` },
          { id: 'hhi', kind: 'hhi', data: conc, source: src, heading: `Gráfico - Índice de concentração (HHI) da origem das importações (${m}) (${ncmStr})` },
        );
      }
    }
    if (sectionVisibility.showUfData && ufs && comp && ufs.linhas.some(l => l.v1 > 0)) {
      const src = `${SOURCE_COMEX} UF do domicílio fiscal do importador. Mapa: @svg-maps/brazil (CC BY 4.0).`;
      list.push(
        { id: 'mapaUf', kind: 'mapaUf', linhas: ufs.linhas, w: 620, h: 690, source: src, heading: `Mapa - Participação das UFs nas importações (US$ FOB), ${comp.atual} (${ncmStr})` },
        { id: 'rankingUf', kind: 'rankingUf', linhas: ufs.linhas, h: Math.max(280, 40 + Math.min(10, ufs.linhas.length) * 34), source: `${SOURCE_COMEX} Entre parênteses, variação sobre ${comp.anterior}.`,
          heading: `Gráfico - 10 maiores UFs importadoras (US$ FOB), ${comp.atual} (${ncmStr})` },
      );
    }
    if (pen.length) {
      list.push({ id: 'penetracao', kind: 'penetracao', data: pen, grupo: 'nfe', source: SOURCE_NFE,
        heading: `Gráfico - Penetração das importações no consumo nacional aparente (kg) (${ncmStr})` });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncmCode, annualRows, rollingChartData, countryPeriods, sectionVisibility, Y, M, priceData, priceCountry, monthPoints, monthMode, monthMetric, countryMetric, shareImp, shareExp, shareMetric, shareColors,
    cal, comp, countryYears, bolhas, cascata, decomp, conc, ufs, pen]);

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
    reportCharts.filter(spec => spec.grupo !== 'nfe').forEach(spec => {
      const img = images[spec.id];
      if (img) items.push({ type: 'image', image: { heading: spec.heading, source: spec.source, ...img } });
      if (img && spec.tableAfter) items.push({ type: 'table', table: spec.tableAfter });
    });
    if (sectionVisibility.showExcelAnalysis) {
      items.push({ type: 'pagebreak' });
      if (!nfeAll) {
        items.push({ type: 'text', text: 'Planilha de NF-e não carregada: vendas da indústria nacional e consumo nacional aparente não incluídos.', italic: true });
      } else {
        items.push({ type: 'table', table: { heading: 'Vendas da Indústria Nacional', columns: nfeSalesColumns.map(c => c.header), rows: nfeSalesTable.map(r => nfeSalesColumns.map(c => (r as any)[c.key] ?? '')), source: SOURCE_NFE, emptyMessage: 'Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.' } });
        reportCharts.filter(spec => spec.grupo === 'nfe').forEach(spec => {
          const img = images[spec.id];
          if (img) items.push({ type: 'image', image: { heading: spec.heading, source: spec.source, ...img } });
        });
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
    { id: 'origem-preco', label: 'Preço × volume', show: sectionVisibility.showCountryData },
    { id: 'evolucao-paises', label: 'Evolução por país', show: sectionVisibility.showCountryData },
    { id: 'uf', label: 'UFs', show: sectionVisibility.showUfData },
    { id: 'planilhas', label: 'Contatos e NF-e', show: sectionVisibility.showExcelAnalysis },
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
          <button onClick={() => { window.location.hash = ''; window.location.reload(); }} className="flex items-center gap-2.5 text-left" title="Início">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-sm font-bold">CS</span>
            <span>
              <span className="block text-sm font-semibold leading-tight">Analisador Comex Stat NCM</span>
              <span className="block text-[11px] leading-tight text-white/60">Ficha individual da NCM</span>
            </span>
          </button>
          <div className="flex rounded-lg bg-white/10 p-0.5">
            {([['ficha', 'Ficha por NCM'], ['cestas', 'Cestas de NCMs'], ['alertas', '🚨 Radar de alertas']] as [Mode, string][]).map(([m, label]) => (
              <button key={m} onClick={() => goTo(m)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === m || (m === 'alertas' && mode === 'metodologia') ? 'bg-white text-brand-900' : 'text-white/70 hover:text-white'}`}>{label}</button>
            ))}
          </div>
          {mode === 'ficha' && ncmCode && <div className="ml-auto w-full md:w-auto md:min-w-[22rem]"><NcmInput onSubmit={handleNcmSubmit} loading={loading} /></div>}
        </div>
        {mode === 'ficha' && dataReady && (
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
        {mode === 'cestas' && <CestasView onOpenNcm={openNcmFromCesta} />}
        {mode === 'alertas' && <AlertasPage entidadeInicial={alertEntity} onOpenNcm={openNcmFromCesta} />}
        {mode === 'metodologia' && <MetodologiaAlertas />}
        <div className={mode !== 'ficha' ? 'hidden' : ''}>
        {/* Tela inicial */}
        {!ncmCode && (
          <div className="mx-auto mt-10 max-w-2xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">Ficha de comércio exterior por NCM</h1>
            <p className="mt-3 text-slate-600">Séries históricas desde 2004, importações acumuladas em 12 meses, análise de surto, origem e destino por país e a Ficha individual em Word, com dados da API Comex Stat (MDIC).</p>
            <div className="mt-8 flex justify-center"><NcmInput onSubmit={handleNcmSubmit} loading={loading} variant="hero" /></div>
            <p className="mt-3 text-xs text-slate-500">Aceita o código com ou sem pontos: 7213.10.00 ou 72131000.</p>
            <button onClick={() => goTo('cestas')} className="mt-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 shadow-sm hover:border-brand-500 hover:text-brand-600">
              Ou analise as cestas de NCMs: por entidade (ABAL, IABR, IBÁ…) ou temáticas, como minerais críticos →
            </button>
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
                <KpiCard label={`Importações · ${periodLabel(kpi.cur)}`} {...money(kpi.cur['Importações (US$ FOB)'])} delta={kpi.d('Importações (US$ FOB)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label={`Importações (kg) · ${periodLabel(kpi.cur)}`} value={tons(kpi.cur['Importações (KG)'])} unit="t" delta={kpi.d('Importações (KG)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label={`Exportações · ${periodLabel(kpi.cur)}`} {...money(kpi.cur['Exportações (US$ FOB)'])} delta={kpi.d('Exportações (US$ FOB)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label={`Balança comercial · ${periodLabel(kpi.cur)}`} {...money(kpi.cur['Balança Comercial (FOB)'])} hint={(kpi.cur['Balança Comercial (FOB)'] || 0) >= 0 ? 'superávit' : 'déficit'} />
                <KpiCard label="Preço médio de importação" value={formatDecimalPtBR(kpi.cur['Preço Médio Importação (US$/KG)'] ?? null)} unit="US$/kg" delta={kpi.d('Preço Médio Importação (US$/KG)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
                <KpiCard label="Importações · últimos 12 meses" value={twelveMonth ? tons(twelveMonth.blocks[0].importacaoKg) : '–'} unit="t" delta={twelveMonth?.comparisons[0].resultado != null ? twelveMonth.comparisons[0].resultado * 100 : null} deltaLabel="vs 12 meses anteriores" />
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
                      <ChartCard title="Preços médios de importação e exportação (US$ FOB/kg)" subtitle={priceCountry ? `Linhas cheias: todos os países · tracejadas: ${priceCountry}` : undefined}>
                        <div className="-mt-1 mb-1 flex justify-end">
                          {countryYears
                            ? <CountryPicker countries={priceCountries} value={priceCountry} onChange={setPriceCountry} />
                            : <span className="text-[11px] text-slate-400">Carregando países…</span>}
                        </div>
                        <PriceLineChart data={priceData} country={priceCountry} />
                      </ChartCard>
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
                    <div className="lg:col-span-3">
                      <ChartCard
                        title={`${monthTitle} · ${metricShort(monthMetric, ncmDetails?.unit)}`}
                        subtitle={`${monthRange}. ${monthMode === 'serie' ? 'Linha tracejada = média mensal dos 48 meses.' : 'Uma linha por ano; anos com * estão incompletos na janela.'}`}
                      >
                        <div className="-mt-1 mb-2 flex flex-wrap justify-end gap-2">
                          <SegmentedControl value={monthMode} onChange={setMonthMode} options={[{ value: 'serie', label: 'Série contínua' }, { value: 'anos', label: 'Comparação por ano' }]} />
                          <MetricSelector value={monthMetric} onChange={setMonthMetric} unitName={uName} />
                        </div>
                        {monthMetric === 'metricStatistic' && kgUnit && <p className="mb-2 text-[11px] text-slate-500">{KG_UNIT_NOTE}</p>}
                        {monthMode === 'serie'
                          ? <MonthlyImportsChart points={monthPoints} unit={metricUnit(monthMetric, ncmDetails?.unit)} />
                          : <YearCompareChart years={monthByYear.years} data={monthByYear.data} unit={metricUnit(monthMetric, ncmDetails?.unit)} partialYears={monthPartialYears} />}
                      </ChartCard>
                    </div>
                    {cal && (
                      <div className="lg:col-span-3">
                        <ChartCard title={`Calendário das importações, mês a mês · ${metricShort(monthMetric, ncmDetails?.unit)}`}
                          subtitle="Cores mais escuras = meses com mais importação. Contorno escuro = mês atípico. A métrica segue a escolhida no gráfico acima.">
                          <CalendarioHeatmap cal={cal} unit={metricUnit(monthMetric, ncmDetails?.unit)} />
                        </ChartCard>
                      </div>
                    )}
                  </div>
                ) : steps.find(st => st.key === 'monthly')?.status === 'running' ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Carregando dados mensais…</p>
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
                    <MetricSelector value={countryMetric} onChange={setCountryMetric} unitName={uName} />
                  </>
                }
              >
                {countryMetric === 'metricStatistic' && kgUnit && (
                  <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{KG_UNIT_NOTE}</p>
                )}
                <div className="grid gap-4 lg:grid-cols-2">
                  <ChartCard title={`Origem das importações · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`}>
                    <CountryTreemap data={cp.imports} flow="import" metric={countryMetric} unitLabel={metricUnit(countryMetric, ncmDetails?.unit)} />
                  </ChartCard>
                  <ChartCard title={`Destino das exportações · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`}>
                    <CountryTreemap data={cp.exports} flow="export" metric={countryMetric} unitLabel={metricUnit(countryMetric, ncmDetails?.unit)} />
                  </ChartCard>
                  <DataTable title={`Importações por país · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`} data={sortByMetric(cp.imports)} columns={countryColumns} formatters={countryFormatters} source={SOURCE_COMEX} compact />
                  <DataTable title={`Exportações por país · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`} data={sortByMetric(cp.exports)} columns={countryColumns} formatters={countryFormatters} source={SOURCE_COMEX} compact />
                </div>
              </Section>
            )}

            {/* Preço × volume e decomposição da variação por país */}
            {sectionVisibility.showCountryData && comp && (
              <Section
                id="origem-preco"
                title="Preço, volume e variação das importações por origem"
                description="Quem cresce, a que preço, e quem explica a variação do valor importado entre dois períodos iguais."
                actions={<ComparacaoSelector />}
              >
                {!countryYears ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{steps.find(st => st.key === 'country')?.status === 'error' ? 'Não foi possível carregar os dados por país.' : 'Carregando dados por país…'}</p>
                ) : (
                  <div className="space-y-4">
                    <ChartCard title={`Preço × volume das importações por país de origem (${comp.anterior} → ${comp.atual})`}
                      subtitle={`Círculo tracejado = ${comp.anterior}; círculo cheio = ${comp.atual}; a seta mostra o deslocamento. Tamanho = valor importado (US$ FOB). Os ${bolhas.pontos.length} maiores países${bolhas.outros ? `; outros ${bolhas.outros} não aparecem` : ''}.`}>
                      <PrecoVolumeChart pontos={bolhas.pontos} precoMedio={bolhas.precoMedio1} rotulo0={comp.anterior} rotulo1={comp.atual} />
                    </ChartCard>
                    <div className="grid gap-4 lg:grid-cols-5">
                      <div className="lg:col-span-3">
                        <ChartCard title={`De onde veio a variação do valor importado (US$ FOB), ${comp.anterior} → ${comp.atual}`}
                          subtitle={`Total: US$ ${formatCompactPtBR(decomp.total0)} → US$ ${formatCompactPtBR(decomp.total1)}. Laranja = país que vendeu mais ao Brasil; verde = país que vendeu menos. Passe o mouse para ver o efeito quantidade e o efeito preço.`}>
                          <CascataChart rows={cascata} />
                        </ChartCard>
                      </div>
                      <div className="lg:col-span-2">
                        <ChartCard title="Efeito quantidade × efeito preço, por país"
                          subtitle="Quantidade = variação do volume ao preço anterior; preço = variação do preço sobre o volume atual. A soma é a variação total.">
                          <EfeitosChart linhas={decomp.linhas} />
                        </ChartCard>
                      </div>
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Evolução da origem e do destino (colunas empilhadas a 100%) */}
            {sectionVisibility.showCountryData && (
              <Section
                id="evolucao-paises"
                title="Evolução da origem das importações e do destino das exportações"
                description={`Participação dos 5 maiores países (pelo total acumulado desde ${SHARE_FROM}) em cada ano; os demais somam-se em “${OTHERS}”.`}
                actions={<MetricSelector value={shareMetric} onChange={setShareMetric} unitName={uName} />}
              >
                {shareMetric === 'metricStatistic' && kgUnit && (
                  <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{KG_UNIT_NOTE}</p>
                )}
                {!shareImp || !shareExp ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{steps.find(st => st.key === 'country')?.status === 'error' ? 'Não foi possível carregar os dados por país.' : 'Carregando dados por país…'}</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {([['import', 'Origem das importações', shareImp], ['export', 'Destino das exportações', shareExp]] as const).map(([flow, title, evo]) => (
                        <ChartCard key={flow} title={`${title} (${metricShort(shareMetric, ncmDetails?.unit)})`} legend={partialFootnote || undefined}>
                          <ShareStackedChart evo={evo} colors={shareColors} unit={metricUnit(shareMetric, ncmDetails?.unit)} flow={flow} />
                        </ChartCard>
                      ))}
                    </div>
                    {([['Origem das importações', shareImp], ['Destino das exportações', shareExp]] as const).filter(([, evo]) => evo.hasData).map(([title, evo]) => {
                      const tb = shareTable(evo);
                      return (
                        <DataTable key={title} title={`${title}: participação por ano (${metricShort(shareMetric, ncmDetails?.unit)})`} compact
                          data={tb.rows.map(r => Object.fromEntries(tb.columns.map((c, i) => [c, r[i]])))}
                          columns={tb.columns.map(c => ({ key: c, header: c, LTR: c === 'País' }))}
                          source={`${SOURCE_COMEX}${partialFootnote ? ` ${partialFootnote}` : ''}`} />
                      );
                    })}
                    {conc.length > 0 && (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <ChartCard title={`Concentração da origem das importações (${metricShort(shareMetric, ncmDetails?.unit)})`}
                          subtitle="Participação do maior fornecedor e dos 3 maiores em cada ano. O nome aparece quando o maior fornecedor muda." legend={partialFootnote || undefined}>
                          <ConcentracaoChart data={conc} />
                        </ChartCard>
                        <ChartCard title="Índice de concentração (HHI) das importações"
                          subtitle={`Soma dos quadrados das participações (0 a 10.000). Último ano: ${formatIntegerPtBR(conc[conc.length - 1].hhi)}, concentração ${faixaHhi(conc[conc.length - 1].hhi)}.`} legend={partialFootnote || undefined}>
                          <HhiChart data={conc} />
                        </ChartCard>
                      </div>
                    )}
                  </div>
                )}
              </Section>
            )}

            {/* Importações por UF */}
            {sectionVisibility.showUfData && comp && (
              <Section
                id="uf"
                title="Importações por UF de destino"
                description="UF do domicílio fiscal da empresa importadora, conforme o Comex Stat (detalhamento “UF do produto”). US$ FOB."
                actions={<ComparacaoSelector />}
              >
                {!ufs ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{steps.find(st => st.key === 'uf')?.status === 'error' ? 'Não foi possível carregar as importações por UF.' : 'Carregando importações por UF…'}</p>
                ) : !ufs.linhas.some(l => l.v1 > 0) ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Sem importações em {comp.atual}.</p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ChartCard title={`Participação de cada UF nas importações · ${comp.atual}`} subtitle="Passe o mouse sobre o estado para ver o valor e a variação.">
                      <MapaUf linhas={ufs.linhas} />
                      <p className="mt-1 text-[10.5px] text-slate-400">Mapa: @svg-maps/brazil (CC BY 4.0).</p>
                    </ChartCard>
                    <ChartCard title={`10 maiores UFs importadoras · ${comp.atual}`} subtitle={`Participação no total e, entre parênteses, a variação sobre ${comp.anterior}.`}>
                      <RankingUfChart linhas={ufs.linhas} />
                      {ufs.naoIdentificado > 0 && <p className="mt-2 text-[11px] text-slate-500">US$ {formatCompactPtBR(ufs.naoIdentificado)} sem UF identificada no mapa (ex.: “Não declarada”).</p>}
                    </ChartCard>
                  </div>
                )}
              </Section>
            )}
          </>
        )}

        {/* Planilhas */}
        {ncmCode && !loading && sectionVisibility.showExcelAnalysis && (
          <Section id="planilhas" title="Contatos da entidade e dados de NF-e" description="Envie as planilhas internas; elas são lidas apenas no seu navegador e não são enviadas a nenhum servidor.">
            <div className="grid gap-4 md:grid-cols-2">
              <FileUpload label="Planilha CGIM/DINTE" hint="Ex.: 20241011_NCMs-CGIM-DINTE.xlsx (aba NCMs-CGIM-DINTE e abas das entidades)" onFileUpload={handleCgimFile} loading={fileBusy === 'cgim'} fileName={cgimFile?.name} />
              <FileUpload label="Planilha de NF-e (SECEX/RFB)" hint="Ex.: dados_nfe_2016_2025_ajustado.xlsx (aba Dados)" onFileUpload={handleNfeFile} loading={fileBusy === 'nfe'} fileName={nfeFile?.name} />
            </div>
            {cgimParsed && (
              <>
                {entityContacts.length
                  ? <ContactCards title={`Contatos da entidade responsável · ${ncmStr}`} contacts={entityContacts} />
                  : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{cgimInfo ? 'A planilha não traz contato de entidade para esta NCM.' : 'Produto não é de competência da CGIM e não há entidade associada na planilha.'}</p>}
              </>
            )}
            {nfeAll && (
              nfeForNcm.length ? (
                <>
                  <ChartCard source={SOURCE_NFE} title={`Penetração das importações no consumo nacional aparente · ${ncmStr}`}
                    subtitle="Consumo aparente = vendas internas da indústria + importações (kg). O rótulo mostra a parcela das importações. Dados de NF-e lidos só no seu navegador.">
                    <PenetracaoChart data={pen} />
                  </ChartCard>
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
        </div>
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
