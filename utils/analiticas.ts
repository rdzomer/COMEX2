/**
 * Visões analíticas da ficha e do radar (pacote de 25/11/2026):
 *  1. preço × volume por origem (bolhas com seta do período anterior ao atual);
 *  2. decomposição da variação das importações por país (efeito quantidade × efeito preço);
 *  3. quadrante de triagem dos alertas (radar das cestas);
 *  4. calendário mês × ano;
 *  5. concentração de origem (maior fornecedor, 3 maiores e HHI);
 *  6. penetração das importações no consumo aparente (NF-e);
 *  7. importações por UF.
 * Tudo é calculado no navegador a partir de dados já carregados.
 */
import { CountryYearRecord, MonthlyComexStatRecord, NfeData } from '../types.ts';
import type { Metric } from './fichaExtras.ts';
import type { Alerta } from './alertas.ts';

// ---------------------------------------------------------------------------
// Períodos de comparação (usados nas bolhas, na decomposição e nas UFs)
// ---------------------------------------------------------------------------
export type Comparacao = 'ytd' | 'ano';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export interface PeriodoComparacao { chave: Comparacao; anterior: string; atual: string; rotulo: string }

/** Opções de comparação disponíveis dado o último mês publicado. */
export function opcoesComparacao(Y: number, M: number): PeriodoComparacao[] {
  const out: PeriodoComparacao[] = [];
  if (M < 12) {
    const j = `jan–${MESES[M - 1]}`;
    out.push({ chave: 'ytd', anterior: `${j}/${Y - 1}`, atual: `${j}/${Y}`, rotulo: `${j}/${Y - 1} → ${j}/${Y}` });
    out.push({ chave: 'ano', anterior: String(Y - 2), atual: String(Y - 1), rotulo: `${Y - 2} → ${Y - 1}` });
  } else {
    out.push({ chave: 'ano', anterior: String(Y - 1), atual: String(Y), rotulo: `${Y - 1} → ${Y}` });
  }
  return out;
}

/** Registros (país × ano) do período anterior e do atual, conforme a comparação escolhida. */
export function registrosDaComparacao(
  comp: Comparacao, Y: number, M: number, anual: CountryYearRecord[], anteriorAteMes: CountryYearRecord[],
): { anterior: CountryYearRecord[]; atual: CountryYearRecord[] } {
  if (comp === 'ytd' && M < 12) return { anterior: anteriorAteMes.filter(r => r.year === Y - 1), atual: anual.filter(r => r.year === Y) };
  const a = M < 12 ? Y - 1 : Y;
  return { anterior: anual.filter(r => r.year === a - 1), atual: anual.filter(r => r.year === a) };
}

// ---------------------------------------------------------------------------
// 1 e 2 — pares por país
// ---------------------------------------------------------------------------
export interface ParPais { pais: string; q0: number; v0: number; q1: number; v1: number }

export function paresPorPais(anterior: CountryYearRecord[], atual: CountryYearRecord[]): ParPais[] {
  const m = new Map<string, ParPais>();
  const get = (p: string) => m.get(p) ?? (m.set(p, { pais: p, q0: 0, v0: 0, q1: 0, v1: 0 }), m.get(p)!);
  anterior.forEach(r => { const x = get(r.country); x.q0 += r.metricKG; x.v0 += r.metricFOB; });
  atual.forEach(r => { const x = get(r.country); x.q1 += r.metricKG; x.v1 += r.metricFOB; });
  return [...m.values()].filter(p => p.v0 > 0 || p.v1 > 0);
}

export interface PontoBolha {
  pais: string; cor: string;
  q0: number | null; p0: number | null; v0: number;
  q1: number | null; p1: number | null; v1: number;
  varQ: number | null; varP: number | null;
}

