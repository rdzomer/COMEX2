import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CestaData, GrupoBalanco, PeriodOption, balancoPorClasse } from '../../utils/cestas.ts';
import { formatCompactPtBR, formatDecimalPtBR, formatIntegerPtBR } from '../../utils/formatting.ts';
import { KpiCard } from '../ui.tsx';

/**
 * Cores dos minerais nas pizzas: ordem categórica validada (verde-água, violeta, magenta, amarelo, vermelho, verde, azul),
 * sem o laranja, que neste app já significa "importação". Todo o resto vira "Demais" em cinza.
 * Cada mineral mantém a mesma cor nas pizzas de importação e de exportação da sua classe.
 */
const PALETA = ['#1baf7a', '#6250d6', '#e87ba4', '#eda100', '#e34948', '#008300', '#2a78d6'];
const COR_DEMAIS = '#94a3b8';

const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
const usd = (v: number) => `US$ ${formatCompactPtBR(v)}`;

interface Fatia { name: string; value: number; color: string; agrupados?: string[] }

/** Fatias de uma pizza: os minerais com cor própria (se tiveram comércio) e, no fim, "Demais". */
function fatias(classe: GrupoBalanco, flow: 'imp' | 'exp', cores: Map<string, string>): Fatia[] {
  const comCor: Fatia[] = [];
  let demais = 0;
  const nomesDemais: string[] = [];
  for (const m of classe.filhos) {
    const v = m[flow].fob;
    if (v <= 0) continue;
    const cor = cores.get(m.name);
    if (cor) comCor.push({ name: m.name, value: v, color: cor }); else { demais += v; nomesDemais.push(m.name); }
  }
  comCor.sort((a, b) => b.value - a.value);
  if (demais <= 0) return comCor;
  // Se só um mineral ficou sem cor própria, ele aparece pelo nome; senão, entram todos juntos em "Demais"
  return [...comCor, nomesDemais.length === 1
    ? { name: nomesDemais[0], value: demais, color: COR_DEMAIS }
    : { name: `Demais minerais (${nomesDemais.length})`, value: demais, color: COR_DEMAIS, agrupados: nomesDemais }];
}

