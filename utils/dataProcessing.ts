import {
  ComexStatRecord, ProcessedTradeData, LastUpdateData, NcmDetails, YearSummaryData, NfeData,
  FormattedNfeSalesData, FormattedNfeCnaData, MonthlyComexStatRecord, MonthlySeriesPoint,
  SurgeAnalysisPeriodValues, SurgeAnalysisResult, YearRowKind, TwelveMonthSummary, TwelveMonthBlock,
} from '../types.ts';
import { formatIntegerPtBR, formatPercentagePtBR, getMonthNamePtBR, MONTHS_ABBR, pad2 } from './formatting.ts';

const safeDiv = (num: number, den: number): number | null => (den ? num / den : null);

/**
 * Junta exportações e importações por ano e calcula balança comercial e preços médios
 * (mesmas colunas do notebook: US$ FOB/Ton e US$/Qtd Estatística; US$/KG para o gráfico).
 */
export function processAnnualTradeData(
  exportData: ComexStatRecord[],
  importData: ComexStatRecord[],
  ncmCode: string,
  ncmDetails: NcmDetails,
  lastUpdateData: LastUpdateData | null,
  forcedKind?: YearRowKind,
): ProcessedTradeData[] {
  const byYear = new Map<number, ProcessedTradeData>();
  const get = (year: number) => {
    if (!byYear.has(year)) byYear.set(year, { year: String(year), yearNumeric: year });
    return byYear.get(year)!;
  };
  const add = (row: ProcessedTradeData, key: keyof ProcessedTradeData, v: unknown) => {
    (row as any)[key] = ((row as any)[key] || 0) + (Number(v) || 0);
  };

  exportData.forEach(item => {
    const r = get(Number(item.year));
    add(r, 'Exportações (US$ FOB)', item.metricFOB);
    add(r, 'Exportações (KG)', item.metricKG);
    add(r, 'Exportações (Qtd Estatística)', item.metricStatistic);
  });
  importData.forEach(item => {
    const r = get(Number(item.year));
    add(r, 'Importações (US$ FOB)', item.metricFOB);
    add(r, 'Importações (KG)', item.metricKG);
    add(r, 'Importações (Qtd Estatística)', item.metricStatistic);
    add(r, 'Importações (Frete USD)', item.metricFreight);
    add(r, 'Importações (Seguro USD)', item.metricInsurance);
    add(r, 'Importações (CIF USD)', item.metricCIF);
  });

  const lastYear = lastUpdateData?.year ?? null;
  const lastMonth = lastUpdateData?.month ?? null;
  const partialYear = lastMonth !== null && lastMonth < 12;

  return Array.from(byYear.values())
    .sort((a, b) => a.yearNumeric! - b.yearNumeric!)
    .map(item => {
      const r: ProcessedTradeData = {
        year: item.year,
        yearNumeric: item.yearNumeric,
        'Código NCM': ncmCode,
        'Descrição NCM': ncmDetails.description || '',
        'Unidade Estatística': ncmDetails.unit || '',
      };
      const expFob = item['Exportações (US$ FOB)'] || 0;
      const expKg = item['Exportações (KG)'] || 0;
      const expQtd = item['Exportações (Qtd Estatística)'] || 0;
      const impFob = item['Importações (US$ FOB)'] || 0;
      const impKg = item['Importações (KG)'] || 0;
      const impQtd = item['Importações (Qtd Estatística)'] || 0;
      Object.assign(r, {
        'Exportações (US$ FOB)': expFob,
        'Exportações (KG)': expKg,
        'Exportações (Qtd Estatística)': expQtd,
        'Importações (US$ FOB)': impFob,
        'Importações (KG)': impKg,
        'Importações (Qtd Estatística)': impQtd,
        'Balança Comercial (FOB)': expFob - impFob,
        'Balança Comercial (KG)': expKg - impKg,
        'Balança Comercial (Qtd Estatística)': expQtd - impQtd,
        'Importações (CIF USD)': item['Importações (CIF USD)'] || 0,
        'Importações (Frete USD)': item['Importações (Frete USD)'] || 0,
        'Importações (Seguro USD)': item['Importações (Seguro USD)'] || 0,
        'Preço Médio Exportação (US$ FOB/Ton)': safeDiv(expFob, expKg / 1000),
        'Preço Médio Importação (US$ FOB/Ton)': safeDiv(impFob, impKg / 1000),
        'Preço Médio Exportação (US$/Qtd Est)': safeDiv(expFob, expQtd),
        'Preço Médio Importação (US$/Qtd Est)': safeDiv(impFob, impQtd),
        'Preço Médio Exportação (US$/KG)': safeDiv(expFob, expKg),
        'Preço Médio Importação (US$/KG)': safeDiv(impFob, impKg),
      });

      let kind: YearRowKind = forcedKind ?? 'full';
      if (!forcedKind && partialYear && item.yearNumeric === lastYear) kind = 'ytd';
      r.kind = kind;
      if (kind !== 'full' && lastMonth !== null) {
        r.year = `${item.yearNumeric} (Até mês ${pad2(lastMonth)})`;
      }
      return r;
    });
}

