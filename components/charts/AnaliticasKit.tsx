
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Customized,
  BarChart, Bar, LabelList, Cell, LineChart, Line, Legend,
} from 'recharts';
import brazil from '@svg-maps/brazil';
import { AXIS_TICK, COLORS, Frame, TooltipBox, SizeProps, EmptyChart } from './ChartKit.tsx';
import { formatCompactPtBR, formatIntegerPtBR, formatDecimalPtBR } from '../../utils/formatting.ts';
import {
  PontoBolha, linhasCascata, LinhaDecomposicao, PontoQuadrante, LIM_X, LIM_Y, Calendario, PontoConcentracao,
  PontoPenetracao, LinhaUf, faixaHhi,
} from '../../utils/analiticas.ts';

const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number | null | undefined, sinal = true) => (v === null || v === undefined || !isFinite(v) ? '–' : `${sinal && v > 0 ? '+' : ''}${nf1.format(v)}%`);
const usd = (v: number) => `US$ ${formatCompactPtBR(v)}`;
const peso = (kg: number) => (Math.abs(kg) >= 1000 ? `${formatCompactPtBR(kg / 1000)} t` : `${formatIntegerPtBR(kg)} kg`);
const FONT = 'Inter, Arial, sans-serif';

/** Rampa sequencial laranja (importações): do mais claro ao mais escuro. */
export const RAMPA = ['#fdeee6', '#fbd3bf', '#f7b092', '#f08a5f', '#eb6834', '#c44b1c', '#8f3510'];
const passo = (v: number, max: number) => (max > 0 ? Math.min(RAMPA.length - 1, Math.floor((v / max) * RAMPA.length * 0.9999)) : 0);

// ===========================================================================
// 1. Preço × volume por origem (bolhas)
// ===========================================================================
function Setas(props: any) {
  const xs: any = Object.values(props.xAxisMap ?? {})[0];
  const ys: any = Object.values(props.yAxisMap ?? {})[0];
  if (!xs?.scale || !ys?.scale) return null;
  const pts: PontoBolha[] = props.pontos ?? [];
  return (
    <g>
      <defs>
        <marker id="seta-bolha" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
        </marker>
      </defs>
      {pts.filter(p => p.q0 && p.p0 && p.q1 && p.p1).map(p => {
        const x0 = xs.scale(p.q0), y0 = ys.scale(p.p0), x1 = xs.scale(p.q1), y1 = ys.scale(p.p1);
        const d = Math.hypot(x1 - x0, y1 - y0);
        if (!isFinite(d) || d < 6) return null;
        // Ponta da seta no meio do caminho: no fim ela ficaria escondida sob a bolha
        return <polyline key={p.pais} points={`${x0},${y0} ${(x0 + x1) / 2},${(y0 + y1) / 2} ${x1},${y1}`} fill="none" stroke="#475569" strokeWidth={1.5} strokeOpacity={0.85} markerMid="url(#seta-bolha)" />;
      })}
    </g>
  );
}

const ticksLog = (min: number, max: number) => {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    [1, 3].forEach(m => { const v = m * 10 ** e; if (v >= min && v <= max) out.push(v); });
  }
  return out;
};

