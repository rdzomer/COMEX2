import React from 'react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine, Treemap, LabelList, Customized,
} from 'recharts';
import { formatCompactPtBR, formatDecimalPtBR, formatIntegerPtBR } from '../../utils/formatting.ts';
import { CountryDataRecord, YearRowKind } from '../../types.ts';
import { Metric, ShareEvolution, MonthPoint, inkOn } from '../../utils/fichaExtras.ts';

// Paleta validada (dataviz): exportações = azul, importações = laranja; tons claros = períodos parciais.
export const COLORS = {
  exp: '#2a78d6',
  expPrevYtd: '#8db8ec',
  expYtd: '#5b97e0',
  imp: '#eb6834',
  impPrevYtd: '#f5b192',
  impYtd: '#f08a5f',
  balance: '#334155',
  grid: '#e2e8f0',
  axis: '#64748b',
};

const AXIS_TICK = { fontSize: 11, fill: COLORS.axis };

/** Tamanho fixo (para exportar como imagem) ou responsivo (na tela). */
interface SizeProps { width?: number; height?: number }

function Frame({ width, height = 320, children }: SizeProps & { children: React.ReactElement }) {
  if (width) return React.cloneElement(children as React.ReactElement<any>, { width, height });
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

function TooltipBox({ label, items }: { label: React.ReactNode; items: { name: string; value: string; color: string }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-semibold text-slate-800">{label}</p>
      {items.map(i => (
        <p key={i.name} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}: <span className="tabular font-semibold text-slate-900">{i.value}</span>
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barras anuais (importações ou exportações, KG ou US$ FOB)
// ---------------------------------------------------------------------------
export interface AnnualPoint { name: string; value: number; kind?: YearRowKind }

export function AnnualBarChart({ data, flow, unitLabel, width, height }: SizeProps & {
  data: AnnualPoint[]; flow: 'import' | 'export'; unitLabel: string;
}) {
  const animate = !width;
  const color = (k?: YearRowKind) =>
    flow === 'import'
      ? k === 'ytd' ? COLORS.impYtd : k === 'prevYtd' ? COLORS.impPrevYtd : COLORS.imp
      : k === 'ytd' ? COLORS.expYtd : k === 'prevYtd' ? COLORS.expPrevYtd : COLORS.exp;
  return (
    <Frame width={width} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 58 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-40} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox label={label} items={[{ name: unitLabel, value: formatIntegerPtBR(payload[0].value as number), color: color((payload[0].payload as AnnualPoint).kind) }]} />
          ) : null}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={animate}>
          {data.map((d, i) => <Cell key={i} fill={color(d.kind)} />)}
        </Bar>
      </BarChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Preços médios (US$ FOB/kg) — duas linhas gerais e, opcionalmente, as duas do país (tracejadas)
// ---------------------------------------------------------------------------
export interface PricePoint {
  name: string;
  imp: number | null; exp: number | null; impKg?: number; expKg?: number;
  impC?: number | null; expC?: number | null; impCKg?: number; expCKg?: number;
}
const KG_OF: Record<string, keyof PricePoint> = { imp: 'impKg', exp: 'expKg', impC: 'impCKg', expC: 'expCKg' };

export function PriceLineChart({ data, country, width, height }: SizeProps & { data: PricePoint[]; country?: string | null }) {
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 58 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-40} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={v => formatDecimalPtBR(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox label={label} items={payload.map(p => {
              const kg = (p.payload as PricePoint)[KG_OF[String(p.dataKey)]] as number | undefined;
              const v = p.value === null || p.value === undefined ? 'sem comércio' : `US$ ${formatDecimalPtBR(p.value as number)}/kg`;
              return { name: String(p.name), value: kg ? `${v} · ${formatIntegerPtBR(kg)} kg` : v, color: p.color as string };
            })} />
          ) : null}
        />
        <Legend verticalAlign="top" height={country ? 40 : 28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="linear" dataKey="imp" name={country ? 'Importação (geral)' : 'Importação'} stroke={COLORS.imp} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={animate} />
        <Line type="linear" dataKey="exp" name={country ? 'Exportação (geral)' : 'Exportação'} stroke={COLORS.exp} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={animate} />
        {country && <Line type="linear" dataKey="impC" name={`Importação (${country})`} stroke={COLORS.imp} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, strokeDasharray: '' }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={animate} />}
        {country && <Line type="linear" dataKey="expC" name={`Exportação (${country})`} stroke={COLORS.exp} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, strokeDasharray: '' }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={animate} />}
      </LineChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Exportação (+), importação (−) e balança comercial (linha) — mesmo eixo, mesma unidade
// ---------------------------------------------------------------------------
export function TradeBalanceChart({ data, width, height }: SizeProps & { data: { name: string; exp: number; impNeg: number; balance: number }[] }) {
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 58 }} barGap={-14} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-40} textAnchor="end" interval={0} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox label={label} items={payload.map(p => ({
              name: String(p.name),
              value: `US$ ${formatIntegerPtBR(p.dataKey === 'impNeg' ? -(p.value as number) : (p.value as number))}`,
              color: (p.color || (p as any).fill) as string,
            }))} />
          ) : null}
        />
        <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine y={0} stroke="#475569" />
        <Bar dataKey="exp" name="Exportação" fill={COLORS.exp} radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={animate} />
        <Bar dataKey="impNeg" name="Importação" fill={COLORS.imp} radius={[0, 0, 4, 4]} barSize={14} isAnimationActive={animate} />
        <Line type="linear" dataKey="balance" name="Balança comercial" stroke={COLORS.balance} strokeWidth={2} dot={{ r: 3, fill: COLORS.balance }} isAnimationActive={animate} />
      </ComposedChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Importações acumuladas em 12 meses (KG)
