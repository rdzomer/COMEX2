/**
 * Catálogo de análises da ficha e modelos por tipo de demanda (especificação de 26/11/2026, etapa 1).
 *
 * - Cada análise tem um id estável (string), uma família e os conjuntos de dados de que depende.
 * - Os modelos institucionais seguem a matriz da seção 6 da especificação (P = pré-selecionada,
 *   C = complementar/sugerida), já com as análises novas da etapa 2 que estão implementadas.
 * - Modelos pessoais ficam no navegador (localStorage) e podem ser exportados/importados em JSON.
 *   Nada de dados de NF-e, contatos ou valores entra nos modelos: só a configuração.
 */

export type Dataset = 'annual' | 'monthly' | 'country' | 'uf' | 'radar' | 'nfe' | 'cgim';

export type Familia = 'panorama' | 'tendencias' | 'precos' | 'origens' | 'mercado' | 'contatos';

export const FAMILIAS: { id: Familia; titulo: string }[] = [
  { id: 'panorama', titulo: 'Panorama geral' },
  { id: 'tendencias', titulo: 'Tendências, surtos e sazonalidade' },
  { id: 'precos', titulo: 'Preços e pressão competitiva' },
  { id: 'origens', titulo: 'Origens, destinos e concentração' },
  { id: 'mercado', titulo: 'Mercado interno (NF-e)' },
  { id: 'contatos', titulo: 'Entidades e contatos' },
];

export interface Analise {
  id: string;
  titulo: string;
  familia: Familia;
  /** Referência aos IDs conceituais da especificação (A01, B10…) e ao bloco atual (1–18). */
  ref: string;
  deps: Dataset[];
  nova?: boolean;
  descricao?: string;
}

export const CATALOGO: Analise[] = [
  // Panorama
  { id: 'kpis', titulo: 'Indicadores gerais', familia: 'panorama', ref: 'A01 · bloco 2', deps: ['annual', 'monthly'] },
  { id: 'imp-anual', titulo: 'Evolução anual das importações (t e US$)', familia: 'panorama', ref: 'A02/A03 · bloco 3', deps: ['annual'] },
  { id: 'exp-anual', titulo: 'Evolução anual das exportações (t e US$)', familia: 'panorama', ref: 'A04/A05 · bloco 3', deps: ['annual'] },
  { id: 'balanca', titulo: 'Balança comercial (US$ FOB)', familia: 'panorama', ref: 'A06 · bloco 5', deps: ['annual'] },
  { id: 'tabela-anual', titulo: 'Tabela de dados anuais resumidos', familia: 'panorama', ref: 'A08 · bloco 6', deps: ['annual'] },
  { id: 'quadro-imp', titulo: 'Quadro resumo de variações das importações', familia: 'panorama', ref: 'A09 · bloco 7', deps: ['annual'] },
  { id: 'quadro-exp', titulo: 'Quadro resumo de variações das exportações', familia: 'panorama', ref: 'A10 · bloco 7', deps: ['annual'] },
  { id: 'dados-completos', titulo: 'Dados anuais completos (CIF, frete, seguro…)', familia: 'panorama', ref: 'tabela completa', deps: ['annual'] },
  // Tendências
  { id: 'soma-12m', titulo: 'Importações acumuladas em 12 meses e quadro P1–P5', familia: 'tendencias', ref: 'B01/B03 · bloco 8', deps: ['monthly'] },
  { id: 'janelas', titulo: 'Últimos 3, 6 e 12 meses vs ano anterior', familia: 'tendencias', ref: 'B10', deps: ['monthly'], nova: true,
    descricao: 'O movimento está se intensificando ou perdendo força?' },
  { id: 'mensal-48', titulo: 'Evolução mensal das importações (48 meses)', familia: 'tendencias', ref: 'B05/B07 · bloco 9', deps: ['monthly'] },
  { id: 'calendario', titulo: 'Calendário de calor das importações', familia: 'tendencias', ref: 'B08 · bloco 10', deps: ['monthly'] },
  { id: 'surto', titulo: 'Análise de surto em período personalizado', familia: 'tendencias', ref: 'B09 · bloco 11', deps: ['monthly'] },
  { id: 'base100', titulo: 'Volume e preço em base 100', familia: 'tendencias', ref: 'B12/C11', deps: ['annual'], nova: true,
    descricao: 'As importações crescem enquanto o valor unitário cai?' },
  { id: 'sinais-radar', titulo: 'Sinais do radar para esta NCM', familia: 'tendencias', ref: 'B13/B14/D15', deps: ['radar'], nova: true },
  // Preços
  { id: 'precos', titulo: 'Preços médios anuais (com seleção de país)', familia: 'precos', ref: 'C01–C03/C07 · bloco 4', deps: ['annual', 'country'] },
  { id: 'preco-mensal', titulo: 'Preço médio mensal e móvel (3, 6, 12 meses)', familia: 'precos', ref: 'C04/C06', deps: ['monthly'], nova: true },
  { id: 'variacao-origem', titulo: 'Contribuição dos países para a variação (US$ ou t) e efeito preço × quantidade', familia: 'precos', ref: 'C12/D08/D09 · bloco 13', deps: ['country'] },
  // Origens
  { id: 'paises-graficos', titulo: 'Treemaps de origens e destinos', familia: 'origens', ref: 'D01/D02 · bloco 12', deps: ['country'] },
  { id: 'paises-tabelas', titulo: 'Tabelas de origens e destinos', familia: 'origens', ref: 'D03/D04 · bloco 12', deps: ['country'] },
  { id: 'origens-diagnostico', titulo: 'Diagnóstico integrado por origem (volume, participação e preço)', familia: 'origens', ref: 'C07/D03/D05/D09', deps: ['country'], nova: true },
  { id: 'evolucao-paises', titulo: 'Evolução histórica da participação por país', familia: 'origens', ref: 'D05/D06 · bloco 14', deps: ['country'] },
  { id: 'concentracao', titulo: 'Concentração das importações (Top 1, Top 3 e HHI)', familia: 'origens', ref: 'D10 · bloco 15', deps: ['country'] },
  { id: 'uf', titulo: 'Importações por UF', familia: 'origens', ref: 'D16 · bloco 16', deps: ['uf'] },
  // Mercado interno
  { id: 'nfe-penetracao', titulo: 'Penetração das importações no consumo aparente', familia: 'mercado', ref: 'F02/F03 · bloco 17', deps: ['nfe'] },
  { id: 'nfe-tabelas', titulo: 'Vendas da indústria nacional e consumo aparente (tabelas)', familia: 'mercado', ref: 'F01/F02 · bloco 17', deps: ['nfe'] },
  // Contatos
  { id: 'contatos', titulo: 'Contatos da entidade', familia: 'contatos', ref: 'bloco 18', deps: ['cgim'] },
];

