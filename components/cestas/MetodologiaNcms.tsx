import React, { useEffect, useMemo, useState } from 'react';
import { CestaData, DicionarioTematico, LinhaNcm, PeriodOption, linhasPorNcm, loadDicionarioTematico } from '../../utils/cestas.ts';
import { formatCompactPtBR, formatDecimalPtBR, formatIntegerPtBR, formatNcmCode } from '../../utils/formatting.ts';
import { Button } from '../ui.tsx';

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const peso = (v: number, total: number) => (total > 0 ? `${formatDecimalPtBR((v / total) * 100)}%` : '–');

interface Props {
  data: CestaData;
  period: PeriodOption;
  onOpenNcm: (ncm: string) => void;
  onClose: () => void;
}

/**
 * Painel "Metodologia e NCMs" da cesta temática: critérios, fontes e, para cada mineral, o que entrou e o que ficou de fora,
 * com todas as NCMs, o valor no período e o peso de cada uma no mineral.
 */
const MetodologiaNcms: React.FC<Props> = ({ data, period, onOpenNcm, onClose }) => {
  const [dic, setDic] = useState<DicionarioTematico['cestas'][number] | null>(null);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    loadDicionarioTematico().then(d => setDic(d.cestas.find(c => c.id === data.entidade) ?? null)).catch(() => setErro(true));
  }, [data.entidade]);

  const linhas = useMemo(() => linhasPorNcm(data, period), [data, period]);
  const porMineral = useMemo(() => {
    const m = new Map<string, LinhaNcm[]>();
    linhas.forEach(l => { const k = `${l.classe}|${l.mineral}`; (m.get(k) ?? m.set(k, []).get(k)!).push(l); });
    return m;
  }, [linhas]);

  const termo = semAcento(busca.trim()), digitos = busca.replace(/\D/g, '');
  const casa = (l: LinhaNcm) => !termo || (digitos.length >= 2 && l.ncm.startsWith(digitos)) || semAcento(`${l.descricao} ${l.mineral} ${l.etapa}`).includes(termo);
  const semComercioTotal = linhas.filter(l => l.imp.fob <= 0 && l.exp.fob <= 0).length;
  const sobre = dic ?? data;
  const classes = data.classes ?? [];

  return (
    <section className="mb-4 rounded-2xl border border-brand-100 bg-white p-5 shadow-sm" aria-label="Metodologia e NCMs da cesta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Metodologia e NCMs</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{sobre.descricao}</p>
        </div>
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
      </div>

      {sobre.metodologia?.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">{sobre.metodologia.map((m, i) => <li key={i}>{m}</li>)}</ul>
      ) : null}
      {sobre.fontes?.length ? (
        <p className="mt-3 text-xs text-slate-500">
          Fontes:{' '}
          {sobre.fontes.map((f, i) => (
            <React.Fragment key={f.url}>{i > 0 && ' · '}<a href={f.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{f.rotulo}</a></React.Fragment>
          ))}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <input value={busca} onChange={e => setBusca(e.target.value)} type="search" placeholder="Buscar NCM, produto ou mineral…" aria-label="Buscar NCM, produto ou mineral"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none" />
        <span className="text-xs text-slate-500">
          {linhas.length} NCMs em {porMineral.size} minerais · valores de {period.label}
          {semComercioTotal ? ` · ${semComercioTotal} sem comércio no período` : ''}
        </span>
      </div>
      {erro && <p className="mt-3 text-sm text-amber-700">Não foi possível carregar os critérios por mineral; a lista de NCMs abaixo continua valendo.</p>}

      <div className="mt-4 space-y-6">
        {classes.map(c => (
          <div key={c.id}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{c.nome}</h3>
            <div className="space-y-2">
              {c.minerais.map(mineral => {
                const todas = porMineral.get(`${c.nome}|${mineral}`) ?? [];
                const visiveis = todas.filter(casa);
                if (termo && !visiveis.length) return null;
                const det = dic?.detalhes?.[mineral];
                const totImp = todas.reduce((s, l) => s + l.imp.fob, 0), totExp = todas.reduce((s, l) => s + l.exp.fob, 0);
                const sem = todas.filter(l => l.imp.fob <= 0 && l.exp.fob <= 0).length;
                // Etapas da cadeia do maior para o menor movimento; dentro de cada uma, as NCMs de maior valor primeiro
                const valorEtapa = new Map<string, number>();
                todas.forEach(l => valorEtapa.set(l.etapa, (valorEtapa.get(l.etapa) ?? 0) + l.imp.fob + l.exp.fob));
                const etapas = [...valorEtapa.keys()].sort((a, b) => valorEtapa.get(b)! - valorEtapa.get(a)! || a.localeCompare(b, 'pt-BR'));
                return (
                  <details key={mineral} open={!!termo} className="rounded-xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                      <span className="font-semibold text-slate-800">{mineral}</span>
                      <span className="text-xs text-slate-500">{todas.length} NCMs</span>
                      <span className="tabular text-xs text-slate-500">importações US$ {formatCompactPtBR(totImp)} · exportações US$ {formatCompactPtBR(totExp)}</span>
                      {sem > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">{sem} sem comércio no período</span>}
                    </summary>
                    <div className="border-t border-slate-100 px-4 py-3">
                      {det?.criterio && <p className="text-sm text-slate-600"><b className="font-medium text-slate-700">O que entra:</b> {det.criterio}</p>}
                      {det?.fora?.length ? (
                        <div className="mt-2 text-sm text-slate-600">
                          <b className="font-medium text-slate-700">Ficou de fora:</b>
                          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-500">{det.fora.map((f, i) => <li key={i}>{f}</li>)}</ul>
                        </div>
                      ) : null}
                      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2 text-left">NCM</th>
                              <th className="px-3 py-2 text-left">Descrição</th>
                              <th className="px-3 py-2 text-right">Importações US$</th>
                              <th className="px-3 py-2 text-right">Peso</th>
                              <th className="px-3 py-2 text-right">Exportações US$</th>
                              <th className="px-3 py-2 text-right">Peso</th>
                            </tr>
                          </thead>
                          <tbody>
                            {etapas.flatMap(etapa => {
                              const doGrupo = visiveis.filter(l => l.etapa === etapa).sort((a, b) => b.imp.fob + b.exp.fob - (a.imp.fob + a.exp.fob) || a.ncm.localeCompare(b.ncm));
                              if (!doGrupo.length) return [];
                              return [
                                <tr key={`h-${etapa}`} className="bg-slate-50/70"><td colSpan={6} className="px-3 py-1.5 text-xs font-semibold text-slate-600">{etapa}</td></tr>,
                                ...doGrupo.map(l => {
                                  const parada = l.imp.fob <= 0 && l.exp.fob <= 0;
                                  return (
                                    <tr key={l.ncm} className={`border-t border-slate-100 hover:bg-brand-50/60 ${parada ? 'text-slate-400' : 'text-slate-700'}`}>
                                      <td className="whitespace-nowrap px-3 py-1.5">
                                        <button onClick={() => onOpenNcm(l.ncm)} className="tabular font-medium text-brand-600 hover:underline" title="Abrir a ficha individual desta NCM">{formatNcmCode(l.ncm)}</button>
                                      </td>
                                      <td className="px-3 py-1.5 text-xs">
                                        {l.descricao}
                                        {parada && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">sem comércio no período</span>}
                                      </td>
                                      <td className="px-3 py-1.5 text-right tabular">{formatIntegerPtBR(l.imp.fob)}</td>
                                      <td className="px-3 py-1.5 text-right tabular text-xs text-slate-500">{peso(l.imp.fob, totImp)}</td>
                                      <td className="px-3 py-1.5 text-right tabular">{formatIntegerPtBR(l.exp.fob)}</td>
                                      <td className="px-3 py-1.5 text-right tabular text-xs text-slate-500">{peso(l.exp.fob, totExp)}</td>
                                    </tr>
                                  );
                                }),
                              ];
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">Peso = participação da NCM no total do mineral (importações ou exportações do período). Fonte: Comex Stat/MDIC.</p>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default MetodologiaNcms;
