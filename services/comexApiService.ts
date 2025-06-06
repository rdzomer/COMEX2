
import { LastUpdateData, NcmDetails, ComexStatRecord, FlowType, ApiFilter, Period, CountryDataRecord, MonthlyComexStatRecord } from '../types.ts';
import { parseApiNumber } from '../utils/formatting.ts';

const API_BASE_URL = "https://api-comexstat.mdic.gov.br";

const MAX_RETRIES = 3; // Simplified retry for frontend
const RETRY_DELAY = 20000; // 20 seconds

async function fetchWithRetry<T>(url: string, options?: RequestInit, attempt = 1): Promise<T> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      if (response.status === 429 && attempt < MAX_RETRIES) { // Too Many Requests
        console.warn(`Attempt ${attempt} for ${url} failed with status 429. Retrying in ${RETRY_DELAY / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return fetchWithRetry(url, options, attempt + 1);
      }
      const errorText = await response.text();
      console.error(`API Error: ${response.status} ${response.statusText} - ${errorText} for URL: ${url}`);
      throw new Error(`API request failed: ${response.status} ${response.statusText}. Details: ${errorText}`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    const isNetworkErrorOrUnprocessed = !(error instanceof Error && error.message.startsWith("API request failed"));

    if (attempt < MAX_RETRIES && isNetworkErrorOrUnprocessed) {
      console.warn(`Attempt ${attempt} for ${url} failed with error: ${error}. Retrying in ${RETRY_DELAY / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, options, attempt + 1);
    }
    console.error(`Failed to fetch ${url} after ${attempt} attempts:`, error);
    throw error;
  }
}


export async function fetchLastUpdateData(): Promise<LastUpdateData> {
  const url = `${API_BASE_URL}/general/dates/updated`;
  try {
    const response = await fetchWithRetry<{ data: { updated: string; year: number; monthNumber: number } }>(url);
    return {
      date: response.data.updated,
      year: response.data.year,
      month: response.data.monthNumber,
    };
  } catch (error) {
    console.error("Error fetching last update data:", error);
    return { date: null, year: null, month: null };
  }
}

export async function fetchNcmDescription(ncmCode: string): Promise<string | null> {
  if (!ncmCode) return null;
  const url = `${API_BASE_URL}/tables/ncm/${ncmCode}`;
  try {
    const response = await fetchWithRetry<{ data: { text: string }[] }>(url);
    if (response.data && response.data.length > 0) {
      return response.data[0].text;
    }
    return 'Descrição não encontrada';
  } catch (error) {
    console.error(`Error fetching NCM description for ${ncmCode}:`, error);
    return 'Erro ao buscar descrição';
  }
}

export async function fetchNcmUnit(ncmCode: string): Promise<string | null> {
  if (!ncmCode) return null;
  const url = `${API_BASE_URL}/tables/ncm`;
  try {
    // This API returns a list of ALL NCMs, so we need to find the specific one.
    const response = await fetchWithRetry<{ data: { list: { coNcm: string; unit: string }[] } }>(url);
    const ncmItem = response.data.list.find(item => item.coNcm === ncmCode);
    return ncmItem ? ncmItem.unit : 'Unidade não encontrada';
  } catch (error) {
    console.error(`Error fetching NCM unit for ${ncmCode}:`, error);
    return 'Erro ao buscar unidade';
  }
}

export async function fetchComexData(
  flow: FlowType,
  period: Period,
  filters: ApiFilter[],
  metrics: string[],
  details: string[] = [],
  monthDetail: boolean = false,
): Promise<ComexStatRecord[]> {
  const url = `${API_BASE_URL}/general`;
  const body = {
    flow,
    monthDetail,
    period,
    filters,
    details,
    metrics,
  };

  try {
    const response = await fetchWithRetry<{ data: { list: ComexStatRecord[] } }>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    // Parse numeric fields robustly
    return (response.data.list || []).map(item => ({
        ...item,
        metricFOB: parseApiNumber(item.metricFOB),
        metricKG: parseApiNumber(item.metricKG),
        metricStatistic: parseApiNumber(item.metricStatistic),
        metricFreight: parseApiNumber(item.metricFreight),
        metricInsurance: parseApiNumber(item.metricInsurance),
        metricCIF: parseApiNumber(item.metricCIF),
    }));
  } catch (error) {
    console.error(`Error fetching comex data for flow ${flow}, period ${period.from}-${period.to}:`, error);
    return []; // Return empty array on error to allow further processing
  }
}