export const ANALISE = Object.fromEntries(CATALOGO.map(a => [a.id, a])) as Record<string, Analise>;
/**
 * Ordem padrão da ficha: a dos blocos atuais (matriz da seção 6), com cada análise nova logo após o bloco afim.
 * O catálogo continua agrupado por família no seletor; esta é a ordem de exibição e do Word.
 */
export const ORDEM_PADRAO = [
  'kpis', 'imp-anual', 'exp-anual', 'precos', 'preco-mensal', 'base100', 'balanca', 'tabela-anual', 'quadro-imp', 'quadro-exp', 'dados-completos',
  'soma-12m', 'janelas', 'mensal-48', 'calendario', 'surto', 'sinais-radar', 'paises-graficos', 'paises-tabelas', 'variacao-origem', 'origens-diagnostico',
  'evolucao-paises', 'concentracao', 'uf', 'nfe-penetracao', 'nfe-tabelas', 'contatos',
];
const ORDEM_CATALOGO = ORDEM_PADRAO;

// ---------------------------------------------------------------------------
// Modelos institucionais
// ---------------------------------------------------------------------------
export interface Modelo {
  id: string;
  nome: string;
  /** Título da ficha em Word. */
  titulo: string;
  objetivo: string;
  tipo: 'institucional' | 'pessoal';
  versao: number;
  /** Análises marcadas, na ordem de exibição. */
  analises: string[];
  /** Análises sugeridas (complementares), disponíveis mas não marcadas. */
  sugeridas?: string[];
  aviso?: string;
}

/** Blocos da matriz (seção 6) → análises do catálogo. */
const BLOCO: Record<number, string[]> = {
  2: ['kpis'], 3: ['imp-anual', 'exp-anual'], 4: ['precos'], 5: ['balanca'], 6: ['tabela-anual'], 7: ['quadro-imp', 'quadro-exp'],
  8: ['soma-12m'], 9: ['mensal-48'], 10: ['calendario'], 11: ['surto'], 12: ['paises-graficos', 'paises-tabelas'],
  13: ['variacao-origem'], 14: ['evolucao-paises'], 15: ['concentracao'], 16: ['uf'], 17: ['nfe-penetracao', 'nfe-tabelas'], 18: ['contatos'],
};

/** Ordena as análises de um modelo: blocos na ordem do catálogo, com as novas logo após o bloco afim. */
const ordenar = (ids: string[]) => {
  const set = new Set(ids);
  return ORDEM_CATALOGO.filter(id => set.has(id));
};
const expandir = (blocos: number[], novas: string[] = []) => ordenar([...blocos.flatMap(b => BLOCO[b]), ...novas]);