/** Os N maiores países (pelo maior valor entre os dois períodos), com preço US$/kg em cada período. */
export function dadosBolhas(pares: ParPais[], cores: string[], n = 8): { pontos: PontoBolha[]; precoMedio0: number | null; precoMedio1: number | null; outros: number } {
  const ord = [...pares].sort((a, b) => Math.max(b.v1, b.v0) - Math.max(a.v1, a.v0));
  const top = ord.slice(0, n);
  const preco = (v: number, q: number) => (q > 0 && v > 0 ? v / q : null);
  const tot = (k: 'q0' | 'v0' | 'q1' | 'v1') => pares.reduce((s, p) => s + p[k], 0);
  return {
    pontos: top.map((p, i) => {
      const p0 = preco(p.v0, p.q0), p1 = preco(p.v1, p.q1);
      return {
        pais: p.pais, cor: cores[i % cores.length],
        q0: p.q0 > 0 ? p.q0 : null, p0, v0: p.v0, q1: p.q1 > 0 ? p.q1 : null, p1, v1: p.v1,
        varQ: p.q0 > 0 ? (p.q1 / p.q0 - 1) * 100 : null,
        varP: p0 && p1 ? (p1 / p0 - 1) * 100 : null,
      };
    }),
    precoMedio0: preco(tot('v0'), tot('q0')),
    precoMedio1: preco(tot('v1'), tot('q1')),
    outros: Math.max(0, pares.length - top.length),
  };
}

export interface LinhaDecomposicao { pais: string; delta: number; efeitoQuantidade: number; efeitoPreco: number; v0: number; v1: number; q0: number; q1: number }

/**
 * Variação do valor importado (US$ FOB) por país, separada em efeito quantidade e efeito preço:
 *   ΔV = (q1 − q0)·p0  +  (p1 − p0)·q1
 * A soma das duas parcelas é exatamente ΔV. País novo (q0 = 0) ou que deixou de exportar (q1 = 0):
 * toda a variação é efeito quantidade.
 */
export function decomporPais(p: ParPais): LinhaDecomposicao {
  const delta = p.v1 - p.v0;
  let eq: number, ep: number;
  if (p.q0 <= 0 || p.q1 <= 0) { eq = delta; ep = 0; }
  else {
    const p0 = p.v0 / p.q0, p1 = p.v1 / p.q1;
    eq = (p.q1 - p.q0) * p0;
    ep = (p1 - p0) * p.q1;
  }
  return { pais: p.pais, delta, efeitoQuantidade: eq, efeitoPreco: ep, v0: p.v0, v1: p.v1, q0: p.q0, q1: p.q1 };
}

export const DEMAIS = 'Demais países';

export function decomposicao(pares: ParPais[], n = 7): { linhas: LinhaDecomposicao[]; total0: number; total1: number } {
  const linhas = pares.map(decomporPais).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = linhas.slice(0, n), resto = linhas.slice(n);
  if (resto.length) {
    const s = (k: keyof LinhaDecomposicao) => resto.reduce((acc, l) => acc + (l[k] as number), 0);
    top.push({ pais: DEMAIS, delta: s('delta'), efeitoQuantidade: s('efeitoQuantidade'), efeitoPreco: s('efeitoPreco'), v0: s('v0'), v1: s('v1'), q0: s('q0'), q1: s('q1') });
  }
  return { linhas: top, total0: pares.reduce((a, p) => a + p.v0, 0), total1: pares.reduce((a, p) => a + p.v1, 0) };
}

/**
 * Linhas do gráfico em cascata: parte do zero, soma a contribuição de cada país e termina na variação total.
 * (Partir do valor do período anterior deixaria as contribuições invisíveis quando a variação é pequena.)
 * Barras flutuantes: base invisível + parte visível; "neg" guarda a parte abaixo de zero.
 */