export async function fetchMonthlyComexData(
  flow: FlowType,
  period: Period, // Overall period, e.g., { from: "2019-01", to: "2025-05" }
  filters: ApiFilter[],
  metrics: string[]
): Promise<MonthlyComexStatRecord[]> {
  const startYearOverall = parseInt(period.from.substring(0, 4));
  const endYearOverall = parseInt(period.to.substring(0, 4));
  const endMonthOverall = parseInt(period.to.substring(5, 7));

  let allRawDataList: ComexStatRecord[] = [];
  const url = `${API_BASE_URL}/general`;

  try { // Outer try block for the entire function logic
    for (let year = startYearOverall; year <= endYearOverall; year++) {
      const yearPeriodStart = `${year}-01`;
      const yearPeriodEnd = (year === endYearOverall) 
                            ? `${year}-${String(endMonthOverall).padStart(2, '0')}` 
                            : `${year}-12`;
      
      const currentYearPeriod: Period = { from: yearPeriodStart, to: yearPeriodEnd };

      const body = {
        flow,
        monthDetail: true, // Key difference for monthly data
        period: currentYearPeriod, // Use the specific year's period
        filters,
        details: [], 
        metrics,
      };

      try { // Inner try-catch for individual year fetches
        console.log(`fetchMonthlyComexData: Iniciando busca para o ano ${year} (Período: ${currentYearPeriod.from} a ${currentYearPeriod.to})`);
        const response = await fetchWithRetry<{ data: { list: ComexStatRecord[] } }>(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        
        const yearDataList = response.data.list || [];
        if (yearDataList.length > 0) {
          allRawDataList = allRawDataList.concat(yearDataList);
        }
        console.log(`fetchMonthlyComexData: Recebidos ${yearDataList.length} registros para o ano ${year}. Total de registros brutos acumulados: ${allRawDataList.length}`);

      } catch (error) {
        console.error(`fetchMonthlyComexData: Erro ao buscar dados para o ano ${year} (Período: ${currentYearPeriod.from} a ${currentYearPeriod.to}):`, error);
        // Consider how to handle partial failures. For now, continue to fetch other years.
      }
    }
    
    // The rest of the processing now uses `allRawDataList`
    const rawDataList = allRawDataList; 
      
    const potentialMonthFields = ['monthNumber', 'coMes', 'CO_MES', 'mes', 'month'];

    const itemsWithDiagnostics = rawDataList.map(rawItem => {
      const numericYear = Number(rawItem.year);
      let monthValueFromApi: any = undefined;
      let fieldUsedForMonth: string = 'none';

      for (const field of potentialMonthFields) {
        if (rawItem.hasOwnProperty(field)) { 
          monthValueFromApi = rawItem[field];
          fieldUsedForMonth = field;
          break; 
        }
      }
      
      const numericMonth = (monthValueFromApi === null || monthValueFromApi === undefined) ? NaN : Number(monthValueFromApi);
      
      const isValid = !isNaN(numericYear) &&
                      !isNaN(numericMonth) && 
                      numericMonth >= 1 && numericMonth <= 12;
      
      return {
        year: numericYear,
        month: isValid ? numericMonth : NaN, 
        metricFOB: parseApiNumber(rawItem.metricFOB),
        metricKG: parseApiNumber(rawItem.metricKG),
        _rawYear: rawItem.year,
        _rawMonthValue: monthValueFromApi, 
        _rawMonthFieldUsed: fieldUsedForMonth,
        _isValid: isValid,
        _rawMetricKG: rawItem.metricKG, 
        _rawMetricFOB: rawItem.metricFOB,
      };
    });

    const validMonthlyRecords: MonthlyComexStatRecord[] = itemsWithDiagnostics
      .filter(item => item._isValid) 
      .map(item => ({
        year: item.year,
        month: item.month, 
        metricFOB: item.metricFOB,
        metricKG: item.metricKG,
      }));

    if (rawDataList.length > 0 && validMonthlyRecords.length < rawDataList.length) {
      const discardedCount = rawDataList.length - validMonthlyRecords.length;
      const discardedSample = itemsWithDiagnostics
        .filter(item => !item._isValid)
        .slice(0, 5); 
      
      console.warn(
        `fetchMonthlyComexData: De ${rawDataList.length} itens brutos da API (agregados de todas as chamadas anuais), ${validMonthlyRecords.length} foram considerados registros mensais válidos (após validação de ano/mês). ${discardedCount} itens foram descartados.`,
        "Amostra de itens descartados (devido a ano/mês inválido):",
        discardedSample.map(d => ({ 
          rawYearFromApi: d._rawYear, 
          rawMonthValueFromApi: d._rawMonthValue, 
          monthFieldUsed: d._rawMonthFieldUsed,
          parsedYear: d.year, 
          parsedMonth: d.month, 
          isValid: d._isValid,
        }))
      );
    } else if (rawDataList.length > 0 && validMonthlyRecords.length === rawDataList.length) {
        console.log(
            `fetchMonthlyComexData: Todos os ${rawDataList.length} itens brutos da API (agregados) foram validados para ano/mês.`
        );
    }
    
    let nonStandardKgParsingCount = 0;
    let actualZeroKgCount = 0;
    itemsWithDiagnostics.filter(item => item._isValid).forEach(item => { 
      const rawKgValueOriginal: unknown = item._rawMetricKG; 
      const parsedKg = item.metricKG;    

      if (parsedKg === 0) {
        let isRawExplicitZero = false;
        if (typeof rawKgValueOriginal === 'number' && rawKgValueOriginal === 0) {
          isRawExplicitZero = true;
        } else if (typeof rawKgValueOriginal === 'string' && rawKgValueOriginal.trim() === "0") {
          isRawExplicitZero = true;
        }
        
        if (isRawExplicitZero) {
          actualZeroKgCount++;
        } else { 
          nonStandardKgParsingCount++;
          if (nonStandardKgParsingCount <= 5) { 
            console.log(
              `fetchMonthlyComexData: Note - Raw metricKG '${String(rawKgValueOriginal)}' (tipo: ${typeof rawKgValueOriginal}) para ${item.year}-${String(item.month).padStart(2, '0')} foi parseado para ${parsedKg}.`
            );
          }
        }
      }
    });

    if (nonStandardKgParsingCount > 5) {
      console.log(`fetchMonthlyComexData: ...e mais ${nonStandardKgParsingCount - 5} instâncias de metricKG não-zero (ex: null, "") parseadas para 0.`);
    }
    if (actualZeroKgCount > 0) {
        console.log(`fetchMonthlyComexData: ${actualZeroKgCount} registros continham metricKG explicitamente como 0 (número) ou "0" (string) na API.`);
    }
    if (nonStandardKgParsingCount === 0 && actualZeroKgCount === 0 && validMonthlyRecords.length > 0) {
        const sampleItem = itemsWithDiagnostics.find(item => item._isValid && item.metricKG !== 0);
        if (sampleItem) {
             console.log(
                `fetchMonthlyComexData: Amostra de parsing bem-sucedido de metricKG (para item validado): raw='${String(sampleItem._rawMetricKG)}', parsed=${sampleItem.metricKG} para ${sampleItem.year}-${String(sampleItem.month).padStart(2,'0')}. Nenhum metricKG parseado para 0 de forma não-trivial.`
            );
        } else if (validMonthlyRecords.length > 0) {
            console.log(`fetchMonthlyComexData: Todos os ${validMonthlyRecords.length} registros válidos tiveram metricKG parseado para 0, e todos parecem ser zeros explícitos da API ou não houve casos não-triviais.`);
        }
    }

    console.log(`fetchMonthlyComexData: Final 'validMonthlyRecords' (prestes a serem retornados). Total de registros: ${validMonthlyRecords.length}. Detalhamento por ano:`);
    if (validMonthlyRecords.length > 0) {
        const dataByYear: { [year: number]: MonthlyComexStatRecord[] } = {};
        validMonthlyRecords.forEach(r => {
            if (!dataByYear[r.year]) dataByYear[r.year] = [];
            dataByYear[r.year].push(r);
        });

        const apiRequestEndYear = parseInt(period.to.substring(0, 4)); 

        Object.keys(dataByYear).sort((a,b) => Number(a)-Number(b)).forEach(yearStr => {
            const year = Number(yearStr);
            const recordsInYear = dataByYear[year].sort((a,b) => a.month - b.month);
            const monthsInYear = recordsInYear.map(r => r.month);
            const kgsInYearSample = recordsInYear.slice(0, 12).map(r => ({m: r.month, kg: r.metricKG })); 

            console.log(`  Para o Ano ${year}: Encontrados ${monthsInYear.length} meses. Meses: [${monthsInYear.join(', ')}]. Amostra de KG (mês, kg):`, kgsInYearSample);
            
            if (year < apiRequestEndYear) { 
                if (monthsInYear.length < 12) {
                    const expectedMonths = Array.from({length: 12}, (_, i) => i + 1);
                    const missing = expectedMonths.filter(m => !monthsInYear.includes(m));
                    if (missing.length > 0) {
                         console.warn(`    AVISO: Ano ${year} (anterior ao ano final do período da API '${period.to}') está incompleto. Meses ausentes: [${missing.join(', ')}]. Isso resultará em zeros para estes meses na soma acumulada.`);
                    }
                }
            } else if (year === apiRequestEndYear) {
                const requestToMonth = parseInt(period.to.substring(5,7));
                if (monthsInYear.length < requestToMonth) {
                    const expectedMonthsThisYear = Array.from({length: requestToMonth}, (_, i) => i + 1);
                    const missingThisYear = expectedMonthsThisYear.filter(m => !monthsInYear.includes(m));
                     if (missingThisYear.length > 0) {
                        console.warn(`    AVISO: Ano ${year} (ano final do período da API '${period.to}') está incompleto até o mês solicitado (${requestToMonth}). Meses ausentes: [${missingThisYear.join(', ')}].`);
                    }
                }
            }
        });
    } else {
        console.log("  Nenhum registro mensal válido foi processado para ser retornado.");
    }
    
    return validMonthlyRecords;

  } catch (error) {
    // This top-level catch is for the overall aggregation logic, not individual year fetches.
    console.error(`Error em fetchMonthlyComexData durante o processamento agregado para o período ${period.from}-${period.to}:`, error);
    return [];
  }
}


export async function fetchCountryData(
  ncmCode: string,
  flow: FlowType,
  year: number = 2024
): Promise<CountryDataRecord[]> {
  console.log(`DEBUG: Executing fetchCountryData for NCM: ${ncmCode}, Flow: ${flow}, Year: ${year}`); // Trivial change for debugging
  const filters: ApiFilter[] = [{ filter: "ncm", values: [ncmCode] }];
  const metrics = ["metricFOB", "metricKG"];
  const details = ["country"];
  const period: Period = { from: `${year}-01`, to: `${year}-12` }; 

  const url = `${API_BASE_URL}/general`;
  const body = {
    flow,
    monthDetail: false,
    period,
    filters,
    details,
    metrics,
  };

  try {
    const response = await fetchWithRetry<{ data: { list: ComexStatRecord[] } }>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const rawData = response.data.list || [];
    const processedData: CountryDataRecord[] = rawData.map(item => ({
        country: item.country || "Desconhecido",
        metricFOB: parseApiNumber(item.metricFOB),
        metricKG: parseApiNumber(item.metricKG),
    }));

    const totalFob = processedData.reduce((sum, item) => sum + item.metricFOB, 0);
    const totalKg = processedData.reduce((sum, item) => sum + item.metricKG, 0);

    return processedData.map(item => ({
        ...item,
        representatividadeFOB: totalFob > 0 ? parseFloat(((item.metricFOB / totalFob) * 100).toFixed(2)) : 0,
        representatividadeKG: totalKg > 0 ? parseFloat(((item.metricKG / totalKg) * 100).toFixed(2)) : 0,
    })).sort((a, b) => b.metricFOB - a.metricFOB); 

  } catch (error) {
    console.error(`Error fetching country data for NCM ${ncmCode}, flow ${flow}, year ${year}:`, error);
    return [];
  }
}
