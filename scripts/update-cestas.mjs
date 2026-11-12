/**
 * Atualiza os dados das cestas de NCMs por entidade (public/cestas/*.json) consultando a API Comex Stat
 * DEVAGAR: uma requisição por vez, com pausa entre elas e espera longa quando a API recusa (HTTP 429).
 *
 * Roda pelo GitHub Actions (.github/workflows/atualizar-cestas.yml) todo dia 7 e pode ser executado
 * manualmente. Se a API ainda não publicou mês novo e o dicionário não mudou, não faz nada.
 *
 * Variáveis: FORCE=1 (atualiza mesmo sem mês novo), DELAY_MS (pausa entre chamadas, padrão 8000),
 *            ONLY=IABR,ABAL (limita a algumas entidades, para teste)
 */
import fs from 'node:fs';

const API = 'https://api-comexstat.mdic.gov.br';
const OUT_DIR = 'public/cestas';
const DELAY_MS = Number(process.env.DELAY_MS || 8000);
const BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 300_000];
const CHUNK = 100;
const FIRST_YEAR = 2010;
const MONTHLY_FIRST_YEAR = 2019;
const FORCE = process.env.FORCE === '1' || process.env.FORCE === 'true';
const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad2 = n => String(n).padStart(2, '0');
const num = v => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};
let calls = 0;
let lastCall = 0;

async function request(url, options, label) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    calls++;
    let status = 0;
    let text = '';
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(120_000) });
      status = res.status;
      text = await res.text();
      if (res.ok) return JSON.parse(text);
    } catch (e) {
      text = String(e);
    }
    const retryable = status === 0 || status === 429 || status >= 500;
    if (!retryable || attempt >= BACKOFF_MS.length) {
      throw new Error(`Falha em ${label}: HTTP ${status} ${text.slice(0, 200)}`);
    }
    console.log(`  … ${label}: HTTP ${status || 'erro de rede'}; aguardando ${BACKOFF_MS[attempt] / 1000}s (tentativa ${attempt + 1})`);
    await sleep(BACKOFF_MS[attempt]);
  }
}

async function general(body, label) {
  const json = await request(`${API}/general`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, label);
  return json?.data?.list || [];
}