export function linhasCascata(d: ReturnType<typeof decomposicao>) {
  const rows: { name: string; base: number; sobe: number; desce: number; total: number; delta: number; linha?: LinhaDecomposicao }[] = [];
  let acc = 0;
  d.linhas.forEach(l => {
    const novo = acc + l.delta;
    rows.push({ name: l.pais, base: 0, sobe: l.delta > 0 ? l.delta : 0, desce: l.delta < 0 ? -l.delta : 0, total: 0, delta: l.delta, linha: l });
    const r = rows[rows.length - 1];
    r.base = Math.min(acc, novo);
    acc = novo;
  });
  rows.push({ name: 'Variação total', base: 0, sobe: 0, desce: 0, total: d.total1 - d.total0, delta: d.total1 - d.total0 });
  return rows;
}

// ---------------------------------------------------------------------------
// 3 — quadrante de triagem dos alertas
// ---------------------------------------------------------------------------
export const LIM_X = 300; // crescimento de volume acima disso aparece no limite do gráfico
export const LIM_Y = 80;

export interface PontoQuadrante {
  ncm: string; descricao: string; cesta: string; nivel: Alerta['nivel'];
  x: number; y: number; xReal: number | null; yReal: number | null; z: number; // z = peso na cesta (%)
  kg0: number; kg1: number; usd1: number;
}

export function pontosQuadrante(alertas: Alerta[]): { pontos: PontoQuadrante[]; semImportacao: number } {
  let semImportacao = 0;
  const pontos: PontoQuadrante[] = [];
  for (const a of alertas) {
    if (a.importacao12mKg <= 0) { semImportacao++; continue; }
    const xReal = a.importacaoAnt12mKg > 0 ? (a.importacao12mKg / a.importacaoAnt12mKg - 1) * 100 : null;
    const pr1 = a.importacao12mUsd / a.importacao12mKg;
    const pr0 = a.importacaoAnt12mKg > 0 && a.importacaoAnt12mUsd > 0 ? a.importacaoAnt12mUsd / a.importacaoAnt12mKg : null;
    const yReal = pr0 ? (pr1 / pr0 - 1) * 100 : null;
    pontos.push({
      ncm: a.ncm, descricao: a.descricao, cesta: a.cestaRotulo, nivel: a.nivel,
      x: Math.max(-100, Math.min(LIM_X, xReal ?? LIM_X)), y: Math.max(-LIM_Y, Math.min(LIM_Y, yReal ?? 0)),
      xReal, yReal, z: a.participacaoCesta * 100,
      kg0: a.importacaoAnt12mKg, kg1: a.importacao12mKg, usd1: a.importacao12mUsd,
    });
  }
  return { pontos, semImportacao };
}

// ---------------------------------------------------------------------------
// 4 — calendário mês × ano
// ---------------------------------------------------------------------------
export interface Calendario { anos: number[]; valores: (number | null)[][]; max: number; media: number; dp: number }

export function calendario(raw: MonthlyComexStatRecord[], metric: Metric, anoIni: number, Y: number, M: number): Calendario {
  const mapa = new Map<string, number>();
  raw.forEach(r => { const k = `${r.year}-${r.month}`; mapa.set(k, (mapa.get(k) ?? 0) + (Number(r[metric]) || 0)); });
  const anos = Array.from({ length: Y - anoIni + 1 }, (_, i) => anoIni + i);
  const valores = anos.map(a => Array.from({ length: 12 }, (_, i) => (a === Y && i + 1 > M ? null : mapa.get(`${a}-${i + 1}`) ?? 0)));
  const todos = valores.flat().filter((v): v is number => v !== null);
  const media = todos.reduce((s, v) => s + v, 0) / (todos.length || 1);
  const dp = Math.sqrt(todos.reduce((s, v) => s + (v - media) ** 2, 0) / (todos.length || 1));
  return { anos, valores, max: Math.max(0, ...todos), media, dp };
}

// ---------------------------------------------------------------------------
// 5 — concentração de origem
// ---------------------------------------------------------------------------
export interface PontoConcentracao { name: string; year: number; maior: number; maiorPais: string; tres: number; hhi: number; rotuloPais?: string }

