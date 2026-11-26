/**
 * Cruzamentos da etapa 2 da especificação de modelos (26/11/2026), calculados só com os dados já consultados.
 * Regras: preço = razão entre somas (nunca média de preços); base zero ⇒ sem variação percentual (null), nunca infinito.
 */
import { MonthlyComexStatRecord, ProcessedTradeData } from '../types.ts';
import { ParPais } from './analiticas.ts';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const varPct = (a: number, b: number) => (b > 0 ? (a / b - 1) * 100 : null);
const preco = (usd: number, kg: number) => (kg > 0 ? usd / kg : null);
const rotMes = (y: number, m: number) => `${MESES[m - 1]}/${String(y).slice(2)}`;

/** Índice mês → {kg, usd}; meses sem registro na API valem zero dentro do intervalo consultado. */
function porMes(raw: MonthlyComexStatRecord[]) {
  const m = new Map<number, { kg: number; usd: number }>();
  raw.forEach(r => {
    const k = r.year * 12 + (r.month - 1);
    const x = m.get(k) ?? { kg: 0, usd: 0 };
    x.kg += r.metricKG || 0; x.usd += r.metricFOB || 0;
    m.set(k, x);
  });
  return m;
}
const soma = (m: Map<number, { kg: number; usd: number }>, fim: number, n: number) => {
  let kg = 0, usd = 0;
  for (let k = fim - n + 1; k <= fim; k++) { const x = m.get(k); if (x) { kg += x.kg; usd += x.usd; } }
  return { kg, usd };
};

// ---------------------------------------------------------------------------
// B10 — último mês, 3, 6 e 12 meses e ano corrente vs a mesma janela do ano anterior
// ---------------------------------------------------------------------------
export interface LinhaJanela {
  janela: string; periodo: string; periodoAnt: string;
  kg: number; kgAnt: number; usd: number; usdAnt: number; preco: number | null; precoAnt: number | null;
  varKg: number | null; varUsd: number | null; varPreco: number | null; difKg: number;
}

export function janelasRecentes(raw: MonthlyComexStatRecord[], Y: number, M: number): LinhaJanela[] {
  if (!raw.length) return [];
  const m = porMes(raw);
  const fim = Y * 12 + (M - 1);
  const def: [string, number][] = [['Último mês', 1], ['Últimos 3 meses', 3], ['Últimos 6 meses', 6], ['Últimos 12 meses', 12]];
  // em dezembro o ano corrente coincide com os últimos 12 meses
  if (M > 1 && M < 12) def.push([`Ano corrente (jan–${MESES[M - 1]})`, M]);
  return def.map(([janela, n]) => {
    const a = soma(m, fim, n), b = soma(m, fim - 12, n);
    const ini = fim - n + 1;
    const lbl = (i: number, f: number) => (i === f ? rotMes(Math.floor(f / 12), (f % 12) + 1) : `${rotMes(Math.floor(i / 12), (i % 12) + 1)} a ${rotMes(Math.floor(f / 12), (f % 12) + 1)}`);
    const pa = preco(a.usd, a.kg), pb = preco(b.usd, b.kg);
    return {
      janela, periodo: lbl(ini, fim), periodoAnt: lbl(ini - 12, fim - 12),
      kg: a.kg, kgAnt: b.kg, usd: a.usd, usdAnt: b.usd, preco: pa, precoAnt: pb,
      varKg: varPct(a.kg, b.kg), varUsd: varPct(a.usd, b.usd), varPreco: pa !== null && pb !== null ? (pa / pb - 1) * 100 : null,
      difKg: a.kg - b.kg,
    };
  });
}

// ---------------------------------------------------------------------------
// C04–C06 — preço médio mensal e preço móvel (razão entre somas na janela)
// ---------------------------------------------------------------------------
export interface PontoPrecoMensal { name: string; mensal: number | null; movel: number | null; kg: number; usd: number }

export function precoMensal(raw: MonthlyComexStatRecord[], Y: number, M: number, janela: 3 | 6 | 12, meses = 48): PontoPrecoMensal[] {
  if (!raw.length) return [];
  const m = porMes(raw);
  const fim = Y * 12 + (M - 1);
  const primeiro = Math.min(...raw.map(r => r.year * 12 + (r.month - 1)));
  const out: PontoPrecoMensal[] = [];
  for (let k = fim - meses + 1; k <= fim; k++) {
    const x = m.get(k) ?? { kg: 0, usd: 0 };
    // janela móvel só quando completa dentro da série consultada
    const s = k - janela + 1 >= primeiro ? soma(m, k, janela) : null;
    out.push({ name: rotMes(Math.floor(k / 12), (k % 12) + 1), mensal: preco(x.usd, x.kg), movel: s ? preco(s.usd, s.kg) : null, kg: x.kg, usd: x.usd });
  }
  return out;
}

// ---------------------------------------------------------------------------
// B12/C11 — volume e preço em base 100 (anos completos)
// ---------------------------------------------------------------------------
export interface PontoBase100 { name: string; volume: number | null; preco: number | null; valor: number | null; kg: number; usd: number; p: number | null }

export function anosCompletos(rows: ProcessedTradeData[], desde = 2010) {
  return rows.filter(r => r.kind === 'full' && (r.yearNumeric ?? 0) >= desde).map(r => r.yearNumeric as number);
}