export function PrecoVolumeChart({ pontos, precoMedio, rotulo0, rotulo1, width, height = 440 }: SizeProps & {
  pontos: PontoBolha[]; precoMedio: number | null; rotulo0: string; rotulo1: string;
}) {
  const ant = pontos.filter(p => p.q0 && p.p0).map(p => ({ ...p, x: p.q0!, y: p.p0!, v: p.v0, periodo: 0 }));
  const atu = pontos.filter(p => p.q1 && p.p1).map(p => ({ ...p, x: p.q1!, y: p.p1!, v: p.v1, periodo: 1 }));
  const todos = [...ant, ...atu];
  if (!atu.length) return <EmptyChart width={width} height={height} message={`Sem importações em ${rotulo1}.`} />;
  const xmin = Math.min(...todos.map(p => p.x)) / 1.8, xmax = Math.max(...todos.map(p => p.x)) * 1.8;
  const ys = [...todos.map(p => p.y), ...(precoMedio ? [precoMedio] : [])];
  // Preços muito dispersos (ex.: uma origem de nicho a US$ 20/kg e o grosso a US$ 2/kg): eixo em escala logarítmica
  const logY = Math.max(...ys) / Math.max(1e-9, Math.min(...ys)) > 4;
  const pad = (Math.max(...ys) - Math.min(...ys)) * 0.15 || Math.max(...ys) * 0.1;
  const ymin = logY ? Math.min(...ys) / 1.4 : Math.max(0, Math.min(...ys) - pad);
  const ymax = logY ? Math.max(...ys) * 1.4 : Math.max(...ys) + pad;
  const animate = !width;
  const conteudo = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as PontoBolha & { periodo: number };
    return <TooltipBox label={p.pais} items={[
      { name: rotulo0, value: p.q0 ? `${peso(p.q0)} · US$ ${formatDecimalPtBR(p.p0!)}/kg · ${usd(p.v0)}` : 'sem importação', color: '#cbd5e1' },
      { name: rotulo1, value: p.q1 ? `${peso(p.q1)} · US$ ${formatDecimalPtBR(p.p1!)}/kg · ${usd(p.v1)}` : 'sem importação', color: p.cor },
      { name: 'Volume', value: p.varQ === null ? (p.q1 ? 'origem nova' : '–') : pct(p.varQ), color: '#94a3b8' },
      { name: 'Preço', value: pct(p.varP), color: '#94a3b8' },
    ]} />;
  };
  return (
    <Frame width={width} height={height}>
      <ScatterChart margin={{ top: 16, right: 92, left: 8, bottom: 34 }}>
        <CartesianGrid stroke={COLORS.grid} />
        <XAxis type="number" dataKey="x" name="Volume" scale="log" domain={[xmin, xmax]} ticks={ticksLog(xmin, xmax)} allowDataOverflow
          tickFormatter={v => peso(v)} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }}
          label={{ value: 'Volume importado (escala logarítmica)', position: 'insideBottom', offset: -22, fontSize: 11, fill: COLORS.axis }} />
        <YAxis type="number" dataKey="y" name="Preço" domain={[ymin, ymax]} scale={logY ? 'log' : 'auto'} allowDataOverflow
          ticks={logY ? ticksLog(ymin, ymax) : undefined} tickFormatter={v => formatDecimalPtBR(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56}
          label={{ value: logY ? 'US$ FOB/kg (escala logarítmica)' : 'US$ FOB/kg', angle: -90, position: 'insideLeft', fontSize: 11, fill: COLORS.axis, dy: logY ? 70 : 30 }} />
        <ZAxis type="number" dataKey="v" range={[50, 1600]} />
        <Tooltip content={conteudo} cursor={{ strokeDasharray: '3 3' }} />
        {precoMedio !== null && (
          <ReferenceLine y={precoMedio} stroke="#334155" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain"
            label={{ value: `média ${formatDecimalPtBR(precoMedio)}`, position: 'right', fontSize: 11, fill: '#334155' }} />
        )}
        <Customized component={(cp: any) => <Setas {...cp} pontos={pontos} />} />
        <Scatter name={rotulo0} data={ant} isAnimationActive={animate}
          shape={(sp: any) => <circle cx={sp.cx} cy={sp.cy} r={Math.sqrt((sp.size ?? 60) / Math.PI)} fill="#ffffff" fillOpacity={0.6} stroke={sp.payload.cor} strokeWidth={1.5} strokeDasharray="3 2" />} />
        <Scatter name={rotulo1} data={atu} isAnimationActive={animate}
          shape={(sp: any) => {
            const r = Math.sqrt((sp.size ?? 60) / Math.PI);
            return (
              <g>
                <circle cx={sp.cx} cy={sp.cy} r={r} fill={sp.payload.cor} fillOpacity={0.78} stroke="#ffffff" strokeWidth={2} />
                <text x={sp.cx + r + 4} y={sp.cy + 4} fontSize={11} fontWeight={600} fill="#1e293b" fontFamily={FONT}>{sp.payload.pais}</text>
              </g>
            );
          }} />
      </ScatterChart>
    </Frame>
  );
}