export function concentracao(rows: CountryYearRecord[], metric: Metric, de: number, ate: number, parcial: boolean): PontoConcentracao[] {
  const out: PontoConcentracao[] = [];
  let anterior = '';
  for (let y = de; y <= ate; y++) {
    const vals = rows.filter(r => r.year === y).map(r => ({ p: r.country, v: r[metric] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const tot = vals.reduce((s, x) => s + x.v, 0);
    if (!tot) continue;
    const sh = vals.map(x => (x.v / tot) * 100);
    const maiorPais = vals[0].p;
    out.push({
      name: y === ate && parcial ? `${y}*` : String(y), year: y,
      maior: sh[0], maiorPais, tres: sh.slice(0, 3).reduce((s, v) => s + v, 0),
      hhi: sh.reduce((s, v) => s + v * v, 0),
      rotuloPais: maiorPais !== anterior ? maiorPais : undefined,
    });
    anterior = maiorPais;
  }
  return out;
}

export const faixaHhi = (h: number) => (h < 1500 ? 'baixa' : h < 2500 ? 'moderada' : 'alta');

// ---------------------------------------------------------------------------
// 6 — penetração das importações no consumo aparente (NF-e)
// ---------------------------------------------------------------------------
export interface PontoPenetracao { name: string; vendas: number; importacoes: number; cna: number; penetracao: number | null }

export function penetracao(nfe: NfeData[]): PontoPenetracao[] {
  return [...nfe].sort((a, b) => (a.ano || 0) - (b.ano || 0)).map(r => {
    const vendas = Math.max(0, r['Vendas internas (KG)'] || 0);
    const importacoes = r.qtd_tributavel_imp || 0;
    const cna = r.consumo_nacional_aparente_qtd || vendas + importacoes;
    const coef = typeof r.coeficiente_penetracao_imp_qtd === 'number' && !isNaN(r.coeficiente_penetracao_imp_qtd)
      ? r.coeficiente_penetracao_imp_qtd * 100 : cna > 0 ? (importacoes / cna) * 100 : null;
    return { name: String(r.ano ?? ''), vendas, importacoes, cna, penetracao: coef };
  });
}

// ---------------------------------------------------------------------------
// 7 — importações por UF
// ---------------------------------------------------------------------------
export interface UfRecord { uf: string; year: number; metricFOB: number; metricKG: number }
export interface LinhaUf { uf: string; id: string | null; v0: number; v1: number; q1: number; part: number; varPct: number | null }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Associa o nome da UF devolvido pela API ao id do mapa (ex.: "São Paulo" → "sp"). */
export function idDaUf(nome: string, locais: { id: string; name: string }[]): string | null {
  const n = norm(nome);
  const hit = locais.find(l => norm(l.name) === n) ?? locais.find(l => n.length === 2 && l.id === n);
  return hit?.id ?? null;
}

export function linhasUf(anterior: UfRecord[], atual: UfRecord[], locais: { id: string; name: string }[]): { linhas: LinhaUf[]; naoIdentificado: number } {
  const m = new Map<string, LinhaUf>();
  const get = (uf: string) => m.get(uf) ?? (m.set(uf, { uf, id: idDaUf(uf, locais), v0: 0, v1: 0, q1: 0, part: 0, varPct: null }), m.get(uf)!);
  anterior.forEach(r => { get(r.uf).v0 += r.metricFOB; });
  atual.forEach(r => { const x = get(r.uf); x.v1 += r.metricFOB; x.q1 += r.metricKG; });
  const linhas = [...m.values()].filter(l => l.v0 > 0 || l.v1 > 0);
  const tot = linhas.reduce((s, l) => s + l.v1, 0);
  linhas.forEach(l => { l.part = tot > 0 ? (l.v1 / tot) * 100 : 0; l.varPct = l.v0 > 0 ? (l.v1 / l.v0 - 1) * 100 : null; });
  linhas.sort((a, b) => b.v1 - a.v1);
  const naoIdentificado = linhas.filter(l => !l.id).reduce((s, l) => s + l.v1, 0);
  return { linhas, naoIdentificado };
}
