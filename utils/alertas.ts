/**
 * Radar de alertas das cestas: identifica NCMs com comportamento fora do padrão,
 * levando em conta o TAMANHO do movimento (peso na cesta e, se houver NF-e, no mercado brasileiro).
 * Usado pela tela (critérios ajustáveis) e pela tarefa mensal (resumo por e-mail).
 * A página de metodologia (components/cestas/MetodologiaAlertas.tsx) descreve estas regras.
 */
import type { CestaData } from './cestas.ts';
import { buildMonthlySeries } from './dataProcessing.ts';

export interface Criterios {
  surto12m: number;        // P5 / média(P2:P4) - 1  ≥ (0,30 = 130% da média)
  aceleracao3m: number;    // últimos 3 meses vs mesmos 3 meses do ano anterior ≥
  picoDesvios: number;     // último mês > média + N desvios-padrão dos 24 meses anteriores
  quedaPreco: number;      // variação do preço US$/kg em 12 meses ≤ -x (com volume subindo)
  mudancaOrigemPp: number; // ganho de participação de um país (pontos percentuais) ≥
  quedaExportacao: number; // exportação do ano até o mês vs mesmo período do ano anterior ≤ -x
  relevanciaUsd: number;   // importações 12 meses (US$) ≥  … ou …
  relevanciaParticipacao: number; // participação nas importações da cesta ≥ (0,01 = 1%)
  impactoMinimo: number;   // aumento (US$) ≥ x das importações da cesta para o alerta passar de "em observação"…
  impactoMinimoUsd: number; // …ou aumento ≥ este valor absoluto (US$)
}

export const CRITERIOS_PADRAO: Criterios = {
  surto12m: 0.30,
  aceleracao3m: 0.50,
  picoDesvios: 3,
  quedaPreco: 0.15,
  mudancaOrigemPp: 20,
  quedaExportacao: 0.30,
  relevanciaUsd: 2_000_000,
  relevanciaParticipacao: 0.01,
  impactoMinimo: 0.0025,
  impactoMinimoUsd: 10_000_000,
};

export type TipoSinal = 'surto' | 'aceleracao' | 'pico' | 'preco' | 'origem' | 'exportacao';
export const ROTULO_SINAL: Record<TipoSinal, string> = {
  surto: 'Surto em 12 meses',
  aceleracao: 'Aceleração recente',
  pico: 'Pico atípico no mês',
  preco: 'Queda de preço com volume subindo',
  origem: 'Mudança de origem',
  exportacao: 'Queda de exportações',
};

export interface Sinal { tipo: TipoSinal; texto: string; valor: number; pontos: number }
export type Nivel = 'alto' | 'medio' | 'atencao';

export interface Mercado {
  ano: number;
  penetracao: number;          // importações / consumo nacional aparente (0–1), em kg
  penetracaoAnterior: number | null;
  anoAnterior: number | null;
}

export interface Alerta {
  ncm: string;
  descricao: string;
  entidades: { id: string; rotulo: string }[];
  categoria: string;
  sinais: Sinal[];
  pontos: number;
  nivel: Nivel;
  nivelSemLimite: Nivel;          // nível antes da regra de materialidade
  limitadoPorMaterialidade: boolean;
  importacao12mUsd: number;
  importacao12mKg: number;
  importacaoAnt12mUsd: number;    // 12 meses anteriores
  importacaoAnt12mKg: number;
  participacaoCesta: number;      // importações 12m da NCM / importações 12m da cesta
  cestaImportacao12mUsd: number;
  cestaRotulo: string;
  impacto: number;                // tamanho do movimento em US$ / importações 12m da cesta
  impactoUsd: number;             // aumento das importações (US$) em 12 meses (ou queda de exportações)
  mercado?: Mercado;              // preenchido no navegador se a NF-e for carregada
  rolling: number[];              // soma móvel 12m (kg), últimos 36 meses
  periodoRef: string;             // aaaamm do último mês
}

