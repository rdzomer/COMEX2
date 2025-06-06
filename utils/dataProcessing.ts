import { ComexStatRecord, ProcessedTradeData, LastUpdateData, NcmDetails, YearSummaryData, NfeData, FormattedNfeSalesData, FormattedNfeCnaData, MonthlyComexStatRecord, RollingSumDataPoint, SurgeAnalysisPeriodValues, SurgeAnalysisResult } from '../types.ts';
import { formatDecimalPtBR, formatIntegerPtBR, formatPercentagePtBR, getMonthNamePtBR } from './formatting.ts';

export function processAnnualTradeData(
  exportData: ComexStatRecord[],
  importData: ComexStatRecord[],
  ncmCode: string,
  ncmDetails: NcmDetails,
  lastUpdateData: LastUpdateData | null
): ProcessedTradeData[] {
  const combinedMap = new Map<number, ProcessedTradeData>();

  exportData.forEach(item => {
    const year = item.year;
    if (!combinedMap.has(year)) {
      combinedMap.set(year, { year: String(year) });
    }
    const entry = combinedMap.get(year)!;
    entry['Código NCM'] = ncmCode;
    entry['Descrição NCM'] = ncmDetails.description || '';
    entry['Unidade Estatística'] = ncmDetails.unit || '';
    entry['Exportações (US$ FOB)'] = (entry['Exportações (US$ FOB)'] || 0) + (Number(item.metricFOB) || 0);
    entry['Exportações (KG)'] = (entry['Exportações (KG)'] || 0) + (Number(item.metricKG) || 0);
    entry['Exportações (Qtd Estatística)'] = (entry['Exportações (Qtd Estatística)'] || 0) + (Number(item.metricStatistic) || 0);
  });

  importData.forEach(item => {
    const year = item.year;
    if (!combinedMap.has(year)) {
      combinedMap.set(year, { year: String(year) });
    }
    const entry = combinedMap.get(year)!;
    entry['Código NCM'] = ncmCode;
    entry['Descrição NCM'] = ncmDetails.description || '';
    entry['Unidade Estatística'] = ncmDetails.unit || '';
    entry['Importações (US$ FOB)'] = (entry['Importações (US$ FOB)'] || 0) + (Number(item.metricFOB) || 0);
    entry['Importações (KG)'] = (entry['Importações (KG)'] || 0) + (Number(item.metricKG) || 0);
    entry['Importações (Qtd Estatística)'] = (entry['Importações (Qtd Estatística)'] || 0) + (Number(item.metricStatistic) || 0);
    entry['Importações (Frete USD)'] = (entry['Importações (Frete USD)'] || 0) + (Number(item.metricFreight) || 0);
    entry['Importações (Seguro USD)'] = (entry['Importações (Seguro USD)'] || 0) + (Number(item.metricInsurance) || 0);
    entry['Importações (CIF USD)'] = (entry['Importações (CIF USD)'] || 0) + (Number(item.metricCIF) || 0);
  });

  const processedData: ProcessedTradeData[] = Array.from(combinedMap.values()).sort((a, b) => Number(a.year) - Number(b.year));

  processedData.forEach(item => {
    // Fill missing metrics with 0 for calculations
    item['Exportações (US$ FOB)'] = item['Exportações (US$ FOB)'] || 0;
    item['Exportações (KG)'] = item['Exportações (KG)'] || 0;
    item['Exportações (Qtd Estatística)'] = item['Exportações (Qtd Estatística)'] || 0;
    item['Importações (US$ FOB)'] = item['Importações (US$ FOB)'] || 0;
    item['Importações (KG)'] = item['Importações (KG)'] || 0;
    item['Importações (Qtd Estatística)'] = item['Importações (Qtd Estatística)'] || 0;
    item['Importações (CIF USD)'] = item['Importações (CIF USD)'] || 0;
    item['Importações (Frete USD)'] = item['Importações (Frete USD)'] || 0;
    item['Importações (Seguro USD)'] = item['Importações (Seguro USD)'] || 0;

    item['Balança Comercial (FOB)'] = item['Exportações (US$ FOB)']! - item['Importações (US$ FOB)']!;
    item['Balança Comercial (KG)'] = item['Exportações (KG)']! - item['Importações (KG)']!;
    item['Balança Comercial (Qtd Estatística)'] = item['Exportações (Qtd Estatística)']! - item['Importações (Qtd Estatística)']!;

    item['Preço Médio Exportação (US$ FOB/Ton)'] = item['Exportações (KG)']! > 0 ? item['Exportações (US$ FOB)']! / (item['Exportações (KG)']! / 1000) : 0;
    item['Preço Médio Importação (US$ FOB/Ton)'] = item['Importações (KG)']! > 0 ? item['Importações (US$ FOB)']! / (item['Importações (KG)']! / 1000) : 0;
    
    item['Preço Médio Exportação (US$/KG)'] = item['Exportações (KG)']! !== 0 ? item['Exportações (US$ FOB)']! / item['Exportações (KG)']! : 0;
    item['Preço Médio Importação (US$/KG)'] = item['Importações (KG)']! !== 0 ? item['Importações (US$ FOB)']! / item['Importações (KG)']! : 0;
    
    if (lastUpdateData && item.year === String(lastUpdateData.year)) { 
         item.year = `${item.year} (Até mês ${String(lastUpdateData.month).padStart(2, '0')})`;
    }
  });
  
  return processedData;
}