// Matriz da seção 6: P e C por modelo (bloco 1, cabeçalho, sempre presente)
const M = (P: number[], C: number[], novasP: string[] = [], novasC: string[] = []) => ({
  analises: expandir(P, novasP),
  sugeridas: expandir(C, novasC).filter(id => !expandir(P, novasP).includes(id)),
});

/**
 * Poucos modelos, para não virar mais uma tela de configuração: a ficha completa é o padrão e os demais
 * juntam demandas parecidas da matriz da seção 6 (DCC+LETEC, desabastecimento+competitividade, defesa+renovação).
 * Necessidades específicas ficam em "Meus modelos".
 */
const uniao = (...ms: ReturnType<typeof M>[]) => {
  const analises = ordenar(ms.flatMap(m => m.analises));
  return { analises, sugeridas: ordenar(ms.flatMap(m => m.sugeridas)).filter(id => !analises.includes(id)) };
};

export const MODELOS_INSTITUCIONAIS: Modelo[] = [
  { id: 'completa', nome: 'Ficha completa', titulo: 'Ficha individual da NCM', tipo: 'institucional', versao: 2,
    objetivo: 'Todas as análises disponíveis. Use “Análises” para esconder o que não interessa.',
    analises: [...ORDEM_CATALOGO] },
  { id: 'rapida', nome: 'Visão rápida', titulo: 'Visão rápida de comércio exterior', tipo: 'institucional', versao: 2,
    objetivo: 'Situação comercial do produto em poucos minutos.',
    ...M([2, 3, 4, 5, 7, 8, 12], [6, 9, 11, 13, 14, 15, 17], ['janelas', 'sinais-radar']) },
  { id: 'elevacao', nome: 'Pleito de elevação tarifária (DCC/LETEC)', titulo: 'Análise de pleito de elevação tarifária', tipo: 'institucional', versao: 1,
    objetivo: 'Pressão importadora recente e evolução estrutural da competitividade e da indústria nacional.',
    ...uniao(
      M([2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 14, 17], [5, 6, 15, 18], ['janelas', 'preco-mensal', 'base100'], ['sinais-radar', 'origens-diagnostico']),
      M([2, 3, 4, 5, 7, 8, 11, 12, 13, 14, 15, 17], [6, 9, 10, 18], ['base100'], ['janelas', 'preco-mensal']),
    ),
    aviso: 'Os sinais estatísticos (radar, surtos, janelas) não caracterizam, por si, desequilíbrio comercial conjuntural.' },
  { id: 'reducao', nome: 'Pleito de redução tarifária (desabastecimento/competitividade)', titulo: 'Análise de pleito de redução tarifária', tipo: 'institucional', versao: 1,
    objetivo: 'Dependência das importações, origens e oferta nacional.',
    ...uniao(
      M([2, 3, 4, 6, 7, 8, 9, 12, 14, 15, 17], [5, 10, 11, 13, 16, 18], ['janelas', 'origens-diagnostico']),
      M([2, 3, 4, 7, 8, 12, 14, 15, 17], [5, 6, 9, 13, 16, 18], ['preco-mensal', 'origens-diagnostico']),
    ),
    aviso: 'Importações observadas não equivalem a necessidade não atendida, e as bases não comprovam desabastecimento, capacidade ou estoques. Sem estrutura de custos, não se estima o impacto da tarifa sobre o produto final.' },
  { id: 'defesa', nome: 'Defesa comercial, surtos e medidas vigentes', titulo: 'Evidências estatísticas preliminares — defesa comercial', tipo: 'institucional', versao: 1,
    objetivo: 'Evidências estatísticas preliminares para investigações e para avaliar se as condições que motivaram uma medida persistem.',
    ...uniao(
      M([2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17], [6, 16, 18], ['janelas', 'origens-diagnostico', 'sinais-radar'], ['preco-mensal', 'base100']),
      M([2, 3, 4, 7, 8, 9, 11, 12, 13, 14, 17], [5, 6, 10, 15, 18], ['sinais-radar'], ['janelas', 'preco-mensal']),
    ),
    aviso: 'Não substitui investigação formal nem comprova dumping, dano ou nexo causal. Associação temporal não indica eficácia de medida.' },
];

/** Modelos da primeira versão (links antigos) → modelo atual. */
export const MODELO_ANTIGO: Record<string, string> = {
  dcc: 'elevacao', letec: 'elevacao', desabastecimento: 'reducao', competitividade: 'reducao', renovacao: 'defesa',
  ex: 'completa', origens: 'completa', exterior: 'completa', setor: 'completa',
};

