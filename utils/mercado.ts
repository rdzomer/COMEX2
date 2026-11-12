/**
 * Peso das importações no mercado brasileiro (consumo nacional aparente), a partir da planilha de NF-e.
 * Os dados ficam SÓ no navegador do usuário (localStorage): nada é enviado ao site.
 */
import type { NfeData } from '../types.ts';
import type { Mercado } from './alertas.ts';

const KEY = 'comexstat.mercadoNfe.v1';
interface Guardado { fonte: string; salvoEm: string; itens: Record<string, [number, number, number | null, number | null]> }

/** Penetração das importações (kg) no consumo aparente: último ano disponível e o anterior. */
export function mercadoDaNfe(rows: NfeData[]): Map<string, Mercado> {
  const porNcm = new Map<string, { ano: number; pen: number }[]>();
  for (const r of rows) {
    if (!r.ncm_8d || !r.ano) continue;
    const cna = r.consumo_nacional_aparente_qtd;
    let pen = r.coeficiente_penetracao_imp_qtd;
    if ((pen === undefined || pen === null || isNaN(pen)) && cna && cna > 0) pen = (r.qtd_tributavel_imp || 0) / cna;
    if (pen === undefined || pen === null || isNaN(pen) || !isFinite(pen)) continue;
    const l = porNcm.get(r.ncm_8d) ?? [];
    l.push({ ano: r.ano, pen });
    porNcm.set(r.ncm_8d, l);
  }
  const out = new Map<string, Mercado>();
  porNcm.forEach((l, ncm) => {
    l.sort((a, b) => b.ano - a.ano);
    out.set(ncm, { ano: l[0].ano, penetracao: l[0].pen, anoAnterior: l[1]?.ano ?? null, penetracaoAnterior: l[1]?.pen ?? null });
  });
  return out;
}

export function salvarMercado(m: Map<string, Mercado>, fonte: string) {
  const itens: Guardado['itens'] = {};
  m.forEach((v, k) => { itens[k] = [v.ano, v.penetracao, v.anoAnterior, v.penetracaoAnterior]; });
  try { localStorage.setItem(KEY, JSON.stringify({ fonte, salvoEm: new Date().toISOString(), itens } satisfies Guardado)); } catch { /* sem espaço */ }
}

export function lerMercado(): { mapa: Map<string, Mercado>; fonte: string; salvoEm: string } | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY) || 'null') as Guardado | null;
    if (!g) return null;
    const mapa = new Map<string, Mercado>();
    Object.entries(g.itens).forEach(([k, [ano, penetracao, anoAnterior, penetracaoAnterior]]) => mapa.set(k, { ano, penetracao, anoAnterior, penetracaoAnterior }));
    return { mapa, fonte: g.fonte, salvoEm: g.salvoEm };
  } catch { return null; }
}

export function apagarMercado() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