/**
 * Ordena a série anual: anos fechados, depois "ano anterior até mês X" e "ano corrente até mês X".
 * (No notebook, o ano anterior até mês X é concatenado ao final; aqui fica ao lado do ano corrente
 * para leitura cronológica nos gráficos.)
 */
export function sortAnnualRows(rows: ProcessedTradeData[]): ProcessedTradeData[] {
  const key = (r: ProcessedTradeData) => (r.yearNumeric ?? 0) + (r.kind === 'prevYtd' ? 0.5 : 0);
  return [...rows].sort((a, b) => key(a) - key(b));
}

/**
 * Quadro resumo (notebook, células 13–16): anos a partir de 2020 (2019 só serve de base),
 * variação % contra o ano anterior. O "ano anterior até mês X" fica sem variação e
 * o "ano corrente até mês X" é comparado com ele (mesmo período).
 */
export function createYearSummary(fullData: ProcessedTradeData[], flow: 'import' | 'export'): YearSummaryData[] {
  const rows = fullData.filter(d => (d.yearNumeric ?? 0) >= 2019);
  const fobKey = flow === 'import' ? 'Importações (US$ FOB)' : 'Exportações (US$ FOB)';
  const kgKey = flow === 'import' ? 'Importações (KG)' : 'Exportações (KG)';
  const priceKey = flow === 'import' ? 'Preço Médio Importação (US$ FOB/Ton)' : 'Preço Médio Exportação (US$ FOB/Ton)';
  const labels = flow === 'import'
    ? { fob: 'Importações (US$ FOB)', vfob: 'Var. (%) Imp (US$ FOB)', kg: 'Importações (kg)', vkg: 'Var. (%) Imp (kg)', price: 'Preço médio Importação (US$ FOB/Ton)', vprice: 'Var. (%) Preço médio Imp' }
    : { fob: 'Exportações (US$ FOB)', vfob: 'Var. (%) Exp (US$ FOB)', kg: 'Exportações (kg)', vkg: 'Var. (%) Exp (kg)', price: 'Preço médio Exp (US$ FOB/Ton)', vprice: 'Var. (%) Preço médio Exp' };

  const pct = (cur: number | null | undefined, prev: number | null | undefined) =>
    cur !== null && cur !== undefined && prev ? ((cur - prev) / prev) * 100 : null;

  const out: YearSummaryData[] = [];
  rows.forEach(cur => {
    if ((cur.yearNumeric ?? 0) < 2020) return;
    let base: ProcessedTradeData | undefined;
    if (cur.kind === 'full') base = rows.find(r => r.kind === 'full' && r.yearNumeric === cur.yearNumeric! - 1);
    else if (cur.kind === 'ytd') base = rows.find(r => r.kind === 'prevYtd');
    // prevYtd: sem variação (como no notebook)

    const fob = cur[fobKey] as number;
    const kg = cur[kgKey] as number;
    const price = cur[priceKey] as number | null;
    out.push({
      'Ano': cur.year,
      kind: cur.kind,
      [labels.fob]: fob,
      [labels.vfob]: base ? pct(fob, base[fobKey] as number) : null,
      [labels.kg]: kg,
      [labels.vkg]: base ? pct(kg, base[kgKey] as number) : null,
      [labels.price]: price,
      [labels.vprice]: base ? pct(price, base[priceKey] as number | null) : null,
    });
  });
  return out;
}

