import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CestaManifest, loadAlertas, loadCesta, AlertasArquivo } from '../../utils/cestas.ts';
import { Alerta, Criterios, CRITERIOS_PADRAO, Nivel, ROTULO_SINAL, TipoSinal, alertasDaCesta, juntarAlertas, aplicarMercado, ordenar, fmtUsd, fmtPeso } from '../../utils/alertas.ts';
import { lerMercado, salvarMercado, apagarMercado, mercadoDaNfe } from '../../utils/mercado.ts';
import { parseNfeExcel } from '../../services/excelService.ts';
import { formatCompactPtBR, formatDecimalPtBR, formatNcmCode, getMonthNamePtBR } from '../../utils/formatting.ts';
import { downloadWorkbook } from '../../services/excelService.ts';
import { Button, Icons } from '../ui.tsx';

const NIVEL: Record<Nivel, { rotulo: string; cor: string; fundo: string; borda: string; ponto: string }> = {
  alto: { rotulo: 'Alto', cor: 'text-red-700', fundo: 'bg-red-50', borda: 'border-l-red-500', ponto: 'bg-red-500' },
  medio: { rotulo: 'Médio', cor: 'text-orange-700', fundo: 'bg-orange-50', borda: 'border-l-orange-400', ponto: 'bg-orange-400' },
  atencao: { rotulo: 'Em observação', cor: 'text-amber-700', fundo: 'bg-amber-50', borda: 'border-l-amber-300', ponto: 'bg-amber-300' },
};
const ICONE: Record<TipoSinal, string> = { surto: '📈', aceleracao: '⚡', pico: '📍', preco: '💲', origem: '🌐', exportacao: '📉' };


interface Props {
  manifest: CestaManifest;
  entidadeInicial?: string;
  onOpenNcm: (ncm: string) => void;
}

