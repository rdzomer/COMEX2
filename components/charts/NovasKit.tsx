
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, LabelList, LineChart, Line, Legend } from 'recharts';
import { AXIS_TICK, COLORS, Frame, TooltipBox, SizeProps, EmptyChart } from './ChartKit.tsx';
import { formatCompactPtBR, formatIntegerPtBR, formatDecimalPtBR } from '../../utils/formatting.ts';
import { LinhaJanela, PontoPrecoMensal, PontoBase100, LinhaCascataT } from '../../utils/novas.ts';

const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const pct = (v: number | null | undefined) => (v === null || v === undefined || !isFinite(v) ? 'sem base' : `${v > 0 ? '+' : ''}${nf1.format(v)}%`);
const FONT = 'Inter, Arial, sans-serif';

/** Validado (dataviz): volume roxo, valor verde, preço âmbar — distintos com e sem daltonismo. */
export const COR_VOLUME = '#6250d6', COR_VALOR = '#008300', COR_PRECO_N = '#eda100';
const LEGEND = { fontSize: 11.5, paddingTop: 6 };
const legendaTexto = (v: string) => <span style={{ color: '#475569' }}>{v}</span>;

// ---------------------------------------------------------------------------
// B10 — variação por janela (barras agrupadas)
// ---------------------------------------------------------------------------
export function JanelasChart({ linhas, width, height = 320 }: SizeProps & { linhas: LinhaJanela[] }) {
  if (!linhas.some(l => l.kg > 0 || l.kgAnt > 0)) return <EmptyChart width={width} height={height} message="Sem importações nas janelas recentes." />;
  const animate = !width;
  const data = linhas.map(l => ({ name: l.janela.replace('Últimos ', '').replace('Ano corrente', 'Ano'), vol: l.varKg, val: l.varUsd, pre: l.varPreco, l }));
  // valores muito grandes (fluxo quase novo) achatariam as demais barras: corta a escala em ±300% e mostra o valor real no rótulo
  const LIM = 300;
  const clip = (v: number | null) => (v === null ? null : Math.max(-LIM, Math.min(LIM, v)));
  const plot = data.map(d => ({ ...d, volC: clip(d.vol), valC: clip(d.val), preC: clip(d.pre) }));
  const rot = (k: 'vol' | 'val' | 'pre') => (p: any) => {
    const v = plot[p.index]?.[k];
    // rótulo só quando a barra foi cortada pela escala (o valor exato está na tabela e no tooltip)
    if (v === null || v === undefined || Math.abs(v) <= LIM) return null;
    const neg = v < 0;
    const y = neg ? Math.max(p.y, p.y + p.height) + 12 : Math.min(p.y, p.y + p.height) - 4;
    return <text x={p.x + p.width / 2} y={y} textAnchor="middle" fontSize={10} fontWeight={600} fill="#334155" fontFamily={FONT}>{`${v > 0 ? '+' : ''}${nf0.format(v)}%`}</text>;
  };
  return (
    <Frame width={width} height={height}>
      <BarChart data={plot} margin={{ top: 22, right: 12, left: 0, bottom: 4 }} barCategoryGap="22%" barGap={2}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10.5 }} tickLine={false} axisLine={{ stroke: COLORS.grid }} interval={0} />
        <YAxis tickFormatter={v => `${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
        <ReferenceLine y={0} stroke="#94a3b8" />
        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const l = (payload[0].payload as (typeof plot)[number]).l;
          return <TooltipBox label={`${l.janela}: ${l.periodo} vs ${l.periodoAnt}`} items={[
            { name: 'Volume', value: `${formatIntegerPtBR(l.kgAnt / 1000)} t → ${formatIntegerPtBR(l.kg / 1000)} t (${pct(l.varKg)})`, color: COR_VOLUME },
            { name: 'Valor', value: `US$ ${formatCompactPtBR(l.usdAnt)} → US$ ${formatCompactPtBR(l.usd)} (${pct(l.varUsd)})`, color: COR_VALOR },
            { name: 'Preço médio', value: `${l.precoAnt === null ? '–' : formatDecimalPtBR(l.precoAnt)} → ${l.preco === null ? '–' : formatDecimalPtBR(l.preco)} US$/kg (${pct(l.varPreco)})`, color: COR_PRECO_N },
          ]} />;
        }} />
        <Legend wrapperStyle={LEGEND} iconType="square" formatter={legendaTexto} />
        <Bar name="Volume (kg)" dataKey="volC" fill={COR_VOLUME} radius={[3, 3, 0, 0]} isAnimationActive={animate}><LabelList content={rot('vol')} /></Bar>
        <Bar name="Valor (US$ FOB)" dataKey="valC" fill={COR_VALOR} radius={[3, 3, 0, 0]} isAnimationActive={animate}><LabelList content={rot('val')} /></Bar>
        <Bar name="Preço médio (US$/kg)" dataKey="preC" fill={COR_PRECO_N} radius={[3, 3, 0, 0]} isAnimationActive={animate}><LabelList content={rot('pre')} /></Bar>
      </BarChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// B12/C11 — base 100 (uma escala só)
// ---------------------------------------------------------------------------
export function Base100Chart({ pontos, width, height = 320 }: SizeProps & { pontos: PontoBase100[] }) {
  if (pontos.length < 2) return <EmptyChart width={width} height={height} message="Anos insuficientes para o índice." />;
  const animate = !width;
  const ult = pontos[pontos.length - 1];
  const fimLabel = (cor: string, k: 'volume' | 'preco') => (p: any) => {
    if (p.index !== pontos.length - 1 || ult[k] === null) return null;
    return <text x={p.x + 8} y={p.y + 4} fontSize={11} fontWeight={700} fill={cor === COR_PRECO_N ? '#8a5d00' : cor} fontFamily={FONT}>{nf0.format(ult[k]!)}</text>;
  };
  return (
    <Frame width={width} height={height}>
      <LineChart data={pontos} margin={{ top: 14, right: 40, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
        <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="4 3" />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as PontoBase100;
          return <TooltipBox label={label} items={[
            { name: 'Volume (índice)', value: `${p.volume === null ? '–' : nf1.format(p.volume)} · ${formatIntegerPtBR(p.kg / 1000)} t`, color: COR_VOLUME },
            { name: 'Preço médio (índice)', value: `${p.preco === null ? '–' : nf1.format(p.preco)} · ${p.p === null ? '–' : formatDecimalPtBR(p.p)} US$/kg`, color: COR_PRECO_N },
          ]} />;
        }} />
        <Legend wrapperStyle={LEGEND} formatter={legendaTexto} />
        <Line name="Volume importado (kg)" dataKey="volume" stroke={COR_VOLUME} strokeWidth={2.5} dot={{ r: 3.5 }} isAnimationActive={animate} connectNulls={false}><LabelList content={fimLabel(COR_VOLUME, 'volume')} /></Line>
        <Line name="Preço médio de importação (US$/kg)" dataKey="preco" stroke={COR_PRECO_N} strokeWidth={2.5} dot={{ r: 3.5 }} isAnimationActive={animate} connectNulls={false}><LabelList content={fimLabel(COR_PRECO_N, 'preco')} /></Line>
      </LineChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// C04–C06 — preço mensal e móvel
// ---------------------------------------------------------------------------
export function PrecoMensalChart({ pontos, janela, width, height = 320 }: SizeProps & { pontos: PontoPrecoMensal[]; janela: number }) {
  if (!pontos.some(p => p.mensal !== null)) return <EmptyChart width={width} height={height} message="Sem importações no período." />;
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <LineChart data={pontos} margin={{ top: 14, right: 16, left: 0, bottom: 34 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-45} textAnchor="end" interval={width ? 1 : 'preserveStartEnd'} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={v => formatDecimalPtBR(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as PontoPrecoMensal;
          return <TooltipBox label={label} items={[
            { name: 'Preço no mês', value: p.mensal === null ? 'sem importação' : `${formatDecimalPtBR(p.mensal)} US$/kg`, color: '#f7b092' },
            { name: `Preço móvel ${janela} meses`, value: p.movel === null ? 'janela incompleta' : `${formatDecimalPtBR(p.movel)} US$/kg`, color: COLORS.imp },
            { name: 'Volume no mês', value: `${formatIntegerPtBR(p.kg / 1000)} t`, color: '#cbd5e1' },
          ]} />;
        }} />
        <Legend verticalAlign="top" wrapperStyle={{ ...LEGEND, paddingTop: 0, paddingBottom: 6 }} formatter={legendaTexto} />
        <Line name="Preço médio no mês" dataKey="mensal" stroke="#f7b092" strokeWidth={1.5} dot={{ r: 2.5, fill: '#f7b092' }} connectNulls={false} isAnimationActive={animate} />
        <Line name={`Preço móvel ${janela} meses (soma US$ ÷ soma kg)`} dataKey="movel" stroke={COLORS.imp} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={animate} />
      </LineChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// D09 — cascata em toneladas
// ---------------------------------------------------------------------------
const COR_SOBE = '#eb6834', COR_DESCE = '#1baf7a', COR_TOTAL = '#475569';
export function CascataToneladasChart({ rows, width, height = 400 }: SizeProps & { rows: LinhaCascataT[] }) {
  const animate = !width;
  const fmtT = (t: number) => (Math.abs(t) >= 10 ? formatIntegerPtBR(Math.abs(t)) : formatDecimalPtBR(Math.abs(t)));
  const rotulo = (key: 'sobe' | 'desce' | 'total') => (p: any) => {
    const r = rows[p.index];
    if (!r) return null;
    const v = key === 'total' ? r.total : r.delta;
    if (key !== 'total' && (r[key] as number) <= 0) return null;
    if (key === 'total' && !r.total) return null;
    const abaixo = key === 'total' ? v < 0 : false;
    const y = abaixo ? Math.max(p.y, p.y + p.height) + 14 : Math.min(p.y, p.y + p.height) - 5;
    return <text x={p.x + p.width / 2} y={y} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#334155" fontFamily={FONT}>{`${v > 0 ? '+' : '−'}${fmtT(v)} t`}</text>;
  };
  return (
    <Frame width={width} height={height}>
      <BarChart data={rows} margin={{ top: 22, right: 12, left: 4, bottom: 52 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10.5 }} angle={-30} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={false} width={60} />
        <ReferenceLine y={0} stroke="#94a3b8" />
        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const r = payload[0].payload as LinhaCascataT;
          return <TooltipBox label={r.name} items={[
            { name: 'Variação do volume', value: `${r.delta >= 0 ? '+' : '−'}${fmtT(r.delta)} t`, color: r.q0 === undefined ? COR_TOTAL : r.delta >= 0 ? COR_SOBE : COR_DESCE },
            ...(r.q0 !== undefined ? [{ name: 'Volume', value: `${formatIntegerPtBR(r.q0)} t → ${formatIntegerPtBR(r.q1!)} t`, color: '#cbd5e1' }] : []),
          ]} />;
        }} />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} legendType="none" />
        <Bar dataKey="total" stackId="w" fill={COR_TOTAL} isAnimationActive={animate}><LabelList content={rotulo('total')} /></Bar>
        <Bar dataKey="sobe" stackId="w" fill={COR_SOBE} isAnimationActive={animate}><LabelList content={rotulo('sobe')} /></Bar>
        <Bar dataKey="desce" stackId="w" fill={COR_DESCE} isAnimationActive={animate}><LabelList content={rotulo('desce')} /></Bar>
      </BarChart>
    </Frame>
  );
}