/** Série mensal de importações preenchida com zeros, de 2019-01 até o último mês atualizado, com soma móvel de 12 meses. */
export function buildMonthlySeries(monthly: MonthlyComexStatRecord[], endYear: number, endMonth: number, startYear = 2019): MonthlySeriesPoint[] {
  const map = new Map<string, { kg: number; fob: number }>();
  monthly.forEach(m => {
    const key = `${m.year}-${pad2(m.month)}`;
    const cur = map.get(key) ?? { kg: 0, fob: 0 };
    cur.kg += m.metricKG || 0;
    cur.fob += m.metricFOB || 0;
    map.set(key, cur);
  });

  const series: MonthlySeriesPoint[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const lastM = y === endYear ? endMonth : 12;
    for (let m = 1; m <= lastM; m++) {
      const key = `${y}-${pad2(m)}`;
      const v = map.get(key) ?? { kg: 0, fob: 0 };
      series.push({ yearMonth: key, year: y, month: m, metricKG: v.kg, metricFOB: v.fob, rollingKG: null });
    }
  }
  let running = 0;
  series.forEach((p, i) => {
    running += p.metricKG;
    if (i >= 12) running -= series[i - 12].metricKG;
    p.rollingKG = i >= 11 ? running : null;
  });
  return series;
}

/**
 * Notebook, célula 24: cinco blocos consecutivos de 12 meses terminando no último mês disponível
 * (P5 = mais recente) e as comparações P5 vs P4, P5 vs Média(P2:P4), P5 vs Média(P1:P4).
 */
export function buildTwelveMonthSummary(series: MonthlySeriesPoint[]): TwelveMonthSummary | null {
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  const startMo = (last.month % 12) + 1;
  const yy = (y: number) => String(y).slice(-2);

  const blocks: TwelveMonthBlock[] = [];
  for (let i = 0; i < 5; i++) {
    const slice = series.slice(Math.max(0, series.length - (i + 1) * 12), series.length - i * 12);
    const endYear = last.year - i;
    const startYear = startMo > last.month ? endYear - 1 : endYear;
    blocks.push({
      periodo: `P${5 - i}`,
      dataInicio: `${MONTHS_ABBR[startMo - 1]}/${yy(startYear)}`,
      dataFinal: `${MONTHS_ABBR[last.month - 1]}/${yy(endYear)}`,
      importacaoKg: Math.round(slice.reduce((s, p) => s + p.metricKG, 0)),
    });
  }
  const [p5, p4, p3, p2, p1] = blocks.map(b => b.importacaoKg);
  const ratio = (num: number, den: number) => (den === 0 ? null : num / den - 1);
  return {
    blocks,
    comparisons: [
      { comparacao: 'P5 vs P4', resultado: ratio(p5, p4) },
      { comparacao: 'P5 vs Média(P2:P4)', resultado: ratio(p5, (p2 + p3 + p4) / 3) },
      { comparacao: 'P5 vs Média(P1:P4)', resultado: ratio(p5, (p1 + p2 + p3 + p4) / 4) },
    ],
  };
}

