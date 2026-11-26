import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NcmInput from './components/NcmInput.tsx';
import DataTable, { Column, VarCell } from './components/DataTable.tsx';
import FileUpload from './components/FileUpload.tsx';
import ContactCards from './components/ContactCards.tsx';
import Section from './components/Section.tsx';
import SurgeAnalysisConfigurator from './components/SurgeAnalysisConfigurator.tsx';
import SurgeAnalysisDisplay from './components/SurgeAnalysisDisplay.tsx';
import { ChartCard, KpiCard, Button, SegmentedControl, Swatch, Icons, MetricSelector, CountryPicker } from './components/ui.tsx';
import { ModeloBar, ModeloPainel } from './components/ModeloSelector.tsx';
import { JanelasChart, Base100Chart, PrecoMensalChart, CascataToneladasChart } from './components/charts/NovasKit.tsx';
import { AnnualBarChart, PriceLineChart, PricePoint, TradeBalanceChart, RollingSumChart, CountryTreemap, ShareStackedChart, MonthlyImportsChart, YearCompareChart, COLORS } from './components/charts/ChartKit.tsx';
import CestasView from './components/cestas/CestasView.tsx';
import { AlertasPage } from './components/cestas/AlertasRadar.tsx';
import MetodologiaAlertas from './components/cestas/MetodologiaAlertas.tsx';
import { mercadoDaNfe, salvarMercado } from './utils/mercado.ts';
import { loadAlertas, AlertasArquivo } from './utils/cestas.ts';
import { ROTULO_SINAL } from './utils/alertas.ts';
import {
  ANALISE, Configuracao, Dataset, Modelo, MODELOS_INSTITUCIONAIS, MODELO_PADRAO, configDoModelo, datasetsNecessarios,
  lerPessoais, gravarPessoais, MODELO_ANTIGO,
} from './utils/catalogo.ts';
import { janelasRecentes, precoMensal, base100, anosCompletos, diagnosticoOrigens, cascataToneladas } from './utils/novas.ts';
import ReportChartsOffscreen, { ReportChartSpec } from './components/ReportChartsOffscreen.tsx';

import { apiIndisponivel, reiniciarDisponibilidade, fetchLastUpdateData, fetchNcmDescription, fetchNcmUnit, fetchComexData, fetchMonthlyComexData, fetchCountryYearData, fetchUfYearData } from './services/comexApiService.ts';
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
  Comparacao, opcoesComparacao, registrosDaComparacao, paresPorPais, decomposicao, linhasCascata, calendario,
  concentracao, penetracao, linhasUf, UfRecord, faixaHhi,
} from './utils/analiticas.ts';
import {
  CascataChart, EfeitosChart, CalendarioHeatmap, ConcentracaoChart, HhiChart, PenetracaoChart, MapaUf, RankingUfChart, LOCAIS_BR,
} from './components/charts/AnaliticasKit.tsx';
import {
  LastUpdateData, NcmDetails, ProcessedTradeData, ApiFilter, Period, CountryPeriodData, CgimNcmInfo,
  EntityContactInfo, NfeData, MonthlyComexStatRecord, SurgeAnalysisConfig, SurgeAnalysisResult, CountryYearRecord,
} from './types.ts';

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
const modeloDaUrl = () => { const id = window.location.hash.match(/[?&]modelo=([a-z0-9-]+)/)?.[1]; return id ? MODELO_ANTIGO[id] ?? id : undefined; };
const hashDaNcm = (code: string, modeloId: string) => `#/ncm/${code}${modeloId.startsWith('pessoal-') || modeloId === 'completa' ? '' : `?modelo=${modeloId}`}`;
type ApiDs = 'annual' | 'monthly' | 'country' | 'uf';
const API_DS: ApiDs[] = ['annual', 'monthly', 'country', 'uf'];
const ROTULO_DS: Record<ApiDs, string> = {
  annual: 'Séries anuais desde 2004', monthly: 'Importações mensais desde 2019', country: 'Dados por país e ano desde 2010', uf: 'Importações por UF',
};
const NAV_FAMILIA: Record<string, string> = { panorama: 'Panorama', tendencias: 'Tendências', precos: 'Preços', origens: 'Origens', mercado: 'Mercado interno', contatos: 'Contatos' };

