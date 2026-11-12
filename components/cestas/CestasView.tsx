import React, { useEffect, useMemo, useState } from 'react';
import {
  CestaData, CestaManifest, Flow, TreeNode, loadCesta, loadCestaManifest, selectNcms, nextLevelOptions,
  periodOptions, valuesByNcm, sumOver, buildTree, annualSeries, monthlyImports, countriesFor,
} from '../../utils/cestas.ts';
import { buildMonthlySeries, buildTwelveMonthSummary } from '../../utils/dataProcessing.ts';
import { formatIntegerPtBR, formatDecimalPtBR, formatNcmCode, formatCompactPtBR, getMonthNamePtBR } from '../../utils/formatting.ts';
import { downloadWorkbook } from '../../services/excelService.ts';
import { AnnualBarChart, RollingSumChart, CountryTreemap, COLORS } from '../charts/ChartKit.tsx';
import { ChartCard, KpiCard, Button, SegmentedControl, Swatch, Icons } from '../ui.tsx';
import DataTable, { VarCell } from '../DataTable.tsx';
import Section from '../Section.tsx';
import { AvisoAlertas } from './AlertasRadar.tsx';
import { loadAlertas } from '../../utils/cestas.ts';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';

const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);
const perTon = (fob: number, kg: number) => (kg ? fob / (kg / 1000) : null);

interface Props { onOpenNcm: (ncm: string) => void }

