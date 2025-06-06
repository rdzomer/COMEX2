
import * as XLSX from 'xlsx';
import { CgimNcmInfo, EntityContactInfo, NfeData } from '../types.ts';

export async function parseCgimDinteExcel(file: File): Promise<{ cgimNcmInfo: CgimNcmInfo | string; entityContacts: EntityContactInfo[] | string }> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  let cgimNcmInfo: CgimNcmInfo | string = "Produto não é de competência da CGIM";
  const ncmSheetName = "NCMs-CGIM-DINTE";
  if (workbook.SheetNames.includes(ncmSheetName)) {
    const ncmSheet = workbook.Sheets[ncmSheetName];
    const ncmData = XLSX.utils.sheet_to_json<any>(ncmSheet);
    // This function will be called with ncmCode, so filtering will happen in App.tsx
    // For now, it returns all data, or a placeholder structure if the sheet is empty.
    // The actual filtering by NCM code needs to be done after calling this.
    // This function provides the raw parsed data.
    // The python script returns a single row or a message. We'll simulate this by returning the array.
     cgimNcmInfo = ncmData.length > 0 ? "data_available_for_filtering" : "Produto não é de competência da CGIM"; // Placeholder
  } else {
    cgimNcmInfo = `Aba "${ncmSheetName}" não encontrada no arquivo.`;
  }
  
  const entitySheets = ["ABITAM", "IABR", "ABAL", "ABCOBRE", "ABRAFE", "IBÁ", "SICETEL", "SINDIFER"];
  let allEntityContacts: EntityContactInfo[] = [];

  for (const sheetName of entitySheets) {
    if (workbook.SheetNames.includes(sheetName)) {
      const entitySheet = workbook.Sheets[sheetName];
      // Python code uses usecols="A,T:AE". XLSX reads all columns. We filter later.
      const entityData = XLSX.utils.sheet_to_json<any>(entitySheet);
      // The python script filters by NCM here. We'll filter in App.tsx.
      // Add Aba identifier
      const sheetContacts = entityData.map(row => ({
        ...row, // Assuming column names match EntityContactInfo or will be mapped
        'Aba': sheetName,
        // Map specific columns if names differ, e.g. row['NCM'] or row[excel_column_header_for_ncm]
        'NCM': String(row['NCM'] || row[Object.keys(row)[0]]), // Assuming NCM is the first column
         // Map other columns from T:AE (index 19 to 30)
        'Sigla Entidade': row[Object.keys(row)[19]],
        'Entidade': row[Object.keys(row)[20]],
        // ... and so on for other contact fields
      }));
      allEntityContacts.push(...sheetContacts);
    }
  }
  
  const entityContactsResult = allEntityContacts.length > 0 ? "data_available_for_filtering_entities" : `Não há informação sobre a entidade responsável.`;

  // Actual filtering by NCM code will be done in the component using this data.
  // For now, returning the raw (or semi-processed) data.
  return { 
    cgimNcmInfo: cgimNcmInfo, // This will be the array of CgimNcmInfo to be filtered by NCM
    entityContacts: entityContactsResult // This will be the array of EntityContactInfo to be filtered by NCM
  };
}


