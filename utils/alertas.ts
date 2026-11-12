/**
 * Radar de alertas das cestas: identifica NCMs com comportamento fora do padrão.
 * Usado pela tela (com critérios ajustáveis) e pela tarefa mensal (resumo por e-mail).
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
  relevanciaParticipacao: number; // participação nas importações da cesta ≥ (0,005 = 0,5%)
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

export interface Alerta {
  ncm: string;
  descricao: string;
  entidades: { id: string; rotulo: string }[];
  categoria: string;
  sinais: Sinal[];
  pontos: number;
  nivel: Nivel;
  importacao12mUsd: number;
  importacao12mKg: number;
  participacaoCesta: number;
  rolling: number[]; // soma móvel 12m (kg), últimos 36 meses, para o minigráfico
  periodoRef: string; // aaaamm do último mês
}

const fmtPct = (x: number) => `${x > 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(x * 100)}%`;
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Calcula os alertas de uma cesta. */
export function alertasDaCesta(data: CestaData, c: Criterios = CRITERIOS_PADRAO): Alerta[] {
  const { ano: Y, mes: M } = data.atualizacao;
  const n = data.ncms.length;

  // Séries mensais de importação por NCM
  const porNcm: { year: number; month: number; metricKG: number; metricFOB: number }[][] = Array.from({ length: n }, () => []);
  for (const [i, ym, fob, kg] of data.mensal.import) porNcm[i].push({ year: Math.floor(ym / 100), month: ym % 100, metricKG: kg, metricFOB: fob });

  const series = porNcm.map(rows => buildMonthlySeries(rows, Y, M));
  const sum = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
  const totalCesta12mUsd = sum(series.map(s => sum(s.slice(-12).map(p => p.metricFOB))));

  // Países (importação): participação por NCM no ano anterior e no ano corrente
  const paisShare = (key: 'anterior' | 'atual') => {
    const m: Map<number, number>[] = Array.from({ length: n }, () => new Map());
    for (const [i, p, fob] of data.paises[key].import) m[i].set(p, (m[i].get(p) || 0) + fob);
    return m;
  };
  const pAnt = paisShare('anterior'), pAtu = paisShare('atual');

  // Exportações: ano corrente até o mês vs mesmo período do ano anterior
  const expAtual = new Map<number, number>(), expAnt = new Map<number, number>();
  for (const [i, y, fob] of data.anual.export) if (y === Y) expAtual.set(i, (expAtual.get(i) || 0) + fob);
  if (data.anoAnteriorAteMes) for (const [i, fob] of data.anoAnteriorAteMes.export) expAnt.set(i, (expAnt.get(i) || 0) + fob);
  else for (const [i, y, fob] of data.anual.export) if (y === Y - 1) expAnt.set(i, (expAnt.get(i) || 0) + fob);

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
        if (v >= c.surto12m) sinais.push({ tipo: 'surto', valor: v, pontos: v >= 2 * c.surto12m ? 4 : 3, texto: `12 meses ${fmtPct(v)} vs média dos 3 períodos anteriores` });
      }
      // 2. Aceleração recente (3 meses vs mesmos 3 meses do ano anterior)
      const k3 = sum(kg.slice(-3)), k3a = sum(kg.slice(-15, -12));
      if (k3a > 0) {
        const v = k3 / k3a - 1;
        if (v >= c.aceleracao3m) sinais.push({ tipo: 'aceleracao', valor: v, pontos: v >= 2 * c.aceleracao3m ? 3 : 2, texto: `Últimos 3 meses ${fmtPct(v)} vs mesmo período do ano anterior` });
      } else if (k3 > 0 && kg12 > 0 && k3 / kg12 > 0.5) {
        sinais.push({ tipo: 'aceleracao', valor: Infinity, pontos: 3, texto: 'Importações surgiram nos últimos 3 meses (sem registro no mesmo período do ano anterior)' });
      }
      // 3. Pico atípico no último mês
      const hist = kg.slice(-25, -1);
      const media = sum(hist) / hist.length;
      const dp = Math.sqrt(sum(hist.map(x => (x - media) ** 2)) / hist.length);
      const ult = kg[kg.length - 1];
      if (dp > 0 && ult > media + c.picoDesvios * dp) {
        const z = (ult - media) / dp;
        sinais.push({ tipo: 'pico', valor: z, pontos: 1, texto: `${MES[M - 1]}/${String(Y).slice(-2)} ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(ult / media)}× a média mensal dos 24 meses anteriores` });
      }
      // 4. Queda de preço com volume subindo
      if (kg12 > 0 && kgPrev12 > 0 && usdPrev12 > 0 && kg12 > kgPrev12) {
        const v = (usd12 / kg12) / (usdPrev12 / kgPrev12) - 1;
        if (v <= -c.quedaPreco) sinais.push({ tipo: 'preco', valor: v, pontos: v <= -2 * c.quedaPreco ? 3 : 2, texto: `Preço US$/kg ${fmtPct(v)} em 12 meses, com volume ${fmtPct(kg12 / kgPrev12 - 1)}` });
      }
      // 5. Mudança de origem
      const tA = sum([...pAnt[i].values()]), tB = sum([...pAtu[i].values()]);
      if (tA > 0 && tB > 0) {
        const top3A = [...pAnt[i].entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]);
        let melhor: { p: number; a: number; b: number; delta: number } | null = null;
        for (const [p, v] of pAtu[i]) {
          const a = ((pAnt[i].get(p) || 0) / tA) * 100, b = (v / tB) * 100;
          const delta = b - a;
          const entrouTop3 = !top3A.includes(p) && b >= 10 && a < 5 && [...pAtu[i].entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).some(e => e[0] === p);
          if ((delta >= c.mudancaOrigemPp || entrouTop3) && (!melhor || delta > melhor.delta)) melhor = { p, a, b, delta };
        }
        if (melhor) {
          const f = (x: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(x);
          sinais.push({ tipo: 'origem', valor: melhor.delta, pontos: 1, texto: `${data.paisNomes[melhor.p]}: ${f(melhor.a)}% → ${f(melhor.b)}% das importações (${Y - 1} → jan–${MES[M - 1]}/${Y})` });
        }
      }
    }
    // 6. Queda de exportações (relevância própria)
    const eA = expAnt.get(i) || 0, eB = expAtual.get(i) || 0;
    if (eA >= c.relevanciaUsd) {
      const v = eB / eA - 1;
      if (v <= -c.quedaExportacao) sinais.push({ tipo: 'exportacao', valor: v, pontos: v <= -2 * c.quedaExportacao ? 3 : 2, texto: `Exportações do ano até ${MES[M - 1]} ${fmtPct(v)} vs mesmo período do ano anterior` });
    }

    if (!sinais.length) continue;
    // Mudança de origem e pico isolado só reforçam: sozinhos não geram alerta
    const principais = sinais.filter(x => x.tipo !== 'origem' && x.tipo !== 'pico');
    if (!principais.length) continue;
    let pontos = sum(sinais.map(x => x.pontos));
    if (participacao >= 0.05) pontos += 1; // NCM com peso grande na cesta
    const nivel: Nivel = pontos >= 8 ? 'alto' : pontos >= 5 ? 'medio' : 'atencao';
    const roll = s.slice(-36).map(p => p.rollingKG ?? 0);
    out.push({
      ncm: data.ncms[i].ncm, descricao: data.ncms[i].descricao, categoria: data.ncms[i].categoria,
      entidades: [{ id: data.entidade, rotulo: data.rotulo }],
      sinais, pontos, nivel, importacao12mUsd: usd12, importacao12mKg: kg12, participacaoCesta: participacao,
      rolling: roll, periodoRef: `${Y}${String(M).padStart(2, '0')}`,
    });
  }
  return out;
}

/** Junta alertas de várias cestas (uma NCM pode estar em mais de uma) e ordena por gravidade. */
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

export const ordenar = (l: Alerta[]) => [...l].sort((a, b) => b.pontos - a.pontos || b.importacao12mUsd - a.importacao12mUsd);