const nf = (d: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d });
const fmtPct = (x: number) => `${x > 0 ? '+' : ''}${nf(0).format(x * 100)}%`;
/** Quantidade legível: 850 kg · 12,4 t · 3,1 mil t */
export const fmtPeso = (kg: number) => {
  const a = Math.abs(kg);
  if (a >= 1e6) return `${nf(1).format(kg / 1e6)} mil t`;
  if (a >= 1e3) return `${nf(a >= 1e5 ? 0 : 1).format(kg / 1e3)} t`;
  return `${nf(0).format(kg)} kg`;
};
export const fmtUsd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `US$ ${nf(1).format(v / 1e9)} bi`;
  if (a >= 1e6) return `US$ ${nf(1).format(v / 1e6)} mi`;
  if (a >= 1e3) return `US$ ${nf(0).format(v / 1e3)} mil`;
  return `US$ ${nf(0).format(v)}`;
};
const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const nivelPorPontos = (p: number): Nivel => (p >= 8 ? 'alto' : p >= 5 ? 'medio' : 'atencao');

/** Calcula os alertas de uma cesta. */
export function alertasDaCesta(data: CestaData, c: Criterios = CRITERIOS_PADRAO): Alerta[] {
  const { ano: Y, mes: M } = data.atualizacao;
  const n = data.ncms.length;
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);

  const porNcm: { year: number; month: number; metricKG: number; metricFOB: number }[][] = Array.from({ length: n }, () => []);
  for (const [i, ym, fob, kg] of data.mensal.import) porNcm[i].push({ year: Math.floor(ym / 100), month: ym % 100, metricKG: kg, metricFOB: fob });
  const series = porNcm.map(rows => buildMonthlySeries(rows, Y, M));
  const totalCesta12mUsd = sum(series.map(s => sum(s.slice(-12).map(p => p.metricFOB))));

  const paisShare = (key: 'anterior' | 'atual') => {
    const m: Map<number, number>[] = Array.from({ length: n }, () => new Map());
    for (const [i, p, fob] of data.paises[key].import) m[i].set(p, (m[i].get(p) || 0) + fob);
    return m;
  };
  const pAnt = paisShare('anterior'), pAtu = paisShare('atual');

  const expAtual = new Map<number, number>(), expAnt = new Map<number, number>();
  for (const [i, y, fob] of data.anual.export) if (y === Y) expAtual.set(i, (expAtual.get(i) || 0) + fob);
  if (data.anoAnteriorAteMes) for (const [i, fob] of data.anoAnteriorAteMes.export) expAnt.set(i, (expAnt.get(i) || 0) + fob);
  else for (const [i, y, fob] of data.anual.export) if (y === Y - 1) expAnt.set(i, (expAnt.get(i) || 0) + fob);
  const totalExpAnt = sum([...expAnt.values()]);

  const out: Alerta[] = [];
  for (let i = 0; i < n; i++) {
    const s = series[i];
    if (s.length < 60) continue;
    const kg = s.map(p => p.metricKG), usd = s.map(p => p.metricFOB);
    const kg12 = sum(kg.slice(-12)), usd12 = sum(usd.slice(-12));
    const kgPrev12 = sum(kg.slice(-24, -12)), usdPrev12 = sum(usd.slice(-24, -12));
    const participacao = totalCesta12mUsd ? usd12 / totalCesta12mUsd : 0;
    const relevanteImp = usd12 >= c.relevanciaUsd || participacao >= c.relevanciaParticipacao;
    const sinais: Sinal[] = [];

    if (relevanteImp) {
      // 1. Surto em 12 meses (P5 vs média P2:P4)
      const p = [1, 2, 3, 4, 5].map(k => sum(kg.slice(kg.length - k * 12, kg.length - (k - 1) * 12)));
      const media234 = (p[1] + p[2] + p[3]) / 3;
      if (media234 > 0) {
        const v = p[0] / media234 - 1;
        if (v >= c.surto12m) sinais.push({ tipo: 'surto', valor: v, pontos: v >= 2 * c.surto12m ? 4 : 3,
          texto: `${fmtPeso(p[0])} nos últimos 12 meses vs média de ${fmtPeso(media234)} nos 3 períodos anteriores (${sinal(p[0] - media234)}${fmtPeso(Math.abs(p[0] - media234))}, ${fmtPct(v)})` });
      }
      // 2. Aceleração recente
      const k3 = sum(kg.slice(-3)), k3a = sum(kg.slice(-15, -12));
      if (k3a > 0) {
        const v = k3 / k3a - 1;
        if (v >= c.aceleracao3m) sinais.push({ tipo: 'aceleracao', valor: v, pontos: v >= 2 * c.aceleracao3m ? 3 : 2,
          texto: `Últimos 3 meses: ${fmtPeso(k3a)} → ${fmtPeso(k3)} vs mesmo período do ano anterior (${fmtPct(v)})` });
      } else if (k3 > 0 && kg12 > 0 && k3 / kg12 > 0.5) {
        sinais.push({ tipo: 'aceleracao', valor: Infinity, pontos: 3, texto: `Últimos 3 meses: ${fmtPeso(k3)}, sem registro no mesmo período do ano anterior` });
      }
      // 3. Pico atípico no último mês
      const hist = kg.slice(-25, -1);
      const media = sum(hist) / hist.length;
      const dp = Math.sqrt(sum(hist.map(x => (x - media) ** 2)) / hist.length);
      const ult = kg[kg.length - 1];
      if (dp > 0 && ult > media + c.picoDesvios * dp) {
        sinais.push({ tipo: 'pico', valor: (ult - media) / dp, pontos: 1,
          texto: `${MES[M - 1]}/${String(Y).slice(-2)}: ${fmtPeso(ult)} no mês, ${nf(1).format(ult / media)}× a média mensal de ${fmtPeso(media)}` });
      }
      // 4. Queda de preço com volume subindo
      if (kg12 > 0 && kgPrev12 > 0 && usdPrev12 > 0 && kg12 > kgPrev12) {
        const pa = usdPrev12 / kgPrev12, pb = usd12 / kg12;
        const v = pb / pa - 1;
        if (v <= -c.quedaPreco) sinais.push({ tipo: 'preco', valor: v, pontos: v <= -2 * c.quedaPreco ? 3 : 2,
          texto: `US$ ${nf(2).format(pa)}/kg → US$ ${nf(2).format(pb)}/kg (${fmtPct(v)}) com volume de ${fmtPeso(kgPrev12)} → ${fmtPeso(kg12)}` });
      }
      // 5. Mudança de origem
      const tA = sum([...pAnt[i].values()]), tB = sum([...pAtu[i].values()]);
      if (tA > 0 && tB > 0) {
        const top3A = [...pAnt[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
        const top3B = [...pAtu[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
        let melhor: { p: number; a: number; b: number; delta: number; v: number } | null = null;
        for (const [pp, v] of pAtu[i]) {
          const a = ((pAnt[i].get(pp) || 0) / tA) * 100, b = (v / tB) * 100;
          const delta = b - a;
          const entrouTop3 = !top3A.includes(pp) && top3B.includes(pp) && b >= 10 && a < 5;
          if ((delta >= c.mudancaOrigemPp || entrouTop3) && (!melhor || delta > melhor.delta)) melhor = { p: pp, a, b, delta, v };
        }
        if (melhor) {
          sinais.push({ tipo: 'origem', valor: melhor.delta, pontos: 1,
            texto: `${data.paisNomes[melhor.p]}: ${nf(0).format(melhor.a)}% → ${nf(0).format(melhor.b)}% das importações (${Y - 1} → jan–${MES[M - 1]}/${Y}; ${fmtUsd(melhor.v)} no período)` });
        }
      }
    }
    // 6. Queda de exportações
    const eA = expAnt.get(i) || 0, eB = expAtual.get(i) || 0;
    if (eA >= c.relevanciaUsd) {
      const v = eB / eA - 1;
      if (v <= -c.quedaExportacao) sinais.push({ tipo: 'exportacao', valor: v, pontos: v <= -2 * c.quedaExportacao ? 3 : 2,
        texto: `Exportações jan–${MES[M - 1]}: ${fmtUsd(eA)} → ${fmtUsd(eB)} (${fmtPct(v)}) vs mesmo período do ano anterior` });
    }

    if (!sinais.length) continue;
    const principais = sinais.filter(x => x.tipo !== 'origem' && x.tipo !== 'pico');
    if (!principais.length) continue; // origem e pico sozinhos não geram alerta

    // Tamanho do movimento: aumento das importações em US$ (12m vs 12m anteriores) sobre o total da cesta.
    // Para alertas só de exportação, usa a queda das exportações sobre o total exportado pela cesta.
    const soExport = principais.every(x => x.tipo === 'exportacao');
    const impactoUsd = soExport ? eA - eB : usd12 - usdPrev12;
    const impacto = soExport ? (totalExpAnt ? impactoUsd / totalExpAnt : 0) : (totalCesta12mUsd ? impactoUsd / totalCesta12mUsd : 0);

    let pontos = sum(sinais.map(x => x.pontos));
    if (participacao >= 0.05) pontos += 1;  // NCM com peso grande na cesta
    if (impacto >= 0.01) pontos += 1;       // aumento equivale a ≥ 1% da cesta
    const nivelSemLimite = nivelPorPontos(pontos);
    const limitado = impacto < c.impactoMinimo && Math.abs(impactoUsd) < c.impactoMinimoUsd && nivelSemLimite !== 'atencao';

    out.push({
      ncm: data.ncms[i].ncm, descricao: data.ncms[i].descricao, categoria: data.ncms[i].categoria,
      entidades: [{ id: data.entidade, rotulo: data.rotulo }],
      sinais, pontos, nivelSemLimite, nivel: limitado ? 'atencao' : nivelSemLimite, limitadoPorMaterialidade: limitado,
      importacao12mUsd: usd12, importacao12mKg: kg12, importacaoAnt12mUsd: usdPrev12, importacaoAnt12mKg: kgPrev12,
      participacaoCesta: participacao, cestaImportacao12mUsd: totalCesta12mUsd, cestaRotulo: data.rotulo,
      impacto, impactoUsd,
      rolling: s.slice(-36).map(p => p.rollingKG ?? 0), periodoRef: `${Y}${String(M).padStart(2, '0')}`,
    });
  }
  return out;
}

/**
 * Peso no mercado brasileiro (NF-e): importações / consumo nacional aparente.
 * Um alerta limitado pela materialidade na cesta volta ao nível original se a NCM tiver
 * participação relevante no consumo (≥ 10%) ou se ela subiu ≥ 2 p.p. no último ano.
 */
export function aplicarMercado(alertas: Alerta[], mercado: Map<string, Mercado>): Alerta[] {
  return alertas.map(a => {
    const m = mercado.get(a.ncm);
    if (!m) return { ...a, mercado: undefined, nivel: a.limitadoPorMaterialidade ? 'atencao' : a.nivelSemLimite };
    const subiu = m.penetracaoAnterior != null ? m.penetracao - m.penetracaoAnterior : 0;
    const relevanteNoMercado = m.penetracao >= 0.10 || subiu >= 0.02;
    return { ...a, mercado: m, nivel: a.limitadoPorMaterialidade && !relevanteNoMercado ? 'atencao' : a.nivelSemLimite };
  });
}

/** Junta alertas de várias cestas (uma NCM pode estar em mais de uma). */
export function juntarAlertas(listas: Alerta[][]): Alerta[] {
  const map = new Map<string, Alerta>();
  for (const a of listas.flat()) {
    const cur = map.get(a.ncm);
    if (!cur) map.set(a.ncm, { ...a, entidades: [...a.entidades] });
    else {
      a.entidades.forEach(e => { if (!cur.entidades.some(x => x.id === e.id)) cur.entidades.push(e); });
      if (a.pontos > cur.pontos) Object.assign(cur, { ...a, entidades: cur.entidades });
    }
  }
  return ordenar([...map.values()]);
}

const ORDEM_NIVEL: Record<Nivel, number> = { alto: 0, medio: 1, atencao: 2 };
export const ordenar = (l: Alerta[], por: 'gravidade' | 'impacto' = 'gravidade') => [...l].sort((a, b) =>
  por === 'impacto'
    ? b.impactoUsd - a.impactoUsd
    : ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || b.pontos - a.pontos || b.impactoUsd - a.impactoUsd);