const ncmOf = row => {
  const d = String(row.coNcm ?? row.ncm ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.padStart(8, '0') : '';
};
const monthOf = row => Number(row.monthNumber ?? row.coMes ?? row.month ?? 0);

// ---------------------------------------------------------------------------
const dict = JSON.parse(fs.readFileSync(`${OUT_DIR}/dicionario.json`, 'utf8'));
const manifestPath = `${OUT_DIR}/manifest.json`;
const oldManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;

const upd = (await request(`${API}/general/dates/updated`, {}, 'data de atualização')).data;
const Y = Number(upd.year), M = Number(upd.monthNumber), MM = pad2(M);
console.log(`API Comex Stat atualizada até ${MM}/${Y} (${upd.updated}).`);

if (!FORCE && !ONLY.length && oldManifest?.atualizacao?.ano === Y && oldManifest?.atualizacao?.mes === M && oldManifest?.dicionarioHash === dict.hash) {
  console.log('Dados já estão atualizados e o dicionário não mudou. Nada a fazer.');
  process.exit(0);
}

const entities = dict.entidades.filter(e => e.ncms.length && (!ONLY.length || ONLY.includes(e.id)));
const allNcms = [...new Set(entities.flatMap(e => e.ncms.map(n => n.ncm)))].sort();
const chunks = [];
for (let i = 0; i < allNcms.length; i += CHUNK) chunks.push(allNcms.slice(i, i + CHUNK));
console.log(`${entities.length} entidades, ${allNcms.length} NCMs distintas, ${chunks.length} lotes.`);

// Acumuladores por NCM
const annual = { import: [], export: [] };     // [ncm, ano, fob, kg]
const prevYtd = { import: [], export: [] };    // [ncm, fob, kg]
const monthly = { import: [] };                // [ncm, yyyymm, fob, kg]
const countries = {
  anterior: { rotulo: String(Y - 1), periodo: { from: `${Y - 1}-01`, to: `${Y - 1}-12` }, import: [], export: [] },
  atual: { rotulo: M < 12 ? `${Y} (até ${MM})` : String(Y), periodo: { from: `${Y}-01`, to: `${Y}-${MM}` }, import: [], export: [] },
};

const metrics = ['metricFOB', 'metricKG'];
for (const [ci, values] of chunks.entries()) {
  const filters = [{ filter: 'ncm', values }];
  const tag = `lote ${ci + 1}/${chunks.length}`;
  console.log(`▶ ${tag} (${values.length} NCMs)`);
  for (const flow of ['import', 'export']) {
    // A API aplica o intervalo de meses a cada ano: até dezembro = anos completos (+ ano corrente até o último mês)
    for (const r of await general({ flow, monthDetail: false, period: { from: `${FIRST_YEAR}-01`, to: `${Y}-12` }, filters, details: ['ncm'], metrics }, `${tag} anual ${flow}`)) {
      const n = ncmOf(r); if (n) annual[flow].push([n, Number(r.year), num(r.metricFOB), num(r.metricKG)]);
    }
    if (M < 12) {
      for (const r of await general({ flow, monthDetail: false, period: { from: `${Y - 1}-01`, to: `${Y - 1}-${MM}` }, filters, details: ['ncm'], metrics }, `${tag} ${Y - 1} até ${MM} ${flow}`)) {
        const n = ncmOf(r); if (n) prevYtd[flow].push([n, num(r.metricFOB), num(r.metricKG)]);
      }
    }
    for (const key of ['anterior', 'atual']) {
      for (const r of await general({ flow, monthDetail: false, period: countries[key].periodo, filters, details: ['ncm', 'country'], metrics }, `${tag} países ${key} ${flow}`)) {
        const n = ncmOf(r); if (n) countries[key][flow].push([n, r.country || 'Desconhecido', num(r.metricFOB), num(r.metricKG)]);
      }
    }
  }
  for (let y = MONTHLY_FIRST_YEAR; y <= Y; y++) {
    const to = y === Y ? `${y}-${MM}` : `${y}-12`;
    for (const r of await general({ flow: 'import', monthDetail: true, period: { from: `${y}-01`, to }, filters, details: ['ncm'], metrics }, `${tag} mensal ${y}`)) {
      const n = ncmOf(r), m = monthOf(r);
      if (n && m >= 1 && m <= 12) monthly.import.push([n, Number(r.year) * 100 + m, num(r.metricFOB), num(r.metricKG)]);
    }
  }
}

// ---------------------------------------------------------------------------
// Grava um arquivo por entidade (índices compactos para reduzir o tamanho)
fs.mkdirSync(OUT_DIR, { recursive: true });
const geradoEm = new Date().toISOString();
const manifestEntities = [];
for (const e of entities) {
  const idx = new Map(e.ncms.map((n, i) => [n.ncm, i]));
  const pick = (rows, map) => rows.filter(r => idx.has(r[0])).map(map);
  const paisNomes = [];
  const pIdx = name => { let i = paisNomes.indexOf(name); if (i < 0) { i = paisNomes.length; paisNomes.push(name); } return i; };
  const ctry = key => ({
    rotulo: countries[key].rotulo,
    import: pick(countries[key].import, r => [idx.get(r[0]), pIdx(r[1]), r[2], r[3]]),
    export: pick(countries[key].export, r => [idx.get(r[0]), pIdx(r[1]), r[2], r[3]]),
  });
  const data = {
    entidade: e.id,
    rotulo: e.label,
    geradoEm,
    atualizacao: { ano: Y, mes: M, data: upd.updated },
    ncms: e.ncms,
    anual: {
      import: pick(annual.import, r => [idx.get(r[0]), r[1], r[2], r[3]]),
      export: pick(annual.export, r => [idx.get(r[0]), r[1], r[2], r[3]]),
    },
    anoAnteriorAteMes: M < 12 ? {
      import: pick(prevYtd.import, r => [idx.get(r[0]), r[1], r[2]]),
      export: pick(prevYtd.export, r => [idx.get(r[0]), r[1], r[2]]),
    } : null,
    mensal: { import: pick(monthly.import, r => [idx.get(r[0]), r[1], r[2], r[3]]) },
    paises: { anterior: ctry('anterior'), atual: ctry('atual') },
    paisNomes,
  };
  const file = `${e.id}.json`;
  fs.writeFileSync(`${OUT_DIR}/${file}`, JSON.stringify(data));
  manifestEntities.push({ id: e.id, rotulo: e.label, ncms: e.ncms.length, arquivo: file });
  console.log(`✓ ${e.label}: ${data.anual.import.length + data.anual.export.length} linhas anuais`);
}

// Entidades sem NCMs na planilha também aparecem (com aviso no app)
for (const e of dict.entidades.filter(x => !x.ncms.length)) manifestEntities.push({ id: e.id, rotulo: e.label, ncms: 0, arquivo: null });
if (ONLY.length && oldManifest) {
  for (const old of oldManifest.entidades) if (!manifestEntities.some(m => m.id === old.id)) manifestEntities.push(old);
}
manifestEntities.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

fs.writeFileSync(manifestPath, JSON.stringify({
  geradoEm,
  atualizacao: { ano: Y, mes: M, data: upd.updated },
  dicionarioHash: dict.hash,
  dicionarioFonte: dict.fonte,
  chamadasApi: calls,
  entidades: manifestEntities,
}, null, 1));
console.log(`Concluído: ${calls} chamadas à API.`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `atualizado=true\nperiodo=${MM}/${Y}\n`);