const CestasView: React.FC<Props> = ({ onOpenNcm }) => {
  const [manifest, setManifest] = useState<CestaManifest | null>(null);
  const [entityId, setEntityId] = useState<string>(() => localStorageGet('cestas.entidade') || '');
  const [data, setData] = useState<CestaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flow, setFlow] = useState<Flow>('import');
  const [periodKey, setPeriodKey] = useState<string>('');
  const [prefix, setPrefix] = useState<string[]>([]);
  const [depth, setDepth] = useState<number>(2);
  const [countryKey, setCountryKey] = useState<'anterior' | 'atual'>('atual');
  const [countryMetric, setCountryMetric] = useState<'metricFOB' | 'metricKG'>('metricFOB');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [alertCount, setAlertCount] = useState<Record<string, number>>({});
  useEffect(() => {
    loadAlertas().then(f => {
      const c: Record<string, number> = {};
      f.alertas.filter(a => a.nivel !== 'atencao').forEach(a => a.entidades.forEach(e => { c[e.id] = (c[e.id] || 0) + 1; }));
      setAlertCount(c);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadCestaManifest().then(m => {
      setManifest(m);
      const first = m.entidades.find(e => e.arquivo);
      setEntityId(prev => (prev && m.entidades.some(e => e.id === prev) ? prev : first?.id ?? ''));
    }).catch(() => setError('Os dados das cestas ainda não foram gerados. A tarefa mensal cria esses arquivos; tente novamente mais tarde.'));
  }, []);

  const entity = manifest?.entidades.find(e => e.id === entityId);
  useEffect(() => {
    if (!entity) return;
    localStorageSet('cestas.entidade', entity.id);
    setPrefix([]); setOpen(new Set()); setData(null); setError(null);
    if (!entity.arquivo) return;
    setLoading(true);
    loadCesta(entity.arquivo)
      .then(d => { setData(d); setPeriodKey(periodOptions(d)[0]?.key ?? ''); })
      .catch(e => setError(`Não foi possível carregar a cesta: ${e.message}`))
      .finally(() => setLoading(false));
  }, [entity?.id]);

  const periods = useMemo(() => (data ? periodOptions(data) : []), [data]);
  const period = periods.find(p => p.key === periodKey) ?? periods[0];

  const sel = useMemo(() => (data ? selectNcms(data, prefix) : new Set<number>()), [data, prefix]);
  const vals = useMemo(() => (data && period ? valuesByNcm(data, flow, period) : null), [data, flow, period]);
  const total = useMemo(() => (vals ? sumOver(vals.cur, sel) : { fob: 0, kg: 0 }), [vals, sel]);
  const totalBase = useMemo(() => (vals ? sumOver(vals.base, sel) : { fob: 0, kg: 0 }), [vals, sel]);
  const options = useMemo(() => (data && vals ? nextLevelOptions(data, prefix, vals.cur) : []), [data, prefix, vals]);
  // Para o gráfico de composição: pula níveis com uma única opção (ex.: cesta toda numa só categoria)
  const composition = useMemo(() => {
    if (!data || !vals) return { prefix, items: [] as { name: string; fob: number }[] };
    let p = prefix;
    let items = nextLevelOptions(data, p, vals.cur);
    while (items.length === 1) {
      const deeper = nextLevelOptions(data, [...p, items[0].name], vals.cur);
      if (!deeper.length) break;
      p = [...p, items[0].name];
      items = deeper;
    }
    return { prefix: p, items };
  }, [data, prefix, vals]);
  const tree = useMemo(() => (data && vals ? buildTree(data, sel, vals.cur, vals.base, prefix.length, depth) : []), [data, sel, vals, prefix.length, depth]);
  const series = useMemo(() => (data ? annualSeries(data, flow, sel) : []), [data, flow, sel]);
  const monthly = useMemo(() => {
    if (!data) return [];
    return buildMonthlySeries(monthlyImports(data, sel), data.atualizacao.ano, data.atualizacao.mes);
  }, [data, sel]);
  const twelve = useMemo(() => buildTwelveMonthSummary(monthly), [monthly]);
  const countries = useMemo(() => (data ? countriesFor(data, countryKey, flow, sel) : []), [data, countryKey, flow, sel]);

  if (error) return <Notice tone="amber">{error}</Notice>;
  if (!manifest) return <Notice>Carregando cestas…</Notice>;

  const upd = manifest.atualizacao;
  const flowLabel = flow === 'import' ? 'Importações' : 'Exportações';
  const contextLabel = [entity?.rotulo, ...prefix].filter(Boolean).join(' › ');
  const yearRows = series.filter(r => r.yearNumeric >= 2010);
  const seriesTable = yearRows.filter(r => r.yearNumeric >= 2019).map((r, _i, arr) => {
    const base = r.kind === 'ytd' ? arr.find(x => x.kind === 'prevYtd') : r.kind === 'full' ? series.find(x => x.kind === 'full' && x.yearNumeric === r.yearNumeric - 1) : undefined;
    return {
      year: r.year, kind: r.kind, fob: r.fob, vfob: base ? pct(r.fob, base.fob) : null, kg: r.kg, vkg: base ? pct(r.kg, base.kg) : null,
      preco: perTon(r.fob, r.kg), vpreco: base ? pct(perTon(r.fob, r.kg) ?? 0, perTon(base.fob, base.kg) ?? 0) : null,
    };
  });
  const partialLegend = data && data.atualizacao.mes < 12 ? (
    <span>
      <Swatch color={flow === 'import' ? COLORS.impPrevYtd : COLORS.expPrevYtd} label={`${data.atualizacao.ano - 1} (jan–${getMonthNamePtBR(data.atualizacao.mes).slice(0, 3)})`} />
      <Swatch color={flow === 'import' ? COLORS.impYtd : COLORS.expYtd} label={`${data.atualizacao.ano} (jan–${getMonthNamePtBR(data.atualizacao.mes).slice(0, 3)})`} />
      tons claros = períodos parciais
    </span>
  ) : undefined;

  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const expandAll = () => {
    const keys = new Set<string>();
    const walk = (t: TreeNode[]) => t.forEach(n => { if (n.children.length) { keys.add(n.key); walk(n.children); } });
    walk(tree); setOpen(keys);
  };

  const exportExcel = () => {
    if (!data || !vals || !period) return;
    const flat: Record<string, any>[] = [];
    sel.forEach(i => {
      const n = data.ncms[i]; const c = vals.cur.get(i) ?? { fob: 0, kg: 0 }; const b = vals.base.get(i) ?? { fob: 0, kg: 0 };
      flat.push({
        'NCM': n.ncm, 'Descrição': n.descricao, 'Categoria': n.categoria,
        'Subcategoria (1)': n.subcategorias[0] ?? '', 'Subcategoria (2)': n.subcategorias[1] ?? '', 'Subcategoria (3)': n.subcategorias[2] ?? '', 'Subcategoria (4)': n.subcategorias[3] ?? '',
        [`${flowLabel} US$ FOB ${period.label}`]: c.fob, [`${flowLabel} kg ${period.label}`]: c.kg,
        [`${flowLabel} US$ FOB ${vals.baseLabel}`]: b.fob, [`${flowLabel} kg ${vals.baseLabel}`]: b.kg,
        'US$/t': perTon(c.fob, c.kg),
      });
    });
    flat.sort((a, b) => b[`${flowLabel} US$ FOB ${period.label}`] - a[`${flowLabel} US$ FOB ${period.label}`]);
    downloadWorkbook(`Cesta_${data.entidade}_${flow}_${period.key}.xlsx`, [
      { name: 'NCMs', rows: flat },
      { name: 'Série anual', rows: yearRows.map(r => ({ 'Ano': r.year, 'US$ FOB': r.fob, 'kg': r.kg, 'US$/t': perTon(r.fob, r.kg) })) },
      { name: 'Importações mensais', rows: monthly.map(p => ({ 'Mês': p.yearMonth, 'kg': p.metricKG, 'US$ FOB': p.metricFOB, 'Soma 12 meses (kg)': p.rollingKG })) },
      { name: 'Blocos 12 meses', rows: (twelve?.blocks ?? []).map(b => ({ 'Período': b.periodo, 'Início': b.dataInicio, 'Fim': b.dataFinal, 'Importação kg': b.importacaoKg })) },
      { name: `Países ${data.paises[countryKey].rotulo}`, rows: countries.map(c => ({ 'País': c.country, 'US$ FOB': c.metricFOB, 'kg': c.metricKG, 'Part. FOB (%)': c.representatividadeFOB, 'Part. kg (%)': c.representatividadeKG })) },
    ]);
  };

  return (
    <div>
      <AvisoAlertas entidade={entityId} rotulo={entity?.rotulo} />

      {/* Seleção de entidade */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">Cestas de NCMs por entidade</p>
            <h1 className="mt-1 text-xl font-semibold text-slate-900">{entity?.rotulo ?? 'Escolha uma entidade'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Dados Comex Stat até <b className="font-medium text-slate-700">{getMonthNamePtBR(upd.mes)} de {upd.ano}</b>
              {' · '}atualizados automaticamente em {new Date(manifest.geradoEm).toLocaleDateString('pt-BR')}
              {entity ? ` · ${entity.ncms} NCMs na cesta` : ''}
            </p>
          </div>
          {data && <Button onClick={exportExcel} icon={Icons.excel}>Excel</Button>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {manifest.entidades.map(e => (
            <button
              key={e.id}
              onClick={() => setEntityId(e.id)}
              disabled={!e.arquivo}
              title={!e.arquivo ? 'Sem NCMs na planilha CGIM/DINTE' : `${e.ncms} NCMs`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${e.id === entityId ? 'bg-brand-500 text-white shadow-sm' : e.arquivo ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'cursor-not-allowed bg-slate-50 text-slate-300'}`}
            >
              {e.rotulo}
              {alertCount[e.id] ? <span className={`ml-1.5 rounded-full px-1.5 text-[11px] font-bold ${e.id === entityId ? 'bg-white text-red-600' : 'bg-red-500 text-white'}`} title="Alertas altos e médios">{alertCount[e.id]}</span> : null}
            </button>
          ))}
        </div>
      </section>

      {entity && !entity.arquivo && <Notice tone="amber">A aba {entity.rotulo} está vazia na planilha CGIM/DINTE. Inclua as NCMs dessa entidade na planilha para a cesta aparecer.</Notice>}
      {loading && <Notice>Carregando a cesta {entity?.rotulo}…</Notice>}

      {data && period && vals && (
        <>
          {/* Filtros */}
          <section className="sticky top-[60px] z-20 mb-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl value={flow} onChange={setFlow} options={[{ value: 'import', label: 'Importação' }, { value: 'export', label: 'Exportação' }]} />
              <select value={period.key} onChange={e => setPeriodKey(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-brand-500 focus:outline-none">
                {periods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <span className="text-xs text-slate-500">comparado com {vals.baseLabel}</span>
              <nav className="ml-auto flex flex-wrap items-center gap-1 text-sm">
                <button onClick={() => setPrefix([])} className={`rounded px-1.5 py-0.5 ${prefix.length ? 'text-brand-600 hover:underline' : 'font-semibold text-slate-900'}`}>Toda a cesta</button>
                {prefix.map((p, i) => (
                  <React.Fragment key={i}>
                    <span className="text-slate-300">›</span>
                    <button onClick={() => setPrefix(prefix.slice(0, i + 1))} className={`max-w-[16rem] truncate rounded px-1.5 py-0.5 ${i === prefix.length - 1 ? 'font-semibold text-slate-900' : 'text-brand-600 hover:underline'}`}>{p}</button>
                  </React.Fragment>
                ))}
              </nav>
            </div>
            {options.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="mr-1 self-center text-xs font-medium text-slate-500">{prefix.length === 0 ? 'Categoria' : `Subcategoria (${prefix.length})`}:</span>
                {options.slice(0, 24).map(o => (
                  <button key={o.name} onClick={() => setPrefix([...prefix, o.name])} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-brand-50 hover:text-brand-700">
                    {o.name}{o.fob > 0 && <span className="ml-1.5 text-slate-400">US$ {formatCompactPtBR(o.fob)}</span>}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={`${flowLabel} · ${period.label}`} value={formatCompactPtBR(total.fob)} unit="US$ FOB" delta={pct(total.fob, totalBase.fob)} deltaLabel={`vs ${vals.baseLabel}`} />
            <KpiCard label={`${flowLabel} (kg) · ${period.label}`} value={formatCompactPtBR(total.kg)} unit="kg" delta={pct(total.kg, totalBase.kg)} deltaLabel={`vs ${vals.baseLabel}`} />
            <KpiCard label="Preço médio" value={formatDecimalPtBR(perTon(total.fob, total.kg))} unit="US$/t" delta={pct(perTon(total.fob, total.kg) ?? 0, perTon(totalBase.fob, totalBase.kg) ?? 0)} deltaLabel={`vs ${vals.baseLabel}`} />
            <KpiCard label="Importações · últimos 12 meses" value={twelve ? formatCompactPtBR(twelve.blocks[0].importacaoKg) : '–'} unit="kg" delta={twelve?.comparisons[0].resultado != null ? twelve.comparisons[0].resultado * 100 : null} deltaLabel="vs 12 meses anteriores" />
          </div>

          <Section title={`Evolução anual · ${contextLabel}`} description={`${flowLabel} da seleção desde 2010.`}>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title={`${flowLabel} (US$ FOB)`} legend={partialLegend}>
                <AnnualBarChart data={yearRows.map(r => ({ name: r.year, value: r.fob, kind: r.kind }))} flow={flow} unitLabel={`${flowLabel} (US$ FOB)`} />
              </ChartCard>
              <ChartCard title={`${flowLabel} (kg)`} legend={partialLegend}>
                <AnnualBarChart data={yearRows.map(r => ({ name: r.year, value: r.kg, kind: r.kind }))} flow={flow} unitLabel={`${flowLabel} (kg)`} />
              </ChartCard>
              <ChartCard title="Preço médio (US$ FOB/t)">
                <PriceTonChart data={data} sel={sel} />
              </ChartCard>
              <ChartCard title={`Composição · ${period.label} (US$ FOB)`} subtitle={composition.items.length ? (composition.prefix.length === 0 ? 'Por categoria' : `Por subcategoria (${composition.prefix.length})${composition.prefix.length > prefix.length ? ` de ${composition.prefix.at(-1)}` : ''} · clique numa barra para filtrar`) : 'Por NCM'}>
                <CompositionChart
                  items={composition.items.length ? composition.items : [...sel].map(i => ({ name: formatNcmCode(data.ncms[i].ncm), fob: vals.cur.get(i)?.fob ?? 0 })).sort((a, b) => b.fob - a.fob)}
                  total={total.fob} flow={flow}
                  onPick={composition.items.length ? (name => setPrefix([...composition.prefix, name])) : undefined}
                />
              </ChartCard>
            </div>
            <DataTable
              title="Quadro resumo anual"
              data={seriesTable}
              columns={[{ key: 'year', header: 'Ano', LTR: true }, { key: 'fob', header: 'US$ FOB' }, { key: 'vfob', header: 'Var. %' }, { key: 'kg', header: 'kg' }, { key: 'vkg', header: 'Var. %' }, { key: 'preco', header: 'Preço médio (US$/t)' }, { key: 'vpreco', header: 'Var. %' }]}
              formatters={{ fob: formatIntegerPtBR, kg: formatIntegerPtBR, preco: formatDecimalPtBR, vfob: v => <VarCell value={v} />, vkg: v => <VarCell value={v} />, vpreco: v => <VarCell value={v} /> }}
              source="Fonte: Comex Stat/MDIC. Elaboração própria."
            />
          </Section>

          <Section title="Tabela hierárquica" description="Clique numa linha para abrir os níveis; clique no código da NCM para abrir a ficha individual."
            actions={<>
              <SegmentedControl value={String(depth)} onChange={v => { setDepth(Number(v)); setOpen(new Set()); }} options={[{ value: '1', label: '1 nível' }, { value: '2', label: '2 níveis' }, { value: '99', label: 'Todos' }]} />
              <Button variant="ghost" onClick={expandAll}>Expandir tudo</Button>
              <Button variant="ghost" onClick={() => setOpen(new Set())}>Recolher</Button>
            </>}>
            <HierarchyTable nodes={tree} open={open} toggle={toggle} total={total.fob} period={period.label} base={vals.baseLabel} onOpenNcm={onOpenNcm} />
          </Section>

          <Section title="Importações acumuladas em 12 meses" description={`Soma móvel de 12 meses (kg) da seleção: ${contextLabel}.`}>
            <div className="grid gap-4 lg:grid-cols-3">
              <ChartCard className="lg:col-span-2" title="Importações acumuladas nos últimos 12 meses (kg)">
                <RollingSumChart data={monthly.filter(p => p.rollingKG !== null).map(p => ({ name: p.yearMonth, value: p.rollingKG as number }))} />
              </ChartCard>
              <div className="space-y-4">
                <DataTable title="Soma por período de 12 meses" data={twelve?.blocks ?? []} compact stickyFirstColumn={false}
                  columns={[{ key: 'periodo', header: 'Período', LTR: true }, { key: 'dataInicio', header: 'Início', LTR: true }, { key: 'dataFinal', header: 'Fim', LTR: true }, { key: 'importacaoKg', header: 'Importação (kg)' }]}
                  formatters={{ importacaoKg: formatIntegerPtBR }} />
                <DataTable title="Comparações" data={twelve?.comparisons ?? []} compact stickyFirstColumn={false}
                  columns={[{ key: 'comparacao', header: 'Comparação', LTR: true }, { key: 'resultado', header: 'Resultado' }]}
                  formatters={{ resultado: (v: number | null) => <VarCell value={v === null ? null : v * 100} /> }} />
              </div>
            </div>
          </Section>

          <Section title={flow === 'import' ? 'Origem das importações' : 'Destino das exportações'} description={`Seleção: ${contextLabel}. Cores mais escuras = maior participação.`}
            actions={<>
              <SegmentedControl value={countryKey} onChange={setCountryKey} options={[{ value: 'anterior', label: data.paises.anterior.rotulo }, { value: 'atual', label: data.paises.atual.rotulo }]} />
              <SegmentedControl value={countryMetric} onChange={setCountryMetric} options={[{ value: 'metricFOB', label: 'US$ FOB' }, { value: 'metricKG', label: 'kg' }]} />
            </>}>
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title={`${flow === 'import' ? 'Origem' : 'Destino'} · ${data.paises[countryKey].rotulo} (${countryMetric === 'metricFOB' ? 'US$ FOB' : 'kg'})`}>
                <CountryTreemap data={countries} flow={flow} metric={countryMetric} />
              </ChartCard>
              <DataTable title={`${flowLabel} por país · ${data.paises[countryKey].rotulo}`} data={countries} compact
                columns={[{ key: 'country', header: 'País', LTR: true }, { key: 'metricFOB', header: 'US$ FOB' }, { key: 'representatividadeFOB', header: 'Part. FOB' }, { key: 'metricKG', header: 'kg' }, { key: 'representatividadeKG', header: 'Part. kg' }]}
                formatters={{ metricFOB: formatIntegerPtBR, metricKG: formatIntegerPtBR, representatividadeFOB: (v: number) => `${formatDecimalPtBR(v)}%`, representatividadeKG: (v: number) => `${formatDecimalPtBR(v)}%` }}
                source="Fonte: Comex Stat/MDIC. Elaboração própria." />
            </div>
          </Section>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
function Notice({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'amber' }) {
  return <div className={`mb-4 rounded-xl border p-4 text-sm ${tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}>{children}</div>;
}

function localStorageGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } }

function PriceTonChart({ data, sel }: { data: CestaData; sel: Set<number> }) {
  const imp = annualSeries(data, 'import', sel), exp = annualSeries(data, 'export', sel);
  const rows = imp.filter(r => r.yearNumeric >= 2010).map(r => {
    const e = exp.find(x => x.year === r.year);
    return { name: r.year, imp: perTon(r.fob, r.kg), exp: e ? perTon(e.fob, e.kg) : null };
  });
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 58 }}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.axis }} angle={-40} textAnchor="end" interval={0} tickLine={false} />
          <YAxis tickFormatter={v => formatIntegerPtBR(v)} tick={{ fontSize: 11, fill: COLORS.axis }} tickLine={false} axisLine={false} width={64} />
          <Tooltip formatter={(v: any, n: any) => [v == null ? '–' : `US$ ${formatDecimalPtBR(v)}/t`, n]} />
          <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
          <Line type="linear" dataKey="imp" name="Importação" stroke={COLORS.imp} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line type="linear" dataKey="exp" name="Exportação" stroke={COLORS.exp} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompositionChart({ items, total, flow, onPick }: { items: { name: string; fob: number }[]; total: number; flow: Flow; onPick?: (name: string) => void }) {
  const top = items.filter(i => i.fob > 0).slice(0, 10);
  const rest = items.slice(10).reduce((s, i) => s + i.fob, 0);
  const rows = [...top, ...(rest > 0 ? [{ name: 'Demais', fob: rest }] : [])].map(r => ({ ...r, share: total ? (r.fob / total) * 100 : 0 }));
  if (!rows.length) return <p className="py-16 text-center text-sm text-slate-500">Sem comércio no período.</p>;
  return (
    <div style={{ width: '100%', height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11, fill: '#334155' }} tickLine={false} axisLine={false}
            tickFormatter={(v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)} />
          <Tooltip formatter={(v: any, _n: any, p: any) => [`US$ ${formatIntegerPtBR(v)} (${formatDecimalPtBR(p.payload.share)}%)`, 'FOB']} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Bar dataKey="fob" fill={flow === 'import' ? COLORS.imp : COLORS.exp} radius={[0, 4, 4, 0]} barSize={16}
            label={{ position: 'right', fontSize: 10, fill: '#475569', formatter: (v: number) => (total ? `${formatDecimalPtBR((v / total) * 100)}%` : '') }}
            onClick={(d: any) => onPick && d?.name !== 'Demais' && onPick(d.name)} style={{ cursor: onPick ? 'pointer' : 'default' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HierarchyTable({ nodes, open, toggle, total, period, base, onOpenNcm }: {
  nodes: TreeNode[]; open: Set<string>; toggle: (k: string) => void; total: number; period: string; base: string; onOpenNcm: (n: string) => void;
}) {
  const rows: { node: TreeNode; depth: number }[] = [];
  const walk = (list: TreeNode[], d: number) => list.forEach(n => { rows.push({ node: n, depth: d }); if (open.has(n.key)) walk(n.children, d + 1); });
  walk(nodes, 0);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <div className="max-h-[640px] overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Classificação / NCM</th>
              <th className="px-3 py-2 text-right">US$ FOB {period}</th>
              <th className="px-3 py-2 text-right">Var. % vs {base}</th>
              <th className="px-3 py-2 text-right">kg</th>
              <th className="px-3 py-2 text-right">Var. %</th>
              <th className="px-3 py-2 text-right">US$/t</th>
              <th className="px-3 py-2 text-right">Part.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node: n, depth }) => (
              <tr key={n.key} className={`border-b border-slate-100 ${n.isNcm ? 'bg-white' : depth === 0 ? 'bg-slate-50/70 font-medium' : 'bg-white'} hover:bg-brand-50/60`}>
                <td className="px-3 py-2" style={{ paddingLeft: 12 + depth * 18 }}>
                  {n.isNcm ? (
                    <span className="flex items-baseline gap-2">
                      <button onClick={() => onOpenNcm(n.ncm!)} className="tabular font-medium text-brand-600 hover:underline" title="Abrir a ficha individual desta NCM">{formatNcmCode(n.ncm!)}</button>
                      <span className="max-w-[28rem] truncate text-xs text-slate-500" title={n.descricao}>{n.descricao}</span>
                    </span>
                  ) : (
                    <button onClick={() => toggle(n.key)} className="flex items-center gap-1.5 text-left text-slate-800">
                      <span className={`inline-block text-slate-400 transition-transform ${open.has(n.key) ? 'rotate-90' : ''}`}>▸</span>
                      {n.name}
                      <span className="text-xs font-normal text-slate-400">({countNcms(n)})</span>
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular text-slate-700">{formatIntegerPtBR(n.fob)}</td>
                <td className="px-3 py-2 text-right tabular"><VarCell value={pct(n.fob, n.baseFob)} /></td>
                <td className="px-3 py-2 text-right tabular text-slate-700">{formatIntegerPtBR(n.kg)}</td>
                <td className="px-3 py-2 text-right tabular"><VarCell value={pct(n.kg, n.baseKg)} /></td>
                <td className="px-3 py-2 text-right tabular text-slate-700">{formatDecimalPtBR(perTon(n.fob, n.kg))}</td>
                <td className="px-3 py-2 text-right tabular text-slate-500">{total ? `${formatDecimalPtBR((n.fob / total) * 100)}%` : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">Fonte: Comex Stat/MDIC. Classificação: planilha CGIM/DINTE.</p>
    </div>
  );
}

function countNcms(n: TreeNode): number {
  return n.isNcm ? 1 : n.children.reduce((s, c) => s + countNcms(c), 0);
}

export default CestasView;