export const MODELO_PADRAO = 'completa';

// ---------------------------------------------------------------------------
// Configuração em uso (modelo + ajustes temporários)
// ---------------------------------------------------------------------------
export interface Configuracao {
  modeloId: string;
  analises: string[]; // ordem de exibição
  titulo?: string;
  modificada: boolean;
}

export function configDoModelo(m: Modelo): Configuracao {
  return { modeloId: m.id, analises: [...m.analises], titulo: undefined, modificada: false };
}

/** Datasets necessários para uma seleção (annual sempre, por causa do cabeçalho e dos indicadores). */
export function datasetsNecessarios(analises: string[]): Set<Dataset> {
  const s = new Set<Dataset>(['annual']);
  analises.forEach(id => ANALISE[id]?.deps.forEach(d => s.add(d)));
  return s;
}

// ---------------------------------------------------------------------------
// Modelos pessoais (navegador) e JSON
// ---------------------------------------------------------------------------
const CHAVE_PESSOAIS = 'comexstat.modelos.v1';
const CHAVE_ULTIMO = 'comexstat.modeloAtual.v1';
export const SCHEMA = 1;

export function lerPessoais(): Modelo[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAVE_PESSOAIS) || '[]');
    return Array.isArray(raw) ? raw.map(validarModelo).filter((m): m is Modelo => !!m) : [];
  } catch { return []; }
}
export function gravarPessoais(lista: Modelo[]) {
  try { localStorage.setItem(CHAVE_PESSOAIS, JSON.stringify(lista)); } catch { /* cota cheia ou bloqueado */ }
}
export function lerUltimoModelo(): string {
  try { return localStorage.getItem(CHAVE_ULTIMO) || MODELO_PADRAO; } catch { return MODELO_PADRAO; }
}
export function gravarUltimoModelo(id: string) {
  try { localStorage.setItem(CHAVE_ULTIMO, id); } catch { /* ignora */ }
}

/** Valida um modelo vindo do navegador ou de arquivo: só campos conhecidos, ids do catálogo, sem código. */
export function validarModelo(x: unknown): Modelo | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.nome !== 'string' || !o.nome.trim() || !Array.isArray(o.analises)) return null;
  const analises = (o.analises as unknown[]).filter((a): a is string => typeof a === 'string' && !!ANALISE[a]);
  const unicos = [...new Set(analises)];
  return {
    id: typeof o.id === 'string' && o.id.startsWith('pessoal-') ? o.id : `pessoal-${Math.random().toString(36).slice(2, 10)}`,
    nome: o.nome.trim().slice(0, 80),
    titulo: typeof o.titulo === 'string' ? o.titulo.slice(0, 160) : o.nome.trim().slice(0, 80),
    objetivo: typeof o.objetivo === 'string' ? o.objetivo.slice(0, 300) : 'Modelo pessoal.',
    tipo: 'pessoal',
    versao: typeof o.versao === 'number' ? o.versao : 1,
    analises: unicos,
  };
}

export function exportarJson(lista: Modelo[]): string {
  return JSON.stringify({ schema: SCHEMA, app: 'comexstat', exportadoEm: new Date().toISOString(),
    modelos: lista.map(({ id, nome, titulo, objetivo, versao, analises }) => ({ id, nome, titulo, objetivo, versao, analises })) }, null, 2);
}

/** Lê um arquivo de modelos. Devolve os modelos válidos e quantos itens foram ignorados; lança erro amigável se o arquivo for inválido. */
export function importarJson(texto: string): { modelos: Modelo[]; ignorados: number; idsDescartados: number } {
  let dados: unknown;
  try { dados = JSON.parse(texto); } catch { throw new Error('O arquivo não é um JSON válido.'); }
  const lista = Array.isArray(dados) ? dados : (dados as { modelos?: unknown })?.modelos;
  if (!Array.isArray(lista)) throw new Error('O arquivo não traz uma lista de modelos do Comex Stat.');
  const schema = (dados as { schema?: unknown })?.schema;
  if (typeof schema === 'number' && schema > SCHEMA) throw new Error('O arquivo foi gerado por uma versão mais nova do app.');
  let ignorados = 0, idsDescartados = 0;
  const modelos: Modelo[] = [];
  for (const item of lista) {
    const m = validarModelo(item);
    if (!m) { ignorados++; continue; }
    const brutos = Array.isArray((item as { analises?: unknown }).analises) ? (item as { analises: unknown[] }).analises.length : 0;
    idsDescartados += Math.max(0, brutos - m.analises.length);
    modelos.push({ ...m, id: `pessoal-${Math.random().toString(36).slice(2, 10)}` });
  }
  return { modelos, ignorados, idsDescartados };
}