/** Seção de uma análise do catálogo (componente estável: não remonta a cada renderização). */
const Bloco: React.FC<Omit<React.ComponentProps<typeof Section>, 'id' | 'title'> & { aid: string; title?: string }> = ({ aid, title, ...rest }) => (
  <Section id={`a-${aid}`} title={title ?? ANALISE[aid].titulo} {...rest} />
);

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

  // Modelos de análise: a configuração em uso define o que aparece, o que é consultado e o que vai para o Word/Excel
  const [pessoais, setPessoaisState] = useState<Modelo[]>(lerPessoais);
  const [config, setConfigState] = useState<Configuracao>(() => {
    // padrão: ficha completa; outro modelo só quando vem no link
    const id = modeloDaUrl() ?? MODELO_PADRAO;
    const m = [...MODELOS_INSTITUCIONAIS, ...lerPessoais()].find(x => x.id === id) ?? MODELOS_INSTITUCIONAIS.find(x => x.id === MODELO_PADRAO)!;
    return configDoModelo(m);
  });
  const configRef = useRef(config);
  const [painelAberto, setPainelAberto] = useState(false);
  const modelo = [...MODELOS_INSTITUCIONAIS, ...pessoais].find(m => m.id === config.modeloId) ?? MODELOS_INSTITUCIONAIS[0];
  const sel = useMemo(() => new Set(config.analises), [config.analises]);
  const on = (id: string) => sel.has(id);
  const setConfig = (c: Configuracao) => {
    configRef.current = c;
    setConfigState(c);
    const code = currentNcmRef.current;
    if (code) window.history.replaceState(null, '', hashDaNcm(code, c.modeloId));
  };
  const setPessoais = (lista: Modelo[], selecionar?: Modelo) => {
    gravarPessoais(lista);
    setPessoaisState(lista);
    if (selecionar) setConfig(configDoModelo(selecionar));
  };
  const [radarArquivo, setRadarArquivo] = useState<AlertasArquivo | null | 'erro'>(null);
  const [cascataUnidade, setCascataUnidade] = useState<'usd' | 't'>('usd');
  const [janelaPreco, setJanelaPreco] = useState<3 | 6 | 12>(12);
  const [anoBase, setAnoBase] = useState<number | null>(null);
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
  // Contexto da NCM consultada (após a etapa básica) e datasets já disparados para ela
  const ctxRef = useRef<{ id: number; code: string; Y: number; M: number; details: NcmDetails; upd: LastUpdateData } | null>(null);
  const iniciados = useRef<Set<ApiDs>>(new Set());

  const fail = (id: number, key: string, msg: string, e: unknown) => {
    console.error(msg, e);
    if (requestId.current !== id) return;
    setStep(key, 'error');
    setErrors(prev => [...prev, msg]);
  };

  const loaders: Record<ApiDs, (c: NonNullable<typeof ctxRef.current>) => Promise<void>> = {
    annual: async ({ id, code, Y, M, details, upd }) => {
      const alive = () => requestId.current === id;
      const MM = pad2(M), filters: ApiFilter[] = [{ filter: 'ncm', values: [code] }];
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
      } catch (e) { fail(id, 'annual', 'Falha ao carregar as séries anuais da API Comex Stat.', e); }
    },
    monthly: async ({ id, code, Y, M }) => {
      try {
        const data = await fetchMonthlyComexData('import', { from: '2019-01', to: `${Y}-${pad2(M)}` }, [{ filter: 'ncm', values: [code] }], ['metricFOB', 'metricKG', 'metricStatistic']);
        if (requestId.current !== id) return;
        setRawMonthlyImportData(data);
        setStep('monthly', 'done');
      } catch (e) { fail(id, 'monthly', 'Falha ao carregar os dados mensais de importação.', e); }
    },
    country: async ({ id, code, Y, M }) => {
      try {
        // Uma consulta por fluxo traz país × ano desde 2010 (anos completos até dezembro; o ano corrente até o último mês).
        // Com o ano incompleto, o mesmo período do ano anterior por país completa a série de preços por país.
        const MM = pad2(M);
        const allYears: Period = { from: '2010-01', to: `${Y}-12` };
        const prevYtd: Period = { from: `${Y - 1}-01`, to: `${Y - 1}-${MM}` };
        const [ex, im, exPrev, imPrev] = await Promise.all([
          fetchCountryYearData(code, 'export', allYears),
          fetchCountryYearData(code, 'import', allYears),
          M < 12 ? fetchCountryYearData(code, 'export', prevYtd) : Promise.resolve([]),
          M < 12 ? fetchCountryYearData(code, 'import', prevYtd) : Promise.resolve([]),
        ]);
        if (requestId.current !== id) return;
        setCountryYears({ imp: im, exp: ex, impPrev: imPrev, expPrev: exPrev });
        setCountryPeriods([
          { label: String(Y - 1), period: { from: `${Y - 1}-01`, to: `${Y - 1}-12` }, exports: countriesForYears(ex, [Y - 1]), imports: countriesForYears(im, [Y - 1]) },
          { label: M < 12 ? `${Y} (até ${getMonthNamePtBR(M)})` : String(Y), period: { from: `${Y}-01`, to: `${Y}-${MM}` }, exports: countriesForYears(ex, [Y]), imports: countriesForYears(im, [Y]) },
        ]);
        setStep('country', 'done');
      } catch (e) { fail(id, 'country', 'Falha ao carregar os dados por país.', e); }
    },
    uf: async ({ id, code, Y, M }) => {
      try {
        // Importações por UF: os dois últimos anos completos e o ano corrente numa consulta, mais o mesmo período do ano anterior
        const [anual, ateMes] = await Promise.all([
          fetchUfYearData(code, 'import', { from: `${Y - 2}-01`, to: `${Y}-12` }),
          M < 12 ? fetchUfYearData(code, 'import', { from: `${Y - 1}-01`, to: `${Y - 1}-${pad2(M)}` }) : Promise.resolve([]),
        ]);
        if (requestId.current !== id) return;
        setUfData({ anual, ateMes });
        setStep('uf', 'done');
      } catch (e) { fail(id, 'uf', 'Falha ao carregar as importações por UF.', e); }
    },
  };

  /** Dispara a consulta de um dataset uma única vez por NCM (só os que a seleção pede). */
  const carregar = (ds: ApiDs) => {
    const c = ctxRef.current;
    if (!c || c.id !== requestId.current || iniciados.current.has(ds)) return;
    iniciados.current.add(ds);
    setSteps(prev => prev.some(s => s.key === ds) ? prev.map(s => (s.key === ds ? { ...s, status: 'running' } : s)) : [...prev, { key: ds, label: ROTULO_DS[ds], status: 'running' }]);
    void loaders[ds](c);
  };
  const precisa = (analises: string[]) => { const d = datasetsNecessarios(analises); return API_DS.filter(x => d.has(x as Dataset)); };

  const handleNcmSubmit = async (code: string) => {
    const myId = ++requestId.current;
    currentNcmRef.current = code;
    ctxRef.current = null;
    iniciados.current = new Set();
    const h = hashDaNcm(code, configRef.current.modeloId);
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
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
    setAnoBase(null);
    setSurgeAnalysisResult(null);
    const necessarios = precisa(configRef.current.analises);
    setSteps([
      { key: 'basic', label: 'Descrição, unidade e data de atualização', status: 'running' },
      ...necessarios.map(ds => ({ key: ds, label: ROTULO_DS[ds], status: 'pending' as StepStatus })),
    ]);

    reiniciarDisponibilidade(); // clicar em Analisar sempre tenta de novo
    const [upd, desc, unit] = await Promise.all([fetchLastUpdateData(), fetchNcmDescription(code), fetchNcmUnit(code)]);
    if (!alive()) return;
    const details: NcmDetails = { description: desc, unit };
    setLastUpdateData(upd);
    setNcmDetails(details);
    if (!upd.year || !upd.month) {
      fail(myId, 'basic', apiIndisponivel()
        ? 'A API do Comex Stat (MDIC) está fora do ar no momento: o servidor responde “503 – serviço indisponível”. Não é um problema do app. Tente de novo em alguns minutos.'
        : 'Não foi possível obter a data de atualização da API Comex Stat. Tente novamente em alguns instantes.', null);
      setSteps(prev => prev.map(s => (s.status === 'pending' ? { ...s, status: 'error' } : s)));
      return;
    }
    setStep('basic', 'done');
    ctxRef.current = { id: myId, code, Y: upd.year, M: upd.month, details, upd };
    // a seleção pode ter mudado durante a etapa básica: usa a atual
    precisa(configRef.current.analises).forEach(carregar);
  };

  // Seleção alterada depois da consulta: busca só os datasets que faltam
  useEffect(() => {
    if (ctxRef.current) precisa(config.analises).forEach(carregar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.analises, lastUpdateData]);

  // Sinais do radar (arquivo estático das cestas): só quando a análise é selecionada
  useEffect(() => {
    if (!on('sinais-radar') || radarArquivo) return;
    loadAlertas().then(setRadarArquivo).catch(() => setRadarArquivo('erro'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, radarArquivo]);

  // Navegação: #/cestas abre as cestas; #/ncm/XXXXXXXX abre a ficha da NCM
  useEffect(() => {
    const onHash = () => {
      setMode(modeFromHash());
      setAlertEntity(alertEntityFromHash());
      const m = window.location.hash.match(/^#\/ncm\/(\d{8})/);
      const mod = modeloDaUrl();
      if (mod && mod !== configRef.current.modeloId) {
        const x = MODELOS_INSTITUCIONAIS.find(y => y.id === mod);
        if (x) { configRef.current = configDoModelo(x); setConfigState(configRef.current); }
      }
      if (m && m[1] !== currentNcmRef.current) handleNcmSubmit(m[1]);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { currentNcmRef.current = ncmCode; }, [ncmCode]);
  const goTo = (m: Mode) => { window.location.hash = m === 'cestas' ? '#/cestas' : m === 'alertas' ? '#/alertas' : (ncmCode ? hashDaNcm(ncmCode, configRef.current.modeloId) : '#/'); window.scrollTo(0, 0); };
  const openNcmFromCesta = (code: string) => { window.location.hash = hashDaNcm(code, configRef.current.modeloId); window.scrollTo(0, 0); };

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

  // ---- Visões analíticas (decomposição, calendário, concentração, penetração, UF) ----
  const compOpcoes = useMemo(() => (Y && M ? opcoesComparacao(Y, M) : []), [Y, M]);
  const comp = compOpcoes.find(o => o.chave === comparacao) ?? compOpcoes[0];
  const paresImp = useMemo(() => {
    if (!countryYears || !comp || !Y || !M) return [];
    const r = registrosDaComparacao(comp.chave, Y, M, countryYears.imp, countryYears.impPrev);
    return paresPorPais(r.anterior, r.atual);
  }, [countryYears, comp, Y, M]);
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
  // ---- Cruzamentos da etapa 2 ----
  const janelas = useMemo(() => (Y && M ? janelasRecentes(rawMonthlyImportData, Y, M) : []), [rawMonthlyImportData, Y, M]);
  const precoMes = useMemo(() => (Y && M ? precoMensal(rawMonthlyImportData, Y, M, janelaPreco) : []), [rawMonthlyImportData, Y, M, janelaPreco]);
  const anosBase = useMemo(() => anosCompletos(annualRows), [annualRows]);
  const anoBaseEf = anoBase !== null && anosBase.includes(anoBase) ? anoBase
    : anosBase.length ? Math.max(anosBase[0], anosBase[anosBase.length - 1] - 5) : null;
  const b100 = useMemo(() => (anoBaseEf ? base100(annualRows, anoBaseEf) : null), [annualRows, anoBaseEf]);
  const diag = useMemo(() => diagnosticoOrigens(paresImp), [paresImp]);
  const cascT = useMemo(() => cascataToneladas(paresImp), [paresImp]);
  const radarOk = radarArquivo && radarArquivo !== 'erro' ? radarArquivo : null;
  const alertaNcm = radarOk && ncmCode ? radarOk.alertas.find(a => a.ncm === ncmCode) ?? null : null;

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
  const handleExportExcel = (escopo: 'selecao' | 'base') => {
    if (!ncmCode) return;
    try {
      type Sheet = { name: string; rows: object[]; columns?: [string, string][] };
      const fullSheetCols: [string, string][] = [
        ['year', 'Ano'], ['Código NCM', 'Código NCM'], ['Descrição NCM', 'Descrição'], ['Unidade Estatística', 'Unidade Estatística'],
        ...fullColumns.slice(1).map(c => [c.key, c.key] as [string, string]),
      ];
      const pctOrNull = (v: unknown) => (typeof v === 'number' ? v / 100 : null);
      const summaryRows = (rows: typeof importSummary) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'kind').map(([k, v]) => [k, k.startsWith('Var') ? pctOrNull(v) : v])));
      const cpRows = (rows: CountryPeriodData['imports']) => rows.map(r => ({ 'País': r.country, 'US$ FOB': r.metricFOB, 'KG': r.metricKG, 'Qtd. estatística': r.metricStatistic, 'Representatividade FOB (%)': r.representatividadeFOB, 'Representatividade KG (%)': r.representatividadeKG, 'Representatividade Qtd. estatística (%)': r.representatividadeStat }));
      const S: Record<string, () => Sheet[]> = {
        consolidado: () => [{ name: 'Consolidado', rows: annualRows, columns: fullSheetCols }],
        resumido: () => [{ name: 'Resumido', rows: annualRows, columns: resumedColumns.map(c => [c.key, c.key === 'year' ? 'Ano' : c.key] as [string, string]) }],
        quadroImp: () => [{ name: 'Resumo Importações', rows: summaryRows(importSummary) }],
        quadroExp: () => [{ name: 'Resumo Exportações', rows: summaryRows(exportSummary) }],
        mensal: () => monthlySeries.length ? [{ name: 'Importações mensais', rows: monthlySeries.map(p => ({ 'Mês': p.yearMonth, 'Importações (KG)': p.metricKG, 'Importações (US$ FOB)': p.metricFOB, 'Soma móvel 12 meses (KG)': p.rollingKG })) }] : [],
        m48: () => monthPoints.length ? [{ name: 'Importações 48 meses', rows: monthPoints.map(p => ({ 'Mês': p.name, [`Importações (${metricShort(monthMetric, ncmDetails?.unit)})`]: p.value, 'Mesmo mês do ano anterior': p.prevYear, 'Variação (%)': p.yoy === null ? null : p.yoy / 100 })) }] : [],
        paisesAno: () => countryYears ? [{ name: 'Países por ano', rows: [
          ...countryYears.imp.map(r => ({ 'Fluxo': 'Importação', 'Ano': r.year, 'País': r.country, 'US$ FOB': r.metricFOB, 'KG líquido': r.metricKG, [`Qtd. estatística (${uName})`]: r.metricStatistic })),
          ...countryYears.exp.map(r => ({ 'Fluxo': 'Exportação', 'Ano': r.year, 'País': r.country, 'US$ FOB': r.metricFOB, 'KG líquido': r.metricKG, [`Qtd. estatística (${uName})`]: r.metricStatistic })),
        ].sort((a, b) => a['Fluxo'].localeCompare(b['Fluxo']) || a['Ano'] - b['Ano'] || b['US$ FOB'] - a['US$ FOB']) }] : [],
        decomp: () => comp && decomp.linhas.length ? [{ name: 'Decomposição por país', rows: decomp.linhas.map(l => ({
          'País': l.pais, [`${comp.anterior} (US$ FOB)`]: l.v0, [`${comp.atual} (US$ FOB)`]: l.v1, [`${comp.anterior} (kg)`]: l.q0, [`${comp.atual} (kg)`]: l.q1,
          'Variação (US$)': l.delta, 'Variação (kg)': l.q1 - l.q0, 'Efeito quantidade (US$)': l.efeitoQuantidade, 'Efeito preço (US$)': l.efeitoPreco,
          [`Preço ${comp.anterior} (US$/kg)`]: l.q0 > 0 ? l.v0 / l.q0 : null, [`Preço ${comp.atual} (US$/kg)`]: l.q1 > 0 ? l.v1 / l.q1 : null,
        })) }] : [],
        concentracao: () => conc.length ? [{ name: 'Concentração de origem', rows: conc.map(c => ({ 'Ano': c.name, 'Maior fornecedor': c.maiorPais, 'Participação do maior (%)': c.maior, 'Participação dos 3 maiores (%)': c.tres, 'HHI': c.hhi, 'Concentração': faixaHhi(c.hhi) })) }] : [],
        evolucao: () => shareImp && shareExp ? ([['Evolução origem', shareImp], ['Evolução destino', shareExp]] as const).filter(([, e]) => e.hasData).map(([name, e]) => {
          const tb = shareTable(e);
          return { name, rows: tb.rows.map(r => Object.fromEntries(tb.columns.map((c, k) => [c, r[k]]))) };
        }) : [],
        uf: () => ufs && comp ? [{ name: 'Importações por UF', rows: ufs.linhas.map(l => ({ 'UF': l.uf, [`${comp.anterior} (US$ FOB)`]: l.v0, [`${comp.atual} (US$ FOB)`]: l.v1, [`${comp.atual} (kg)`]: l.q1, 'Participação (%)': l.part, 'Variação (%)': l.varPct })) }] : [],
        calendario: () => cal ? [{ name: 'Calendário mensal', rows: cal.anos.map((a, k) => Object.fromEntries([['Ano', a], ...['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, jj) => [m, cal.valores[k][jj]])])) }] : [],
        doze: () => twelveMonth ? [
          { name: 'Soma período (12m)', rows: twelveRows.map(b => ({ 'Período': b.periodo, 'Data de Início': b.dataInicio, 'Data Final': b.dataFinal, 'Importação KG': b.importacaoKg })) },
          { name: 'Comparações 12m', rows: (twelveMonth?.comparisons ?? []).map(c => ({ 'Comparação': c.comparacao, 'Resultado': c.resultado })) },
        ] : [],
        paisesPeriodo: () => countryPeriods.flatMap(cpx => [
          { name: `Exportações ${cpx.label}`, rows: cpRows(cpx.exports) },
          { name: `Importações ${cpx.label}`, rows: cpRows(cpx.imports) },
        ]),
        janelas: () => janelas.length ? [{ name: 'Janelas recentes', rows: janelas.map(l => ({
          'Janela': l.janela, 'Período': l.periodo, 'Período anterior': l.periodoAnt, 'Volume (kg)': l.kg, 'Volume anterior (kg)': l.kgAnt, 'Var. volume (%)': l.varKg,
          'Valor (US$ FOB)': l.usd, 'Valor anterior (US$ FOB)': l.usdAnt, 'Var. valor (%)': l.varUsd, 'Preço (US$/kg)': l.preco, 'Preço anterior (US$/kg)': l.precoAnt, 'Var. preço (%)': l.varPreco,
        })) }] : [],
        base100: () => b100?.baseValida ? [{ name: 'Base 100', rows: b100.pontos.map(p => ({ 'Ano': p.name, 'Volume (kg)': p.kg, 'Valor (US$ FOB)': p.usd, 'Preço (US$/kg)': p.p, [`Índice volume (${anoBaseEf}=100)`]: p.volume, [`Índice preço (${anoBaseEf}=100)`]: p.preco, [`Índice valor (${anoBaseEf}=100)`]: p.valor })) }] : [],
        precoMensal: () => precoMes.length ? [{ name: 'Preço mensal', rows: precoMes.map(p => ({ 'Mês': p.name, 'Volume (kg)': p.kg, 'Valor (US$ FOB)': p.usd, 'Preço no mês (US$/kg)': p.mensal, [`Preço móvel ${janelaPreco}m (US$/kg)`]: p.movel })) }] : [],
        diag: () => comp && diag.linhas.length ? [{ name: 'Diagnóstico por origem', rows: [...diag.linhas, diag.total].map(l => ({
          'Origem': l.pais, [`Volume ${comp.anterior} (kg)`]: l.kg0, [`Volume ${comp.atual} (kg)`]: l.kg1, 'Var. volume (%)': l.varKg, 'Dif. volume (kg)': l.difKg,
          [`Part. ${comp.anterior} (%)`]: l.part0, [`Part. ${comp.atual} (%)`]: l.part1, 'Dif. (p.p.)': l.difPp,
          [`US$ FOB ${comp.anterior}`]: l.usd0, [`US$ FOB ${comp.atual}`]: l.usd1, [`Preço ${comp.anterior} (US$/kg)`]: l.preco0, [`Preço ${comp.atual} (US$/kg)`]: l.preco1, 'Var. preço (%)': l.varPreco,
          'Contribuição para a variação do volume (%)': l.contribKg,
        })) }] : [],
        radar: () => alertaNcm ? [{ name: 'Sinais do radar', rows: alertaNcm.sinais.map(si => ({ 'Sinal': ROTULO_SINAL[si.tipo], 'Descrição': si.texto, 'Pontos': si.pontos })) }] : [],
        cgim: () => cgimInfo ? [{ name: 'CGIM-DINTE', rows: [cgimInfo as unknown as Record<string, unknown>] }] : [],
        entidades: () => entityContacts.length ? [{ name: 'Entidades', rows: entityContacts as unknown as Record<string, unknown>[] }] : [],
        nfe: () => nfeForNcm.length ? [{ name: 'NF-e', rows: nfeForNcm as unknown as Record<string, unknown>[] }] : [],
      };
      const POR_ANALISE: Record<string, (keyof typeof S)[]> = {
        kpis: [], 'imp-anual': ['resumido'], 'exp-anual': ['resumido'], balanca: ['resumido'], 'tabela-anual': ['resumido'], 'quadro-imp': ['quadroImp'], 'quadro-exp': ['quadroExp'],
        'dados-completos': ['consolidado'], 'soma-12m': ['doze', 'mensal'], janelas: ['janelas'], 'mensal-48': ['m48'], calendario: ['calendario'], surto: ['mensal'],
        base100: ['base100'], 'sinais-radar': ['radar'], precos: ['consolidado'], 'preco-mensal': ['precoMensal'], 'variacao-origem': ['decomp'],
        'paises-graficos': ['paisesPeriodo'], 'paises-tabelas': ['paisesPeriodo'], 'origens-diagnostico': ['diag'], 'evolucao-paises': ['evolucao', 'paisesAno'],
        concentracao: ['concentracao'], uf: ['uf'], 'nfe-penetracao': ['nfe'], 'nfe-tabelas': ['nfe'], contatos: ['cgim', 'entidades'],
      };
      // (a) dados da ficha selecionada, na ordem das análises; (b) base consultada (exportação anterior), NF-e só se selecionada
      const chaves: (keyof typeof S)[] = escopo === 'selecao'
        ? [...new Set(['consolidado' as const, ...config.analises.flatMap(id => POR_ANALISE[id] ?? [])])]
        : ['consolidado', 'resumido', 'quadroImp', 'quadroExp', 'mensal', 'm48', 'paisesAno', 'decomp', 'concentracao', 'uf', 'calendario', 'doze', 'paisesPeriodo',
           ...(on('janelas') ? ['janelas' as const] : []), ...(on('base100') ? ['base100' as const] : []), ...(on('preco-mensal') ? ['precoMensal' as const] : []), ...(on('origens-diagnostico') ? ['diag' as const] : []),
           'cgim', 'entidades', ...(on('nfe-penetracao') || on('nfe-tabelas') ? ['nfe' as const] : [])];
      const sheets = chaves.flatMap(k => S[k]());
      const sufixo = escopo === 'selecao' ? (modelo.tipo === 'institucional' ? modelo.id : 'personalizada') : 'base';
      downloadWorkbook(`Comex_NCM_${ncmCode}_${Y ?? ''}${M ? pad2(M) : ''}_${sufixo}.xlsx`, sheets as never);
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
    const unitM = metricUnit(monthMetric, ncmDetails?.unit);
    if (on('imp-anual')) list.push(
      { analise: 'imp-anual', id: 'impKg', heading: `Gráfico - Importações (KG) da ${ncmStr}`, kind: 'bar', flow: 'import', data: barData('Importações (KG)'), unitLabel: 'Importações (kg)' },
      { analise: 'imp-anual', id: 'impFob', heading: `Gráfico - Importações (US$ FOB) da ${ncmStr}`, kind: 'bar', flow: 'import', data: barData('Importações (US$ FOB)'), unitLabel: 'Importações (US$ FOB)' },
    );
    if (on('exp-anual')) list.push(
      { analise: 'exp-anual', id: 'expKg', heading: `Gráfico - Exportações (KG) da ${ncmStr}`, kind: 'bar', flow: 'export', data: barData('Exportações (KG)'), unitLabel: 'Exportações (kg)' },
      { analise: 'exp-anual', id: 'expFob', heading: `Gráfico - Exportações (US$ FOB) da ${ncmStr}`, kind: 'bar', flow: 'export', data: barData('Exportações (US$ FOB)'), unitLabel: 'Exportações (US$ FOB)' },
    );
    if (on('precos')) list.push({ analise: 'precos', id: 'prices', heading: `Gráfico - Preços Médios de Importação e Exportação (US$ FOB/kg) da ${ncmStr} (${y0}–${Y})${priceCountry ? ` – todos os países e ${priceCountry}` : ' – todos os países'}`, kind: 'price', data: priceData, country: priceCountry });
    if (on('balanca')) list.push({ analise: 'balanca', id: 'balance', heading: `Gráfico - Exportação, Importação e Balança Comercial (${ncmStr})`, kind: 'balance', data: balanceData });
    if (on('soma-12m') && rollingChartData.length) list.push({ analise: 'soma-12m', id: 'rolling', heading: `Gráfico - Importações Acumuladas nos Últimos 12 Meses (em KG) da ${ncmStr}`, kind: 'rolling', data: rollingChartData });
    if (on('janelas') && janelas.length) list.push({ analise: 'janelas', id: 'janelas', kind: 'janelas', linhas: janelas, h: 400,
      heading: `Gráfico - Variação das importações nas janelas recentes vs mesmo período do ano anterior (${ncmStr})`,
      source: `${SOURCE_COMEX} Preço médio = soma do US$ FOB ÷ soma do kg na janela. Escala limitada a ±300%; o rótulo mostra o valor real.` });
    if (on('mensal-48') && monthPoints.length) {
      const heading = `Gráfico - ${monthTitle} (${metricShort(monthMetric, ncmDetails?.unit)}) da ${ncmStr}, ${monthRange}${monthMode === 'anos' ? ' – comparação por ano' : ''}`;
      list.push(monthMode === 'serie'
        ? { analise: 'mensal-48', id: 'monthly48', heading, kind: 'monthly', points: monthPoints, unit: unitM }
        : { analise: 'mensal-48', id: 'monthly48', heading, kind: 'yearCompare', years: monthByYear.years, data: monthByYear.data, unit: unitM, partialYears: monthPartialYears,
            source: `${SOURCE_COMEX} * ano incompleto na janela de 48 meses.` });
    }
    if (on('calendario') && cal) list.push({ analise: 'calendario', id: 'calendario', kind: 'calendario', cal, unit: unitM, w: 960, h: Math.round(26 + cal.anos.length * 30 + 46),
      heading: `Gráfico - Calendário mensal das importações (${metricShort(monthMetric, ncmDetails?.unit)}) da ${ncmStr}, 2019–${Y}`,
      source: `${SOURCE_COMEX} Contorno escuro: mês acima da média + 2 desvios-padrão do período.` });
    if (on('base100') && b100?.baseValida) list.push({ analise: 'base100', id: 'base100', kind: 'base100', pontos: b100.pontos, h: 400,
      heading: `Gráfico - Volume e preço médio das importações em base 100 (${anoBaseEf} = 100), anos completos (${ncmStr})`,
      source: `${SOURCE_COMEX} Índice = 100 × valor do ano ÷ valor de ${anoBaseEf}. Preço médio = US$ FOB ÷ kg.` });
    if (on('preco-mensal') && precoMes.some(p => p.mensal !== null)) list.push({ analise: 'preco-mensal', id: 'precoMensal', kind: 'precoMensal', pontos: precoMes, janela: janelaPreco, h: 420,
      heading: `Gráfico - Preço médio mensal de importação e preço móvel de ${janelaPreco} meses (US$ FOB/kg) (${ncmStr})`,
      source: `${SOURCE_COMEX} Preço móvel = soma do US$ FOB ÷ soma do kg na janela (não é média de preços mensais). Meses sem importação ficam sem ponto.` });
    if (on('variacao-origem') && comp && countryYears && decomp.linhas.length) {
      const src = `${SOURCE_COMEX} Períodos comparados: ${comp.anterior} e ${comp.atual}.`;
      if (cascataUnidade === 't') list.push({ analise: 'variacao-origem', id: 'cascataT', kind: 'cascataT', rows: cascT.rows, h: 440, source: src,
        heading: `Gráfico - Contribuição de cada país para a variação do volume importado (t), ${comp.anterior} → ${comp.atual} (${ncmStr})` });
      else list.push({ analise: 'variacao-origem', id: 'cascata', kind: 'cascata', rows: cascata, h: 440, source: src,
        heading: `Gráfico - Decomposição da variação do valor importado (US$ FOB) por país, ${comp.anterior} → ${comp.atual} (${ncmStr})` });
      list.push({ analise: 'variacao-origem', id: 'efeitos', kind: 'efeitos', linhas: decomp.linhas, h: Math.max(260, 60 + decomp.linhas.length * 34), source: src,
        heading: `Gráfico - Efeito quantidade × efeito preço por país, ${comp.anterior} → ${comp.atual} (${ncmStr})`,
        tableAfter: {
          heading: 'Decomposição da variação por país (US$ FOB)', source: src,
          columns: ['País', comp.anterior, comp.atual, 'Variação', 'Efeito quantidade', 'Efeito preço'],
          rows: decomp.linhas.map(l => [l.pais, formatIntegerPtBR(l.v0), formatIntegerPtBR(l.v1), formatIntegerPtBR(l.delta), formatIntegerPtBR(l.efeitoQuantidade), formatIntegerPtBR(l.efeitoPreco)]),
        } });
    }
    if (on('paises-graficos')) {
      countryPeriods.forEach((cp, idx) => {
        // Notebook: em dezembro, os treemaps do ano anterior ficam de fora da ficha
        if (idx === 0 && M === 12) return;
        const lbl = idx === 0 ? cp.label : `${Y} até o mês ${pad2(M!)}`;
        list.push(
          { analise: 'paises-graficos', id: `tm-imp-fob-${idx}`, heading: `Treemap - Origem das Importações (US$ FOB) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'import', metric: 'metricFOB', countries: cp.imports },
          { analise: 'paises-graficos', id: `tm-exp-fob-${idx}`, heading: `Treemap - Destino das Exportações (US$ FOB) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'export', metric: 'metricFOB', countries: cp.exports },
          { analise: 'paises-graficos', id: `tm-imp-kg-${idx}`, heading: `Treemap - Origem das Importações (KG) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'import', metric: 'metricKG', countries: cp.imports },
          { analise: 'paises-graficos', id: `tm-exp-kg-${idx}`, heading: `Treemap - Destino das Exportações (KG) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'export', metric: 'metricKG', countries: cp.exports },
        );
        // Unidade estatística: entra na ficha quando é a métrica escolhida na tela
        if (countryMetric === 'metricStatistic') {
          const u = metricUnit('metricStatistic', ncmDetails?.unit);
          list.push(
            { analise: 'paises-graficos', id: `tm-imp-st-${idx}`, heading: `Treemap - Origem das Importações (unidade estatística: ${u}) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'import', metric: 'metricStatistic', unitLabel: u, countries: cp.imports },
            { analise: 'paises-graficos', id: `tm-exp-st-${idx}`, heading: `Treemap - Destino das Exportações (unidade estatística: ${u}) ${lbl} (${ncmStr})`, kind: 'treemap', flow: 'export', metric: 'metricStatistic', unitLabel: u, countries: cp.exports },
          );
        }
      });
    }
    if (on('evolucao-paises') && shareImp && shareExp) {
      const m = metricShort(shareMetric, ncmDetails?.unit);
      const src = `${SOURCE_COMEX}${partialFootnote ? ` ${partialFootnote}` : ''}`;
      ([['import', 'Origem das Importações', 'da origem das importações', shareImp], ['export', 'Destino das Exportações', 'do destino das exportações', shareExp]] as const).forEach(([flow, t, tt, evo]) => {
        const tb = shareTable(evo);
        list.push({
          analise: 'evolucao-paises', id: `share-${flow}`, kind: 'share', flow, evo, colors: shareColors, unit: metricUnit(shareMetric, ncmDetails?.unit), source: src,
          heading: `Gráfico - Evolução ${tt} por país, participação % (${m}), ${SHARE_FROM}–${Y}${partialYear ? '*' : ''} (${ncmStr})`,
          tableAfter: evo.hasData ? { heading: `${t}: participação por ano (${m})`, columns: tb.columns, rows: tb.rows, source: src } : undefined,
        });
      });
    }
    if (on('concentracao') && conc.length) {
      const m = metricShort(shareMetric, ncmDetails?.unit);
      const src = `${SOURCE_COMEX}${partialFootnote ? ` ${partialFootnote}` : ''}`;
      list.push(
        { analise: 'concentracao', id: 'concentracao', kind: 'concentracao', data: conc, source: src, heading: `Gráfico - Concentração da origem das importações: maior fornecedor e 3 maiores (${m}) (${ncmStr})` },
        { analise: 'concentracao', id: 'hhi', kind: 'hhi', data: conc, source: src, heading: `Gráfico - Índice de concentração (HHI) da origem das importações (${m}) (${ncmStr})` },
      );
    }
    if (on('uf') && ufs && comp && ufs.linhas.some(l => l.v1 > 0)) {
      const src = `${SOURCE_COMEX} UF do domicílio fiscal do importador. Mapa: @svg-maps/brazil (CC BY 4.0).`;
      list.push(
        { analise: 'uf', id: 'mapaUf', kind: 'mapaUf', linhas: ufs.linhas, w: 620, h: 690, source: src, heading: `Mapa - Participação das UFs nas importações (US$ FOB), ${comp.atual} (${ncmStr})` },
        { analise: 'uf', id: 'rankingUf', kind: 'rankingUf', linhas: ufs.linhas, h: Math.max(280, 40 + Math.min(10, ufs.linhas.length) * 34), source: `${SOURCE_COMEX} Entre parênteses, variação sobre ${comp.anterior}.`,
          heading: `Gráfico - 10 maiores UFs importadoras (US$ FOB), ${comp.atual} (${ncmStr})` },
      );
    }
    if (on('nfe-penetracao') && pen.length) {
      list.push({ analise: 'nfe-penetracao', id: 'penetracao', kind: 'penetracao', data: pen, grupo: 'nfe', source: SOURCE_NFE,
        heading: `Gráfico - Penetração das importações no consumo nacional aparente (kg) (${ncmStr})` });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncmCode, annualRows, rollingChartData, countryPeriods, sel, Y, M, priceData, priceCountry, monthPoints, monthMode, monthMetric, countryMetric, shareImp, shareExp, shareMetric, shareColors,
    cal, comp, countryYears, cascata, decomp, conc, ufs, pen, janelas, b100, anoBaseEf, precoMes, janelaPreco, cascataUnidade, cascT]);

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
    const fpn = (v: number | null) => (v === null ? 'sem base' : formatPercentagePtBR(v));
    const imagens = (id: string) => reportCharts.filter(spec => spec.analise === id).forEach(spec => {
      const img = images[spec.id];
      if (img) items.push({ type: 'image', image: { heading: spec.heading, source: spec.source, ...img } });
      if (img && spec.tableAfter) items.push({ type: 'table', table: spec.tableAfter });
    });
    const quadro = (heading: string, flow: 'import' | 'export', rows: typeof importSummary) => {
      const cols = summaryCols(flow);
      const full = flow === 'import'
        ? ['Ano', 'Importações (US$ FOB)', 'Var. (%) Imp (US$ FOB)', 'Importações (kg)', 'Var. (%) Imp (kg)', 'Preço médio Importação (US$ FOB/Ton)', 'Var. (%) Preço médio Imp']
        : ['Ano', 'Exportações (US$ FOB)', 'Var. (%) Exp (US$ FOB)', 'Exportações (kg)', 'Var. (%) Exp (kg)', 'Preço médio Exp (US$ FOB/Ton)', 'Var. (%) Preço médio Exp'];
      items.push({ type: 'table', table: {
        heading, columns: full, source: SOURCE_COMEX,
        rows: rows.map(r => cols.map(c => c.key === 'Ano' ? r.Ano : c.key.startsWith('Var') ? fp(r[c.key]) : c.key.startsWith('Preço') ? fd(r[c.key]) : fi(r[c.key]))),
      } });
    };
    const semNfe = () => items.push({ type: 'text', text: 'Planilha de NF-e não carregada: vendas da indústria nacional e consumo nacional aparente não incluídos.', italic: true });

    // Cada análise selecionada, na ordem da tela
    for (const id of config.analises) {
      switch (id) {
        case 'kpis':
          if (kpi) items.push({ type: 'table', table: {
            heading: `Indicadores gerais · ${periodLabel(kpi.cur)}`, source: SOURCE_COMEX,
            columns: ['Indicador', periodLabel(kpi.cur), periodLabel(kpi.base), 'Variação'],
            rows: [
              ['Importações (US$ FOB)', fi(kpi.cur['Importações (US$ FOB)']), fi(kpi.base?.['Importações (US$ FOB)']), fpn(kpi.d('Importações (US$ FOB)'))],
              ['Importações (kg)', fi(kpi.cur['Importações (KG)']), fi(kpi.base?.['Importações (KG)']), fpn(kpi.d('Importações (KG)'))],
              ['Exportações (US$ FOB)', fi(kpi.cur['Exportações (US$ FOB)']), fi(kpi.base?.['Exportações (US$ FOB)']), fpn(kpi.d('Exportações (US$ FOB)'))],
              ['Balança comercial (US$ FOB)', fi(kpi.cur['Balança Comercial (FOB)']), fi(kpi.base?.['Balança Comercial (FOB)']), ''],
              ['Preço médio de importação (US$/kg)', fd(kpi.cur['Preço Médio Importação (US$/KG)']), fd(kpi.base?.['Preço Médio Importação (US$/KG)']), fpn(kpi.d('Preço Médio Importação (US$/KG)'))],
              ...(twelveMonth ? [['Importações nos últimos 12 meses (kg)', fi(twelveMonth.blocks[0].importacaoKg), fi(twelveMonth.blocks[1]?.importacaoKg), twelveMonth.comparisons[0].resultado == null ? '' : formatPercentagePtBR(twelveMonth.comparisons[0].resultado * 100)]] : []),
            ],
          } });
          break;
        case 'tabela-anual':
          items.push({ type: 'table', table: {
            heading: 'Dados anuais resumidos',
            columns: ['Ano', 'Exportações (US$ FOB)', 'Exportações (KG)', 'Importações (US$ FOB)', 'Importações (KG)', 'Balança Comercial (FOB)', 'Balança Comercial (KG)'],
            rows: annualRows.map(r => [r.year, fi(r['Exportações (US$ FOB)']), fi(r['Exportações (KG)']), fi(r['Importações (US$ FOB)']), fi(r['Importações (KG)']), fi(r['Balança Comercial (FOB)']), fi(r['Balança Comercial (KG)'])]),
            source: SOURCE_COMEX,
          } });
          break;
        case 'quadro-exp': quadro('Quadro resumo das Exportações', 'export', exportSummary); break;
        case 'quadro-imp': quadro('Quadro resumo das Importações', 'import', importSummary); break;
        case 'dados-completos':
          items.push({ type: 'table', table: {
            heading: 'Dados anuais completos', source: SOURCE_COMEX,
            columns: ['Ano', 'Imp (US$ FOB)', 'Imp (CIF US$)', 'Frete (US$)', 'Seguro (US$)', 'Imp (kg)', 'P. médio imp (US$/t)', 'Exp (US$ FOB)', 'Exp (kg)', 'P. médio exp (US$/t)'],
            rows: annualRows.map(r => [r.year, fi(r['Importações (US$ FOB)']), fi(r['Importações (CIF USD)']), fi(r['Importações (Frete USD)']), fi(r['Importações (Seguro USD)']), fi(r['Importações (KG)']),
              fd(r['Preço Médio Importação (US$ FOB/Ton)']), fi(r['Exportações (US$ FOB)']), fi(r['Exportações (KG)']), fd(r['Preço Médio Exportação (US$ FOB/Ton)'])]),
          } });
          break;
        case 'soma-12m':
          imagens(id);
          if (twelveMonth) items.push({ type: 'table', table: {
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
          break;
        case 'janelas':
          imagens(id);
          if (janelas.length) items.push({ type: 'table', table: {
            heading: 'Janelas recentes vs mesmo período do ano anterior', source: `${SOURCE_COMEX} Variações calculadas a partir dos totais, sem arredondamento prévio.`,
            columns: ['Janela', 'Período', 'Volume (t)', 'Var. volume', 'Valor (US$ FOB)', 'Var. valor', 'Preço (US$/kg)', 'Var. preço'],
            rows: janelas.map(l => [l.janela, l.periodo, fi(l.kg / 1000), fpn(l.varKg), fi(l.usd), fpn(l.varUsd), l.preco === null ? '–' : fd(l.preco), fpn(l.varPreco)]),
          } });
          break;
        case 'surto':
          if (surgeAnalysisResult && !surgeAnalysisResult.error) {
            const r = surgeAnalysisResult;
            items.push({ type: 'table', table: {
              heading: 'Análise de surto de importação', source: SOURCE_COMEX,
              columns: ['Período', 'Importações (kg)'],
              rows: [
                [`Período analisado (${r.currentPeriod.startDate} a ${r.currentPeriod.endDate})`, fi(r.currentPeriod.sumKg)],
                ...r.previousPeriods.map(pp => [`${pp.periodLabel} (${pp.startDate} a ${pp.endDate})`, fi(pp.sumKg)]),
                ['Média dos períodos anteriores', fi(r.averagePreviousKg)],
                ['Variação sobre a média', formatPercentagePtBR(r.percentageChange)],
              ],
            } });
          } else items.push({ type: 'text', text: 'Análise de surto: nenhum período calculado na tela antes da exportação.', italic: true });
          break;
        case 'base100':
          imagens(id);
          if (b100?.baseValida) items.push({ type: 'table', table: {
            heading: `Volume e preço médio em base 100 (${anoBaseEf} = 100)`, source: SOURCE_COMEX,
            columns: ['Ano', 'Volume (t)', 'Índice volume', 'Preço (US$/kg)', 'Índice preço'],
            rows: b100.pontos.map(p => [p.name, fi(p.kg / 1000), p.volume === null ? '–' : fd(p.volume), p.p === null ? '–' : fd(p.p), p.preco === null ? '–' : fd(p.preco)]),
          } });
          else items.push({ type: 'text', text: 'Base 100: o ano-base escolhido não tem importação; índice não calculado.', italic: true });
          break;
        case 'sinais-radar':
          items.push({ type: 'heading', text: 'Sinais do radar de alertas' });
          if (alertaNcm) {
            items.push({ type: 'text', text: `Nível: ${alertaNcm.nivel === 'alto' ? 'alto' : alertaNcm.nivel === 'medio' ? 'médio' : 'atenção'} (${alertaNcm.pontos} pontos) · cesta ${alertaNcm.cestaRotulo} · referência ${alertaNcm.periodoRef.slice(4)}/${alertaNcm.periodoRef.slice(0, 4)}.` });
            alertaNcm.sinais.forEach(si => items.push({ type: 'text', bullet: true, text: `${ROTULO_SINAL[si.tipo]}: ${si.texto}` }));
          } else items.push({ type: 'text', text: radarOk ? 'A NCM não tem sinal no radar de alertas (o radar cobre apenas as NCMs das cestas).' : 'Radar de alertas indisponível no momento.' });
          items.push({ type: 'text', italic: true, text: 'Sinais estatísticos de triagem: não caracterizam, por si, desequilíbrio comercial, dumping ou dano.' });
          break;
        case 'origens-diagnostico':
          if (comp && diag.linhas.length) items.push({ type: 'table', table: {
            heading: `Diagnóstico integrado por origem, ${comp.anterior} → ${comp.atual}`,
            source: `${SOURCE_COMEX} Participação pelo volume (kg). Preço = US$ FOB ÷ kg. ${diag.contribuicaoBruta ? 'Variação líquida próxima de zero: contribuição calculada sobre o aumento bruto.' : 'Contribuição = variação do volume do país ÷ variação total (pode passar de 100% quando outros recuam).'}`,
            columns: ['Origem', `Volume ${comp.anterior} (t)`, `Volume ${comp.atual} (t)`, 'Var. volume', `Part. ${comp.atual}`, 'Dif. (p.p.)', `US$/kg ${comp.atual}`, 'Var. preço', 'Contribuição'],
            rows: [...diag.linhas, diag.total].map(l => [l.pais, fi(l.kg0 / 1000), fi(l.kg1 / 1000), fpn(l.varKg), formatPercentagePtBR(l.part1), `${l.difPp > 0 ? '+' : ''}${formatDecimalPtBR(l.difPp)}`, l.preco1 === null ? '–' : fd(l.preco1), fpn(l.varPreco), l.contribKg === null ? '–' : formatPercentagePtBR(l.contribKg)]),
          } });
          break;
        case 'paises-tabelas':
          countryPeriods.forEach((cpx, idx) => {
            if (idx === 0 && M === 12) return;
            ([['Importações', cpx.imports], ['Exportações', cpx.exports]] as const).forEach(([t, rows]) => items.push({ type: 'table', table: {
              heading: `${t} por país · ${cpx.label} (${metricShort(countryMetric, ncmDetails?.unit)})`, source: SOURCE_COMEX,
              columns: ['País', METRIC_HEAD[countryMetric], 'Participação'],
              rows: sortByMetric(rows).slice(0, 20).map(r => [r.country, fi(r[countryMetric]), pct1(r[shareKey(countryMetric)] as number)]),
            } }));
          });
          break;
        case 'nfe-penetracao':
          if (!nfeAll) semNfe(); else imagens(id);
          break;
        case 'nfe-tabelas':
          if (!nfeAll) { if (!config.analises.includes('nfe-penetracao')) semNfe(); break; }
          items.push({ type: 'table', table: { heading: 'Vendas da Indústria Nacional', columns: nfeSalesColumns.map(c => c.header), rows: nfeSalesTable.map(r => nfeSalesColumns.map(c => (r as any)[c.key] ?? '')), source: SOURCE_NFE, emptyMessage: 'Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.' } });
          items.push({ type: 'table', table: { heading: 'Consumo Nacional Aparente', columns: nfeCnaColumns.map(c => c.header), rows: nfeCnaTable.map(r => nfeCnaColumns.map(c => (r as any)[c.key] ?? '')), source: SOURCE_NFE, emptyMessage: 'Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.' } });
          break;
        case 'contatos':
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
          break;
        default:
          imagens(id);
      }
    }

    // Notas metodológicas das análises incluídas e limitações do modelo
    const notas = notasMetodologicas();
    if (notas.length || modelo.aviso) {
      items.push({ type: 'heading', text: 'Notas metodológicas e limitações' });
      if (modelo.aviso) items.push({ type: 'text', text: modelo.aviso, italic: true });
      notas.forEach(n => items.push({ type: 'text', bullet: true, text: n }));
    }
    items.push({ type: 'text', text: `Relatório gerado em: ${new Date().toLocaleDateString('pt-BR')} · Modelo: ${modelo.nome}${config.modificada ? ' (seleção ajustada)' : ''}` });

    const tituloFicha = config.titulo || modelo.titulo;
    const subtitle = `${ncmStr} – ${ncmDetails?.description ?? ''} · Unidade estatística: ${ncmDetails?.unit ?? '–'} · Dados Comex Stat atualizados até ${pad2(M!)}/${Y}${lastUpdateData?.date ? ` (extração em ${lastUpdateData.date})` : ''}`;
    const blob = await buildWordReport(tituloFicha, subtitle, items);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ficha_${modelo.tipo === 'institucional' ? modelo.id : 'personalizada'}_NCM_${ncmCode}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /** Notas que valem para as análises selecionadas (seção 11 da especificação). */
  const notasMetodologicas = () => {
    const n: string[] = [];
    const tem = (...ids: string[]) => ids.some(on);
    if (partialYear && tem('kpis', 'quadro-imp', 'quadro-exp', 'tabela-anual', 'variacao-origem', 'uf', 'origens-diagnostico'))
      n.push(`O ano de ${Y} está incompleto (até ${getMonthNamePtBR(M!)}): comparações usam o mesmo período do ano anterior.`);
    if (tem('precos', 'preco-mensal', 'base100', 'janelas', 'origens-diagnostico'))
      n.push('Preço médio = soma do valor FOB ÷ soma da quantidade (valor unitário agregado). Não é preço internado nem indicador de subcotação; nunca é média de preços.');
    if (tem('janelas', 'origens-diagnostico', 'quadro-imp', 'quadro-exp')) n.push('Base anterior igual a zero: fluxo novo, sem variação percentual.');
    if (tem('evolucao-paises', 'concentracao', 'origens-diagnostico')) n.push('Participações e HHI calculados com o universo completo de países; “Demais” agrega apenas para exibição. Mudanças de participação em pontos percentuais.');
    if (tem('uf')) n.push('UF de importação = domicílio fiscal da empresa importadora, não o destino final da mercadoria.');
    if (tem('nfe-penetracao', 'nfe-tabelas')) n.push('Dados de NF-e: fonte interna de natureza restrita, processada apenas no navegador. Ausência de NF-e indica indisponibilidade, não zero.');
    if (tem('surto', 'soma-12m', 'janelas', 'sinais-radar')) n.push('Indícios estatísticos de variação não comprovam causalidade, dumping ou dano.');
    return n;
  };

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  const dataReady = !!ncmCode && annualRows.length > 0;
  const hasAnyTrade = annualRows.some(r => (r['Importações (US$ FOB)'] || 0) + (r['Exportações (US$ FOB)'] || 0) > 0);
  // Navegação: uma entrada por família, apontando para a primeira análise dela na ordem escolhida
  const nav = useMemo(() => {
    const vistas = new Set<string>();
    const out: { id: string; label: string }[] = [{ id: 'visao-geral', label: 'Visão geral' }];
    config.analises.forEach(id => {
      const f = ANALISE[id]?.familia;
      if (f && !vistas.has(f)) { vistas.add(f); out.push({ id: `a-${id}`, label: NAV_FAMILIA[f] }); }
    });
    return out;
  }, [config.analises]);
  const stepStatus = (k: string) => steps.find(st => st.key === k)?.status;
  const aguardando = (ds: ApiDs, erro: string) => (
    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{stepStatus(ds) === 'error' ? erro : 'Carregando…'}</p>
  );
  const primeiroNfe = config.analises.find(id => id === 'nfe-penetracao' || id === 'nfe-tabelas');
  const nfeUpload = <FileUpload label="Planilha de NF-e (SECEX/RFB)" hint="Ex.: dados_nfe_2016_2025_ajustado.xlsx (aba Dados). Lida só no seu navegador." onFileUpload={handleNfeFile} loading={fileBusy === 'nfe'} fileName={nfeFile?.name} />;
  const cgimUpload = <FileUpload label="Planilha CGIM/DINTE" hint="Ex.: 20241011_NCMs-CGIM-DINTE.xlsx (aba NCMs-CGIM-DINTE e abas das entidades). Lida só no seu navegador." onFileUpload={handleCgimFile} loading={fileBusy === 'cgim'} fileName={cgimFile?.name} />;
  const fmtPctN = (v: number | null) => (v === null ? <span className="text-slate-400">fluxo novo</span> : <VarCell value={v} />);
  const nivelCor = { alto: 'bg-red-100 text-red-800', medio: 'bg-amber-100 text-amber-800', atencao: 'bg-sky-100 text-sky-800' } as const;
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

  const unitM = metricUnit(monthMetric, ncmDetails?.unit);

  /** Conteúdo de cada análise do catálogo. A ordem de exibição vem da configuração. */
  const bloco = (id: string): React.ReactNode => {
    switch (id) {
      case 'kpis':
        return kpi && (
          <section id={`a-${id}`} className="mb-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <KpiCard label={`Importações · ${periodLabel(kpi.cur)}`} {...money(kpi.cur['Importações (US$ FOB)'])} delta={kpi.d('Importações (US$ FOB)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
              <KpiCard label={`Importações (kg) · ${periodLabel(kpi.cur)}`} value={tons(kpi.cur['Importações (KG)'])} unit="t" delta={kpi.d('Importações (KG)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
              <KpiCard label={`Exportações · ${periodLabel(kpi.cur)}`} {...money(kpi.cur['Exportações (US$ FOB)'])} delta={kpi.d('Exportações (US$ FOB)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
              <KpiCard label={`Balança comercial · ${periodLabel(kpi.cur)}`} {...money(kpi.cur['Balança Comercial (FOB)'])} hint={(kpi.cur['Balança Comercial (FOB)'] || 0) >= 0 ? 'superávit' : 'déficit'} />
              <KpiCard label="Preço médio de importação" value={formatDecimalPtBR(kpi.cur['Preço Médio Importação (US$/KG)'] ?? null)} unit="US$/kg" delta={kpi.d('Preço Médio Importação (US$/KG)')} deltaLabel={`vs ${periodLabel(kpi.base)}`} />
              <KpiCard label="Importações · últimos 12 meses" value={twelveMonth ? tons(twelveMonth.blocks[0].importacaoKg) : '–'} unit="t" delta={twelveMonth?.comparisons[0].resultado != null ? twelveMonth.comparisons[0].resultado * 100 : null} deltaLabel="vs 12 meses anteriores" />
            </div>
          </section>
        );
      case 'imp-anual':
      case 'exp-anual': {
        const imp = id === 'imp-anual', fl = imp ? 'Importações' : 'Exportações';
        return (
          <Bloco aid={id} description={`Desde ${since2010[0]?.yearNumeric ?? 2010}. ${imp ? 'Importações em laranja' : 'Exportações em azul'}; tons claros = períodos parciais.`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title={`${fl} (kg) da ${ncmStr}`} legend={imp ? partialNote : partialNoteExp}><AnnualBarChart data={barData(`${fl} (KG)` as keyof ProcessedTradeData)} flow={imp ? 'import' : 'export'} unitLabel={`${fl} (kg)`} /></ChartCard>
              <ChartCard title={`${fl} (US$ FOB) da ${ncmStr}`} legend={imp ? partialNote : partialNoteExp}><AnnualBarChart data={barData(`${fl} (US$ FOB)` as keyof ProcessedTradeData)} flow={imp ? 'import' : 'export'} unitLabel={`${fl} (US$ FOB)`} /></ChartCard>
            </div>
          </Bloco>
        );
      }
      case 'precos':
        return (
          <Bloco aid={id} title="Preços médios de importação e exportação (US$ FOB/kg)" description={priceCountry ? `Linhas cheias: todos os países · tracejadas: ${priceCountry}` : 'Valor unitário agregado: soma do US$ FOB ÷ soma do kg.'}
            actions={countryYears ? <CountryPicker countries={priceCountries} value={priceCountry} onChange={setPriceCountry} /> : <span className="text-[11px] text-slate-400">Carregando países…</span>}>
            <ChartCard title={`Preços médios da ${ncmStr}`}><PriceLineChart data={priceData} country={priceCountry} /></ChartCard>
          </Bloco>
        );
      case 'balanca':
        return <Bloco aid={id} title="Exportação, importação e balança comercial (US$ FOB)" description="Importações representadas abaixo do zero."><ChartCard title={ncmStr}><TradeBalanceChart data={balanceData} /></ChartCard></Bloco>;
      case 'tabela-anual':
        return <Bloco aid={id} title="Dados anuais resumidos" description="Linhas destacadas são períodos parciais (até o último mês disponível)."><DataTable data={resumedRows} columns={resumedColumns} formatters={resumedFormatters} source={SOURCE_COMEX} /></Bloco>;
      case 'quadro-imp':
      case 'quadro-exp': {
        const f = id === 'quadro-imp' ? 'import' : 'export';
        return (
          <Bloco aid={id} title={`Quadro resumo das ${f === 'import' ? 'importações' : 'exportações'}`} description={partialYear ? `O período parcial de ${Y} é comparado com o mesmo período de ${Y! - 1}.` : undefined}>
            <DataTable data={f === 'import' ? importSummary : exportSummary} columns={summaryCols(f)} formatters={summaryFormatters(f)} source={SOURCE_COMEX} />
          </Bloco>
        );
      }
      case 'dados-completos':
        return <Bloco aid={id} description="Todas as métricas desde 2004, incluindo CIF, frete, seguro e preços médios." defaultOpen={false}><DataTable data={annualRows} columns={fullColumns} formatters={fullFormatters} source={SOURCE_COMEX} compact /></Bloco>;
      case 'soma-12m':
        return (
          <Bloco aid={id} title="Importações acumuladas em 12 meses" description="Soma móvel de 12 meses (kg) e comparação de blocos de 12 meses (P1 a P5, P5 = mais recente).">
            {rollingChartData.length ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartCard className="lg:col-span-2" title={`Importações acumuladas nos últimos 12 meses (kg) – ${ncmStr}`}><RollingSumChart data={rollingChartData} /></ChartCard>
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
            ) : stepStatus('monthly') === 'done' ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A API Comex Stat não retornou dados mensais de importação para esta NCM.</p>
              : aguardando('monthly', 'Não foi possível carregar os dados mensais.')}
          </Bloco>
        );
      case 'janelas':
        return (
          <Bloco aid={id} title="Últimos 3, 6 e 12 meses vs o mesmo período do ano anterior" description="O movimento está se intensificando ou perdendo força? Variações calculadas sobre os totais de cada janela.">
            {!janelas.length ? aguardando('monthly', 'Não foi possível carregar os dados mensais.') : (
              <div className="space-y-4">
                <ChartCard title="Variação por janela" subtitle="Passe o mouse para ver os valores. Barras acima de ±300% são cortadas e rotuladas.">
                  <JanelasChart linhas={janelas} />
                </ChartCard>
                <div>
                  <DataTable compact stickyFirstColumn={false} data={janelas} source={SOURCE_COMEX}
                    columns={[
                      { key: 'janela', header: 'Janela', LTR: true }, { key: 'periodo', header: 'Período', LTR: true }, { key: 'kg', header: 'Volume (t)' }, { key: 'varKg', header: 'Var. volume' },
                      { key: 'usd', header: 'US$ FOB' }, { key: 'varUsd', header: 'Var. US$ FOB' }, { key: 'preco', header: 'US$/kg' }, { key: 'varPreco', header: 'Var. preço' },
                    ]}
                    formatters={{ kg: (v: number) => formatIntegerPtBR(v / 1000), usd: formatIntegerPtBR, preco: (v: number | null) => (v === null ? '–' : formatDecimalPtBR(v)), varKg: fmtPctN, varUsd: fmtPctN, varPreco: fmtPctN }} />
                  <p className="mt-2 text-[11px] text-slate-500">Comparação com a mesma janela do ano anterior ({janelas[0].periodoAnt} para o último mês). Intensificação recente não comprova causalidade.</p>
                </div>
              </div>
            )}
          </Bloco>
        );
      case 'mensal-48':
        return (
          <Bloco aid={id} title={monthTitle} description={`${monthRange}. ${monthMode === 'serie' ? 'Linha tracejada = média mensal dos 48 meses.' : 'Uma linha por ano; anos com * estão incompletos na janela.'}`}
            actions={<>
              <SegmentedControl value={monthMode} onChange={setMonthMode} options={[{ value: 'serie', label: 'Série contínua' }, { value: 'anos', label: 'Comparação por ano' }]} />
              <MetricSelector value={monthMetric} onChange={setMonthMetric} unitName={uName} />
            </>}>
            {monthMetric === 'metricStatistic' && kgUnit && <p className="mb-2 text-[11px] text-slate-500">{KG_UNIT_NOTE}</p>}
            {!monthPoints.length ? aguardando('monthly', 'Não foi possível carregar os dados mensais.') : (
              <ChartCard title={`${ncmStr} · ${metricShort(monthMetric, ncmDetails?.unit)}`}>
                {monthMode === 'serie' ? <MonthlyImportsChart points={monthPoints} unit={unitM} /> : <YearCompareChart years={monthByYear.years} data={monthByYear.data} unit={unitM} partialYears={monthPartialYears} />}
              </ChartCard>
            )}
          </Bloco>
        );
      case 'calendario':
        return (
          <Bloco aid={id} title={`Calendário das importações, mês a mês · ${metricShort(monthMetric, ncmDetails?.unit)}`} description="Cores mais escuras = meses com mais importação. Contorno escuro = mês atípico (acima da média + 2 desvios-padrão)."
            actions={!on('mensal-48') ? <MetricSelector value={monthMetric} onChange={setMonthMetric} unitName={uName} /> : <span className="text-[11px] text-slate-400">métrica do gráfico mensal</span>}>
            {cal ? <ChartCard title={ncmStr}><CalendarioHeatmap cal={cal} unit={unitM} /></ChartCard> : aguardando('monthly', 'Não foi possível carregar os dados mensais.')}
          </Bloco>
        );
      case 'surto':
        return (
          <Bloco aid={id} title="Análise de surto de importação" description="Compara o volume importado no período escolhido com a média dos mesmos meses nos 3 anos anteriores.">
            <SurgeAnalysisConfigurator onCalculate={handleCalculateSurge} isLoading={surgeLoading} lastUpdateData={lastUpdateData} />
            <SurgeAnalysisDisplay result={surgeAnalysisResult} isLoading={surgeLoading} />
          </Bloco>
        );
      case 'base100':
        return (
          <Bloco aid={id} title="Volume e preço médio das importações em base 100" description="As importações crescem enquanto o valor unitário cai? Índice = 100 × valor do ano ÷ valor do ano-base. Só anos completos."
            actions={anosBase.length > 1 ? (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">Ano-base
                <select value={anoBaseEf ?? ''} onChange={e => setAnoBase(Number(e.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs">
                  {anosBase.slice(0, -1).map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>) : undefined}>
            {!b100 ? null : !b100.baseValida ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Sem importação em {anoBaseEf}: índice não calculado. Escolha outro ano-base.</p> : (
              <div className="grid gap-4 lg:grid-cols-5">
                <ChartCard className="lg:col-span-3" title={`${ncmStr} · ${anoBaseEf} = 100`}
                  subtitle={(() => { const u = b100.pontos[b100.pontos.length - 1]; return u.volume !== null && u.preco !== null ? `${u.name}: volume ${u.volume >= 100 ? '+' : ''}${formatDecimalPtBR(u.volume - 100)}% e preço ${u.preco >= 100 ? '+' : ''}${formatDecimalPtBR(u.preco - 100)}% sobre ${anoBaseEf}.` : undefined; })()}>
                  <Base100Chart pontos={b100.pontos} />
                </ChartCard>
                <div className="lg:col-span-2">
                  <DataTable compact stickyFirstColumn={false} data={b100.pontos} source={SOURCE_COMEX}
                    columns={[{ key: 'name', header: 'Ano', LTR: true }, { key: 'kg', header: 'Volume (t)' }, { key: 'volume', header: 'Índice vol.' }, { key: 'p', header: 'US$/kg' }, { key: 'preco', header: 'Índice preço' }]}
                    formatters={{ kg: (v: number) => formatIntegerPtBR(v / 1000), volume: (v: number | null) => (v === null ? '–' : formatDecimalPtBR(v)), p: (v: number | null) => (v === null ? '–' : formatDecimalPtBR(v)), preco: (v: number | null) => (v === null ? '–' : formatDecimalPtBR(v)) }} />
                  {partialYear && <p className="mt-2 text-[11px] text-slate-500">{Y} está incompleto e fica fora do índice; veja as janelas recentes para o ano corrente.</p>}
                </div>
              </div>
            )}
          </Bloco>
        );
      case 'sinais-radar':
        return (
          <Bloco aid={id} title="Sinais do radar para esta NCM" description={radarOk ? `Radar de alertas com dados até ${pad2(radarOk.atualizacao.mes)}/${radarOk.atualizacao.ano} (gerado automaticamente a partir das cestas).` : undefined}>
            {!radarArquivo ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Carregando o radar…</p>
              : radarArquivo === 'erro' ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Não foi possível ler o radar de alertas.</p>
              : !alertaNcm ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">A NCM não tem sinal no radar. O radar cobre apenas as NCMs das cestas (por entidade e temáticas).</p>
              : (
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${nivelCor[alertaNcm.nivel]}`}>{alertaNcm.nivel === 'alto' ? 'Alto' : alertaNcm.nivel === 'medio' ? 'Médio' : 'Atenção'}</span>
                    <span className="text-slate-600">{alertaNcm.pontos} pontos · cesta {alertaNcm.cestaRotulo}</span>
                    {alertaNcm.limitadoPorMaterialidade && <span className="text-xs text-slate-500">(nível limitado pela materialidade na cesta)</span>}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {alertaNcm.sinais.map(si => <li key={si.tipo}><b className="font-semibold text-slate-900">{ROTULO_SINAL[si.tipo]}:</b> <span className="text-slate-700">{si.texto}</span></li>)}
                  </ul>
                  <p className="mt-3 text-[11px] text-slate-500">Sinais estatísticos de triagem; não caracterizam, por si, desequilíbrio comercial, dumping ou dano. <a className="text-brand-600 underline" href="#/metodologia">Metodologia</a></p>
                </div>
              )}
          </Bloco>
        );
      case 'preco-mensal':
        return (
          <Bloco aid={id} title="Preço médio mensal e móvel das importações (US$ FOB/kg)" description="Preço móvel = soma do US$ FOB ÷ soma do kg na janela, nunca média de preços mensais. Meses sem importação ficam sem ponto."
            actions={<SegmentedControl<'3' | '6' | '12'> value={String(janelaPreco) as '3' | '6' | '12'} onChange={v => setJanelaPreco(Number(v) as 3 | 6 | 12)} options={[{ value: '3', label: '3 meses' }, { value: '6', label: '6 meses' }, { value: '12', label: '12 meses' }]} />}>
            {!precoMes.length ? aguardando('monthly', 'Não foi possível carregar os dados mensais.') : <ChartCard title={`${ncmStr} · últimos 48 meses`}><PrecoMensalChart pontos={precoMes} janela={janelaPreco} /></ChartCard>}
          </Bloco>
        );
      case 'variacao-origem':
        return comp && (
          <Bloco aid={id} title="Variação das importações por origem" description="Quem explica a variação entre dois períodos iguais: em valor (com efeito quantidade e efeito preço) ou em toneladas."
            actions={<>
              <SegmentedControl<'usd' | 't'> value={cascataUnidade} onChange={setCascataUnidade} options={[{ value: 'usd', label: 'US$ FOB' }, { value: 't', label: 'Toneladas' }]} />
              <ComparacaoSelector />
            </>}>
            {!countryYears ? aguardando('country', 'Não foi possível carregar os dados por país.') : (
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  {cascataUnidade === 'usd' ? (
                    <ChartCard title={`De onde veio a variação do valor importado (US$ FOB), ${comp.anterior} → ${comp.atual}`}
                      subtitle={`Total: US$ ${formatCompactPtBR(decomp.total0)} → US$ ${formatCompactPtBR(decomp.total1)}. Laranja = país que vendeu mais ao Brasil; verde = país que vendeu menos.`}>
                      <CascataChart rows={cascata} />
                    </ChartCard>
                  ) : (
                    <ChartCard title={`De onde veio a variação do volume importado (t), ${comp.anterior} → ${comp.atual}`}
                      subtitle={`Total: ${formatIntegerPtBR(cascT.total0)} t → ${formatIntegerPtBR(cascT.total1)} t. A soma das contribuições é igual à variação total.${(() => { const top = cascT.rows[0]; const tot = cascT.total1 - cascT.total0; return top && top.name !== 'Variação total' && Math.abs(tot) > 0 && !diag.contribuicaoBruta ? ` ${top.name} responde por ${formatDecimalPtBR((100 * top.delta) / tot)}% da variação líquida.` : ''; })()}`}>
                      <CascataToneladasChart rows={cascT.rows} />
                    </ChartCard>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <ChartCard title="Efeito quantidade × efeito preço, por país (US$)"
                    subtitle="Quantidade = variação do volume ao preço anterior; preço = variação do preço sobre o volume atual. A soma é a variação total.">
                    <EfeitosChart linhas={decomp.linhas} />
                  </ChartCard>
                </div>
              </div>
            )}
          </Bloco>
        );
      case 'paises-graficos':
      case 'paises-tabelas': {
        const graf = id === 'paises-graficos';
        return (
          <Bloco aid={id} title={graf ? 'Origem das importações e destino das exportações' : 'Tabelas de origens e destinos'} description={graf ? 'Participação de cada país. Cores mais escuras = maior participação.' : undefined}
            actions={countryPeriods.length > 0 && <>
              <SegmentedControl value={countryPeriodIdx} onChange={setCountryPeriodIdx} options={countryPeriods.map((p, k) => ({ value: String(k) as '0' | '1', label: p.label }))} />
              <MetricSelector value={countryMetric} onChange={setCountryMetric} unitName={uName} />
            </>}>
            {countryMetric === 'metricStatistic' && kgUnit && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{KG_UNIT_NOTE}</p>}
            {!cp ? aguardando('country', 'Não foi possível carregar os dados por país.') : graf ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title={`Origem das importações · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`}>
                  <CountryTreemap data={cp.imports} flow="import" metric={countryMetric} unitLabel={metricUnit(countryMetric, ncmDetails?.unit)} />
                </ChartCard>
                <ChartCard title={`Destino das exportações · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`}>
                  <CountryTreemap data={cp.exports} flow="export" metric={countryMetric} unitLabel={metricUnit(countryMetric, ncmDetails?.unit)} />
                </ChartCard>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <DataTable title={`Importações por país · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`} data={sortByMetric(cp.imports)} columns={countryColumns} formatters={countryFormatters} source={SOURCE_COMEX} compact />
                <DataTable title={`Exportações por país · ${cp.label} (${metricShort(countryMetric, ncmDetails?.unit)})`} data={sortByMetric(cp.exports)} columns={countryColumns} formatters={countryFormatters} source={SOURCE_COMEX} compact />
              </div>
            )}
          </Bloco>
        );
      }
      case 'origens-diagnostico':
        return comp && (
          <Bloco aid={id} title="Diagnóstico integrado por origem" description="Volume, participação, preço e contribuição de cada país para a variação das importações, nos mesmos períodos."
            actions={<ComparacaoSelector />}>
            {!countryYears ? aguardando('country', 'Não foi possível carregar os dados por país.') : (
              <>
                <DataTable sortable compact title={`Anterior: ${comp.anterior} · atual: ${comp.atual}`} subtitle="Clique no cabeçalho para ordenar. Participação pelo volume (kg); preço = US$ FOB ÷ kg." data={[...diag.linhas, diag.total]} source={SOURCE_COMEX}
                  columns={[
                    { key: 'pais', header: 'Origem', LTR: true }, { key: 'kg0', header: 'Vol. ant. (t)' }, { key: 'kg1', header: 'Vol. atual (t)' }, { key: 'varKg', header: 'Var. vol.' },
                    { key: 'part0', header: 'Part. ant.' }, { key: 'part1', header: 'Part. atual' }, { key: 'difPp', header: 'Dif. p.p.' },
                    { key: 'preco0', header: 'US$/kg ant.' }, { key: 'preco1', header: 'US$/kg atual' }, { key: 'varPreco', header: 'Var. preço' }, { key: 'contribKg', header: diag.contribuicaoBruta ? 'Contrib. aumento bruto' : 'Contrib. variação' },
                  ]}
                  formatters={{
                    pais: (v: string, r) => (r._fixo ? <b className="font-semibold">{v}</b> : v),
                    kg0: (v: number) => formatIntegerPtBR(v / 1000), kg1: (v: number) => formatIntegerPtBR(v / 1000), varKg: fmtPctN,
                    part0: (v: number) => pct1(v), part1: (v: number) => pct1(v), difPp: (v: number) => `${v > 0 ? '+' : ''}${formatDecimalPtBR(v)}`,
                    preco0: (v: number | null) => (v === null ? '–' : formatDecimalPtBR(v)), preco1: (v: number | null) => (v === null ? '–' : formatDecimalPtBR(v)),
                    varPreco: (v: number | null) => (v === null ? '–' : <VarCell value={v} />), contribKg: (v: number | null) => (v === null ? '–' : pct1(v)),
                  }} />
                <p className="mt-2 text-[11px] text-slate-500">{diag.contribuicaoBruta
                  ? 'A variação líquida do volume é próxima de zero; a contribuição é calculada sobre o aumento bruto (soma das altas).'
                  : 'Contribuição = variação do volume do país ÷ variação total. Pode passar de 100% quando outras origens recuam.'}</p>
              </>
            )}
          </Bloco>
        );
      case 'evolucao-paises':
        return (
          <Bloco aid={id} title="Evolução da origem das importações e do destino das exportações" description={`Participação dos 5 maiores países (pelo total acumulado desde ${SHARE_FROM}) em cada ano; os demais somam-se em “${OTHERS}”.`}
            actions={<MetricSelector value={shareMetric} onChange={setShareMetric} unitName={uName} />}>
            {shareMetric === 'metricStatistic' && kgUnit && <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{KG_UNIT_NOTE}</p>}
            {!shareImp || !shareExp ? aguardando('country', 'Não foi possível carregar os dados por país.') : (
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
                      data={tb.rows.map(r => Object.fromEntries(tb.columns.map((c, k) => [c, r[k]])))}
                      columns={tb.columns.map(c => ({ key: c, header: c, LTR: c === 'País' }))}
                      source={`${SOURCE_COMEX}${partialFootnote ? ` ${partialFootnote}` : ''}`} />
                  );
                })}
              </div>
            )}
          </Bloco>
        );
      case 'concentracao':
        return (
          <Bloco aid={id} title="Concentração da origem das importações" description="Participação do maior fornecedor e dos 3 maiores, e índice HHI, calculados com todos os países."
            actions={!on('evolucao-paises') ? <MetricSelector value={shareMetric} onChange={setShareMetric} unitName={uName} /> : <span className="text-[11px] text-slate-400">métrica da evolução por país</span>}>
            {!countryYears ? aguardando('country', 'Não foi possível carregar os dados por país.') : conc.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title={`Maior fornecedor e 3 maiores (${metricShort(shareMetric, ncmDetails?.unit)})`}
                  subtitle="O nome aparece quando o maior fornecedor muda." legend={partialFootnote || undefined}>
                  <ConcentracaoChart data={conc} />
                </ChartCard>
                <ChartCard title="Índice de concentração (HHI) das importações"
                  subtitle={`Soma dos quadrados das participações (0 a 10.000). Último ano: ${formatIntegerPtBR(conc[conc.length - 1].hhi)}, concentração ${faixaHhi(conc[conc.length - 1].hhi)}.`} legend={partialFootnote || undefined}>
                  <HhiChart data={conc} />
                </ChartCard>
              </div>
            )}
          </Bloco>
        );
      case 'uf':
        return comp && (
          <Bloco aid={id} title="Importações por UF de destino" description="UF do domicílio fiscal da empresa importadora, conforme o Comex Stat (detalhamento “UF do produto”). US$ FOB."
            actions={<ComparacaoSelector />}>
            {!ufs ? aguardando('uf', 'Não foi possível carregar as importações por UF.')
              : !ufs.linhas.some(l => l.v1 > 0) ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Sem importações em {comp.atual}.</p>
              : (
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
          </Bloco>
        );
      case 'nfe-penetracao':
      case 'nfe-tabelas': {
        const semPlanilha = !nfeAll && (
          <div className="space-y-2">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Requer a planilha de NF-e. Sem ela, o mercado interno fica indisponível (não é zero).</p>
            {primeiroNfe === id ? nfeUpload : <p className="text-xs text-slate-500">Envie a planilha no bloco de NF-e acima.</p>}
          </div>
        );
        return (
          <Bloco aid={id} title={id === 'nfe-penetracao' ? 'Penetração das importações no consumo nacional aparente' : 'Vendas da indústria nacional e consumo aparente'}
            description="Dados de NF-e (fonte interna, natureza restrita) lidos apenas no seu navegador.">
            {semPlanilha || (!nfeForNcm.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Não foram encontrados dados da Nota Fiscal Eletrônica para esta NCM.</p>
              : id === 'nfe-penetracao' ? (
                <ChartCard source={SOURCE_NFE} title={`Penetração das importações · ${ncmStr}`} subtitle="Consumo aparente = vendas internas da indústria + importações (kg). O rótulo mostra a parcela das importações.">
                  <PenetracaoChart data={pen} />
                </ChartCard>
              ) : (
                <div className="space-y-4">
                  <DataTable title={`Vendas da indústria nacional · ${ncmStr}`} data={nfeSalesTable} columns={nfeSalesColumns} source={SOURCE_NFE} />
                  <DataTable title={`Consumo nacional aparente · ${ncmStr}`} data={nfeCnaTable} columns={nfeCnaColumns} source={SOURCE_NFE} />
                  <Section title="Dados completos de NF-e" defaultOpen={false}>
                    <DataTable data={nfeForNcm} columns={nfeFullColumns} formatters={nfeFullFormatters} source={SOURCE_NFE} compact />
                  </Section>
                </div>
              ))}
          </Bloco>
        );
      }
      case 'contatos':
        return (
          <Bloco aid={id} title="Contatos da entidade" description="Planilha interna CGIM/DINTE, lida apenas no seu navegador.">
            {!cgimParsed ? (
              <div className="space-y-2">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Requer a planilha CGIM/DINTE.</p>
                {cgimUpload}
              </div>
            ) : entityContacts.length
              ? <ContactCards title={`Contatos da entidade responsável · ${ncmStr}`} contacts={entityContacts} />
              : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{cgimInfo ? 'A planilha não traz contato de entidade para esta NCM.' : 'Produto não é de competência da CGIM e não há entidade associada na planilha.'}</p>}
          </Bloco>
        );
      default:
        return null;
    }
  };

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
                <a key={n.id} href={`#${n.id}`} onClick={e => { e.preventDefault(); document.getElementById(n.id)?.scrollIntoView({ behavior: 'smooth' }); }} className="whitespace-nowrap px-3 py-2 text-xs font-medium text-white/70 hover:text-white">{n.label}</a>
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
            <p className="mt-1 text-red-600/80">{steps.find(st => st.key === 'basic')?.status === 'error'
              ? 'Para tentar de novo, clique em Analisar.'
              : 'As demais seções foram carregadas normalmente. Para tentar de novo, clique em Analisar.'}</p>
          </div>
        )}

        {/* Visão geral: cabeçalho sempre presente + modelo de análise */}
        {ncmCode && ncmDetails && (
          <section id="visao-geral" className="mb-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
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
                    <details className="group relative">
                      <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                        {Icons.excel} Excel <span className="text-[10px] text-slate-400">▾</span>
                      </summary>
                      <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                        {([['selecao', 'Dados da ficha selecionada', 'Só as planilhas das análises marcadas, na mesma ordem.'], ['base', 'Base consultada completa', 'Tudo o que já foi consultado nesta NCM (exportação anterior). Não faz novas consultas.']] as const).map(([k, t, d]) => (
                          <button key={k} onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; handleExportExcel(k); }}
                            className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                            <span className="block text-sm font-medium text-slate-800">{t}</span>
                            <span className="block text-[11px] leading-snug text-slate-500">{d}</span>
                          </button>
                        ))}
                      </div>
                    </details>
                    <Button variant="primary" onClick={handleExportWord} disabled={exportingWord} icon={Icons.word}>
                      {exportingWord ? 'Gerando ficha…' : 'Ficha em Word'}
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-4 border-t border-slate-100 pt-3">
                <ModeloBar config={config} onChange={setConfig} modelo={modelo} pessoais={pessoais} onPessoais={setPessoais}
                  disponivel={{ nfe: !!nfeAll, cgim: !!cgimParsed, radar: radarOk ? !!alertaNcm : null }} aberto={painelAberto} onToggle={() => setPainelAberto(v => !v)} />
                <p className="mt-1.5 text-xs text-slate-500"><b className="font-medium text-slate-600">{config.titulo || modelo.titulo}.</b> {modelo.objetivo}</p>
                {modelo.aviso && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{modelo.aviso}</p>}
              </div>
            </div>
            {painelAberto && (
              <ModeloPainel config={config} onChange={setConfig} modelo={modelo} pessoais={pessoais} onPessoais={setPessoais}
                disponivel={{ nfe: !!nfeAll, cgim: !!cgimParsed, radar: radarOk ? !!alertaNcm : null }} />
            )}
            {exportError && <p className="mt-2 text-sm text-red-600">{exportError}</p>}
            {dataReady && !hasAnyTrade && (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A API não retornou importações nem exportações para esta NCM no período. Confira se o código está correto e vigente.</p>
            )}
          </section>
        )}

        {/* Análises do modelo, na ordem escolhida */}
        {dataReady && config.analises.map(id => <React.Fragment key={id}>{bloco(id)}</React.Fragment>)}
        {dataReady && config.analises.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma análise selecionada. Abra “Análises” acima para escolher o que exibir.</p>
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