function PizzaComLegenda({ titulo, fatiasPizza, onPick }: { titulo: string; fatiasPizza: Fatia[]; onPick: (mineral: string) => void }) {
  const total = fatiasPizza.reduce((s, f) => s + f.value, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-800">{titulo}</h4>
      <p className="text-xs text-slate-500">{usd(total)} no período · por mineral</p>
      {total <= 0 ? (
        <p className="py-14 text-center text-sm text-slate-500">Sem comércio no período.</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-4 sm:flex-nowrap">
          <div className="h-[170px] w-[170px] flex-none" role="img" aria-label={`${titulo}: ${fatiasPizza.map(f => `${f.name} ${formatDecimalPtBR((f.value / total) * 100)}%`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={fatiasPizza} dataKey="value" nameKey="name" outerRadius="100%" innerRadius={0} startAngle={90} endAngle={-270}
                  stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>
                  {fatiasPizza.map(f => <Cell key={f.name} fill={f.color} />)}
                </Pie>
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as Fatia;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg">
                      <p className="flex items-center gap-2 font-semibold text-slate-800"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.name}</p>
                      <p className="tabular text-slate-600">US$ {formatIntegerPtBR(p.value)} ({formatDecimalPtBR((p.value / total) * 100)}%)</p>
                    </div>
                  );
                }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-1 text-sm">
            {fatiasPizza.map(f => (
              <li key={f.name} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 flex-none rounded-sm" style={{ background: f.color }} />
                {f.agrupados
                  ? <span className="flex-1 truncate text-slate-600" title={f.agrupados.join(', ')}>{f.name}</span>
                  : <button onClick={() => onPick(f.name)} className="flex-1 truncate text-left text-slate-700 hover:text-brand-600 hover:underline" title="Filtrar a página por este mineral">{f.name}</button>}
                <span className="tabular text-xs text-slate-500">{usd(f.value)}</span>
                <span className="tabular w-12 text-right text-xs font-semibold text-slate-800">{formatDecimalPtBR((f.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const Saldo: React.FC<{ v: number }> = ({ v }) => (
  <span className={`tabular font-medium ${v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : 'text-slate-500'}`}>{v > 0 ? '+' : v < 0 ? '−' : ''}{formatIntegerPtBR(Math.abs(v))}</span>
);

interface Props {
  data: CestaData;
  period: PeriodOption;
  /** Filtra o restante da página: [classe] ou [classe, mineral]. */
  onPick: (caminho: string[]) => void;
}

/** Visão por classe das cestas de minerais: importação e exportação de cada classe (pizzas) e balanço por mineral. */
const MineraisPanorama: React.FC<Props> = ({ data, period, onPick }) => {
  const classes = useMemo(() => balancoPorClasse(data, period), [data, period]);
  const baseLabel = period.kind === 'ytd' ? `${period.year - 1} (mesmo período)` : String(period.year - 1);

  return (
    <div className="space-y-8">
      {classes.map(c => {
        // A mesma cor para o mineral nas duas pizzas: ordem pelo maior fluxo (importação ou exportação)
        const cores = new Map<string, string>();
        c.filhos.filter(m => Math.max(m.imp.fob, m.exp.fob) > 0).slice(0, PALETA.length).forEach((m, i) => cores.set(m.name, PALETA[i]));
        const saldo = c.exp.fob - c.imp.fob, saldoBase = c.exp.baseFob - c.imp.baseFob;
        return (
          <div key={c.name}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{c.name}</h3>
              <button onClick={() => onPick([c.name])} className="text-xs font-medium text-brand-600 hover:underline">Filtrar a página por esta classe</button>
            </div>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard label={`Importações · ${period.label}`} value={formatCompactPtBR(c.imp.fob)} unit="US$ FOB" delta={pct(c.imp.fob, c.imp.baseFob)} deltaLabel={`vs ${baseLabel}`} />
              <KpiCard label={`Exportações · ${period.label}`} value={formatCompactPtBR(c.exp.fob)} unit="US$ FOB" delta={pct(c.exp.fob, c.exp.baseFob)} deltaLabel={`vs ${baseLabel}`} />
              <KpiCard label="Saldo (exportações − importações)" value={`${saldo < 0 ? '−' : ''}${formatCompactPtBR(Math.abs(saldo))}`} unit="US$ FOB" hint={`${baseLabel}: ${saldoBase < 0 ? '−' : ''}${formatCompactPtBR(Math.abs(saldoBase))}`} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <PizzaComLegenda titulo="Importações" fatiasPizza={fatias(c, 'imp', cores)} onPick={m => onPick([c.name, m])} />
              <PizzaComLegenda titulo="Exportações" fatiasPizza={fatias(c, 'exp', cores)} onPick={m => onPick([c.name, m])} />
            </div>
          </div>
        );
      })}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="max-h-[640px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Classe / mineral</th>
                <th className="px-3 py-2 text-right">NCMs</th>
                <th className="px-3 py-2 text-right">Importações US$ FOB</th>
                <th className="px-3 py-2 text-right">Var. %</th>
                <th className="px-3 py-2 text-right">Exportações US$ FOB</th>
                <th className="px-3 py-2 text-right">Var. %</th>
                <th className="px-3 py-2 text-right">Saldo US$ FOB</th>
              </tr>
            </thead>
            <tbody>
              {classes.flatMap(c => [c, ...c.filhos].map((g, i) => {
                const classe = i === 0;
                return (
                  <tr key={`${c.name}|${g.name}`} className={`border-b border-slate-100 hover:bg-brand-50/60 ${classe ? 'bg-slate-50/70 font-semibold' : 'bg-white'}`}>
                    <td className="px-3 py-2" style={{ paddingLeft: classe ? 12 : 30 }}>
                      <button onClick={() => onPick(classe ? [c.name] : [c.name, g.name])} className="text-left text-slate-800 hover:text-brand-600 hover:underline" title="Filtrar a página">{g.name}</button>
                    </td>
                    <td className="px-3 py-2 text-right tabular text-slate-500">{g.ncms}</td>
                    <td className="px-3 py-2 text-right tabular text-slate-700">{formatIntegerPtBR(g.imp.fob)}</td>
                    <td className="px-3 py-2 text-right tabular text-xs text-slate-500">{fmtVar(pct(g.imp.fob, g.imp.baseFob))}</td>
                    <td className="px-3 py-2 text-right tabular text-slate-700">{formatIntegerPtBR(g.exp.fob)}</td>
                    <td className="px-3 py-2 text-right tabular text-xs text-slate-500">{fmtVar(pct(g.exp.fob, g.exp.baseFob))}</td>
                    <td className="px-3 py-2 text-right"><Saldo v={g.exp.fob - g.imp.fob} /></td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
          Fonte: Comex Stat/MDIC. Classes: CIMCE. Saldo = exportações − importações das NCMs da cesta; outros levantamentos que usem outra lista de NCMs podem chegar a valores diferentes.
        </p>
      </div>
    </div>
  );
};

function fmtVar(v: number | null) {
  if (v === null || !isFinite(v)) return '–';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatDecimalPtBR(Math.abs(v))}%`;
}

export default MineraisPanorama;
