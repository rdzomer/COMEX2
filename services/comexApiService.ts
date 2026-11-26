import { LastUpdateData, ComexStatRecord, FlowType, ApiFilter, Period, CountryDataRecord, CountryYearRecord, MonthlyComexStatRecord } from '../types.ts';
import type { UfRecord } from '../utils/analiticas.ts';
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

// --- Detecção rápida de indisponibilidade ---
// Quando o servidor do MDIC cai, o nginx responde 503 sem cabeçalho CORS e o navegador só vê
// "Failed to fetch". Nesse caso não adianta esperar 12 s × 4: tenta uma vez mais após 2 s e,
// se falhar, marca a API como fora do ar por 60 s (as demais consultas falham na hora).
let apiForaAte = 0;
export class ApiIndisponivelError extends Error {
  constructor() { super('A API do Comex Stat está fora do ar no momento.'); this.name = 'ApiIndisponivelError'; }
}
export const apiIndisponivel = () => Date.now() < apiForaAte;
export const reiniciarDisponibilidade = () => { apiForaAte = 0; };

// --- Cache das respostas na sessão: reabrir uma NCM não consulta a API de novo ---
const memCache = new Map<string, unknown>();
const CACHE_PREFIX = 'comexstat.cache.v1:';
function lerCache<T>(key: string): T | undefined {
  if (memCache.has(key)) return memCache.get(key) as T;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (raw) { const v = JSON.parse(raw) as T; memCache.set(key, v); return v; }
  } catch { /* sessionStorage indisponível */ }
  return undefined;
}
function gravarCache(key: string, value: unknown) {
  memCache.set(key, value);
  try {
    const raw = JSON.stringify(value);
    if (raw.length < 1_500_000) sessionStorage.setItem(CACHE_PREFIX + key, raw);
  } catch { /* cota cheia: fica só na memória */ }
}

