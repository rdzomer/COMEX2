import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CestaData, LinhaNcm, PeriodOption, linhasPorNcm } from '../../utils/cestas.ts';
import { formatDecimalPtBR, formatIntegerPtBR, formatNcmCode } from '../../utils/formatting.ts';
import { COLORS } from '../charts/ChartKit.tsx';

const TOP = 8;
const truncar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

interface Barra { name: string; ncm?: string; descricao?: string; fob: number; share: number; demais?: boolean }

/** Barras ordenadas com o peso de cada NCM no total do mineral (as menores entram em "Demais NCMs"). */
function barrasDoFluxo(linhas: LinhaNcm[], flow: 'imp' | 'exp'): { barras: Barra[]; total: number } {
  const ordenadas = linhas.filter(l => l[flow].fob > 0).sort((a, b) => b[flow].fob - a[flow].fob);
  const total = ordenadas.reduce((s, l) => s + l[flow].fob, 0);
  const topo: Barra[] = ordenadas.slice(0, TOP).map(l => ({
    name: `${formatNcmCode(l.ncm)} · ${truncar(l.descricao, 34)}`, ncm: l.ncm, descricao: l.descricao,
    fob: l[flow].fob, share: total ? (l[flow].fob / total) * 100 : 0,
  }));
  const resto = ordenadas.slice(TOP);
  const fobResto = resto.reduce((s, l) => s + l[flow].fob, 0);
  if (fobResto > 0) topo.push({ name: `Demais NCMs (${resto.length})`, fob: fobResto, share: total ? (fobResto / total) * 100 : 0, demais: true });
  return { barras: topo, total };
}

function GraficoBarras({ titulo, flow, barras, total, onOpenNcm }: {
  titulo: string; flow: 'imp' | 'exp'; barras: Barra[]; total: number; onOpenNcm: (ncm: string) => void;
}) {
  const cor = flow === 'imp' ? COLORS.imp : COLORS.exp;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-sm font-semibold text-slate-800">{titulo}</h4>
      <p className="text-xs text-slate-500">US$ {formatIntegerPtBR(total)} no período · clique numa barra para abrir a ficha da NCM</p>
      {barras.length === 0 ? (
        <p className="py-14 text-center text-sm text-slate-500">Sem comércio deste mineral no período.</p>
      ) : (
        <div style={{ width: '100%', height: barras.length * 30 + 16 }} className="mt-2">
          <ResponsiveContainer>
            <BarChart data={barras} layout="vertical" margin={{ top: 4, right: 52, left: 4, bottom: 4 }} barCategoryGap={6}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={250} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const b = payload[0].payload as Barra;
                return (
                  <div className="max-w-xs rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg">
                    <p className="font-semibold text-slate-800">{b.ncm ? formatNcmCode(b.ncm) : b.name}</p>
                    {b.descricao && <p className="text-slate-500">{b.descricao}</p>}
                    <p className="tabular mt-1 text-slate-700">US$ {formatIntegerPtBR(b.fob)} ({formatDecimalPtBR(b.share)}%)</p>
                  </div>
                );
              }} />
              <Bar dataKey="fob" radius={[0, 4, 4, 0]} barSize={18}
                label={{ position: 'right', fontSize: 11, fill: '#475569', formatter: (v: number) => (total ? `${formatDecimalPtBR((v / total) * 100)}%` : '') }}
                onClick={(d: any) => d?.ncm && onOpenNcm(d.ncm)} style={{ cursor: 'pointer' }}>
                {barras.map(b => <Cell key={b.name} fill={b.demais ? '#94a3b8' : cor} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

interface Props { data: CestaData; period: PeriodOption; onOpenNcm: (ncm: string) => void }

/** Peso de cada NCM dentro de um mineral, nas importações e nas exportações do período. */
const PesoPorNcm: React.FC<Props> = ({ data, period, onOpenNcm }) => {
  const linhas = useMemo(() => linhasPorNcm(data, period), [data, period]);
  const porMineral = useMemo(() => {
    const m = new Map<string, LinhaNcm[]>();
    linhas.forEach(l => { const k = `${l.classe}|${l.mineral}`; (m.get(k) ?? m.set(k, []).get(k)!).push(l); });
    return m;
  }, [linhas]);
  // Mineral que abre selecionado: o de maior movimento no período
  const padrao = useMemo(() => {
    let melhor = '', maior = -1;
    porMineral.forEach((ls, k) => {
      const v = ls.reduce((s, l) => s + l.imp.fob + l.exp.fob, 0);
      if (v > maior) { maior = v; melhor = k; }
    });
    return melhor;
  }, [porMineral]);
  const [escolhido, setEscolhido] = useState('');
  const chave = porMineral.has(escolhido) ? escolhido : padrao;
  const ls = porMineral.get(chave) ?? [];
  const imp = useMemo(() => barrasDoFluxo(ls, 'imp'), [ls]);
  const exp = useMemo(() => barrasDoFluxo(ls, 'exp'), [ls]);
  const semComercio = ls.filter(l => l.imp.fob <= 0 && l.exp.fob <= 0).length;
  const classes = data.classes ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-700" htmlFor="peso-mineral">Mineral</label>
        <select id="peso-mineral" value={chave} onChange={e => setEscolhido(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none">
          {classes.map(c => (
            <optgroup key={c.id} label={c.nome}>
              {c.minerais.map(m => <option key={m} value={`${c.nome}|${m}`}>{m}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          {ls.length} NCMs na cesta{semComercio ? ` · ${semComercio} sem comércio em ${period.label}` : ''}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <GraficoBarras titulo="Importações · peso de cada NCM" flow="imp" barras={imp.barras} total={imp.total} onOpenNcm={onOpenNcm} />
        <GraficoBarras titulo="Exportações · peso de cada NCM" flow="exp" barras={exp.barras} total={exp.total} onOpenNcm={onOpenNcm} />
      </div>
    </div>
  );
};

export default PesoPorNcm;
