/**
 * Cálculos das visões adicionais da ficha (solicitação de 24/11/2026):
 *  1. preços médios com seleção de país;
 *  2. unidade estatística nos treemaps e tabelas por país;
 *  3. evolução das participações por país (colunas empilhadas a 100%);
 *  4. evolução mensal das importações nos últimos 48 meses.
 * Tudo é derivado de dados já carregados uma vez por NCM: trocar país ou métrica não consulta a API.
 */
import { CountryDataRecord, CountryYearRecord, MonthlyComexStatRecord } from '../types.ts';
import { MONTHS_ABBR, pad2 } from './formatting.ts';

export type Metric = 'metricFOB' | 'metricKG' | 'metricStatistic';

// ---------------------------------------------------------------------------
// Unidade estatística
// ---------------------------------------------------------------------------
const ACENTOS: Record<string, string> = {
  liquido: 'líquido', cubico: 'cúbico', cubicos: 'cúbicos', metrico: 'métrico', metrica: 'métrica',
  quilometro: 'quilômetro', centimetro: 'centímetro', milimetro: 'milímetro', numero: 'número',
};

/** Nome da unidade estatística como texto corrido (ex.: "QUILOGRAMA LIQUIDO" -> "quilograma líquido"). */
export function unitName(raw: string | null | undefined): string {
  if (!raw || /não encontrada/i.test(raw)) return 'unidade estatística';
  return raw.trim().toLowerCase().split(/\s+/).map(w => ACENTOS[w] ?? w).join(' ');
}

/** A unidade estatística é o próprio quilograma líquido? */
export const isKgUnit = (raw: string | null | undefined) => !!raw && /quilograma\s+l[ií]quido/i.test(raw);

export const metricLabel = (m: Metric, unitRaw: string | null | undefined) =>
  m === 'metricFOB' ? 'US$ FOB' : m === 'metricKG' ? 'kg líquido' : `Unidade estatística (${unitName(unitRaw)})`;

/** Rótulo curto para títulos e eixos. */
export const metricShort = (m: Metric, unitRaw: string | null | undefined) =>
  m === 'metricFOB' ? 'US$ FOB' : m === 'metricKG' ? 'kg líquido' : `unidade estatística: ${unitName(unitRaw)}`;

/** Unidade para acompanhar números (tooltip, tabelas). */
export const metricUnit = (m: Metric, unitRaw: string | null | undefined) =>
  m === 'metricFOB' ? 'US$ FOB' : m === 'metricKG' ? 'kg' : unitName(unitRaw);

export const KG_UNIT_NOTE = 'Nesta NCM a unidade estatística é o kg líquido; os valores podem diferir pontualmente do kg por diferenças de registro.';

// ---------------------------------------------------------------------------
// País × ano -> período (treemaps e tabelas)
// ---------------------------------------------------------------------------
export function countriesForYears(rows: CountryYearRecord[], years: number[]): CountryDataRecord[] {
  const set = new Set(years);
  const by = new Map<string, CountryDataRecord>();
  for (const r of rows) {
    if (!set.has(r.year)) continue;
    const cur = by.get(r.country) ?? { country: r.country, metricFOB: 0, metricKG: 0, metricStatistic: 0 };
    cur.metricFOB += r.metricFOB;
    cur.metricKG += r.metricKG;
    cur.metricStatistic = (cur.metricStatistic ?? 0) + r.metricStatistic;
    by.set(r.country, cur);
  }
  const list = [...by.values()].filter(r => r.metricFOB > 0 || r.metricKG > 0 || (r.metricStatistic ?? 0) > 0);
  const tot = (k: Metric) => list.reduce((s, r) => s + (r[k] ?? 0), 0);
  const tF = tot('metricFOB'), tK = tot('metricKG'), tS = tot('metricStatistic');
  return list
    .map(r => ({
      ...r,
      representatividadeFOB: tF > 0 ? (r.metricFOB / tF) * 100 : 0,
      representatividadeKG: tK > 0 ? (r.metricKG / tK) * 100 : 0,
      representatividadeStat: tS > 0 ? ((r.metricStatistic ?? 0) / tS) * 100 : 0,
    }))
    .sort((a, b) => b.metricFOB - a.metricFOB);
}