async function fetchWithRetry<T>(url: string, options?: RequestInit): Promise<T> {
  const key = `${options?.method ?? 'GET'} ${url} ${typeof options?.body === 'string' ? options.body : ''}`;
  const hit = lerCache<T>(key);
  if (hit !== undefined) return hit;
  if (apiIndisponivel()) throw new ApiIndisponivelError();

  let lastError: unknown;
  let falhasDeRede = 0;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let espera = RETRY_DELAY;
    try {
      const response = await withSlot(() => fetch(url, options));
      if (response.ok) {
        const data = (await response.json()) as T;
        gravarCache(key, data);
        return data;
      }
      const errorText = await response.text();
      lastError = new Error(`API ${response.status}: ${errorText.slice(0, 200)}`);
      // 429 (limite) e 5xx são temporários: tenta de novo. Outros erros, desiste.
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && /^API 4\d\d/.test(error.message) && !error.message.startsWith('API 429')) throw error;
      if (error instanceof TypeError) {
        // Falha de rede/CORS: servidor fora do ar
        falhasDeRede++;
        if (falhasDeRede >= 2 || apiIndisponivel()) {
          apiForaAte = Date.now() + 60_000;
          throw new ApiIndisponivelError();
        }
        espera = 2000;
      }
    }
    if (attempt < MAX_RETRIES) {
      console.warn(`Tentativa ${attempt}/${MAX_RETRIES} falhou para ${url}. Nova tentativa em ${espera / 1000}s...`);
      await sleep(espera);
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

// A tabela completa de NCMs é grande (~10 mil linhas): guarda só NCM → unidade, por 7 dias, no navegador
let ncmTableCache: Record<string, string> | null = null;
const UNIT_KEY = 'comexstat.unidades.v1';
export async function fetchNcmUnit(ncmCode: string): Promise<string | null> {
  try {
    if (!ncmTableCache) {
      try {
        const salvo = JSON.parse(localStorage.getItem(UNIT_KEY) || 'null');
        if (salvo && Date.now() - salvo.em < 7 * 864e5) ncmTableCache = salvo.mapa;
      } catch { /* ignora */ }
    }
    if (!ncmTableCache) {
      const response = await fetchWithRetry<{ data: { list: { coNcm: string; unit: string }[] } }>(`${API_BASE_URL}/tables/ncm`);
      const mapa: Record<string, string> = {};
      response.data.list.forEach(item => { mapa[item.coNcm] = item.unit; });
      ncmTableCache = mapa;
      try { localStorage.setItem(UNIT_KEY, JSON.stringify({ em: Date.now(), mapa })); } catch { /* cota */ }
    }
    return ncmTableCache[ncmCode] ?? 'Unidade não encontrada';
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
      // A quantidade estatística só é aceita pela API com detalhamento por NCM
      flow, monthDetail: true, period: yearPeriod, filters, details: metrics.includes('metricStatistic') ? ['ncm'] : [], metrics,
    });
    return response.data?.list || [];
  }));

  const monthFields = ['monthNumber', 'coMes', 'CO_MES', 'mes', 'month'];
  return results.flat().flatMap(raw => {
    const field = monthFields.find(f => raw[f] !== undefined && raw[f] !== null);
    const month = field ? Number(raw[field]) : NaN;
    const year = Number(raw.year);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return [];
    return [{ year, month, metricFOB: parseApiNumber(raw.metricFOB), metricKG: parseApiNumber(raw.metricKG), metricStatistic: parseApiNumber(raw.metricStatistic) }];
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

/**
 * Comércio por país e por ano num só pedido (monthDetail = false devolve uma linha por ano e país).
 * Atenção: a API aplica o intervalo de meses a cada ano; para anos completos, use `to: AAAA-12`.
 */
export async function fetchCountryYearData(ncmCode: string, flow: FlowType, period: Period): Promise<CountryYearRecord[]> {
  const response = await postGeneral<{ data: { list: ComexStatRecord[] } }>({
    flow,
    monthDetail: false,
    period,
    filters: [{ filter: "ncm", values: [ncmCode] }],
    details: ["country", "ncm"], // a quantidade estatística exige o detalhamento por NCM
    metrics: ["metricFOB", "metricKG", "metricStatistic"],
  });
  const by = new Map<string, CountryYearRecord>();
  for (const item of response.data?.list || []) {
    const country = item.country || "Desconhecido";
    const year = Number(item.year);
    const k = `${country}|${year}`;
    const cur = by.get(k) ?? { country, year, metricFOB: 0, metricKG: 0, metricStatistic: 0 };
    cur.metricFOB += parseApiNumber(item.metricFOB);
    cur.metricKG += parseApiNumber(item.metricKG);
    cur.metricStatistic += parseApiNumber(item.metricStatistic);
    by.set(k, cur);
  }
  return [...by.values()];
}

/** Comércio por UF (detalhamento "state" = UF do produto/domicílio fiscal da empresa) e por ano. */
export async function fetchUfYearData(ncmCode: string, flow: FlowType, period: Period): Promise<UfRecord[]> {
  const response = await postGeneral<{ data: { list: ComexStatRecord[] } }>({
    flow,
    monthDetail: false,
    period,
    filters: [{ filter: "ncm", values: [ncmCode] }],
    details: ["state"],
    metrics: ["metricFOB", "metricKG"],
  });
  const by = new Map<string, UfRecord>();
  for (const item of response.data?.list || []) {
    const it = item as Record<string, any>;
    const uf = String(it.state ?? it.noUf ?? it.uf ?? it.siglaUf ?? it.sgUf ?? 'Não informada');
    const year = Number(it.year);
    const k = `${uf}|${year}`;
    const cur = by.get(k) ?? { uf, year, metricFOB: 0, metricKG: 0 };
    cur.metricFOB += parseApiNumber(it.metricFOB);
    cur.metricKG += parseApiNumber(it.metricKG);
    by.set(k, cur);
  }
  return [...by.values()];
}