export function createYearSummary(
  fullData: ProcessedTradeData[],
  flow: 'import' | 'export'
): YearSummaryData[] {
  if (!fullData || fullData.length === 0) return [];

  const relevantYearsData = fullData
    .map(d => ({ ...d, yearNumeric: parseInt(d.year.substring(0, 4)) })) 
    .filter(d => !isNaN(d.yearNumeric) && d.yearNumeric >= 2019) 
    .sort((a, b) => a.yearNumeric - b.yearNumeric);

  if (relevantYearsData.length < 1) return []; 

  const summary: YearSummaryData[] = [];

  for (let i = 0; i < relevantYearsData.length; i++) {
    const current = relevantYearsData[i];
    const previous = relevantYearsData.find(d => d.yearNumeric === current.yearNumeric - 1);
    
    const row: YearSummaryData = { 'Ano': current.year };

    const fobKey = flow === 'import' ? 'Importações (US$ FOB)' : 'Exportações (US$ FOB)';
    const kgKey = flow === 'import' ? 'Importações (KG)' : 'Exportações (KG)';
    const priceKey = flow === 'import' ? 'Preço Médio Importação (US$ FOB/Ton)' : 'Preço Médio Exportação (US$ FOB/Ton)';

    const currentFob = current[fobKey] || 0;
    const currentKg = current[kgKey] || 0;
    const currentPrice = current[priceKey] || 0;

    const prevFob = previous ? (previous[fobKey] || 0) : 0;
    const prevKg = previous ? (previous[kgKey] || 0) : 0;
    const prevPrice = previous ? (previous[priceKey] || 0) : 0;

    const deltaFob = previous && prevFob !== 0 ? ((currentFob - prevFob) / prevFob) * 100 : NaN;
    const deltaKg = previous && prevKg !== 0 ? ((currentKg - prevKg) / prevKg) * 100 : NaN;
    const deltaPrice = previous && prevPrice !== 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : NaN;
    
    const suppressVariation = current.year.includes("(Até mês") && previous && !previous.year.includes("(Até mês");

    if (flow === 'import') {
      row['Importações (US$ FOB)'] = currentFob;
      row['Var. (%) Imp (US$ FOB)'] = suppressVariation || !previous ? '' : formatPercentagePtBR(deltaFob);
      row['Importações (kg)'] = currentKg;
      row['Var. (%) Imp (kg)'] = suppressVariation || !previous ? '' : formatPercentagePtBR(deltaKg);
      row['Preço médio Importação (US$ FOB/Ton)'] = currentPrice;
      row['Var. (%) Preço médio Imp'] = suppressVariation || !previous ? '' : formatPercentagePtBR(deltaPrice);
    } else {
      row['Exportações (US$ FOB)'] = currentFob;
      row['Var. (%) Exp (US$ FOB)'] = suppressVariation || !previous ? '' : formatPercentagePtBR(deltaFob);
      row['Exportações (kg)'] = currentKg;
      row['Var. (%) Exp (kg)'] = suppressVariation || !previous ? '' : formatPercentagePtBR(deltaKg);
      row['Preço médio Exp (US$ FOB/Ton)'] = currentPrice;
      row['Var. (%) Preço médio Exp'] = suppressVariation || !previous ? '' : formatPercentagePtBR(deltaPrice);
    }
    
    if (current.yearNumeric >= 2019) { // Ensure only 2019 onwards data is pushed
        summary.push(row);
    }
  }
  return summary;
}


