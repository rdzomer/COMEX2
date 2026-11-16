/** Cestas de NCMs (por entidade e temáticas): tipos, carregamento dos arquivos gerados pela tarefa mensal e agregações. */
import { MonthlySeriesPoint, YearRowKind } from '../types.ts';
import { pad2 } from './formatting.ts';

export type Flow = 'import' | 'export';

export interface CestaNcm { ncm: string; descricao: string; categoria: string; subcategorias: string[] }

/** 'entidade' = NCMs de uma entidade setorial (ABAL, IBÁ…); 'tematica' = cesta montada por tema (ex.: minerais críticos). */
export type CestaTipo = 'entidade' | 'tematica';
export interface CestaFonte { rotulo: string; url: string }
export interface CestaClasse { id: string; nome: string; minerais: string[] }
/** Descrição de uma cesta temática (vem do dicionário e é repetida no manifesto e no arquivo da cesta). */
export interface CestaSobre { descricao?: string; fontes?: CestaFonte[]; metodologia?: string[]; classes?: CestaClasse[] }

export interface CestaManifest {
  geradoEm: string;
  atualizacao: { ano: number; mes: number; data: string };
  dicionarioFonte: string;
  // O nome "entidades" vem da primeira versão (só cestas por entidade) e foi mantido para não quebrar os arquivos já
  // publicados; hoje a lista traz todas as cestas e 'tipo' diz a espécie de cada uma (ausente = 'entidade').
  entidades: { id: string; rotulo: string; ncms: number; arquivo: string | null; tipo?: CestaTipo; descricao?: string }[];
}

export interface CestaData extends CestaSobre {
  tipo?: CestaTipo;
  entidade: string;
  rotulo: string;
  geradoEm: string;
  atualizacao: { ano: number; mes: number; data: string };
  ncms: CestaNcm[];
  anual: Record<Flow, [number, number, number, number][]>;          // [ncmIdx, ano, fob, kg]
  anoAnteriorAteMes: Record<Flow, [number, number, number][]> | null; // [ncmIdx, fob, kg]
  mensal: { import: [number, number, number, number][] };           // [ncmIdx, aaaamm, fob, kg]
  paises: Record<'anterior' | 'atual', { rotulo: string } & Record<Flow, [number, number, number, number][]>>; // [ncmIdx, paisIdx, fob, kg]
  paisNomes: string[];
}

