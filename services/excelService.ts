import * as XLSX from 'xlsx';
import { CgimNcmInfo, EntityContactInfo, NfeData } from '../types.ts';
import { normalizeNcm } from '../utils/formatting.ts';

/** Abas de entidades lidas pelo notebook (célula 38). */
export const ENTITY_SHEETS = ["ABAL", "ABIVIDRO", "IABR", "ABITAM", "SICETEL", "IBÁ", "ABCOBRE", "IBRAM", "SINDICEL", "ABRAFE", "ABIROCHAS", "ABIMCI", "SINDIFER"];

const norm = (s: string) => s.normalize('NFC').trim().toUpperCase();

function findSheet(workbook: XLSX.WorkBook, name: string): XLSX.WorkSheet | undefined {
  const real = workbook.SheetNames.find(n => norm(n) === norm(name));
  return real ? workbook.Sheets[real] : undefined;
}

/**
 * Planilha 20241011_NCMs-CGIM-DINTE.xlsx.
 * - Aba "NCMs-CGIM-DINTE": dados de competência por NCM.
 * - Abas de entidades: coluna A (NCM) e colunas T:AE (contatos), com os cabeçalhos da própria planilha.
 */
export async function parseCgimDinteExcelForFiltering(file: File): Promise<{
  cgimData: CgimNcmInfo[];
  entityData: EntityContactInfo[];
  entityColumns: string[];
  missingSheets: string[];
}> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });

  const cgimData: CgimNcmInfo[] = [];
  const ncmSheet = findSheet(workbook, "NCMs-CGIM-DINTE");
  if (ncmSheet) {
    XLSX.utils.sheet_to_json<any>(ncmSheet, { defval: '' }).forEach(row => {
      cgimData.push({
        'NCM': normalizeNcm(row['NCM']),
        'Departamento Responsável': row['Departamento Responsável'],
        'Coordenação-Geral Responsável': row['Coordenação-Geral Responsável'],
        'Agrupamento': row['Agrupamento'],
        'Setores': row['Setores'],
        'Subsetores': row['Subsetores'],
        'Produtos': row['Produtos'],
      });
    });
  }

  const entityData: EntityContactInfo[] = [];
  const entityColumns: string[] = [];
  const missingSheets: string[] = [];
  const FIRST_COL = 19; // T
  const LAST_COL = 30;  // AE

  for (const sheetName of ENTITY_SHEETS) {
    const sheet = findSheet(workbook, sheetName);
    if (!sheet) { missingSheets.push(sheetName); continue; }
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
    if (rows.length === 0) continue;
    const header = rows[0].map((h: any) => String(h ?? '').trim());
    for (let c = FIRST_COL; c <= LAST_COL; c++) {
      const h = header[c] || `Coluna ${XLSX.utils.encode_col(c)}`;
      if (!entityColumns.includes(h)) entityColumns.push(h);
    }
    rows.slice(1).forEach(r => {
      const ncm = normalizeNcm(r[0]);
      if (!ncm) return;
      const rec: EntityContactInfo = { 'Aba': sheetName, 'NCM': ncm };
      for (let c = FIRST_COL; c <= LAST_COL; c++) {
        const h = header[c] || `Coluna ${XLSX.utils.encode_col(c)}`;
        rec[h] = String(r[c] ?? '').trim();
      }
      entityData.push(rec);
    });
  }
  return { cgimData, entityData, entityColumns, missingSheets };
}

/** Planilha de NF-e (aba "Dados"), ex.: dados_nfe_2016_2025_ajustado.xlsx */
export async function parseNfeExcel(file: File): Promise<NfeData[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = findSheet(workbook, "Dados");
  if (!sheet) throw new Error(`Aba "Dados" não encontrada no arquivo de NF-e.`);

  const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
  return XLSX.utils.sheet_to_json<any>(sheet).map(row => ({
    ano: num(row['ano']),
    ncm_8d: normalizeNcm(row['ncm_8d']),
    valor_producao: num(row['valor_producao']),
    qtd_tributavel_producao: num(row['qtd_tributavel_producao']),
    valor_exp: num(row['valor_exp']),
    qtd_tributavel_exp: num(row['qtd_tributavel_exp']),
    valor_cif_imp_dolar: num(row['valor_cif_imp_dolar']),
    qtd_tributavel_imp: num(row['qtd_tributavel_imp']),
    cambio_dolar_medio: num(row['cambio_dolar_medio']),
    valor_cif_imp_reais: num(row['valor_cif_imp_reais']),
    coeficiente_penetracao_imp_valor: num(row['coeficiente_penetracao_imp_valor']),
    coeficiente_penetracao_imp_qtd: num(row['coeficiente_penetracao_imp_qtd']),
    coeficiente_exp_valor: num(row['coeficiente_exp_valor']),
    coeficiente_exp_qtd: num(row['coeficiente_exp_qtd']),
    consumo_nacional_aparente_valor: num(row['consumo_nacional_aparente_valor']),
    consumo_nacional_aparente_qtd: num(row['consumo_nacional_aparente_qtd']),
    disponibilidade_total_valor: num(row['disponibilidade_total_valor']),
    disponibilidade_total_qtd: num(row['disponibilidade_total_qtd']),
  }));
}

export interface SheetSpec {
  name: string;
  rows: Record<string, any>[];
  /** colunas na ordem desejada: [chave no objeto, título na planilha] */
  columns?: [string, string][];
}

/** Gera um .xlsx com várias abas e dispara o download. Valores numéricos são gravados como números. */
export function downloadWorkbook(fileName: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sheets.forEach(({ name, rows, columns }) => {
    if (!rows || rows.length === 0) return;
    const data = columns
      ? rows.map(r => Object.fromEntries(columns.map(([k, h]) => [h, r[k] ?? null])))
      : rows;
    const ws = XLSX.utils.json_to_sheet(data);
    const header = Object.keys(data[0] ?? {});
    ws['!cols'] = header.map(h => ({ wch: Math.min(45, Math.max(10, h.length + 2)) }));
    let sheetName = name.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);
    let i = 2;
    while (used.has(sheetName)) sheetName = `${name.slice(0, 28)} ${i++}`;
    used.add(sheetName);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });
  if (wb.SheetNames.length === 0) throw new Error('Não há dados para exportar.');
  XLSX.writeFile(wb, fileName);
}
