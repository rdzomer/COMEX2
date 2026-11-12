import React from 'react';
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine, Treemap,
} from 'recharts';
import { formatCompactPtBR, formatDecimalPtBR, formatIntegerPtBR } from '../../utils/formatting.ts';
import { CountryDataRecord, YearRowKind } from '../../types.ts';

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
// Preços médios (US$ FOB/kg) — duas linhas
// ---------------------------------------------------------------------------
export function PriceLineChart({ data, width, height }: SizeProps & { data: { name: string; imp: number | null; exp: number | null }[] }) {
  const animate = !width;
  return (
    <Frame width={width} height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 58 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="name" tick={{ ...AXIS_TICK, fontSize: 10 }} angle={-40} textAnchor="end" interval={0} tickLine={false} axisLine={{ stroke: COLORS.grid }} />
        <YAxis tickFormatter={v => formatDecimalPtBR(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          content={({ active, payload, label }) => active && payload?.length ? (
            <TooltipBox label={label} items={payload.map(p => ({ name: String(p.name), value: p.value === null || p.value === undefined ? '–' : `US$ ${formatDecimalPtBR(p.value as number)}/kg`, color: p.color as string }))} />
          ) : null}
        />
        <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="linear" dataKey="imp" name="Importação" stroke={COLORS.imp} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={animate} />
        <Line type="linear" dataKey="exp" name="Exportação" stroke={COLORS.exp} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={animate} />
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

export function CountryTreemap({ data, flow, metric, width, height = 380 }: SizeProps & {
  data: CountryDataRecord[]; flow: 'import' | 'export'; metric: 'metricFOB' | 'metricKG';
}) {
  const total = data.reduce((s, d) => s + d[metric], 0);
  if (!data.length || total <= 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500" style={{ width: width ?? '100%', height }}>
        Não há dados de {flow === 'import' ? 'importação' : 'exportação'} para este período/NCM.
      </div>
    );
  }
  const ramp = SEQ[flow];
  const items = data
    .filter(d => d[metric] > 0)
    .map(d => {
      const share = (d[metric] / total) * 100;
      const step = share >= 40 ? 5 : share >= 20 ? 4 : share >= 10 ? 3 : share >= 4 ? 2 : share >= 1.5 ? 1 : 0;
      return { name: d.country, size: d[metric], share, fill: ramp[step], dark: step >= 3 };
    });
  const unit = metric === 'metricFOB' ? 'US$ FOB' : 'kg';

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