export function processNfeSalesData(nfeData: NfeData[]): FormattedNfeSalesData[] {
  if (!nfeData || nfeData.length === 0) return [];

  const sortedData = [...nfeData].sort((a, b) => (a.ano || 0) - (b.ano || 0));

  return sortedData.map((item, index) => {
    const prevItem = index > 0 ? sortedData[index - 1] : null;

    const vendasTotais = item.qtd_tributavel_producao || 0;
    const vendasInternas = item['Vendas internas (KG)'] || 0; 
    const exportacoes = item.qtd_tributavel_exp || 0;

    const prevVendasTotais = prevItem?.qtd_tributavel_producao || 0;
    const prevVendasInternas = prevItem?.['Vendas internas (KG)'] || 0;
    const prevExportacoes = prevItem?.qtd_tributavel_exp || 0;
    
    return {
      ano: item.ano,
      'Vendas totais (Kg)': formatIntegerPtBR(vendasTotais),
      'Δ Vendas totais (%)': prevItem && prevVendasTotais !== 0 ? formatPercentagePtBR(((vendasTotais - prevVendasTotais) / prevVendasTotais) * 100) : '',
      'Vendas internas (KG)': formatIntegerPtBR(vendasInternas),
      'Δ Vendas internas (%)': prevItem && prevVendasInternas !== 0 ? formatPercentagePtBR(((vendasInternas - prevVendasInternas) / prevVendasInternas) * 100) : '',
      'Exportações (Kg)': formatIntegerPtBR(exportacoes),
      'Δ Exportações (%)': prevItem && prevExportacoes !== 0 ? formatPercentagePtBR(((exportacoes - prevExportacoes) / prevExportacoes) * 100) : '',
    };
  });
}

export function processNfeCnaData(nfeData: NfeData[]): FormattedNfeCnaData[] {
   if (!nfeData || nfeData.length === 0) return [];

  const sortedData = [...nfeData].sort((a, b) => (a.ano || 0) - (b.ano || 0));
  
  return sortedData.map((item, index) => {
    const prevItem = index > 0 ? sortedData[index - 1] : null;

    const vendasInternas = item['Vendas internas (KG)'] || 0;
    const importacoes = item.qtd_tributavel_imp || 0;
    const cna = item.consumo_nacional_aparente_qtd || 0;
    const coefImportacao = (item.coeficiente_penetracao_imp_qtd || 0) * 100; // Convert to percentage

    const prevVendasInternas = prevItem?.['Vendas internas (KG)'] || 0;
    const prevImportacoes = prevItem?.qtd_tributavel_imp || 0;
    const prevCna = prevItem?.consumo_nacional_aparente_qtd || 0;

    return {
      ano: item.ano,
      'Vendas internas (KG)': formatIntegerPtBR(vendasInternas),
      'Δ Vendas internas (%)': prevItem && prevVendasInternas !== 0 ? formatPercentagePtBR(((vendasInternas - prevVendasInternas) / prevVendasInternas) * 100) : '',
      'Importações (Kg)': formatIntegerPtBR(importacoes),
      'Δ Importações (%)': prevItem && prevImportacoes !== 0 ? formatPercentagePtBR(((importacoes - prevImportacoes) / prevImportacoes) * 100) : '',
      'CNA (Kg)': formatIntegerPtBR(cna),
      'Δ CNA (%)': prevItem && prevCna !== 0 ? formatPercentagePtBR(((cna - prevCna) / prevCna) * 100) : '',
      'Coeficiente de importação (%)': formatPercentagePtBR(coefImportacao),
    };
  });
}