// ---------------------------------------------------------------------------
export function RollingSumChart({ data, width, height }: SizeProps & { data: { name: string; value: number }[] }) {
  const animate = !width;
  const n = data.length;
  const ticks = data.filter((_, i) => i % 3 === 0 || i === n - 1).map(d => d.name);
  return (
    <Frame width={width} height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 58 }} barCategoryGap="12%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" ticks={ticks} tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-40} textAnchor="end" tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox label={`12 meses até ${label}`} items={[{ name: 'Importações acumuladas', value: `${formatIntegerPtBR(payload[0].value as number)} kg`, color: COLORS.exp }]} />
          ) : null}
        />
        <Bar dataKey="value" fill={COLORS.exp} radius={[3, 3, 0, 0]} isAnimationActive={animate} />
      </BarChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Treemap por país — cor sequencial (um tom só) pela participação
// ---------------------------------------------------------------------------
const SEQ = {
  import: ['#fde2d6', '#f9c0a6', '#f5996f', '#eb6834', '#c44b1c', '#8f3510'],
  export: ['#d7e7fa', '#a9cbf2', '#6fa6e6', '#2a78d6', '#1f5cab', '#15407a'],
};

export function CountryTreemap({ data, flow, metric, unitLabel, width, height = 380 }: SizeProps & {
  data: CountryDataRecord[]; flow: 'import' | 'export'; metric: Metric; unitLabel?: string;
}) {
  const val = (d: CountryDataRecord) => d[metric] ?? 0;
  const total = data.reduce((s, d) => s + val(d), 0);
  if (!data.length || total <= 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500" style={{ width: width ?? '100%', height }}>
        Não há dados de {flow === 'import' ? 'importação' : 'exportação'} para este período/NCM.
      </div>
    );
  }
  const ramp = SEQ[flow];
  const items = data
    .filter(d => val(d) > 0)
    .sort((a, b) => val(b) - val(a))
    .map(d => {
      const share = (val(d) / total) * 100;
      const step = share >= 40 ? 5 : share >= 20 ? 4 : share >= 10 ? 3 : share >= 4 ? 2 : share >= 1.5 ? 1 : 0;
      return { name: d.country, size: val(d), share, fill: ramp[step], dark: step >= 3 };
    });
  const unit = unitLabel ?? (metric === 'metricFOB' ? 'US$ FOB' : 'kg');

  const Content = (props: any) => {
    const { x, y, width: w, height: h, name, share, fill, dark, size, depth } = props;
    if (depth !== 1) return null;
    const showName = w > 46 && h > 22;
    const showVal = w > 80 && h > 44;
    const fs = Math.max(10, Math.min(15, w / 9));
    const txt = dark ? '#ffffff' : '#0f172a';
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} fill={fill} stroke="#ffffff" strokeWidth={2} rx={3} />
        {showName && (
          <text x={x + 6} y={y + fs + 4} fill={txt} fontSize={fs} fontWeight={600} fontFamily="Inter, Arial, sans-serif">
            {String(name).length * fs * 0.55 > w - 10 ? `${String(name).slice(0, Math.max(3, Math.floor((w - 10) / (fs * 0.55)) - 1))}…` : name}
          </text>
        )}
        {showVal && (
          <>
            <text x={x + 6} y={y + fs * 2 + 8} fill={txt} fontSize={fs - 2} fontFamily="Inter, Arial, sans-serif">{formatDecimalPtBR(share)}%</text>
            {h > 64 && <text x={x + 6} y={y + fs * 3 + 10} fill={txt} fontSize={fs - 3} opacity={0.85} fontFamily="Inter, Arial, sans-serif">{formatCompactPtBR(size)} {unit}</text>}
          </>
        )}
      </g>
    );
  };

  return (
    <Frame width={width} height={height}>
      <Treemap data={items} dataKey="size" nameKey="name" content={<Content />} isAnimationActive={false}>
        {!width && (
          <Tooltip content={({ active, payload }) => active && payload?.length ? (
            <TooltipBox label={(payload[0].payload as any).name} items={[
              { name: unit, value: formatIntegerPtBR((payload[0].payload as any).size), color: (payload[0].payload as any).fill },
              { name: 'Participação', value: `${formatDecimalPtBR((payload[0].payload as any).share)}%`, color: (payload[0].payload as any).fill },
            ]} />
          ) : null} />
        )}
      </Treemap>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Aviso no lugar de um gráfico vazio
// ---------------------------------------------------------------------------
export function EmptyChart({ message, width, height = 320 }: SizeProps & { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm text-slate-500" style={{ width: width ?? '100%', height }}>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alteração 3 — participação por país, colunas empilhadas a 100%
// ---------------------------------------------------------------------------
export function ShareStackedChart({ evo, colors, unit, flow, width, height = 380 }: SizeProps & {
  evo: ShareEvolution; colors: Record<string, string>; unit: string; flow: 'import' | 'export';
}) {
  if (!evo.hasData) {
    return <EmptyChart width={width} height={height} message={`Sem registro de ${flow === 'import' ? 'importações' : 'exportações'} no período.`} />;
  }
  const animate = !width;
  const fmtShare = (v: number) => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;
  return (
    <Frame width={width} height={height}>
      <BarChart data={evo.years} margin={{ top: 8, right: 12, left: 4, bottom: 24 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 11 }} interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={v => `${v}%`} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as Record<string, any>;
            if (row.empty) return <TooltipBox label={label} items={[{ name: 'Sem registro', value: '–', color: '#cbd5e1' }]} />;
            return <TooltipBox label={label} items={evo.countries.map(c => ({
              name: c, color: colors[c],
              value: `${fmtShare(row[c] as number)} · ${formatIntegerPtBR(row[`abs:${c}`] as number)} ${unit}`,
            }))} />;
          }}
        />
        <Legend verticalAlign="top" height={evo.countries.length > 4 ? 44 : 28} wrapperStyle={{ fontSize: 12 }}
          payload={evo.countries.map(c => ({ value: c, id: c, type: 'square' as const, color: colors[c] }))} />
        {evo.countries.map((c, i) => (
          <Bar key={c} dataKey={c} name={c} stackId="s" fill={colors[c]} stroke="#ffffff" strokeWidth={1.5} isAnimationActive={animate}
            radius={i === evo.countries.length - 1 ? [4, 4, 0, 0] : undefined}>
            <LabelList dataKey={c} position="center" content={(p: any) => {
              const v = Number(p.value);
              if (!(v >= 5) || p.height < 13) return null;
              return <text x={p.x + p.width / 2} y={p.y + p.height / 2} dy={4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={inkOn(colors[c])} fontFamily="Inter, Arial, sans-serif">{fmtShare(v).replace('%', '')}</text>;
            }} />
          </Bar>
        ))}
        <Bar dataKey="vazio" stackId="s" fill="transparent" legendType="none" isAnimationActive={false}>
          <LabelList dataKey="vazio" position="center" content={(p: any) => p.value ? (
            <text x={p.x + p.width / 2} y={p.y + p.height / 2} textAnchor="middle" fontSize={11} fill="#94a3b8" fontFamily="Inter, Arial, sans-serif">sem registro</text>
          ) : null} />
        </Bar>
      </BarChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Alteração 4 — importações mensais (48 meses): série contínua
// ---------------------------------------------------------------------------
function YearSeparators(props: any) {
  const xAxis: any = Object.values(props.xAxisMap ?? {})[0];
  const off = props.offset;
  const scale = xAxis?.scale;
  if (!scale || !off || typeof scale.bandwidth !== 'function') return null;
  const step = typeof scale.step === 'function' ? scale.step() : scale.bandwidth();
  const pad = (step - scale.bandwidth()) / 2;
  const data: MonthPoint[] = props.data ?? props.formattedGraphicalItems?.[0]?.props?.data ?? [];
  return (
    <g>
      {data.filter((p, i) => p.month === 1 && i > 0).map(p => {
        const x = scale(p.name) - pad;
        return (
          <g key={p.key}>
            <line x1={x} x2={x} y1={off.top} y2={off.top + off.height} stroke="#cbd5e1" strokeWidth={1} />
            <text x={x + 4} y={off.top + 10} fontSize={10} fill="#94a3b8" fontFamily="Inter, Arial, sans-serif">{p.year}</text>
          </g>
        );
      })}
    </g>
  );
}

export function MonthlyImportsChart({ points, unit, width, height = 340 }: SizeProps & { points: MonthPoint[]; unit: string }) {
  if (!points.some(p => p.value > 0)) {
    return <EmptyChart width={width} height={height} message="Sem registro de importações no período." />;
  }
  const animate = !width;
  const mean = points.reduce((s, p) => s + p.value, 0) / points.length;
  const fmtVar = (v: number | null) => v === null ? 'sem base de comparação' : `${v >= 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)}%`;
  return (
    <Frame width={width} height={height}>
      <BarChart data={points} margin={{ top: 16, right: 84, left: 4, bottom: 40 }} barCategoryGap="14%">
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-45} textAnchor="end" interval={width ? 0 : 'preserveStartEnd'} minTickGap={2} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as MonthPoint;
            return <TooltipBox label={p.name} items={[
              { name: 'Importações', value: `${formatIntegerPtBR(p.value)} ${unit}`, color: COLORS.imp },
              { name: `vs ${p.name.slice(0, 4)}${String(p.year - 1).slice(2)}`, value: fmtVar(p.yoy), color: '#cbd5e1' },
            ]} />;
          }}
        />
        <Customized component={(cp: any) => <YearSeparators {...cp} data={points} />} />
        <Bar dataKey="value" fill={COLORS.imp} radius={[3, 3, 0, 0]} isAnimationActive={animate} />
        <ReferenceLine y={mean} stroke="#334155" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain"
          label={{ value: `média: ${formatCompactPtBR(mean)}`, position: 'right', fontSize: 11, fill: '#334155' }} />
      </BarChart>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// Alteração 4 — comparação por ano (eixo jan–dez, uma linha por ano)
// ---------------------------------------------------------------------------
const YEAR_RAMP = ['#f5b192', '#f08a5f', '#eb6834', '#c44b1c', '#8f3510', '#5e230a'];
export function YearCompareChart({ years, data, unit, partialYears = [], width, height = 340 }: SizeProps & {
  years: number[]; data: Record<string, number | string | null>[]; unit: string; partialYears?: number[];
}) {
  const animate = !width;
  const ramp = YEAR_RAMP.slice(Math.max(0, YEAR_RAMP.length - years.length));
  return (
    <Frame width={width} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 24 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 11 }} interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={formatCompactPtBR} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox label={label} items={[...payload].reverse().filter(p => p.value !== null && p.value !== undefined).map(p => ({
              name: String(p.name), value: `${formatIntegerPtBR(p.value as number)} ${unit}`, color: p.color as string,
            }))} />
          ) : null}
        />
        <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        {years.map((y, i) => (
          <Line key={y} type="linear" dataKey={String(y)} name={partialYears.includes(y) ? `${y}*` : String(y)} stroke={ramp[i]} strokeWidth={i === years.length - 1 ? 2.5 : 2}
            dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={animate} />
        ))}
      </LineChart>
    </Frame>
  );
}

