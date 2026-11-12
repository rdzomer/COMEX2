import { LastUpdateData, ComexStatRecord, FlowType, ApiFilter, Period, CountryDataRecord, MonthlyComexStatRecord } from '../types.ts';
import { parseApiNumber, pad2 } from '../utils/formatting.ts';

const API_BASE_URL = "https://api-comexstat.mdic.gov.br";

const MAX_RETRIES = 4;
const RETRY_DELAY = 12000; // a API limita requisições; o notebook espera ~11 s entre tentativas
const MAX_CONCURRENT = 2;

// --- Fila simples para não estourar o limite de requisições (HTTP 429) ---
let active = 0;
const waiting: (() => void)[] = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>(resolve => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry<T>(url: string, options?: RequestInit): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await withSlot(() => fetch(url, options));
      if (response.ok) return (await response.json()) as T;
      const errorText = await response.text();
      lastError = new Error(`API ${response.status}: ${errorText.slice(0, 200)}`);
      // 429 (limite) e 5xx são temporários: tenta de novo. Outros erros, desiste.
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /^API 4\d\d/.test(error.message) && !error.message.startsWith('API 429')) throw error;
    }
    if (attempt < MAX_RETRIES) {
      console.warn(`Tentativa ${attempt}/${MAX_RETRIES} falhou para ${url}. Nova tentativa em ${RETRY_DELAY / 1000}s...`);
      await sleep(RETRY_DELAY);
    }
  }
  throw lastError;
}

const postGeneral = <T>(body: unknown) =>
  fetchWithRetry<T>(`${API_BASE_URL}/general`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export async function fetchLastUpdateData(): Promise<LastUpdateData> {
  try {
    const response = await fetchWithRetry<{ data: { updated: string; year: number; monthNumber: number } }>(`${API_BASE_URL}/general/dates/updated`);
    return {
      date: response.data.updated,
      year: Number(response.data.year),
      month: Number(response.data.monthNumber),
    };
  } catch (error) {
    console.error("Erro ao obter data de atualização:", error);
    return { date: null, year: null, month: null };
  }
}

export async function fetchNcmDescription(ncmCode: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry<{ data: { text: string }[] }>(`${API_BASE_URL}/tables/ncm/${ncmCode}`);
    return response.data?.[0]?.text ?? 'Descrição não encontrada';
  } catch (error) {
    console.error(`Erro ao obter descrição da NCM ${ncmCode}:`, error);
    return null;
  }
}

let ncmTableCache: { coNcm: string; unit: string }[] | null = null;
export async function fetchNcmUnit(ncmCode: string): Promise<string | null> {
  try {
    if (!ncmTableCache) {
      const response = await fetchWithRetry<{ data: { list: { coNcm: string; unit: string }[] } }>(`${API_BASE_URL}/tables/ncm`);
      ncmTableCache = response.data.list;
    }
    return ncmTableCache.find(item => item.coNcm === ncmCode)?.unit ?? 'Unidade não encontrada';
  } catch (error) {
    console.error(`Erro ao obter unidade da NCM ${ncmCode}:`, error);
    return null;
  }
}

/** Dados anuais (monthDetail = false). Lança erro se a API falhar, para a interface avisar. */
export async function fetchComexData(
  flow: FlowType,
  period: Period,
  filters: ApiFilter[],
  metrics: string[],
  details: string[] = [],
): Promise<ComexStatRecord[]> {
  const response = await postGeneral<{ data: { list: ComexStatRecord[] } }>({
    flow, monthDetail: false, period, filters, details, metrics,
  });
  return (response.data?.list || []).map(item => ({
    ...item,
    year: Number(item.year),
    metricFOB: parseApiNumber(item.metricFOB),
    metricKG: parseApiNumber(item.metricKG),
    metricStatistic: parseApiNumber(item.metricStatistic),
    metricFreight: parseApiNumber(item.metricFreight),
    metricInsurance: parseApiNumber(item.metricInsurance),
    metricCIF: parseApiNumber(item.metricCIF),
  }));
}

/** Dados mensais, uma requisição por ano (como na versão anterior do app). */
export async function fetchMonthlyComexData(
  flow: FlowType,
  period: Period,
  filters: ApiFilter[],
  metrics: string[],
): Promise<MonthlyComexStatRecord[]> {
  const startYear = parseInt(period.from.substring(0, 4));
  const endYear = parseInt(period.to.substring(0, 4));
  const endMonth = parseInt(period.to.substring(5, 7));

  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);
  const results = await Promise.all(years.map(async year => {
    const yearPeriod: Period = { from: `${year}-01`, to: year === endYear ? `${year}-${pad2(endMonth)}` : `${year}-12` };
    const response = await postGeneral<{ data: { list: ComexStatRecord[] } }>({
      flow, monthDetail: true, period: yearPeriod, filters, details: [], metrics,
    });
    return response.data?.list || [];
  }));

  const monthFields = ['monthNumber', 'coMes', 'CO_MES', 'mes', 'month'];
  return results.flat().flatMap(raw => {
    const field = monthFields.find(f => raw[f] !== undefined && raw[f] !== null);
    const month = field ? Number(raw[field]) : NaN;
    const year = Number(raw.year);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return [];
    return [{ year, month, metricFOB: parseApiNumber(raw.metricFOB), metricKG: parseApiNumber(raw.metricKG) }];
  });
}

/** Dados por país para um período, com representatividade (%) em FOB e KG, ordenados por FOB. */
export async function fetchCountryData(
  ncmCode: string,
  flow: FlowType,
  period: Period,
): Promise<CountryDataRecord[]> {
  const response = await postGeneral<{ data: { list: ComexStatRecord[] } }>({
    flow,
    monthDetail: false,
    period,
    filters: [{ filter: "ncm", values: [ncmCode] }],
    details: ["country"],
    metrics: ["metricFOB", "metricKG"],
  });

  // Agrega por país (a API pode devolver uma linha por ano)
  const byCountry = new Map<string, CountryDataRecord>();
  for (const item of response.data?.list || []) {
    const country = item.country || "Desconhecido";
    const cur = byCountry.get(country) ?? { country, metricFOB: 0, metricKG: 0 };
    cur.metricFOB += parseApiNumber(item.metricFOB);
    cur.metricKG += parseApiNumber(item.metricKG);
    byCountry.set(country, cur);
  }
  const rows = Array.from(byCountry.values());
  const totalFob = rows.reduce((s, r) => s + r.metricFOB, 0);
  const totalKg = rows.reduce((s, r) => s + r.metricKG, 0);
  return rows
    .map(r => ({
      ...r,
      representatividadeFOB: totalFob > 0 ? (r.metricFOB / totalFob) * 100 : 0,
      representatividadeKG: totalKg > 0 ? (r.metricKG / totalKg) * 100 : 0,
    }))
    .sort((a, b) => b.metricFOB - a.metricFOB);
}