export function processNfeSalesData(nfeData: NfeData[]): FormattedNfeSalesData[] {
  const sorted = [...nfeData].sort((a, b) => (a.ano || 0) - (b.ano || 0));
  const delta = (cur: number, prev: number | undefined) => (prev ? formatPercentagePtBR(((cur - prev) / prev) * 100) : '');
  return sorted.map((item, i) => {
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const vt = item.qtd_tributavel_producao || 0;
    const vi = item['Vendas internas (KG)'] || 0;
    const ex = item.qtd_tributavel_exp || 0;
    return {
      ano: item.ano,
      'Vendas totais (Kg)': formatIntegerPtBR(vt),
      'Δ Vendas totais (%)': delta(vt, prev?.qtd_tributavel_producao),
      'Vendas internas (KG)': formatIntegerPtBR(vi),
      'Δ Vendas internas (%)': delta(vi, prev?.['Vendas internas (KG)']),
      'Exportações (Kg)': formatIntegerPtBR(ex),
      'Δ Exportações (%)': delta(ex, prev?.qtd_tributavel_exp),
    };
  });
}

export function processNfeCnaData(nfeData: NfeData[]): FormattedNfeCnaData[] {
  const sorted = [...nfeData].sort((a, b) => (a.ano || 0) - (b.ano || 0));
  const delta = (cur: number, prev: number | undefined) => (prev ? formatPercentagePtBR(((cur - prev) / prev) * 100) : '');
  return sorted.map((item, i) => {
    const prev = i > 0 ? sorted[i - 1] : undefined;
    const vi = item['Vendas internas (KG)'] || 0;
    const im = item.qtd_tributavel_imp || 0;
    const cna = item.consumo_nacional_aparente_qtd || 0;
    return {
      ano: item.ano,
      'Vendas internas (KG)': formatIntegerPtBR(vi),
      'Δ Vendas internas (%)': delta(vi, prev?.['Vendas internas (KG)']),
      'Importações (Kg)': formatIntegerPtBR(im),
      'Δ Importações (%)': delta(im, prev?.qtd_tributavel_imp),
      'CNA (Kg)': formatIntegerPtBR(cna),
      'Δ CNA (%)': delta(cna, prev?.consumo_nacional_aparente_qtd),
      'Coeficiente de importação (%)': formatPercentagePtBR((item.coeficiente_penetracao_imp_qtd || 0) * 100),
    };
  });
}

/** Vendas internas = vendas totais − exportações (notebook, célula 40). */
export function ensureVendasInternas(items: NfeData[]): NfeData[] {
  return items.map(item =>
    typeof item['Vendas internas (KG)'] === 'number' && !isNaN(item['Vendas internas (KG)'])
      ? item
      : { ...item, 'Vendas internas (KG)': (item.qtd_tributavel_producao || 0) - (item.qtd_tributavel_exp || 0) },
  );
}

// --- SURGE ANALYSIS FUNCTIONS ---

export function calculatePeriodSumKg(
  monthlyData: MonthlyComexStatRecord[],
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): number {
  let sumKg = 0;
  for (const record of monthlyData) {
    const recordDate = new Date(record.year, record.month - 1); // Month is 0-indexed
    const startDate = new Date(startYear, startMonth - 1);
    const endDate = new Date(endYear, endMonth - 1);

    if (recordDate >= startDate && recordDate <= endDate) {
      sumKg += record.metricKG || 0;
    }
  }
  return sumKg;
}