const AlertasRadar: React.FC<Props> = ({ manifest, entidadeInicial, onOpenNcm }) => {
  const [arquivo, setArquivo] = useState<AlertasArquivo | null>(null);
  const [erro, setErro] = useState(false);
  const [criterios, setCriterios] = useState<Criterios>(CRITERIOS_PADRAO);
  const [recalculados, setRecalculados] = useState<Alerta[] | null>(null);
  const [recalculando, setRecalculando] = useState(false);
  const [entidade, setEntidade] = useState<string>(entidadeInicial || '');
  const [niveis, setNiveis] = useState<Set<Nivel>>(new Set(['alto', 'medio']));
  const [tipos, setTipos] = useState<Set<TipoSinal>>(new Set());
  const [limite, setLimite] = useState(12);
  const [abrirCriterios, setAbrirCriterios] = useState(false);
  const [ordem, setOrdem] = useState<'gravidade' | 'impacto'>('gravidade');
  const [mercado, setMercado] = useState(lerMercado);
  const [lendoNfe, setLendoNfe] = useState(false);
  const nfeInput = useRef<HTMLInputElement>(null);
  const carregarNfe = async (f: File) => {
    setLendoNfe(true);
    try {
      const mapa = mercadoDaNfe(await parseNfeExcel(f));
      salvarMercado(mapa, f.name);
      setMercado({ mapa, fonte: f.name, salvoEm: new Date().toISOString() });
    } catch (e) { alert(`Não foi possível ler a planilha de NF-e: ${(e as Error).message}`); }
    setLendoNfe(false);
  };

  useEffect(() => { loadAlertas().then(setArquivo).catch(() => setErro(true)); }, []);

  const padrao = JSON.stringify(criterios) === JSON.stringify(CRITERIOS_PADRAO);
  // Critérios alterados: recalcula a partir dos dados de todas as cestas (carregados uma vez)
  useEffect(() => {
    if (padrao) { setRecalculados(null); return; }
    let cancel = false;
    setRecalculando(true);
    const t = setTimeout(async () => {
      const arquivos = manifest.entidades.filter(e => e.arquivo);
      const dados = await Promise.all(arquivos.map(e => loadCesta(e.arquivo!)));
      if (!cancel) { setRecalculados(juntarAlertas(dados.map(d => alertasDaCesta(d, criterios)))); setRecalculando(false); }
    }, 400);
    return () => { cancel = true; clearTimeout(t); };
  }, [criterios, padrao, manifest]);

  const base = useMemo(() => {
    const l = recalculados ?? arquivo?.alertas ?? [];
    return ordenar(mercado ? aplicarMercado(l, mercado.mapa) : l, ordem);
  }, [recalculados, arquivo, mercado, ordem]);
  const periodo = arquivo ? `${arquivo.atualizacao.ano}${String(arquivo.atualizacao.mes).padStart(2, '0')}` : '';
  const noEscopo = useMemo(() => base.filter(a => !entidade || a.entidades.some(e => e.id === entidade)), [base, entidade]);
  const contagem = (lv: Nivel) => noEscopo.filter(a => a.nivel === lv).length;
  const lista = noEscopo.filter(a =>
    niveis.has(a.nivel) &&
    (!tipos.size || a.sinais.some(s => tipos.has(s.tipo))));

  const alternar = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); fn(n); };

  const exportar = () => downloadWorkbook(`Radar_alertas_${periodo}.xlsx`, [{
    name: 'Alertas',
    rows: lista.map(a => ({
      'Nível': NIVEL[a.nivel].rotulo, 'Pontos': a.pontos, 'NCM': a.ncm, 'Descrição': a.descricao,
      'Cestas': a.entidades.map(e => e.rotulo).join(', '), 'Importações 12 meses (US$)': a.importacao12mUsd,
      'Importações 12 meses (kg)': a.importacao12mKg, 'Importações 12 meses anteriores (US$)': a.importacaoAnt12mUsd,
      'Peso na cesta (%)': a.participacaoCesta * 100, 'Aumento 12 meses (US$)': a.impactoUsd, 'Aumento / importações da cesta (%)': a.impacto * 100,
      'Importações / consumo aparente (%) (NF-e)': a.mercado ? a.mercado.penetracao * 100 : null, 'Ano NF-e': a.mercado?.ano ?? null,
      'Limitado por materialidade': a.limitadoPorMaterialidade && a.nivel === 'atencao' ? 'sim' : '',
      'Sinais': a.sinais.map(s => `${ROTULO_SINAL[s.tipo]}: ${s.texto}`).join(' | '),
    })),
  }]);

  if (erro) return null;
  if (!arquivo) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
      {/* Cabeçalho chamativo */}
      <div className="flex flex-wrap items-center gap-4 bg-gradient-to-r from-red-600 to-orange-500 px-5 py-4 text-white">
        <div className="flex items-center gap-3 text-left">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-xl">🚨</span>
          <span>
            <span className="block text-lg font-bold leading-tight">Radar de alertas</span>
            <span className="block text-xs text-white/80">NCMs com comportamento fora do padrão · dados até {getMonthNamePtBR(arquivo.atualizacao.mes)}/{arquivo.atualizacao.ano} · <a href="#/metodologia" className="font-semibold text-white underline underline-offset-2 hover:text-white/90">Metodologia</a></span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['alto', 'medio', 'atencao'] as Nivel[]).map(lv => (
            <button key={lv} onClick={() => alternar(niveis, lv, setNiveis)}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${niveis.has(lv) ? 'bg-white text-slate-900' : 'bg-white/15 text-white/80 hover:bg-white/25'}`}>
              <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${NIVEL[lv].ponto}`} />
              {contagem(lv)} {NIVEL[lv].rotulo.toLowerCase()}{lv !== 'atencao' && contagem(lv) !== 1 ? 's' : ''}
            </button>
          ))}
        </div>
        <select value={entidade} onChange={e => { setEntidade(e.target.value); setLimite(12); }}
          className="ml-auto rounded-lg border-0 bg-white/95 px-3 py-1.5 text-sm font-semibold text-red-700 focus:outline-none focus:ring-2 focus:ring-white">
          <option value="">Todas as cestas</option>
          {manifest.entidades.filter(e => e.arquivo).map(e => <option key={e.id} value={e.id}>{e.rotulo}</option>)}
        </select>
      </div>

      {(
        <div className="p-5">
          {/* Filtros por tipo de sinal */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Sinais:</span>
            {(Object.keys(ROTULO_SINAL) as TipoSinal[]).map(t => (
              <button key={t} onClick={() => alternar(tipos, t, setTipos)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${tipos.has(t) ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'}`}>
                {ICONE[t]} {ROTULO_SINAL[t]}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select value={ordem} onChange={e => setOrdem(e.target.value as 'gravidade' | 'impacto')} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700">
                <option value="gravidade">Ordenar por gravidade</option>
                <option value="impacto">Ordenar por impacto (US$)</option>
              </select>
              <input ref={nfeInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) carregarNfe(f); e.target.value = ''; }} />
              <Button variant="ghost" onClick={() => nfeInput.current?.click()} disabled={lendoNfe}
                title="Planilha de NF-e: mostra quanto as importações representam do consumo nacional aparente. Fica só neste navegador.">
                {lendoNfe ? 'Lendo NF-e…' : mercado ? '📄 NF-e carregada' : '📄 Carregar NF-e'}
              </Button>
              <Button variant="ghost" onClick={() => setAbrirCriterios(!abrirCriterios)}>⚙ Critérios{!padrao && ' (alterados)'}</Button>
              <Button variant="ghost" onClick={exportar} icon={Icons.excel}>Excel</Button>
            </div>
          </div>

          {mercado ? (
            <p className="mt-3 text-xs text-slate-500">
              Peso no mercado brasileiro calculado com <b>{mercado.fonte}</b> (guardado só neste navegador).{' '}
              <button className="text-brand-600 hover:underline" onClick={() => { apagarMercado(); setMercado(null); }}>Remover</button>
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Para ver quanto as importações representam do <b>consumo nacional aparente</b>, carregue a planilha de NF-e (botão “Carregar NF-e”). Ela é lida só no seu navegador.
            </p>
          )}
          {abrirCriterios && <PainelCriterios criterios={criterios} onChange={setCriterios} />}
          {recalculando && <p className="mt-3 text-sm text-slate-500">Recalculando com os novos critérios…</p>}

          {/* Cartões */}
          {lista.length === 0 ? (
            <p className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">✓ Nenhum alerta com os filtros escolhidos.</p>
          ) : (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {lista.slice(0, limite).map(a => (
                <CartaoAlerta key={a.ncm} a={a} onOpenNcm={onOpenNcm} />
              ))}
            </div>
          )}
          {lista.length > limite && (
            <div className="mt-4 text-center">
              <Button onClick={() => setLimite(limite + 24)}>Mostrar mais ({lista.length - limite} restantes)</Button>
            </div>
          )}
          <p className="mt-4 text-[11px] text-slate-400">
            Triagem automática para orientar a análise: confirme na ficha individual e na análise de surto da NCM.
            Só entram NCMs relevantes (importações de 12 meses ≥ US$ {formatCompactPtBR(criterios.relevanciaUsd)} ou ≥ {formatDecimalPtBR(criterios.relevanciaParticipacao * 100)}% da cesta).
            {' '}<a href="#/metodologia" className="text-brand-600 hover:underline">Ver metodologia completa</a>.
          </p>
        </div>
      )}
    </section>
  );
};

function CartaoAlerta({ a, onOpenNcm }: { a: Alerta; onOpenNcm: (n: string) => void }) {
  const nv = NIVEL[a.nivel];
  return (
    <article className={`rounded-xl border border-l-4 border-slate-200 ${nv.borda} bg-white p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${nv.fundo} ${nv.cor}`}>{nv.rotulo}</span>
            <button onClick={() => onOpenNcm(a.ncm)} className="tabular text-base font-semibold text-brand-600 hover:underline" title="Abrir a ficha individual">{formatNcmCode(a.ncm)}</button>
            {a.entidades.map(e => <span key={e.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{e.rotulo}</span>)}
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-slate-500" title={a.descricao}>{a.descricao}</p>
        </div>
        <Sparkline values={a.rolling} cor={a.nivel === 'alto' ? '#dc2626' : a.nivel === 'medio' ? '#ea580c' : '#d97706'} />
      </div>
      <ul className="mt-3 space-y-1.5">
        {a.sinais.map(s => (
          <li key={s.tipo} className="flex gap-2 text-sm">
            <span aria-hidden>{ICONE[s.tipo]}</span>
            <span className="text-slate-700"><b className="font-semibold text-slate-900">{ROTULO_SINAL[s.tipo]}:</b> {s.texto}</span>
          </li>
        ))}
      </ul>
      <Materialidade a={a} />
      <div className="mt-3 flex justify-end">
        <button onClick={() => onOpenNcm(a.ncm)} className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600">Abrir ficha</button>
      </div>
    </article>
  );
}

/** Tamanho do movimento: peso na cesta, aumento absoluto e peso no mercado brasileiro. */
function Materialidade({ a }: { a: Alerta }) {
  const pct = (x: number, d = 2) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(x * 100)}%`;
  const subiu = a.impactoUsd >= 0;
  const so = a.sinais.every(s => s.tipo === 'exportacao' || s.tipo === 'origem' || s.tipo === 'pico');
  const m = a.mercado;
  const pp = m && m.penetracaoAnterior != null ? (m.penetracao - m.penetracaoAnterior) * 100 : null;
  return (
    <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
      <div>
        <p className="font-medium text-slate-500">Peso na cesta {a.cestaRotulo}</p>
        <p className="mt-0.5 text-base font-semibold tabular text-slate-900">{pct(a.participacaoCesta)}</p>
        <p className="text-slate-500">{fmtUsd(a.importacao12mUsd)} de {fmtUsd(a.cestaImportacao12mUsd)} importados em 12 meses</p>
      </div>
      <div>
        <p className="font-medium text-slate-500">{so ? 'Tamanho da queda das exportações' : 'Tamanho do aumento (12 meses)'}</p>
        <p className="mt-0.5 text-base font-semibold tabular text-slate-900">{so ? '−' : subiu ? '+' : '−'}{fmtUsd(Math.abs(a.impactoUsd))}</p>
        <p className="text-slate-500">
          {so ? `${pct(Math.abs(a.impacto))} das exportações da cesta` : <>= {pct(Math.abs(a.impacto))} das importações da cesta · {fmtPeso(a.importacaoAnt12mKg)} → {fmtPeso(a.importacao12mKg)}</>}
        </p>
      </div>
      <div>
        <p className="font-medium text-slate-500">Peso no consumo aparente {m ? `(NF-e ${m.ano})` : ''}</p>
        {m ? (
          <>
            <p className="mt-0.5 text-base font-semibold tabular text-slate-900">{pct(m.penetracao, 1)}</p>
            <p className="text-slate-500">das vendas no mercado brasileiro vêm de importação{pp != null && m.anoAnterior ? ` (${m.anoAnterior}: ${pct(m.penetracaoAnterior!, 1)}, ${pp >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(pp)} p.p.)` : ''}</p>
          </>
        ) : <p className="mt-0.5 text-slate-400">carregue a NF-e para ver</p>}
      </div>
      {a.limitadoPorMaterialidade && a.nivel === 'atencao' && (
        <p className="rounded-md bg-amber-100 px-2 py-1 text-amber-800 sm:col-span-3">
          ⚖ Variação grande, mas pequena em valor: o aumento equivale a menos de {pct(CRITERIOS_PADRAO.impactoMinimo)} da cesta e a menos de {fmtUsd(CRITERIOS_PADRAO.impactoMinimoUsd)}{m ? ' e o peso no consumo aparente é baixo' : ''}. Por isso o alerta fica em observação.
        </p>
      )}
    </div>
  );
}

/** Minigráfico da soma móvel de 12 meses (últimos 36 meses). */
function Sparkline({ values, cor }: { values: number[]; cor: string }) {
  const w = 120, h = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <div className="flex-none text-right" title="Importações acumuladas em 12 meses (kg), últimos 36 meses">
      <svg width={w} height={h} className="overflow-visible">
        <polyline points={`0,${h} ${pts} ${w},${h}`} fill={cor} opacity={0.12} />
        <polyline points={pts} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <p className="text-[10px] text-slate-400">12 meses acumulados</p>
    </div>
  );
}

function PainelCriterios({ criterios, onChange }: { criterios: Criterios; onChange: (c: Criterios) => void }) {
  const campos: { k: keyof Criterios; rotulo: string; un: string; mult: number }[] = [
    { k: 'surto12m', rotulo: 'Surto 12 meses: acima da média dos 3 períodos anteriores em', un: '%', mult: 100 },
    { k: 'aceleracao3m', rotulo: 'Aceleração: últimos 3 meses acima do mesmo período do ano anterior em', un: '%', mult: 100 },
    { k: 'picoDesvios', rotulo: 'Pico no mês: acima da média + N desvios-padrão (24 meses)', un: 'desvios', mult: 1 },
    { k: 'quedaPreco', rotulo: 'Queda de preço US$/kg em 12 meses de pelo menos', un: '%', mult: 100 },
    { k: 'mudancaOrigemPp', rotulo: 'Mudança de origem: país ganha pelo menos', un: 'p.p.', mult: 1 },
    { k: 'quedaExportacao', rotulo: 'Queda de exportações no ano de pelo menos', un: '%', mult: 100 },
    { k: 'relevanciaUsd', rotulo: 'Relevância: importações de 12 meses de pelo menos', un: 'US$ mi', mult: 1e-6 },
    { k: 'relevanciaParticipacao', rotulo: '… ou participação na cesta de pelo menos', un: '%', mult: 100 },
    { k: 'impactoMinimo', rotulo: 'Materialidade: aumento de pelo menos … das importações da cesta', un: '%', mult: 100 },
    { k: 'impactoMinimoUsd', rotulo: '… ou aumento absoluto de pelo menos', un: 'US$ mi', mult: 1e-6 },
  ];
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {campos.map(f => (
          <label key={f.k} className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <span>{f.rotulo}</span>
            <span className="flex flex-none items-center gap-1">
              <input type="number" step="any" min={0}
                value={Number((criterios[f.k] * f.mult).toFixed(3))}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) onChange({ ...criterios, [f.k]: v / f.mult }); }}
                className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm tabular focus:border-brand-500 focus:outline-none" />
              <span className="w-12 text-xs text-slate-400">{f.un}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end"><Button variant="ghost" onClick={() => onChange(CRITERIOS_PADRAO)}>Restaurar padrão</Button></div>
    </div>
  );
}

export default AlertasRadar;

/** Página própria do radar (#/alertas ou #/alertas/ENTIDADE). */
export function AlertasPage({ entidadeInicial, onOpenNcm }: { entidadeInicial?: string; onOpenNcm: (n: string) => void }) {
  const [manifest, setManifest] = useState<CestaManifest | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => { import('../../utils/cestas.ts').then(m => m.loadCestaManifest()).then(setManifest).catch(() => setErro(true)); }, []);
  if (erro) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Os dados das cestas ainda não foram gerados.</p>;
  if (!manifest) return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Carregando radar…</p>;
  return <AlertasRadar key={entidadeInicial || ''} manifest={manifest} entidadeInicial={entidadeInicial} onOpenNcm={onOpenNcm} />;
}

/** Aviso compacto para a página das cestas. */
export function AvisoAlertas({ entidade, rotulo }: { entidade?: string; rotulo?: string }) {
  const [arq, setArq] = useState<AlertasArquivo | null>(null);
  useEffect(() => { loadAlertas().then(setArq).catch(() => {}); }, []);
  if (!arq) return null;
  const relevantes = arq.alertas.filter(a => a.nivel !== 'atencao');
  if (!relevantes.length) return null;
  const altos = relevantes.filter(a => a.nivel === 'alto').length;
  const daCesta = entidade ? relevantes.filter(a => a.entidades.some(e => e.id === entidade)) : [];
  const altosCesta = daCesta.filter(a => a.nivel === 'alto').length;
  return (
    <a href={`#/alertas${entidade && daCesta.length ? `/${entidade}` : ''}`}
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50 px-4 py-2.5 text-sm transition hover:border-red-300 hover:shadow-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span className="font-semibold text-red-700">Radar de alertas:</span>
      <span className="text-slate-700"><b>{altos}</b> alertas altos e <b>{relevantes.length - altos}</b> médios nas cestas</span>
      {rotulo && daCesta.length > 0 && <span className="text-slate-700">· <b>{daCesta.length}</b> em {rotulo}{altosCesta ? ` (${altosCesta} altos)` : ''}</span>}
      <span className="ml-auto font-semibold text-red-700">Ver radar →</span>
    </a>
  );
}