export const shareKey = (m: Metric) =>
  (m === 'metricFOB' ? 'representatividadeFOB' : m === 'metricKG' ? 'representatividadeKG' : 'representatividadeStat') as
  'representatividadeFOB' | 'representatividadeKG' | 'representatividadeStat';

// ---------------------------------------------------------------------------
// Alteração 1 — preços por país
// ---------------------------------------------------------------------------
/** Países com comércio da NCM no período (qualquer fluxo), em ordem alfabética. */
export function tradingCountries(imp: CountryYearRecord[], exp: CountryYearRecord[], fromYear: number): string[] {
  const s = new Set<string>();
  [...imp, ...exp].forEach(r => { if (r.year >= fromYear && (r.metricFOB > 0 || r.metricKG > 0)) s.add(r.country); });
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** US$ FOB ÷ kg líquido de um país num ano; null sem comércio (lacuna na linha, nunca zero). */
export function countryYearPrice(rows: CountryYearRecord[], country: string, year: number): { price: number | null; kg: number } {
  let fob = 0, kg = 0;
  rows.forEach(r => { if (r.country === country && r.year === year) { fob += r.metricFOB; kg += r.metricKG; } });
  return { price: kg > 0 ? fob / kg : null, kg };
}

// ---------------------------------------------------------------------------
// Alteração 3 — evolução das participações (colunas empilhadas a 100%)
// ---------------------------------------------------------------------------
export const OTHERS = 'Demais países';
export const OTHERS_COLOR = '#a8a69e';
/** Paleta categórica validada (ordem fixa, sem ciclo). */
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
/** Texto dentro do segmento: branco, exceto preto sobre amarelo e sobre o cinza de "Demais países". */
export const inkOn = (fill: string) => (fill === '#eda100' || fill === '#e87ba4' || fill === OTHERS_COLOR ? '#0b0b0b' : '#ffffff');

export interface ShareYear {
  name: string;          // rótulo do eixo ("2026*" no ano parcial)
  year: number;
  total: number;
  empty: boolean;        // sem registro no ano
  [key: string]: number | string | boolean; // participação % por país (chave = nome do país), e "abs:<país>" = valor absoluto
}

export interface ShareEvolution {
  countries: string[];   // top-N pelo acumulado, maior primeiro (+ OTHERS no fim se houver)
  years: ShareYear[];
  hasData: boolean;
}

export function shareEvolution(rows: CountryYearRecord[], metric: Metric, fromYear: number, toYear: number, partialYear: boolean, topN = 5): ShareEvolution {
  const years = Array.from({ length: Math.max(0, toYear - fromYear + 1) }, (_, i) => fromYear + i);
  const inRange = rows.filter(r => r.year >= fromYear && r.year <= toYear);
  const cum = new Map<string, number>();
  inRange.forEach(r => cum.set(r.country, (cum.get(r.country) ?? 0) + (r[metric] || 0)));
  const top = [...cum.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([c]) => c);
  let othersAny = false;

  const out: ShareYear[] = years.map(y => {
    const yr = inRange.filter(r => r.year === y);
    const total = yr.reduce((s, r) => s + (r[metric] || 0), 0);
    const p: ShareYear = { name: y === toYear && partialYear ? `${y}*` : String(y), year: y, total, empty: total <= 0 };
    let topSum = 0;
    top.forEach(c => {
      const v = yr.filter(r => r.country === c).reduce((s, r) => s + (r[metric] || 0), 0);
      topSum += v;
      p[c] = total > 0 ? (v / total) * 100 : 0;
      p[`abs:${c}`] = v;
    });
    const others = Math.max(0, total - topSum);
    if (others > 0 && total > 0 && (others / total) > 1e-9) othersAny = true;
    p[OTHERS] = total > 0 ? (others / total) * 100 : 0;
    p[`abs:${OTHERS}`] = others;
    if (p.empty) p.vazio = 100;
    return p;
  });
  return { countries: othersAny ? [...top, OTHERS] : top, years: out, hasData: out.some(y => !y.empty) };
}

/**
 * Cores por país, iguais nos dois gráficos (importação e exportação).
 * Até 8 países distintos: uma cor por país. Acima disso (raro), os países presentes num só gráfico
 * compartilham posições, para nunca gerar cores além da paleta validada.
 */
export function countryColors(impTop: string[], expTop: string[]): Record<string, string> {
  const imp = impTop.filter(c => c !== OTHERS), exp = expTop.filter(c => c !== OTHERS);
  const colors: Record<string, string> = { [OTHERS]: OTHERS_COLOR };
  const union = [...imp, ...exp.filter(c => !imp.includes(c))];
  if (union.length <= CATEGORICAL.length) {
    union.forEach((c, i) => { colors[c] = CATEGORICAL[i]; });
    return colors;
  }
  const shared = imp.filter(c => exp.includes(c));
  shared.forEach((c, i) => { colors[c] = CATEGORICAL[i]; });
  const impOnly = imp.filter(c => !shared.includes(c)), expOnly = exp.filter(c => !shared.includes(c));
  impOnly.forEach((c, i) => { colors[c] = CATEGORICAL[shared.length + i]; });
  expOnly.forEach((c, i) => { colors[c] = CATEGORICAL[shared.length + i]; });
  return colors;
}

// ---------------------------------------------------------------------------
// Alteração 4 — importações mensais, últimos 48 meses
// ---------------------------------------------------------------------------
export interface MonthPoint {
  key: string;      // AAAA-MM
  name: string;     // "nov/22"
  year: number;
  month: number;
  value: number;
  prevYear: number | null; // mesmo mês do ano anterior
  yoy: number | null;      // variação % sobre o mesmo mês do ano anterior
}

const monthKey = (y: number, m: number) => `${y}-${pad2(m)}`;
export const monthLabel = (y: number, m: number) => `${MONTHS_ABBR[m - 1]}/${String(y).slice(2)}`;

export function monthlyWindow(raw: MonthlyComexStatRecord[], metric: Metric, endYear: number, endMonth: number, months = 48, dataStartYear = 2019): MonthPoint[] {
  const map = new Map<string, number>();
  raw.forEach(r => {
    const k = monthKey(r.year, r.month);
    map.set(k, (map.get(k) ?? 0) + (Number(r[metric]) || 0));
  });
  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonth - 1 - i, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    const value = map.get(monthKey(y, m)) ?? 0; // mês sem importação = zero (é informação)
    const pk = monthKey(y - 1, m);
    // Só compara quando o mesmo mês do ano anterior está dentro do período consultado
    const prevYear = y - 1 >= dataStartYear ? (map.get(pk) ?? 0) : null;
    out.push({ key: monthKey(y, m), name: monthLabel(y, m), year: y, month: m, value, prevYear, yoy: prevYear ? ((value - prevYear) / prevYear) * 100 : null });
  }
  return out;
}

/** Modo "Comparação por ano": uma linha por ano, eixo jan–dez. */
export function byYearLines(points: MonthPoint[]): { years: number[]; data: Record<string, number | string | null>[] } {
  const years = [...new Set(points.map(p => p.year))].sort();
  const data = MONTHS_ABBR.map((abbr, i) => {
    const row: Record<string, number | string | null> = { name: abbr };
    years.forEach(y => {
      const p = points.find(q => q.year === y && q.month === i + 1);
      row[String(y)] = p ? p.value : null;
    });
    return row;
  });
  return { years, data };
}