export function ensureVendasInternas(nfeDataItems: NfeData[]): NfeData[] {
  return nfeDataItems.map(item => {
    if (typeof item['Vendas internas (KG)'] === 'undefined') {
      const vendasInternas = (item.qtd_tributavel_producao || 0) - (item.qtd_tributavel_exp || 0);
      return { ...item, 'Vendas internas (KG)': vendasInternas };
    }
    return item;
  });
}

export function processRollingSumImportData(monthlyData: MonthlyComexStatRecord[]): RollingSumDataPoint[] {
  console.log("processRollingSumImportData: Input monthlyData (first 5, if available):", monthlyData.slice(0, 5).map(d => ({y:d.year, m:d.month, kg: d.metricKG})));

  if (!monthlyData || monthlyData.length === 0) {
    console.log("processRollingSumImportData: No monthly data provided or empty (likely due to API data issues or pre-filtering in fetchMonthlyComexData).");
    return [];
  }

  const filteredMonthlyData = monthlyData.filter(d => 
    d.year >= 2019 &&
    !isNaN(d.year) && 
    !isNaN(d.month) && d.month >= 1 && d.month <= 12
  );
  console.log("processRollingSumImportData: Filtered monthlyData for sum (from 2019, first 5, if available):", filteredMonthlyData.slice(0, 5).map(d => ({y:d.year, m:d.month, kg: d.metricKG})));


  if (filteredMonthlyData.length === 0) {
    console.log("processRollingSumImportData: No valid monthly data from 2019 onwards after internal validation. Original count passed to function:", monthlyData.length);
    return [];
  }

  let minYear = filteredMonthlyData[0].year;
  let minMonthInMinYear = filteredMonthlyData[0].month;
  let maxYear = filteredMonthlyData[0].year;
  let maxMonthInMaxYear = filteredMonthlyData[0].month;

  filteredMonthlyData.forEach(d => {
    if (d.year < minYear) {
      minYear = d.year;
      minMonthInMinYear = d.month;
    } else if (d.year === minYear && d.month < minMonthInMinYear) {
      minMonthInMinYear = d.month;
    }
    if (d.year > maxYear) {
      maxYear = d.year;
      maxMonthInMaxYear = d.month;
    } else if (d.year === maxYear && d.month > maxMonthInMaxYear) {
      maxMonthInMaxYear = d.month;
    }
  });
  
  const baseStartDate = new Date(2019, 0, 1); 
  const actualDataStartDate = new Date(minYear, minMonthInMinYear - 1, 1);
  const effectiveStartDate = actualDataStartDate > baseStartDate ? actualDataStartDate : baseStartDate;
  
  const effectiveEndDate = new Date(maxYear, maxMonthInMaxYear - 1, 1);

  const allMonthsMap = new Map<string, { metricKG: number; metricFOB: number }>();

  if (effectiveStartDate > effectiveEndDate) {
    console.warn("processRollingSumImportData: effectiveStartDate is after effectiveEndDate. Cannot generate month map.", {
        effectiveStartDate: effectiveStartDate.toISOString().substring(0,7), 
        effectiveEndDate: effectiveEndDate.toISOString().substring(0,7),
        minYearData: `${minYear}-${String(minMonthInMinYear).padStart(2,'0')}`,
        maxYearData: `${maxYear}-${String(maxMonthInMaxYear).padStart(2,'0')}`
    });
    return [];
  }
  
  for (let d = new Date(effectiveStartDate.getTime()); d <= effectiveEndDate; d.setMonth(d.getMonth() + 1)) {
    const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    allMonthsMap.set(yearMonthKey, { metricKG: 0, metricFOB: 0 });
  }
  
  filteredMonthlyData.forEach(item => {
      const yearMonthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
      if (allMonthsMap.has(yearMonthKey)) {
        allMonthsMap.set(yearMonthKey, {
          metricKG: (allMonthsMap.get(yearMonthKey)?.metricKG || 0) + (item.metricKG || 0),
          metricFOB: (allMonthsMap.get(yearMonthKey)?.metricFOB || 0) + (item.metricFOB || 0),
        });
      }
  });
  
  const sortedFullMonthlyData = Array.from(allMonthsMap.entries())
    .map(([yearMonth, metrics]) => ({
      yearMonth,
      year: parseInt(yearMonth.substring(0, 4)),
      month: parseInt(yearMonth.substring(5, 7)),
      metricKG: metrics.metricKG,
      metricFOB: metrics.metricFOB,
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  
  const dataToLog = sortedFullMonthlyData.map(d => ({ ym: d.yearMonth, kg: d.metricKG }));
  if (dataToLog.length <= 75) {
    console.log("processRollingSumImportData: sortedFullMonthlyData (ALL ENTRIES as data.length <= 75). Expand to see all monthly KG values:", dataToLog);
  } else {
    const firstChunk = dataToLog.slice(0, 25);
    const middleStartIndex = Math.max(0, Math.floor(dataToLog.length / 2) - 12);
    const middleEndIndex = Math.min(dataToLog.length, middleStartIndex + 25);
    const middleChunk = dataToLog.slice(middleStartIndex, middleEndIndex);
    const lastChunk = dataToLog.slice(Math.max(0, dataToLog.length - 25));

    console.log("processRollingSumImportData: sortedFullMonthlyData (chunked as data.length > 75). Expand to see monthly KG values.");
    console.log("  First 25 entries:", firstChunk);
    console.log(`  Middle approx. ${middleChunk.length} entries (from index ${middleStartIndex}):`, middleChunk);
    console.log("  Last 25 entries:", lastChunk);
  }


  const rollingSumData: RollingSumDataPoint[] = [];
  const windowSize = 12;

  if (sortedFullMonthlyData.length < windowSize) {
    console.log(`processRollingSumImportData: Not enough data to form a 12-month window after processing and filling gaps. Required: ${windowSize}, Available in map: ${sortedFullMonthlyData.length}. Map from ${effectiveStartDate.toISOString().substring(0,7)} to ${effectiveEndDate.toISOString().substring(0,7)}.`);
    return []; 
  }

  for (let i = windowSize - 1; i < sortedFullMonthlyData.length; i++) {
    let sumKG = 0;
    let sumFOB = 0;
    for (let j = 0; j < windowSize; j++) {
      sumKG += Number(sortedFullMonthlyData[i - j].metricKG) || 0;
      sumFOB += Number(sortedFullMonthlyData[i - j].metricFOB) || 0;
    }
    rollingSumData.push({
      yearMonth: sortedFullMonthlyData[i].yearMonth,
      rollingKG: sumKG,
      rollingFOB: sumFOB,
    });
  }
  
  const finalFilteredData = rollingSumData.filter(d => {
      const year = parseInt(d.yearMonth.substring(0,4));
      const month = parseInt(d.yearMonth.substring(5,7));
      return year > 2019 || (year === 2019 && month === 12); 
  });

  if (finalFilteredData.length === 0 && rollingSumData.length > 0) {
     console.log(`processRollingSumImportData: All ${rollingSumData.length} calculated rolling sum data points were filtered out by the final date condition (sum must end Dec 2019 or later). First sum was for ${rollingSumData[0].yearMonth}.`);
  } else if (finalFilteredData.length === 0 && rollingSumData.length === 0 && sortedFullMonthlyData.length >= windowSize) {
     console.log(`processRollingSumImportData: No rolling sum data was generated, yet had enough initial monthly points (${sortedFullMonthlyData.length}). This state should be investigated.`);
  }

  return finalFilteredData;
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