export function analyzeImportSurge(
  monthlyData: MonthlyComexStatRecord[],
  currentPeriodStartYear: number,
  currentPeriodStartMonth: number,
  currentPeriodEndYear: number,
  currentPeriodEndMonth: number,
  lastUpdateData: LastUpdateData | null
): SurgeAnalysisResult {
  const createPeriodLabel = (sy: number, sm: number, ey: number, em: number) => 
    `${getMonthNamePtBR(sm)}/${sy} - ${getMonthNamePtBR(em)}/${ey}`;
  const createPeriodYm = (y:number, m:number) => `${y}-${String(m).padStart(2, '0')}`;

  // Validate if the requested current period end date is beyond API's last update
  if (lastUpdateData && lastUpdateData.year !== null && lastUpdateData.month !== null) {
    const apiLastDate = new Date(lastUpdateData.year, lastUpdateData.month - 1, 1);
    const requestedEndDate = new Date(currentPeriodEndYear, currentPeriodEndMonth - 1, 1);
    if (requestedEndDate > apiLastDate) {
      return {
        error: `O período final solicitado (${createPeriodYm(currentPeriodEndYear, currentPeriodEndMonth)}) excede a última atualização da API (${createPeriodYm(lastUpdateData.year, lastUpdateData.month)}).`,
        currentPeriod: {} as SurgeAnalysisPeriodValues,
        previousPeriods: [],
        averagePreviousKg: 0,
        percentageChange: 0,
        isSurge: false,
      };
    }
  }
  
  const currentPeriod: SurgeAnalysisPeriodValues = {
    periodLabel: createPeriodLabel(currentPeriodStartYear, currentPeriodStartMonth, currentPeriodEndYear, currentPeriodEndMonth),
    startDate: createPeriodYm(currentPeriodStartYear, currentPeriodStartMonth),
    endDate: createPeriodYm(currentPeriodEndYear, currentPeriodEndMonth),
    sumKg: calculatePeriodSumKg(monthlyData, currentPeriodStartYear, currentPeriodStartMonth, currentPeriodEndYear, currentPeriodEndMonth),
    year: currentPeriodStartYear, // Or a more central year if period spans multiple
  };

  const previousPeriods: SurgeAnalysisPeriodValues[] = [];
  for (let i = 1; i <= 3; i++) {
    const prevStartYear = currentPeriodStartYear - i;
    const prevEndYear = currentPeriodEndYear - i;

    // Ensure previous periods don't go before 2019 (min year for reliable monthly data)
    if (prevStartYear < 2019) break; 

    previousPeriods.push({
      periodLabel: createPeriodLabel(prevStartYear, currentPeriodStartMonth, prevEndYear, currentPeriodEndMonth),
      startDate: createPeriodYm(prevStartYear, currentPeriodStartMonth),
      endDate: createPeriodYm(prevEndYear, currentPeriodEndMonth),
      sumKg: calculatePeriodSumKg(monthlyData, prevStartYear, currentPeriodStartMonth, prevEndYear, currentPeriodEndMonth),
      year: prevStartYear,
    });
  }

  if (previousPeriods.length < 3) {
    return {
      error: `Não há dados suficientes para os três períodos anteriores completos (necessários 3 períodos a partir de 2019, ${previousPeriods.length} encontrados).`,
      currentPeriod,
      previousPeriods,
      averagePreviousKg: 0,
      percentageChange: 0,
      isSurge: false,
    };
  }

  const sumPreviousKg = previousPeriods.reduce((acc, period) => acc + period.sumKg, 0);
  const averagePreviousKg = sumPreviousKg / previousPeriods.length;

  let percentageChange = 0;
  if (averagePreviousKg !== 0) {
    percentageChange = ((currentPeriod.sumKg - averagePreviousKg) / averagePreviousKg) * 100;
  } else if (currentPeriod.sumKg > 0) {
    percentageChange = Infinity; // Current has value, average was 0
  }

  const isSurge = currentPeriod.sumKg >= 1.30 * averagePreviousKg;
  
  // Check if all periods have zero sum, which might indicate no data for the NCM in those ranges
  const allSumsZero = currentPeriod.sumKg === 0 && previousPeriods.every(p => p.sumKg === 0);
  if(allSumsZero) {
     return {
      error: `Nenhum dado de importação (KG) encontrado para o NCM nos períodos selecionados. Verifique se há dados mensais disponíveis para este NCM.`,
      currentPeriod,
      previousPeriods,
      averagePreviousKg: 0,
      percentageChange: 0,
      isSurge: false,
    };
  }


  return {
    currentPeriod,
    previousPeriods,
    averagePreviousKg,
    percentageChange,
    isSurge,
  };
}