// ===========================================================================
// 2. Cascata da variação por país + efeito quantidade × preço
// ===========================================================================
const COR_SOBE = COLORS.imp, COR_DESCE = '#1baf7a', COR_TOTAL = '#334155';

export function CascataChart({ rows, width, height = 400 }: SizeProps & { rows: ReturnType<typeof linhasCascata> }) {
  const animate = !width;
  const rotulo = (key: 'sobe' | 'desce' | 'total') => (p: any) => {
    const r = rows[p.index];
    if (!r) return null;
    const v = key === 'total' ? r.total : r.delta;
    if (key !== 'total' && (r[key] as number) <= 0) return null;
    if (key === 'total' && !r.total) return null;
    const txt = `${v > 0 ? '+' : '−'}${usd(Math.abs(v)).replace('US$ ', '')}`;
    // Rótulo acima da barra; para barras para baixo (ponto final negativo), abaixo
    const abaixo = key === 'total' ? v < 0 : false;
    const y = abaixo ? Math.max(p.y, p.y + p.height) + 14 : Math.min(p.y, p.y + p.height) - 5;
    return <text x={p.x + p.width / 2} y={y} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#334155" fontFamily={FONT}>{txt}</text>;
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
          const r = payload[0].payload as (typeof rows)[number];
          if (!r.linha) return <TooltipBox label={r.name} items={[{ name: 'Variação do valor importado', value: `${r.total >= 0 ? '+' : '−'}US$ ${formatIntegerPtBR(Math.abs(r.total))}`, color: COR_TOTAL }]} />;
          const l = r.linha;
          return <TooltipBox label={r.name} items={[
            { name: 'Variação', value: `${l.delta >= 0 ? '+' : '−'}US$ ${formatIntegerPtBR(Math.abs(l.delta))}`, color: l.delta >= 0 ? COR_SOBE : COR_DESCE },
            { name: 'Efeito quantidade', value: `${l.efeitoQuantidade >= 0 ? '+' : '−'}US$ ${formatIntegerPtBR(Math.abs(l.efeitoQuantidade))}`, color: COR_QTD },
            { name: 'Efeito preço', value: `${l.efeitoPreco >= 0 ? '+' : '−'}US$ ${formatIntegerPtBR(Math.abs(l.efeitoPreco))}`, color: COR_PRECO },
            { name: 'Volume', value: `${peso(l.q0)} → ${peso(l.q1)}`, color: '#cbd5e1' },
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

export const COR_QTD = '#6250d6', COR_PRECO = '#eda100';

export function EfeitosChart({ linhas, width, height }: SizeProps & { linhas: LinhaDecomposicao[] }) {
  const animate = !width;
  const h = height ?? Math.max(220, 46 + linhas.length * 34);
  return (
    <Frame width={width} height={h}>
      <BarChart data={linhas} layout="vertical" stackOffset="sign" margin={{ top: 8, right: 20, left: 8, bottom: 8 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={COLORS.grid} />
        <XAxis type="number" tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis type="category" dataKey="pais" width={132} tick={{ ...AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload, label }) => active && payload?.length ? (
          <TooltipBox label={label} items={payload.map(p => ({ name: String(p.name), value: `${(p.value as number) >= 0 ? '+' : '−'}US$ ${formatIntegerPtBR(Math.abs(p.value as number))}`, color: p.color as string }))} />
        ) : null} />
        <Legend verticalAlign="top" height={26} iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine x={0} stroke="#94a3b8" />
        <Bar dataKey="efeitoQuantidade" name="Efeito quantidade" stackId="e" fill={COR_QTD} isAnimationActive={animate} />
        <Bar dataKey="efeitoPreco" name="Efeito preço" stackId="e" fill={COR_PRECO} isAnimationActive={animate} />
      </BarChart>
    </Frame>
  );
}

// ===========================================================================
// 3. Quadrante de triagem (radar)
// ===========================================================================
const COR_NIVEL: Record<string, string> = { alto: '#dc2626', medio: '#ea580c', atencao: '#d4a72c' };
const NOME_NIVEL: Record<string, string> = { alto: 'Alto', medio: 'Médio', atencao: 'Em observação' };

export function QuadranteChart({ pontos, onOpen, width, height = 460 }: SizeProps & { pontos: PontoQuadrante[]; onOpen?: (ncm: string) => void }) {
  const animate = !width;
  // Rotula as bolhas maiores do canto "volume ↑ · preço ↓"
  const destaque = new Set(pontos.filter(p => p.x > 0 && p.y < 0).sort((a, b) => b.z - a.z).slice(0, 5).map(p => p.ncm));
  const formatarNcm = (n: string) => `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}`;
  return (
    <Frame width={width} height={height}>
      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 34 }}>
        <ReferenceArea x1={0} x2={LIM_X} y1={-LIM_Y} y2={0} fill="#fee2e2" fillOpacity={0.65} ifOverflow="hidden"
          label={{ value: 'Volume ↑ · preço ↓  — olhar primeiro', position: 'insideBottomRight', fontSize: 12, fontWeight: 600, fill: '#b91c1c' }} />
        <CartesianGrid stroke={COLORS.grid} />
        <XAxis type="number" dataKey="x" domain={[-100, LIM_X]} ticks={[-100, -50, 0, 50, 100, 200, 300]} tickFormatter={v => (v >= LIM_X ? `≥ +${v}%` : `${v > 0 ? '+' : ''}${v}%`)}
          tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: COLORS.grid }}
          label={{ value: 'Variação do volume importado (kg), 12 meses vs 12 anteriores', position: 'insideBottom', offset: -22, fontSize: 11, fill: COLORS.axis }} />
        <YAxis type="number" dataKey="y" domain={[-LIM_Y, LIM_Y]} ticks={[-80, -40, 0, 40, 80]} tickFormatter={v => `${v > 0 ? '+' : ''}${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} width={52}
          label={{ value: 'Variação do preço (US$/kg)', angle: -90, position: 'insideLeft', fontSize: 11, fill: COLORS.axis, dy: 70 }} />
        <ZAxis type="number" dataKey="z" range={[30, 1400]} domain={[0, Math.max(5, ...pontos.map(p => p.z))]} />
        <ReferenceLine x={0} stroke="#94a3b8" />
        <ReferenceLine y={0} stroke="#94a3b8" />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as PontoQuadrante;
          return <TooltipBox label={`${formatarNcm(p.ncm)} · ${p.cesta}`} items={[
            { name: 'Produto', value: p.descricao.length > 60 ? `${p.descricao.slice(0, 60)}…` : p.descricao, color: '#ffffff' },
            { name: 'Nível', value: NOME_NIVEL[p.nivel], color: COR_NIVEL[p.nivel] },
            { name: 'Volume 12m', value: `${peso(p.kg0)} → ${peso(p.kg1)} (${p.xReal === null ? 'fluxo novo' : pct(p.xReal)})`, color: '#94a3b8' },
            { name: 'Preço', value: pct(p.yReal), color: '#94a3b8' },
            { name: 'Peso na cesta', value: `${nf1.format(p.z)}% · ${usd(p.usd1)}`, color: '#94a3b8' },
          ]} />;
        }} />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        {(['alto', 'medio', 'atencao'] as const).map(n => (
          <Scatter key={n} name={NOME_NIVEL[n]} data={pontos.filter(p => p.nivel === n)} fill={COR_NIVEL[n]} isAnimationActive={animate}
            onClick={(d: any) => onOpen?.(d?.payload?.ncm ?? d?.ncm)} cursor={onOpen ? 'pointer' : undefined}
            shape={(sp: any) => {
              const r = Math.max(3, Math.sqrt((sp.size ?? 30) / Math.PI));
              const p = sp.payload as PontoQuadrante;
              return (
                <g>
                  <circle cx={sp.cx} cy={sp.cy} r={r} fill={COR_NIVEL[n]} fillOpacity={0.72} stroke="#ffffff" strokeWidth={1.5} />
                  {destaque.has(p.ncm) && <text x={sp.cx + r + 3} y={sp.cy + 4} fontSize={10.5} fontWeight={600} fill="#1e293b" fontFamily={FONT}>{formatarNcm(p.ncm)}</text>}
                </g>
              );
            }} />
        ))}
      </ScatterChart>
    </Frame>
  );
}

// ===========================================================================
// 4. Calendário mês × ano (SVG próprio)
// ===========================================================================
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function CalendarioHeatmap({ cal, unit, width }: { cal: Calendario; unit: string; width?: number }) {
  const W = 960, left = 52, top = 26, cw = (W - left - 8) / 12, ch = 30;
  const H = top + cal.anos.length * ch + 46;
  const limiteAtipico = cal.media + 2 * cal.dp;
  return (
    <svg data-export-svg viewBox={`0 0 ${W} ${H}`} width={width ?? '100%'} height={width ? (width * H) / W : undefined} role="img" aria-label="Calendário mensal das importações"
      style={{ fontFamily: FONT, display: 'block' }}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      {MESES.map((m, i) => <text key={m} x={left + i * cw + cw / 2} y={16} textAnchor="middle" fontSize={11} fill="#64748b">{m}</text>)}
      {cal.anos.map((a, r) => (
        <g key={a}>
          <text x={left - 8} y={top + r * ch + ch / 2 + 4} textAnchor="end" fontSize={11} fill="#475569" fontWeight={600}>{a}</text>
          {cal.valores[r].map((v, c) => {
            const x = left + c * cw, y = top + r * ch;
            if (v === null) return <rect key={c} x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} rx={3} fill="#f8fafc" />;
            const k = passo(v, cal.max);
            const atipico = cal.dp > 0 && v > limiteAtipico;
            return (
              <g key={c}>
                <rect x={x + 1} y={y + 1} width={cw - 2} height={ch - 2} rx={3} fill={v === 0 ? '#f1f5f9' : RAMPA[k]} stroke={atipico ? '#0f172a' : 'none'} strokeWidth={atipico ? 2 : 0}>
                  <title>{`${MESES[c]}/${a}: ${formatIntegerPtBR(v)} ${unit}${atipico ? ' · acima de média + 2 desvios-padrão' : ''}`}</title>
                </rect>
                <text x={x + cw / 2} y={y + ch / 2 + 4} textAnchor="middle" fontSize={10.5} fill={k >= 4 ? '#ffffff' : '#334155'} pointerEvents="none">
                  {v === 0 ? '0' : formatCompactPtBR(v)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
      {/* Legenda */}
      <g transform={`translate(${left}, ${top + cal.anos.length * ch + 16})`}>
        <text x={0} y={11} fontSize={11} fill="#64748b">menor</text>
        {RAMPA.map((c, i) => <rect key={c} x={44 + i * 26} y={1} width={24} height={13} rx={2} fill={c} />)}
        <text x={44 + RAMPA.length * 26 + 6} y={11} fontSize={11} fill="#64748b">maior ({formatCompactPtBR(cal.max)} {unit})</text>
        <rect x={360} y={1} width={24} height={13} rx={2} fill="#ffffff" stroke="#0f172a" strokeWidth={2} />
        <text x={390} y={11} fontSize={11} fill="#64748b">mês atípico (acima de média + 2 desvios-padrão de todo o período)</text>
      </g>
    </svg>
  );
}

// ===========================================================================
// 5. Concentração de origem
// ===========================================================================
export function ConcentracaoChart({ data, width, height = 340 }: SizeProps & { data: PontoConcentracao[] }) {
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <LineChart data={data} margin={{ top: 22, right: 16, left: 4, bottom: 24 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10.5 }} interval={0} angle={data.length > 12 ? -40 : 0} textAnchor={data.length > 12 ? 'end' : 'middle'} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as PontoConcentracao;
          return <TooltipBox label={label} items={[
            { name: `Maior fornecedor (${p.maiorPais})`, value: pct(p.maior, false), color: COLORS.imp },
            { name: '3 maiores', value: pct(p.tres, false), color: '#f5b192' },
          ]} />;
        }} />
        <Legend verticalAlign="top" height={26} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="linear" dataKey="tres" name="3 maiores fornecedores" stroke="#f5b192" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={animate} />
        <Line type="linear" dataKey="maior" name="Maior fornecedor" stroke={COLORS.imp} strokeWidth={2.5} dot={{ r: 3.5 }} isAnimationActive={animate}>
          <LabelList dataKey="rotuloPais" position="top" offset={8} style={{ fontSize: 10.5, fontWeight: 600, fill: '#7c2d12' }} />
        </Line>
      </LineChart>
    </Frame>
  );
}

export function HhiChart({ data, width, height = 340 }: SizeProps & { data: PontoConcentracao[] }) {
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <LineChart data={data} margin={{ top: 22, right: 16, left: 4, bottom: 24 }}>
        <ReferenceArea y1={0} y2={1500} fill="#f8fafc" ifOverflow="hidden" label={{ value: 'baixa', position: 'insideTopRight', fontSize: 10.5, fill: '#94a3b8' }} />
        <ReferenceArea y1={1500} y2={2500} fill="#f1f5f9" ifOverflow="hidden" label={{ value: 'moderada', position: 'insideTopRight', fontSize: 10.5, fill: '#94a3b8' }} />
        <ReferenceArea y1={2500} y2={10000} fill="#e2e8f0" fillOpacity={0.7} ifOverflow="hidden" label={{ value: 'alta concentração', position: 'insideTopRight', fontSize: 10.5, fill: '#64748b' }} />
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10.5 }} interval={0} angle={data.length > 12 ? -40 : 0} textAnchor={data.length > 12 ? 'end' : 'middle'} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis domain={[0, 10000]} ticks={[0, 1500, 2500, 5000, 7500, 10000]} tickFormatter={v => formatIntegerPtBR(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={52} />
        <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
          <TooltipBox label={label} items={[{ name: `HHI (${faixaHhi((payload[0].payload as PontoConcentracao).hhi)})`, value: formatIntegerPtBR((payload[0].payload as PontoConcentracao).hhi), color: '#334155' }]} />
        ) : null} />
        <Line type="linear" dataKey="hhi" name="HHI" stroke="#334155" strokeWidth={2.5} dot={{ r: 3.5 }} isAnimationActive={animate} />
      </LineChart>
    </Frame>
  );
}

// ===========================================================================
// 6. Penetração das importações no consumo aparente (NF-e)
// ===========================================================================
export function PenetracaoChart({ data, width, height = 360 }: SizeProps & { data: PontoPenetracao[] }) {
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <BarChart data={data} margin={{ top: 26, right: 12, left: 4, bottom: 20 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={AXIS_TICK} interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={v => formatCompactPtBR(v / 1000)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={60}
          label={{ value: 'toneladas', angle: -90, position: 'insideLeft', fontSize: 11, fill: COLORS.axis, dy: 30 }} />
        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload as PontoPenetracao;
          return <TooltipBox label={label} items={[
            { name: 'Vendas internas da indústria', value: peso(p.vendas), color: '#94a3b8' },
            { name: 'Importações', value: peso(p.importacoes), color: COLORS.imp },
            { name: 'Consumo aparente', value: peso(p.cna), color: '#334155' },
            { name: 'Penetração das importações', value: pct(p.penetracao, false), color: COLORS.imp },
          ]} />;
        }} />
        <Legend verticalAlign="top" height={26} iconType="square" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="vendas" name="Vendas internas da indústria nacional" stackId="c" fill="#94a3b8" isAnimationActive={animate} />
        <Bar dataKey="importacoes" name="Importações (penetração no rótulo)" stackId="c" fill={COLORS.imp} radius={[4, 4, 0, 0]} isAnimationActive={animate}>
          <LabelList dataKey="penetracao" position="top" formatter={(v: any) => (typeof v === 'number' ? `${nf1.format(v)}%` : '')} style={{ fontSize: 11, fontWeight: 700, fill: '#7c2d12' }} />
        </Bar>
      </BarChart>
    </Frame>
  );
}

// ===========================================================================
// 7. Mapa por UF (SVG do pacote @svg-maps/brazil, CC BY 4.0) + ranking
// ===========================================================================
export const LOCAIS_BR: { id: string; name: string; path: string }[] = (brazil as any).locations;

export function MapaUf({ linhas, width }: { linhas: LinhaUf[]; width?: number }) {
  const byId = new Map(linhas.filter(l => l.id).map(l => [l.id!, l]));
  const max = Math.max(0, ...linhas.map(l => l.part));
  const [vbW, vbH] = [613, 639];
  const H = vbH + 40;
  return (
    <svg data-export-svg viewBox={`0 0 ${vbW} ${H}`} width={width ?? '100%'} height={width ? (width * H) / vbW : undefined} role="img" aria-label="Mapa das importações por UF"
      style={{ fontFamily: FONT, display: 'block', maxHeight: width ? undefined : 460 }}>
      <rect x={0} y={0} width={vbW} height={H} fill="#ffffff" />
      {LOCAIS_BR.map(loc => {
        const l = byId.get(loc.id);
        const fill = !l || l.v1 <= 0 ? '#f1f5f9' : RAMPA[Math.max(1, passo(l.part, max))];
        return (
          <path key={loc.id} d={loc.path} fill={fill} stroke="#ffffff" strokeWidth={1.2}>
            <title>{`${loc.name}: ${l ? `${usd(l.v1)} · ${nf1.format(l.part)}% do total${l.varPct !== null ? ` · ${pct(l.varPct)} vs período anterior` : ''}` : 'sem importações'}`}</title>
          </path>
        );
      })}
      <g transform={`translate(20, ${vbH + 12})`}>
        <text x={0} y={11} fontSize={12} fill="#64748b">menor</text>
        {RAMPA.slice(1).map((c, i) => <rect key={c} x={48 + i * 28} y={1} width={26} height={13} rx={2} fill={c} />)}
        <text x={48 + (RAMPA.length - 1) * 28 + 6} y={11} fontSize={12} fill="#64748b">maior participação ({nf1.format(max)}%)</text>
      </g>
    </svg>
  );
}

export function RankingUfChart({ linhas, width, height }: SizeProps & { linhas: LinhaUf[] }) {
  const top = linhas.slice(0, 10);
  const h = height ?? Math.max(240, 40 + top.length * 32);
  const max = Math.max(0, ...top.map(l => l.part));
  const animate = !width;
  return (
    <Frame width={width} height={h}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 110, left: 8, bottom: 4 }} barCategoryGap="24%">
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis type="category" dataKey="uf" width={130} tick={{ ...AXIS_TICK, fontSize: 11 }} tickLine={false} axisLine={false} interval={0} />
        <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const l = payload[0].payload as LinhaUf;
          return <TooltipBox label={l.uf} items={[
            { name: 'Importações', value: `${usd(l.v1)} (${nf1.format(l.part)}%)`, color: COLORS.imp },
            { name: 'Período anterior', value: usd(l.v0), color: '#cbd5e1' },
            { name: 'Variação', value: pct(l.varPct), color: '#94a3b8' },
          ]} />;
        }} />
        <Bar dataKey="v1" radius={[0, 4, 4, 0]} isAnimationActive={animate}>
          {top.map(l => <Cell key={l.uf} fill={RAMPA[Math.max(2, passo(l.part, max))]} />)}
          <LabelList content={(p: any) => {
            const l = top[p.index];
            if (!l) return null;
            return <text x={p.x + p.width + 6} y={p.y + p.height / 2 + 4} fontSize={11} fill="#334155" fontFamily={FONT}>
              <tspan fontWeight={600}>{nf1.format(l.part)}%</tspan>
              <tspan fill="#64748b">{l.varPct === null ? '  (novo)' : `  (${pct(l.varPct)})`}</tspan>
            </text>;
          }} />
        </Bar>
      </BarChart>
    </Frame>
  );
}