// A more robust parser for CGIM/DINTE that returns structures to be filtered.
export async function parseCgimDinteExcelForFiltering(file: File): Promise<{
  cgimData: CgimNcmInfo[];
  entityData: EntityContactInfo[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });

  let parsedCgimData: CgimNcmInfo[] = [];
  const ncmSheetName = "NCMs-CGIM-DINTE";
  if (workbook.SheetNames.includes(ncmSheetName)) {
    const ncmSheet = workbook.Sheets[ncmSheetName];
    const jsonData = XLSX.utils.sheet_to_json<any>(ncmSheet);
    parsedCgimData = jsonData.map(row => ({
      'NCM': String(row['NCM']), // Important for filtering
      'Departamento Responsável': row['Departamento Responsável'],
      'Coordenação-Geral Responsável': row['Coordenação-Geral Responsável'],
      'Agrupamento': row['Agrupamento'],
      'Setores': row['Setores'],
      'Subsetores': row['Subsetores'],
      'Produtos': row['Produtos'],
    }));
  }

  const entitySheets = ["ABITAM", "IABR", "ABAL", "ABCOBRE", "ABRAFE", "IBÁ", "SICETEL", "SINDIFER"];
  let parsedEntityData: EntityContactInfo[] = [];

  for (const sheetName of entitySheets) {
    if (workbook.SheetNames.includes(sheetName)) {
      const entitySheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<any>(entitySheet);
      
      // Define expected headers based on Python T:AE (cols 19 to 30 if 0-indexed)
      // This mapping is crucial and depends on the exact Excel structure.
      // The Python script implies direct header names like 'Sigla Entidade', etc.
      // are present in columns T onwards.
      
      jsonData.forEach(row => {
        // Ensure NCM is read as string
        const ncmValue = row['NCM'] ? String(row['NCM']) : (row[Object.keys(row)[0]] ? String(row[Object.keys(row)[0]]) : undefined);

        // Map specific columns based on known headers or positions (T:AE)
        // This part is tricky without knowing exact headers in T:AE. Assuming they match EntityContactInfo keys.
        parsedEntityData.push({
          'Aba': sheetName,
          'NCM': ncmValue,
          'Sigla Entidade': row['Sigla Entidade'],
          'Entidade': row['Entidade'],
          'Nome do Dirigente': row['Nome do Dirigente'],
          'Cargo': row['Cargo'],
          'E-mail': row['E-mail'],
          'Telefone': row['Telefone'],
          'Celular': row['Celular'],
          'Contato Importante': row['Contato Importante'],
          'Cargo (Contato Importante)': row['Cargo (Contato Importante)'],
          'E-mail (Contato Importante)': row['E-mail (Contato Importante)'],
          'Telefone (Contato Importante)': row['Telefone (Contato Importante)'],
          'Celular (Contato Importante)': row['Celular (Contato Importante)'],
        });
      });
    }
  }
  return { cgimData: parsedCgimData, entityData: parsedEntityData };
}


export async function parseNfeExcel(file: File): Promise<NfeData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
  const sheetName = "Dados"; // As per Python script
  if (!workbook.SheetNames.includes(sheetName)) {
    throw new Error(`Aba "${sheetName}" não encontrada no arquivo NFE.`);
  }
  
  const nfeSheet = workbook.Sheets[sheetName];
  const nfeDataJson = XLSX.utils.sheet_to_json<any>(nfeSheet);

  // Map to NfeData, ensuring types and handling potential missing columns
  return nfeDataJson.map(row => ({
    ano: Number(row['ano']),
    ncm_8d: String(row['ncm_8d']),
    valor_producao: Number(row['valor_producao']),
    qtd_tributavel_producao: Number(row['qtd_tributavel_producao']),
    valor_exp: Number(row['valor_exp']),
    qtd_tributavel_exp: Number(row['qtd_tributavel_exp']),
    valor_cif_imp_dolar: Number(row['valor_cif_imp_dolar']),
    qtd_tributavel_imp: Number(row['qtd_tributavel_imp']),
    cambio_dolar_medio: Number(row['cambio_dolar_medio']),
    valor_cif_imp_reais: Number(row['valor_cif_imp_reais']),
    coeficiente_penetracao_imp_valor: Number(row['coeficiente_penetracao_imp_valor']),
    coeficiente_penetracao_imp_qtd: Number(row['coeficiente_penetracao_imp_qtd']),
    coeficiente_exp_valor: Number(row['coeficiente_exp_valor']),
    coeficiente_exp_qtd: Number(row['coeficiente_exp_qtd']),
    consumo_nacional_aparente_valor: Number(row['consumo_nacional_aparente_valor']),
    consumo_nacional_aparente_qtd: Number(row['consumo_nacional_aparente_qtd']),
    disponibilidade_total_valor: Number(row['disponibilidade_total_valor']),
    disponibilidade_total_qtd: Number(row['disponibilidade_total_qtd']),
    // 'Vendas internas (KG)' is calculated in Python. We will do it in dataProcessing.ts or assume it's added there.
    // If the excel HAS this column, map it: 'Vendas internas (KG)': Number(row['Vendas internas (KG)'])
  }));
}
