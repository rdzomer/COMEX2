/**
 * Gera public/cestas/dicionario.json a partir da planilha CGIM/DINTE.
 * Usa SÓ as colunas de classificação (NCM, descrição, categoria e subcategorias):
 * nenhum dado de contato vai para o site.
 *
 * Uso: node scripts/build-dicionario.mjs [caminho-da-planilha.xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';

const SRC_DIR = 'dados-fonte';
const OUT = 'public/cestas/dicionario.json';
const IGNORE = new Set(['NCMS-CGIM-DINTE']);

function findXlsx() {
  if (process.argv[2]) return process.argv[2];
  if (!fs.existsSync(SRC_DIR)) return null;
  const files = fs.readdirSync(SRC_DIR).filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
  return files.length ? path.join(SRC_DIR, files.sort().at(-1)) : null;
}

const clean = v => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s === '0' || s === '#N/A' || s.toLowerCase() === 'nan' ? '' : s;
};
const normNcm = v => {
  const d = String(v ?? '').replace(/\D/g, '');
  return d ? d.padStart(8, '0').slice(0, 8) : '';
};
const entityId = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]/g, '').toUpperCase();

const file = findXlsx();
if (!file) {
  console.log('Nenhuma planilha em dados-fonte/; dicionário mantido.');
  process.exit(0);
}
const buf = fs.readFileSync(file);
const wb = XLSX.read(buf, { type: 'buffer' });

const entities = [];
for (const sheetName of wb.SheetNames) {
  const label = sheetName.normalize('NFC').trim();
  if (IGNORE.has(label.toUpperCase()) || label.startsWith('~$')) continue;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false });
  if (!rows.length) continue;
  const header = rows[0].map(h => clean(h).toLowerCase());
  const col = (...names) => header.findIndex(h => names.some(n => h === n.toLowerCase()));
  const iNcm = Math.max(0, col('NCM'));
  const iDesc = col('NO_NCM_POR');
  const iCat = col('Categoria');
  const iSub = [1, 2, 3, 4].map(n => col(`Subcategoria (${n})`));

  const seen = new Set();
  const ncms = [];
  for (const r of rows.slice(1)) {
    const ncm = normNcm(r[iNcm]);
    if (!ncm || ncm.length !== 8 || seen.has(ncm)) continue;
    seen.add(ncm);
    const subs = iSub.map(i => (i >= 0 ? clean(r[i]) : ''));
    // remove níveis vazios no fim e repetições consecutivas
    const path = subs.filter((s, k) => s && s !== subs[k - 1]);
    ncms.push({
      ncm,
      descricao: iDesc >= 0 ? clean(r[iDesc]) : '',
      categoria: (iCat >= 0 ? clean(r[iCat]) : '') || 'Sem categoria',
      subcategorias: path,
    });
  }
  entities.push({ id: entityId(label), label, ncms });
}
entities.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

const body = { fonte: path.basename(file), entidades: entities };
const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ geradoEm: new Date().toISOString(), hash, ...body }, null, 1));
console.log(`Dicionário: ${entities.length} entidades, ${entities.reduce((s, e) => s + e.ncms.length, 0)} NCMs (hash ${hash}) a partir de ${file}`);
