import React, { useRef, useState } from 'react';
import {
  ANALISE, CATALOGO, ORDEM_PADRAO, Configuracao, FAMILIAS, Modelo, MODELOS_INSTITUCIONAIS, configDoModelo, exportarJson, importarJson,
} from '../utils/catalogo.ts';

interface Props {
  config: Configuracao;
  onChange: (c: Configuracao) => void;
  modelo: Modelo;
  pessoais: Modelo[];
  onPessoais: (lista: Modelo[], selecionar?: Modelo) => void;
  disponivel: { nfe: boolean; cgim: boolean; radar: boolean | null };
}

const chip = 'rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide';

/** Linha do modelo: escolha do modelo, objetivo e avisos. O painel de análises abre embaixo. */
export const ModeloBar: React.FC<Props & { aberto: boolean; onToggle: () => void }> = ({ config, onChange, modelo, pessoais, aberto, onToggle }) => {
  const escolher = (id: string) => {
    const m = [...MODELOS_INSTITUCIONAIS, ...pessoais].find(x => x.id === id);
    if (m) onChange(configDoModelo(m));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Modelo</span>
        <select value={config.modeloId} onChange={e => escolher(e.target.value)}
          className="max-w-[19rem] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none">
          <optgroup label="Modelos institucionais">
            {MODELOS_INSTITUCIONAIS.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </optgroup>
          {pessoais.length > 0 && (
            <optgroup label="Meus modelos (neste navegador)">
              {pessoais.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      {config.modificada && <span className={`${chip} bg-amber-100 text-amber-800`} title={`Seleção alterada em relação ao modelo “${modelo.nome}”`}>modificado</span>}
      <button onClick={onToggle} aria-expanded={aberto}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition ${aberto ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500'}`}>
        Análises ({config.analises.length})
        <span className={`text-[10px] transition ${aberto ? 'rotate-180' : ''}`}>▾</span>
      </button>
    </div>
  );
};

/** Painel expansível: lista agrupada por família, ordem, título, e gestão de "Meus modelos". */
export const ModeloPainel: React.FC<Props> = ({ config, onChange, modelo, pessoais, onPessoais, disponivel }) => {
  const sel = new Set(config.analises);
  const sugeridas = new Set(modelo.sugeridas ?? []);
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [nome, setNome] = useState(modelo.tipo === 'pessoal' ? modelo.nome : '');
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  React.useEffect(() => { setNome(modelo.tipo === 'pessoal' ? modelo.nome : ''); setMsg(null); }, [modelo.id, modelo.tipo, modelo.nome]);

  const alterar = (analises: string[], extra: Partial<Configuracao> = {}) => {
    const igual = analises.length === modelo.analises.length && analises.every((a, i) => a === modelo.analises[i]);
    const titulo = extra.titulo !== undefined ? extra.titulo : config.titulo;
    onChange({ ...config, ...extra, analises, modificada: !igual || !!titulo });
  };
  const alternar = (id: string) => {
    if (sel.has(id)) alterar(config.analises.filter(a => a !== id));
    else {
      // entra na posição natural do catálogo, respeitando a ordem já escolhida para as demais
      const ordemCat = ORDEM_PADRAO;
      const pos = ordemCat.indexOf(id);
      const lista = [...config.analises];
      const depois = lista.findIndex(a => ordemCat.indexOf(a) > pos);
      lista.splice(depois < 0 ? lista.length : depois, 0, id);
      alterar(lista);
    }
  };
  const mover = (i: number, d: -1 | 1) => {
    const l = [...config.analises];
    const j = i + d;
    if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    alterar(l);
  };

  const requisito = (id: string) => {
    const deps = ANALISE[id].deps;
    if (deps.includes('nfe') && !disponivel.nfe) return 'requer planilha de NF-e';
    if (deps.includes('cgim') && !disponivel.cgim) return 'requer planilha CGIM/DINTE';
    if (deps.includes('radar') && disponivel.radar === false) return 'NCM fora das cestas do radar';
    return null;
  };

  const salvarNovo = () => {
    const n = nome.trim();
    if (!n) { setMsg({ tipo: 'erro', texto: 'Dê um nome ao modelo.' }); return; }
    const m: Modelo = {
      id: `pessoal-${Math.random().toString(36).slice(2, 10)}`, nome: n.slice(0, 80), titulo: (config.titulo || n).slice(0, 160),
      objetivo: `Modelo pessoal, criado a partir de “${modelo.nome}”.`, tipo: 'pessoal', versao: 1, analises: [...config.analises],
    };
    onPessoais([...pessoais, m], m);
    setMsg({ tipo: 'ok', texto: `Modelo “${m.nome}” salvo neste navegador.` });
  };
  const salvarEste = () => {
    if (modelo.tipo !== 'pessoal') return;
    const m: Modelo = { ...modelo, nome: (nome.trim() || modelo.nome).slice(0, 80), titulo: (config.titulo || modelo.titulo).slice(0, 160), analises: [...config.analises], versao: modelo.versao + 1 };
    onPessoais(pessoais.map(p => (p.id === m.id ? m : p)), m);
    setMsg({ tipo: 'ok', texto: 'Alterações salvas.' });
  };
  const excluir = () => {
    if (modelo.tipo !== 'pessoal' || !window.confirm(`Excluir o modelo “${modelo.nome}” deste navegador?`)) return;
    onPessoais(pessoais.filter(p => p.id !== modelo.id), MODELOS_INSTITUCIONAIS[0]);
  };
  const exportar = () => {
    const blob = new Blob([exportarJson(pessoais)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `modelos-comexstat-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importar = async (f: File) => {
    try {
      const { modelos, ignorados, idsDescartados } = importarJson(await f.text());
      if (!modelos.length) throw new Error('Nenhum modelo válido no arquivo.');
      // não sobrescreve: nomes repetidos ganham sufixo
      const nomes = new Set(pessoais.map(p => p.nome));
      const novos = modelos.map(m => { let n = m.nome, i = 2; while (nomes.has(n)) n = `${m.nome} (${i++})`; nomes.add(n); return { ...m, nome: n }; });
      onPessoais([...pessoais, ...novos]);
      setMsg({ tipo: 'ok', texto: `${novos.length} modelo(s) importado(s).${ignorados ? ` ${ignorados} item(ns) inválido(s) ignorado(s).` : ''}${idsDescartados ? ` ${idsDescartados} análise(s) desconhecida(s) descartada(s).` : ''}` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: `Não foi possível importar: ${(e as Error).message} Seus modelos não foram alterados.` });
    }
    if (arquivo.current) arquivo.current.value = '';
  };

  const btn = 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-700 disabled:opacity-40';
  return (
    <div className="mt-4 rounded-2xl border border-brand-500/30 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Análises selecionadas <span className="font-normal text-slate-500">({config.analises.length} de {CATALOGO.length} disponíveis)</span></p>
        <div className="flex flex-wrap gap-1.5">
          <button className={btn} onClick={() => alterar([...ORDEM_PADRAO])}>Selecionar todas</button>
          <button className={btn} onClick={() => alterar([])}>Limpar</button>
          <button className={btn} disabled={!config.modificada} onClick={() => onChange(configDoModelo(modelo))}>Restaurar modelo</button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Catálogo por família */}
        <div className="space-y-2">
          {FAMILIAS.map(f => {
            const itens = CATALOGO.filter(a => a.familia === f.id);
            const n = itens.filter(a => sel.has(a.id)).length;
            const aberta = !fechadas.has(f.id);
            return (
              <div key={f.id} className="rounded-lg border border-slate-200">
                <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-slate-700"
                  onClick={() => setFechadas(s => { const x = new Set(s); if (x.has(f.id)) x.delete(f.id); else x.add(f.id); return x; })}>
                  <span><span className={`mr-1.5 inline-block text-[10px] transition ${aberta ? '' : '-rotate-90'}`}>▾</span>{f.titulo}</span>
                  <span className="text-xs text-slate-500">{n}/{itens.length}</span>
                </button>
                {aberta && (
                  <ul className="border-t border-slate-100 px-3 py-1.5">
                    {itens.map(a => {
                      const req = requisito(a.id);
                      return (
                        <li key={a.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                            <input type="checkbox" className="mt-0.5 accent-brand-600" checked={sel.has(a.id)} onChange={() => alternar(a.id)} />
                            <span className="min-w-0 flex-1">
                              <span className="text-slate-800">{a.titulo}</span>
                              {' '}{a.nova && <span className={`${chip} bg-brand-50 text-brand-700`}>novo</span>}
                              {' '}{sugeridas.has(a.id) && !sel.has(a.id) && <span className={`${chip} bg-slate-100 text-slate-600`} title="Complementar neste modelo">sugerida</span>}
                              {req && <span className="block text-[11px] text-amber-700">{req}</span>}
                              {a.descricao && <span className="block text-[11px] text-slate-500">{a.descricao}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Ordem, título e modelos pessoais */}
        <div className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Ordem na ficha e no Word</p>
            {config.analises.length === 0 ? <p className="text-sm text-slate-500">Nenhuma análise selecionada; a ficha mostra só o cabeçalho.</p> : (
              <ol className="max-h-72 space-y-0.5 overflow-auto rounded-lg border border-slate-200 p-1.5">
                {config.analises.map((id, i) => (
                  <li key={id} className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[13px] hover:bg-slate-50">
                    <span className="w-5 text-right text-[11px] text-slate-400">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700" title={ANALISE[id].titulo}>{ANALISE[id].titulo}</span>
                    <button className="px-1 text-slate-400 hover:text-brand-600 disabled:opacity-20" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">▲</button>
                    <button className="px-1 text-slate-400 hover:text-brand-600 disabled:opacity-20" disabled={i === config.analises.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">▼</button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Título da ficha (opcional)</span>
            <input value={config.titulo ?? ''} onChange={e => alterar(config.analises, { titulo: e.target.value || undefined })} placeholder={modelo.titulo}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none" />
          </label>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Meus modelos</p>
            <div className="flex gap-1.5">
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do modelo"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none" />
              <button className={btn} onClick={salvarNovo}>Salvar como novo</button>
            </div>
            {modelo.tipo === 'pessoal' && (
              <div className="mt-1.5 flex gap-1.5">
                <button className={btn} onClick={salvarEste}>Salvar alterações em “{modelo.nome}”</button>
                <button className={`${btn} hover:!border-red-400 hover:!text-red-600`} onClick={excluir}>Excluir</button>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className={btn} disabled={!pessoais.length} onClick={exportar}>Exportar meus modelos (JSON)</button>
              <button className={btn} onClick={() => arquivo.current?.click()}>Importar modelos…</button>
              <input ref={arquivo} type="file" accept=".json,application/json" className="hidden" onChange={e => e.target.files?.[0] && importar(e.target.files[0])} />
            </div>
            {msg && <p className={`mt-2 text-xs ${msg.tipo === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{msg.texto}</p>}
            <p className="mt-2 text-[11px] leading-snug text-slate-500">Ficam só neste navegador e podem ser perdidos ao limpar os dados de navegação; exporte para guardar ou compartilhar. Os arquivos trazem apenas a configuração, nunca dados de NF-e ou contatos.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