const cache = new Map<string, Promise<any>>();
function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} ao carregar ${url}`);
      return r.json();
    }).catch(e => { cache.delete(url); throw e; }));
  }
  return cache.get(url)!;
}
export const loadCestaManifest = () => getJson<CestaManifest>('/cestas/manifest.json');
export const loadCesta = (arquivo: string) => getJson<CestaData>(`/cestas/${arquivo}`);

// ---------------------------------------------------------------------------
// Filtro e hierarquia
// ---------------------------------------------------------------------------
/** Caminho de classificação de uma NCM: [categoria, sub1, sub2, ...] */
export const pathOf = (n: CestaNcm) => [n.categoria, ...n.subcategorias];

/** Índices das NCMs cujo caminho começa com o prefixo escolhido. */
export function selectNcms(data: CestaData, prefix: string[]): Set<number> {
  const s = new Set<number>();
  data.ncms.forEach((n, i) => {
    const p = pathOf(n);
    if (prefix.every((v, k) => p[k] === v)) s.add(i);
  });
  return s;
}

/** Opções do próximo nível abaixo do prefixo, com o valor (FOB) do período escolhido para ordenar. */
export function nextLevelOptions(data: CestaData, prefix: string[], values: Map<number, { fob: number; kg: number }>) {
  const map = new Map<string, number>();
  data.ncms.forEach((n, i) => {
    const p = pathOf(n);
    if (!prefix.every((v, k) => p[k] === v)) return;
    const next = p[prefix.length];
    if (!next) return;
    map.set(next, (map.get(next) || 0) + (values.get(i)?.fob || 0));
  });
  return [...map.entries()].map(([name, fob]) => ({ name, fob })).sort((a, b) => b.fob - a.fob);
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------
export interface PeriodOption { key: string; label: string; year: number; kind: YearRowKind }

export function periodOptions(data: CestaData): PeriodOption[] {
  const { ano: Y, mes: M } = data.atualizacao;
  const years = new Set<number>();
  data.anual.import.forEach(r => years.add(r[1]));
  data.anual.export.forEach(r => years.add(r[1]));
  years.add(Y);
  return [...years].sort((a, b) => b - a).map(y => ({
    key: String(y),
    year: y,
    kind: y === Y && M < 12 ? 'ytd' : 'full',
    label: y === Y && M < 12 ? `${y} (jan–${pad2(M)})` : String(y),
  }));
}

/** Valores por NCM no período (e na base de comparação: ano anterior ou mesmo período do ano anterior). */
export function valuesByNcm(data: CestaData, flow: Flow, period: PeriodOption) {
  const cur = new Map<number, { fob: number; kg: number }>();
  const base = new Map<number, { fob: number; kg: number }>();
  const add = (m: Map<number, { fob: number; kg: number }>, i: number, fob: number, kg: number) => {
    const v = m.get(i) ?? { fob: 0, kg: 0 };
    v.fob += fob; v.kg += kg; m.set(i, v);
  };
  for (const [i, y, fob, kg] of data.anual[flow]) {
    if (y === period.year) add(cur, i, fob, kg);
    if (period.kind === 'full' && y === period.year - 1) add(base, i, fob, kg);
  }
  if (period.kind === 'ytd' && data.anoAnteriorAteMes) {
    for (const [i, fob, kg] of data.anoAnteriorAteMes[flow]) add(base, i, fob, kg);
  }
  const baseLabel = period.kind === 'ytd' ? `${period.year - 1} (jan–${pad2(data.atualizacao.mes)})` : String(period.year - 1);
  return { cur, base, baseLabel };
}

export const sumOver = (m: Map<number, { fob: number; kg: number }>, sel: Set<number>) => {
  let fob = 0, kg = 0;
  sel.forEach(i => { const v = m.get(i); if (v) { fob += v.fob; kg += v.kg; } });
  return { fob, kg };
};

// ---------------------------------------------------------------------------
// Balanço por grupo (classe → mineral), para as cestas temáticas
// ---------------------------------------------------------------------------
export interface Fluxo { fob: number; kg: number; baseFob: number; baseKg: number }
export interface GrupoBalanco {
  name: string;
  imp: Fluxo;
  exp: Fluxo;
  ncms: number;
  filhos: GrupoBalanco[];
}
const novoFluxo = (): Fluxo => ({ fob: 0, kg: 0, baseFob: 0, baseKg: 0 });

/**
 * Importações e exportações do período, somadas por categoria (classe) e por subcategoria (mineral).
 * Considera a cesta inteira, sem o filtro de navegação da tela.
 */
export function balancoPorClasse(data: CestaData, period: PeriodOption): GrupoBalanco[] {
  const v = { import: valuesByNcm(data, 'import', period), export: valuesByNcm(data, 'export', period) };
  const classes = new Map<string, GrupoBalanco>();
  data.ncms.forEach((n, i) => {
    const [mineral] = n.subcategorias;
    let c = classes.get(n.categoria);
    if (!c) { c = { name: n.categoria, imp: novoFluxo(), exp: novoFluxo(), ncms: 0, filhos: [] }; classes.set(n.categoria, c); }
    let m = mineral ? c.filhos.find(f => f.name === mineral) : undefined;
    if (mineral && !m) { m = { name: mineral, imp: novoFluxo(), exp: novoFluxo(), ncms: 0, filhos: [] }; c.filhos.push(m); }
    for (const g of m ? [c, m] : [c]) {
      g.ncms++;
      for (const [flow, alvo] of [['import', g.imp], ['export', g.exp]] as const) {
        const cur = v[flow].cur.get(i), base = v[flow].base.get(i);
        if (cur) { alvo.fob += cur.fob; alvo.kg += cur.kg; }
        if (base) { alvo.baseFob += base.fob; alvo.baseKg += base.kg; }
      }
    }
  });
  const ordem = [...classes.values()];
  // Mantém a ordem das classes definida no dicionário (I, II, III); minerais do maior para o menor fluxo
  if (data.classes?.length) ordem.sort((a, b) => data.classes!.findIndex(c => c.nome === a.name) - data.classes!.findIndex(c => c.nome === b.name));
  ordem.forEach(c => c.filhos.sort((a, b) => Math.max(b.imp.fob, b.exp.fob) - Math.max(a.imp.fob, a.exp.fob)));
  return ordem;
}

// ---------------------------------------------------------------------------
// Detalhe por NCM (cestas temáticas): peso de cada NCM dentro do mineral e textos de metodologia
// ---------------------------------------------------------------------------
export interface LinhaNcm {
  ncm: string; descricao: string;
  classe: string; mineral: string; etapa: string;
  imp: Fluxo; exp: Fluxo;
}

/** Uma linha por NCM da cesta, com importações e exportações do período (e da base de comparação). */
export function linhasPorNcm(data: CestaData, period: PeriodOption): LinhaNcm[] {
  const v = { import: valuesByNcm(data, 'import', period), export: valuesByNcm(data, 'export', period) };
  const fluxo = (flow: Flow, i: number): Fluxo => {
    const c = v[flow].cur.get(i), b = v[flow].base.get(i);
    return { fob: c?.fob ?? 0, kg: c?.kg ?? 0, baseFob: b?.fob ?? 0, baseKg: b?.kg ?? 0 };
  };
  return data.ncms.map((n, i) => ({
    ncm: n.ncm, descricao: n.descricao,
    classe: n.categoria, mineral: n.subcategorias[0] ?? '', etapa: n.subcategorias[1] ?? '',
    imp: fluxo('import', i), exp: fluxo('export', i),
  }));
}

export interface TematicaDetalhe { classe: string; criterio: string; fora: string[] }
export interface DicionarioTematico {
  geradoEm: string; hash: string; fonte: string;
  cestas: (CestaSobre & { id: string; label: string; detalhes: Record<string, TematicaDetalhe>; ncms: CestaNcm[] })[];
}
export const loadDicionarioTematico = () => getJson<DicionarioTematico>('/cestas/dicionario-tematicas.json');

// ---------------------------------------------------------------------------
// Árvore hierárquica
// ---------------------------------------------------------------------------
export interface TreeNode {
  key: string;
  name: string;
  level: number;          // 0 = categoria, 1.. = subcategorias, 'ncm' marcado em isNcm
  isNcm: boolean;
  ncm?: string;
  descricao?: string;
  fob: number; kg: number; baseFob: number; baseKg: number;
  children: TreeNode[];
}

export function buildTree(
  data: CestaData, sel: Set<number>,
  cur: Map<number, { fob: number; kg: number }>, base: Map<number, { fob: number; kg: number }>,
  startLevel: number, maxDepth: number, // maxDepth: quantos níveis de classificação mostrar antes das NCMs (99 = todos)
): TreeNode[] {
  const root: TreeNode = { key: '', name: '', level: -1, isNcm: false, fob: 0, kg: 0, baseFob: 0, baseKg: 0, children: [] };
  sel.forEach(i => {
    const n = data.ncms[i];
    const p = pathOf(n).slice(startLevel, startLevel + maxDepth);
    const c = cur.get(i) ?? { fob: 0, kg: 0 };
    const b = base.get(i) ?? { fob: 0, kg: 0 };
    let node = root;
    const addTo = (t: TreeNode) => { t.fob += c.fob; t.kg += c.kg; t.baseFob += b.fob; t.baseKg += b.kg; };
    addTo(root);
    p.forEach((name, k) => {
      const key = `${node.key}›${name}`;
      let child = node.children.find(ch => ch.key === key && !ch.isNcm);
      if (!child) {
        child = { key, name, level: startLevel + k, isNcm: false, fob: 0, kg: 0, baseFob: 0, baseKg: 0, children: [] };
        node.children.push(child);
      }
      addTo(child);
      node = child;
    });
    node.children.push({
      key: `${node.key}›${n.ncm}`, name: n.ncm, ncm: n.ncm, descricao: n.descricao, level: 99, isNcm: true,
      fob: c.fob, kg: c.kg, baseFob: b.fob, baseKg: b.kg, children: [],
    });
  });
  const sort = (t: TreeNode) => { t.children.sort((a, b) => b.fob - a.fob || b.kg - a.kg); t.children.forEach(sort); };
  sort(root);
  return root.children;
}

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------
export interface CestaYearRow { year: string; yearNumeric: number; kind: YearRowKind; fob: number; kg: number }

/** Série anual da seleção, com o mesmo período do ano anterior quando o ano corrente está incompleto. */
export function annualSeries(data: CestaData, flow: Flow, sel: Set<number>): CestaYearRow[] {
  const { ano: Y, mes: M } = data.atualizacao;
  const by = new Map<number, { fob: number; kg: number }>();
  for (const [i, y, fob, kg] of data.anual[flow]) {
    if (!sel.has(i)) continue;
    const v = by.get(y) ?? { fob: 0, kg: 0 };
    v.fob += fob; v.kg += kg; by.set(y, v);
  }
  const firstYear = Math.min(...[...by.keys(), Y]);
  const rows: CestaYearRow[] = [];
  for (let y = firstYear; y <= Y; y++) {
    const v = by.get(y) ?? { fob: 0, kg: 0 };
    const partial = y === Y && M < 12;
    if (partial && data.anoAnteriorAteMes) {
      let fob = 0, kg = 0;
      for (const [i, f, k] of data.anoAnteriorAteMes[flow]) if (sel.has(i)) { fob += f; kg += k; }
      rows.push({ year: `${Y - 1} (Até mês ${pad2(M)})`, yearNumeric: Y - 1, kind: 'prevYtd', fob, kg });
    }
    rows.push({ year: partial ? `${y} (Até mês ${pad2(M)})` : String(y), yearNumeric: y, kind: partial ? 'ytd' : 'full', ...v });
  }
  return rows;
}

/** Série mensal de importações da seleção (para soma móvel de 12 meses e blocos P1–P5). */
export function monthlyImports(data: CestaData, sel: Set<number>): { year: number; month: number; metricKG: number; metricFOB: number }[] {
  const by = new Map<number, { fob: number; kg: number }>();
  for (const [i, ym, fob, kg] of data.mensal.import) {
    if (!sel.has(i)) continue;
    const v = by.get(ym) ?? { fob: 0, kg: 0 };
    v.fob += fob; v.kg += kg; by.set(ym, v);
  }
  return [...by.entries()].map(([ym, v]) => ({ year: Math.floor(ym / 100), month: ym % 100, metricKG: v.kg, metricFOB: v.fob }));
}

/** Países da seleção, com participação. */
export function countriesFor(data: CestaData, key: 'anterior' | 'atual', flow: Flow, sel: Set<number>) {
  const by = new Map<number, { fob: number; kg: number }>();
  for (const [i, p, fob, kg] of data.paises[key][flow]) {
    if (!sel.has(i)) continue;
    const v = by.get(p) ?? { fob: 0, kg: 0 };
    v.fob += fob; v.kg += kg; by.set(p, v);
  }
  const rows = [...by.entries()].map(([p, v]) => ({ country: data.paisNomes[p], metricFOB: v.fob, metricKG: v.kg }));
  const tf = rows.reduce((s, r) => s + r.metricFOB, 0), tk = rows.reduce((s, r) => s + r.metricKG, 0);
  return rows
    .map(r => ({ ...r, representatividadeFOB: tf ? (r.metricFOB / tf) * 100 : 0, representatividadeKG: tk ? (r.metricKG / tk) * 100 : 0 }))
    .sort((a, b) => b.metricFOB - a.metricFOB);
}

export type { MonthlySeriesPoint };

// ---------------------------------------------------------------------------
// Radar de alertas (pré-calculado pela tarefa mensal com os critérios padrão)
// ---------------------------------------------------------------------------
import type { Alerta, Criterios } from './alertas.ts';
export interface AlertasArquivo { geradoEm: string; atualizacao: { ano: number; mes: number }; criterios: Criterios; alertas: Alerta[] }
export const loadAlertas = () => getJson<AlertasArquivo>('/cestas/alertas.json');