export function base100(rows: ProcessedTradeData[], anoBase: number, desde = 2010): { pontos: PontoBase100[]; baseValida: boolean } {
  const anos = rows.filter(r => r.kind === 'full' && (r.yearNumeric ?? 0) >= desde)
    .map(r => ({ ano: r.yearNumeric as number, kg: r['Importações (KG)'] || 0, usd: r['Importações (US$ FOB)'] || 0 }));
  const b = anos.find(a => a.ano === anoBase);
  const pb = b ? preco(b.usd, b.kg) : null;
  const baseValida = !!b && b.kg > 0 && pb !== null;
  return {
    baseValida,
    pontos: anos.filter(a => a.ano >= anoBase).map(a => {
      const p = preco(a.usd, a.kg);
      return {
        name: String(a.ano), kg: a.kg, usd: a.usd, p,
        volume: baseValida ? (100 * a.kg) / b!.kg : null,
        valor: baseValida && b!.usd > 0 ? (100 * a.usd) / b!.usd : null,
        preco: baseValida && p !== null ? (100 * p) / pb! : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// C07/D03/D05/D09 — diagnóstico integrado por origem
// ---------------------------------------------------------------------------
export interface LinhaOrigem {
  pais: string; _fixo?: boolean;
  kg0: number; kg1: number; usd0: number; usd1: number;
  varKg: number | null; difKg: number;
  part0: number; part1: number; difPp: number;
  preco0: number | null; preco1: number | null; varPreco: number | null;
  contribKg: number | null; // % da variação líquida do volume (só quando a variação líquida não é próxima de zero)
}

export function diagnosticoOrigens(pares: ParPais[], n = 10): { linhas: LinhaOrigem[]; total: LinhaOrigem; contribuicaoBruta: boolean } {
  const T0 = pares.reduce((s, p) => s + p.q0, 0), T1 = pares.reduce((s, p) => s + p.q1, 0);
  const V0 = pares.reduce((s, p) => s + p.v0, 0), V1 = pares.reduce((s, p) => s + p.v1, 0);
  const dif = T1 - T0;
  const brutoPos = pares.reduce((s, p) => s + Math.max(0, p.q1 - p.q0), 0);
  // variação líquida perto de zero (< 5% do aumento bruto): percentual líquido seria enganoso; usa o aumento bruto
  const contribuicaoBruta = brutoPos > 0 && Math.abs(dif) < 0.05 * brutoPos;
  const linha = (pais: string, q0: number, q1: number, v0: number, v1: number, fixo = false): LinhaOrigem => {
    const p0 = preco(v0, q0), p1 = preco(v1, q1);
    const d = q1 - q0;
    const part0 = T0 > 0 ? (100 * q0) / T0 : 0, part1 = T1 > 0 ? (100 * q1) / T1 : 0;
    return {
      pais, _fixo: fixo, kg0: q0, kg1: q1, usd0: v0, usd1: v1, varKg: varPct(q1, q0), difKg: d,
      part0, part1, difPp: part1 - part0, preco0: p0, preco1: p1, varPreco: p0 !== null && p1 !== null ? (p1 / p0 - 1) * 100 : null,
      contribKg: contribuicaoBruta ? (d > 0 ? (100 * d) / brutoPos : null) : dif !== 0 ? (100 * d) / dif : null,
    };
  };
  const ord = [...pares].sort((a, b) => Math.max(b.q1, b.q0) - Math.max(a.q1, a.q0));
  const top = ord.slice(0, n).map(p => linha(p.pais, p.q0, p.q1, p.v0, p.v1));
  const resto = ord.slice(n);
  if (resto.length) {
    const s = (k: keyof ParPais) => resto.reduce((a, p) => a + (p[k] as number), 0);
    top.push(linha(`Demais países (${resto.length})`, s('q0'), s('q1'), s('v0'), s('v1'), true));
  }
  const total = linha('Total', T0, T1, V0, V1, true);
  if (!contribuicaoBruta) total.contribKg = dif !== 0 ? 100 : null;
  return { linhas: top, total, contribuicaoBruta };
}

// ---------------------------------------------------------------------------
// D09 — cascata da variação em toneladas (mesmo formato da cascata em US$)
// ---------------------------------------------------------------------------
export interface LinhaCascataT { name: string; base: number; sobe: number; desce: number; total: number; delta: number; q0?: number; q1?: number }

export function cascataToneladas(pares: ParPais[], n = 7): { rows: LinhaCascataT[]; total0: number; total1: number } {
  const linhas = pares.map(p => ({ pais: p.pais, q0: p.q0 / 1000, q1: p.q1 / 1000, d: (p.q1 - p.q0) / 1000 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const top = linhas.slice(0, n), resto = linhas.slice(n);
  if (resto.length) top.push({ pais: 'Demais países', q0: resto.reduce((s, l) => s + l.q0, 0), q1: resto.reduce((s, l) => s + l.q1, 0), d: resto.reduce((s, l) => s + l.d, 0) });
  const rows: LinhaCascataT[] = [];
  let acc = 0;
  top.forEach(l => {
    const novo = acc + l.d;
    rows.push({ name: l.pais, base: Math.min(acc, novo), sobe: l.d > 0 ? l.d : 0, desce: l.d < 0 ? -l.d : 0, total: 0, delta: l.d, q0: l.q0, q1: l.q1 });
    acc = novo;
  });
  const t0 = linhas.reduce((s, l) => s + l.q0, 0), t1 = linhas.reduce((s, l) => s + l.q1, 0);
  rows.push({ name: 'Variação total', base: 0, sobe: 0, desce: 0, total: t1 - t0, delta: t1 - t0 });
  return { rows, total0: t0, total1: t1 };
}
