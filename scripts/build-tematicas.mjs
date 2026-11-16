/**
 * Gera public/cestas/dicionario-tematicas.json: as cestas TEMÁTICAS (hoje, "Minerais críticos e estratégicos").
 *
 * Entrada: dados-fonte/minerais-criticos.json (classes → minerais → etapas da cadeia → prefixos de NCM).
 * Cada prefixo (2 a 8 dígitos) é expandido para os códigos de 8 dígitos da tabela oficial de NCM do Comex Stat
 * (inclui códigos antigos, para que as séries históricas não tenham buracos). Cada NCM entra uma única vez:
 * se dois minerais pegarem a mesma NCM, vale o primeiro da lista (o aviso aparece no log).
 *
 * Uso: node scripts/build-tematicas.mjs [caminho-da-tabela-ncm.json]
 *   (sem argumento, baixa a tabela de https://api-comexstat.mdic.gov.br/tables/ncm; se a API falhar, mantém o dicionário)
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const SRC = 'dados-fonte/minerais-criticos.json';
const OUT = 'public/cestas/dicionario-tematicas.json';
const API = 'https://api-comexstat.mdic.gov.br';

if (!fs.existsSync(SRC)) {
  console.log(`${SRC} não existe; dicionário temático mantido.`);
  process.exit(0);
}
const def = JSON.parse(fs.readFileSync(SRC, 'utf8'));

async function loadNcmTable() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).data.list;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${API}/tables/ncm`, { signal: AbortSignal.timeout(120_000) });
      if (res.ok) return (await res.json()).data.list;
      console.log(`  tabela de NCM: HTTP ${res.status}`);
    } catch (e) {
      console.log(`  tabela de NCM: ${e}`);
    }
    await new Promise(r => setTimeout(r, 30_000 * (attempt + 1)));
  }
  return null;
}

const table = await loadNcmTable();
if (!table) {
  console.log('Não foi possível baixar a tabela de NCM; dicionário temático mantido como estava.');
  process.exit(0);
}
const descOf = new Map();
for (const r of table) {
  const code = String(r.coNcm).padStart(8, '0');
  // Quando o mesmo código aparece mais de uma vez, fica a descrição mais longa
  if (!descOf.has(code) || String(r.noNCM).length > descOf.get(code).length) descOf.set(code, String(r.noNCM).replace(/\s+/g, ' ').trim());
}
const allCodes = [...descOf.keys()].sort();

const ncms = [];
const donoDe = new Map();   // ncm → "Mineral › etapa"
const avisos = [];
const detalhes = {};   // mineral → critério e o que ficou de fora (texto para a tela de metodologia)
const cestaId = def.id;

for (const classe of def.classes) {
  for (const mineral of classe.minerais) {
    const excluir = new Set((mineral.excluir || []).map(String));
    let total = 0;
    for (const grupo of mineral.grupos) {
      for (const prefixo of grupo.ncms) {
        const p = String(prefixo).replace(/\D/g, '');
        const achados = allCodes.filter(c => c.startsWith(p) && !excluir.has(c));
        if (!achados.length) { avisos.push(`Sem NCM na tabela para o prefixo ${prefixo} (${mineral.nome} › ${grupo.etapa})`); continue; }
        for (const c of achados) {
          if (donoDe.has(c)) {
            if (donoDe.get(c) !== `${mineral.nome} › ${grupo.etapa}`) avisos.push(`NCM ${c} já pertence a "${donoDe.get(c)}"; ignorada em "${mineral.nome} › ${grupo.etapa}"`);
            continue;
          }
          donoDe.set(c, `${mineral.nome} › ${grupo.etapa}`);
          ncms.push({ ncm: c, descricao: descOf.get(c), categoria: classe.nome, subcategorias: [mineral.nome, grupo.etapa] });
          total++;
        }
      }
    }
    detalhes[mineral.nome] = { classe: classe.id, criterio: mineral.criterio || '', fora: mineral.fora || [] };
    console.log(`${classe.id.padEnd(3)} ${mineral.nome.padEnd(18)} ${String(total).padStart(3)} NCMs`);
  }
}
ncms.sort((a, b) => a.ncm.localeCompare(b.ncm));

const cesta = {
  id: def.id,
  label: def.rotulo,
  tipo: def.tipo || 'tematica',
  descricao: def.descricao,
  fontes: def.fontes || [],
  metodologia: def.metodologia || [],
  classes: def.classes.map(c => ({ id: c.id, nome: c.nome, minerais: c.minerais.map(m => m.nome) })),
  detalhes,
  ncms,
};
// O hash só muda quando muda QUAIS NCMs entram e em que mineral/etapa (é o que exige reconsultar a API);
// mudar só textos (critérios, notas, fontes) não força a atualização dos dados.
const hash = crypto.createHash('sha256').update(JSON.stringify(ncms.map(n => [n.ncm, n.categoria, n.subcategorias]))).digest('hex').slice(0, 16);

fs.mkdirSync('public/cestas', { recursive: true });
const anterior = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
if (anterior?.hash === hash && JSON.stringify(anterior.cestas) === JSON.stringify([cesta])) {
  // Nada mudou: não regrava o arquivo, para a tarefa mensal não criar um commit à toa
  console.log(`\nDicionário temático já está atualizado (${ncms.length} NCMs, hash ${hash}).`);
} else {
  fs.writeFileSync(OUT, JSON.stringify({ geradoEm: new Date().toISOString(), hash, fonte: SRC, cestas: [cesta] }, null, 1));
  console.log(`\n${ncms.length} NCMs em ${def.classes.reduce((s, c) => s + c.minerais.length, 0)} minerais → ${OUT} (hash ${hash})`);
}
if (avisos.length) console.log('\nAvisos:\n- ' + avisos.join('\n- '));
