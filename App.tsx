
import React, { useState, useEffect, useCallback } from 'react';
import NcmInput from './components/NcmInput.tsx';
import InfoDisplay from './components/InfoDisplay.tsx';
import DataTable from './components/DataTable.tsx';
import SimpleBarChart from './components/charts/SimpleBarChart.tsx';
import SimpleLineChart from './components/charts/SimpleLineChart.tsx';
import CombinedTradeBalanceChart from './components/charts/CombinedTradeBalanceChart.tsx';
import FileUpload from './components/FileUpload.tsx';
import Section from './components/Section.tsx';
import ReportCustomizer from './components/ReportCustomizer.tsx';
import RollingSumTooltip from './components/charts/RollingSumTooltip.tsx'; // Import the new tooltip

// Service imports
import { 
  fetchLastUpdateData, 
  fetchNcmDescription, 
  fetchNcmUnit, 
  fetchComexData,
  fetchMonthlyComexData,
  fetchCountryData
} from './services/comexApiService.ts';
import { 
  parseCgimDinteExcelForFiltering,
  parseNfeExcel
} from './services/excelService.ts';
// Utility imports
import { 
  processAnnualTradeData,
  createYearSummary,
  processNfeSalesData,
  processNfeCnaData,
  ensureVendasInternas,
  processRollingSumImportData
} from './utils/dataProcessing.ts';
import { formatIntegerPtBR, formatDecimalPtBR, formatNcmCode, parseApiNumber } from './utils/formatting.ts';
// Type imports
import { 
  LastUpdateData, NcmDetails, ProcessedTradeData, ComexStatRecord, ApiFilter, Period, 
  CountryDataRecord, ChartDataPoint, CgimNcmInfo, EntityContactInfo, NfeData,
  YearSummaryData, FormattedNfeSalesData, FormattedNfeCnaData, SectionVisibility,
  RollingSumDataPoint, MonthlyComexStatRecord
} from './types.ts';

const initialSectionVisibility: SectionVisibility = {
  showFullHistoricalData: true,
  showResumedHistoricalData: true,
  showAnnualVariationSummary: true,
  showAnnualCharts: true,
  showRollingSumImportChart: true,
  showCountryData: true,
  showExcelAnalysis: true,
};

const App: React.FC = () => {
  // console.log('App component started'); 

  const [ncmCode, setNcmCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  
  const [lastUpdateData, setLastUpdateData] = useState<LastUpdateData | null>(null);
  const [ncmDetails, setNcmDetails] = useState<NcmDetails | null>(null);
  
  const [historicalTradeData, setHistoricalTradeData] = useState<ProcessedTradeData[]>([]);
  const [currentYearTradeData, setCurrentYearTradeData] = useState<ProcessedTradeData[]>([]);
  const [combinedTradeData, setCombinedTradeData] = useState<ProcessedTradeData[]>([]);
  const [resumedTradeData, setResumedTradeData] = useState<ProcessedTradeData[]>([]);

  const [importSummary, setImportSummary] = useState<YearSummaryData[]>([]);
  const [exportSummary, setExportSummary] = useState<YearSummaryData[]>([]);

  const [rollingSumImportData, setRollingSumImportData] = useState<RollingSumDataPoint[]>([]);
  const [monthlyApiDataIssueForRollingSum, setMonthlyApiDataIssueForRollingSum] = useState<boolean>(false);

  const [importCountryData, setImportCountryData] = useState<CountryDataRecord[]>([]);
  const [exportCountryData, setExportCountryData] = useState<CountryDataRecord[]>([]);
  
  // Excel data states
  const [cgimFile, setCgimFile] = useState<File | null>(null);
  const [nfeFile, setNfeFile] = useState<File | null>(null);
  const [parsedCgimData, setParsedCgimData] = useState<CgimNcmInfo | null>(null);
  const [parsedEntityContacts, setParsedEntityContacts] = useState<EntityContactInfo[]>([]);
  const [parsedNfeDataForNcm, setParsedNfeDataForNcm] = useState<NfeData[]>([]);
  const [nfeSalesTable, setNfeSalesTable] = useState<FormattedNfeSalesData[]>([]);
  const [nfeCnaTable, setNfeCnaTable] = useState<FormattedNfeCnaData[]>([]);

  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility>(initialSectionVisibility);

  const resetStateForNewNcm = () => {
    setLastUpdateData(null);
    setNcmDetails(null);
    setHistoricalTradeData([]);
    setCurrentYearTradeData([]);
    setCombinedTradeData([]);
    setResumedTradeData([]);
    setImportSummary([]);
    setExportSummary([]);
    setRollingSumImportData([]); 
    setMonthlyApiDataIssueForRollingSum(false);
    setImportCountryData([]);
    setExportCountryData([]);
    setParsedCgimData(null);
    setParsedEntityContacts([]);
    setParsedNfeDataForNcm([]);
    setNfeSalesTable([]);
    setNfeCnaTable([]);
  };
  
  const handleNcmSubmit = async (submittedNcmCode: string) => {
    setLoading(true);
    setNcmCode(submittedNcmCode);
    resetStateForNewNcm();

    setLoadingMessage('Carregando dados básicos do NCM...');
    // Fetch these first and together
    const [updateData, desc, unit] = await Promise.all([
      fetchLastUpdateData(),
      fetchNcmDescription(submittedNcmCode),
      fetchNcmUnit(submittedNcmCode)
    ]);
    setLastUpdateData(updateData);
    const currentNcmDetails = { description: desc, unit: unit };
    setNcmDetails(currentNcmDetails); 

    const filters: ApiFilter[] = [{ filter: "ncm", values: [submittedNcmCode] }];
    
    if (sectionVisibility.showFullHistoricalData || sectionVisibility.showResumedHistoricalData || sectionVisibility.showAnnualVariationSummary || sectionVisibility.showAnnualCharts) {
      const historicalToYear = updateData.year ? updateData.year -1 : new Date().getFullYear() -1;
      const historicalPeriod: Period = { from: "2004-01", to: `${historicalToYear}-12` };
      
      setLoadingMessage('Carregando dados históricos...');
      const histExportMetrics = ["metricFOB", "metricKG", "metricStatistic"];
      const histImportMetrics = ["metricFOB", "metricFreight", "metricInsurance", "metricCIF", "metricKG", "metricStatistic"];
      
      const [histExportDataRaw, histImportDataRaw] = await Promise.all([
          fetchComexData("export", historicalPeriod, filters, histExportMetrics, ["ncm"]),
          fetchComexData("import", historicalPeriod, filters, histImportMetrics, ["ncm"])
      ]);
            
      const processedHistData = processAnnualTradeData(histExportDataRaw, histImportDataRaw, submittedNcmCode, currentNcmDetails, updateData);
      setHistoricalTradeData(processedHistData);

      if (updateData.year && updateData.month) {
        setLoadingMessage('Carregando dados do ano corrente...');
        const currentYearPeriod: Period = { from: `${updateData.year}-01`, to: `${updateData.year}-${String(updateData.month).padStart(2, '0')}` };
        
        const [currentExportDataRaw, currentImportDataRaw] = await Promise.all([
            fetchComexData("export", currentYearPeriod, filters, histExportMetrics, ["ncm"]),
            fetchComexData("import", currentYearPeriod, filters, histImportMetrics, ["ncm"])
        ]);

        const processedCurrentData = processAnnualTradeData(currentExportDataRaw, currentImportDataRaw, submittedNcmCode, currentNcmDetails, updateData);
        setCurrentYearTradeData(processedCurrentData);
        
        const allData = [...processedHistData, ...processedCurrentData].sort((a,b) => parseInt(a.year.substring(0,4)) - parseInt(b.year.substring(0,4)));
        setCombinedTradeData(allData);
        
        const resumed = allData.map(d => ({
          year: d.year,
          'Exportações (US$ FOB)': d['Exportações (US$ FOB)'],
          'Exportações (KG)': d['Exportações (KG)'],
          'Importações (US$ FOB)': d['Importações (US$ FOB)'],
          'Importações (KG)': d['Importações (KG)'],
          'Balança Comercial (FOB)': d['Balança Comercial (FOB)'],
          'Balança Comercial (KG)': d['Balança Comercial (KG)'],
        } as ProcessedTradeData)); 
        setResumedTradeData(resumed);

        if(sectionVisibility.showAnnualVariationSummary){
          setImportSummary(createYearSummary(allData, 'import'));
          setExportSummary(createYearSummary(allData, 'export'));
        }
      }
    }

    if(sectionVisibility.showCountryData){
      setLoadingMessage('Carregando dados por país (2024)...');
      const [expCountries, impCountries] = await Promise.all([
          fetchCountryData(submittedNcmCode, "export", 2024),
          fetchCountryData(submittedNcmCode, "import", 2024)
      ]);
      setExportCountryData(expCountries);
      setImportCountryData(impCountries);
    }

    if (sectionVisibility.showRollingSumImportChart && updateData.year && updateData.month) {
      setLoadingMessage('Carregando dados mensais para gráfico de acumulado...');
      const monthlyPeriod: Period = { from: "2019-01", to: `${updateData.year}-${String(updateData.month).padStart(2, '0')}` };
      const monthlyImportApiData: MonthlyComexStatRecord[] = await fetchMonthlyComexData("import", monthlyPeriod, filters, ["metricFOB", "metricKG"]);
      // console.log("App.tsx handleNcmSubmit: Fetched monthlyImportApiData:", monthlyImportApiData); 
      if (monthlyImportApiData && monthlyImportApiData.length > 0) {
        setMonthlyApiDataIssueForRollingSum(false);
        const processedRollingData = processRollingSumImportData(monthlyImportApiData);
        setRollingSumImportData(processedRollingData);
      } else {
        setMonthlyApiDataIssueForRollingSum(true);
        setRollingSumImportData([]); 
      }
    }
    
    if (sectionVisibility.showExcelAnalysis) {
        if (cgimFile) await handleCgimFileUpload(cgimFile, submittedNcmCode, true); 
        if (nfeFile) await handleNfeFileUpload(nfeFile, submittedNcmCode, true); 
    }

    setLoadingMessage('');
    setLoading(false);
  };
  
  useEffect(() => {
    const fetchDataForNewlySelectedSections = async () => {
      if (!ncmCode || !lastUpdateData || !ncmDetails) return; 

      setLoading(true); 
      const filters: ApiFilter[] = [{ filter: "ncm", values: [ncmCode] }];

      if ((sectionVisibility.showFullHistoricalData || sectionVisibility.showResumedHistoricalData || sectionVisibility.showAnnualVariationSummary || sectionVisibility.showAnnualCharts) && combinedTradeData.length === 0) {
        setLoadingMessage('Carregando dados históricos/atuais adicionais...');
        const historicalToYear = lastUpdateData.year ? lastUpdateData.year -1 : new Date().getFullYear() -1;
        const historicalPeriod: Period = { from: "2004-01", to: `${historicalToYear}-12` };
        const histExportMetrics = ["metricFOB", "metricKG", "metricStatistic"];
        const histImportMetrics = ["metricFOB", "metricFreight", "metricInsurance", "metricCIF", "metricKG", "metricStatistic"];

        const [histExportDataRaw, histImportDataRaw] = await Promise.all([
            fetchComexData("export", historicalPeriod, filters, histExportMetrics, ["ncm"]),
            fetchComexData("import", historicalPeriod, filters, histImportMetrics, ["ncm"])
        ]);
        const processedHistData = processAnnualTradeData(histExportDataRaw, histImportDataRaw, ncmCode, ncmDetails, lastUpdateData);
        setHistoricalTradeData(processedHistData);

        if (lastUpdateData.year && lastUpdateData.month) {
          const currentYearPeriod: Period = { from: `${lastUpdateData.year}-01`, to: `${lastUpdateData.year}-${String(lastUpdateData.month).padStart(2, '0')}` };
          const [currentExportDataRaw, currentImportDataRaw] = await Promise.all([
            fetchComexData("export", currentYearPeriod, filters, histExportMetrics, ["ncm"]),
            fetchComexData("import", currentYearPeriod, filters, histImportMetrics, ["ncm"])
          ]);
          const processedCurrentData = processAnnualTradeData(currentExportDataRaw, currentImportDataRaw, ncmCode, ncmDetails, lastUpdateData);
          setCurrentYearTradeData(processedCurrentData);
          
          const allData = [...processedHistData, ...processedCurrentData].sort((a,b) => parseInt(a.year.substring(0,4)) - parseInt(b.year.substring(0,4)));
          setCombinedTradeData(allData);
          
          const resumed = allData.map(d => ({
            year: d.year,
            'Exportações (US$ FOB)': d['Exportações (US$ FOB)'],
            'Exportações (KG)': d['Exportações (KG)'],
            'Importações (US$ FOB)': d['Importações (US$ FOB)'],
            'Importações (KG)': d['Importações (KG)'],
            'Balança Comercial (FOB)': d['Balança Comercial (FOB)'],
            'Balança Comercial (KG)': d['Balança Comercial (KG)'],
          } as ProcessedTradeData)); 
          setResumedTradeData(resumed);

          if(sectionVisibility.showAnnualVariationSummary && (importSummary.length === 0 && exportSummary.length === 0)){ 
            setImportSummary(createYearSummary(allData, 'import'));
            setExportSummary(createYearSummary(allData, 'export'));
          }
        }
      }

      if (sectionVisibility.showCountryData && importCountryData.length === 0 && exportCountryData.length === 0) {
        setLoadingMessage('Carregando dados por país adicionais...');
        const [expCountries, impCountries] = await Promise.all([
            fetchCountryData(ncmCode, "export", 2024),
            fetchCountryData(ncmCode, "import", 2024)
        ]);
        setExportCountryData(expCountries);
        setImportCountryData(impCountries);
      }

      if (sectionVisibility.showRollingSumImportChart && rollingSumImportData.length === 0 && lastUpdateData.year && lastUpdateData.month) {
        setLoadingMessage('Carregando dados mensais para gráfico de acumulado...');
        const monthlyPeriod: Period = { from: "2019-01", to: `${lastUpdateData.year}-${String(lastUpdateData.month).padStart(2, '0')}` };
        const monthlyImportApiData: MonthlyComexStatRecord[] = await fetchMonthlyComexData("import", monthlyPeriod, filters, ["metricFOB", "metricKG"]);
        // console.log("App.tsx useEffect: Fetched monthlyImportApiData:", monthlyImportApiData); 
         if (monthlyImportApiData && monthlyImportApiData.length > 0) {
           setMonthlyApiDataIssueForRollingSum(false);
           const processedRollingData = processRollingSumImportData(monthlyImportApiData);
           setRollingSumImportData(processedRollingData);
         } else {
            setMonthlyApiDataIssueForRollingSum(true);
            setRollingSumImportData([]); 
         }
      }
      
      if(sectionVisibility.showExcelAnalysis) {
        if(cgimFile && (!parsedCgimData || parsedCgimData?.['NCM'] !== ncmCode) && parsedEntityContacts.filter(c=>c.NCM === ncmCode).length === 0) {
            await handleCgimFileUpload(cgimFile, ncmCode, false); 
        }
        if(nfeFile && parsedNfeDataForNcm.filter(d => d.ncm_8d === ncmCode).length === 0 ) {
            await handleNfeFileUpload(nfeFile, ncmCode, false); 
        }
      }
      setLoading(false);
      setLoadingMessage('');
    };

    if (ncmCode) { 
        fetchDataForNewlySelectedSections();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionVisibility, ncmCode]); 


  const handleCgimFileUpload = useCallback(async (file: File, currentNcm: string | null = ncmCode, forceReprocess: boolean = false) => {
    if (!currentNcm) {
        setCgimFile(file); 
        return;
    }
    if (!forceReprocess && parsedCgimData && parsedCgimData['NCM'] === currentNcm && parsedEntityContacts.some(c => c.NCM === currentNcm)) return;

    setLoading(true);
    setLoadingMessage('Processando arquivo CGIM/DINTE...');
    setCgimFile(file); 
    try {
      const { cgimData, entityData } = await parseCgimDinteExcelForFiltering(file);
      const ncmInfo = cgimData.find(row => row['NCM'] === currentNcm);
      setParsedCgimData(ncmInfo || null);
      
      const contacts = entityData.filter(row => row['NCM'] === currentNcm);
      setParsedEntityContacts(contacts);

    } catch (error) {
      console.error("Error parsing CGIM/DINTE Excel:", error);
      alert(`Erro ao processar arquivo CGIM/DINTE: ${(error as Error).message}`);
      setParsedCgimData(null);
      setParsedEntityContacts([]);
    }
    setLoadingMessage('');
    setLoading(false);
  }, [ncmCode, parsedCgimData, parsedEntityContacts]);

  const handleNfeFileUpload = useCallback(async (file: File, currentNcm: string | null = ncmCode, forceReprocess: boolean = false) => {
     if (!currentNcm) {
        setNfeFile(file); 
        return;
    }
    if (!forceReprocess && parsedNfeDataForNcm.some(d => d.ncm_8d === currentNcm)) return; 

    setLoading(true);
    setLoadingMessage('Processando arquivo NFE...');
    setNfeFile(file); 
    try {
      const allNfeData = await parseNfeExcel(file);
      const nfeForNcm = allNfeData.filter(row => row.ncm_8d === currentNcm);
      const nfeForNcmWithVendasInternas = ensureVendasInternas(nfeForNcm); 
      setParsedNfeDataForNcm(nfeForNcmWithVendasInternas);

      if (nfeForNcmWithVendasInternas.length > 0) {
        setNfeSalesTable(processNfeSalesData(nfeForNcmWithVendasInternas));
        setNfeCnaTable(processNfeCnaData(nfeForNcmWithVendasInternas));
      } else {
        setNfeSalesTable([]);
        setNfeCnaTable([]);
      }

    } catch (error) {
      console.error("Error parsing NFE Excel:", error);
      alert(`Erro ao processar arquivo NFE: ${(error as Error).message}`);
      setParsedNfeDataForNcm([]);
      setNfeSalesTable([]);
      setNfeCnaTable([]);
    }
    setLoadingMessage('');
    setLoading(false);
  }, [ncmCode, parsedNfeDataForNcm]);

  // Table definitions
  const tradeTableColumns = [
    { key: 'year', header: 'Ano', LTR: true },
    { key: 'Código NCM', header: 'NCM', LTR: true },
    { key: 'Descrição NCM', header: 'Descrição', LTR: true },
    { key: 'Unidade Estatística', header: 'Unidade Est.', LTR: true },
    { key: 'Exportações (US$ FOB)', header: 'Exp (US$ FOB)' },
    { key: 'Exportações (KG)', header: 'Exp (KG)' },
    { key: 'Exportações (Qtd Estatística)', header: 'Exp (Qtd Est.)' },
    { key: 'Importações (US$ FOB)', header: 'Imp (US$ FOB)' },
    { key: 'Importações (KG)', header: 'Imp (KG)' },
    { key: 'Importações (Qtd Estatística)', header: 'Imp (Qtd Est.)' },
    { key: 'Balança Comercial (FOB)', header: 'Balança (FOB)' },
    { key: 'Balança Comercial (KG)', header: 'Balança (KG)' },
    { key: 'Balança Comercial (Qtd Estatística)', header: 'Balança (Qtd Est.)' },
    { key: 'Importações (CIF USD)', header: 'Imp (CIF USD)' },
    { key: 'Importações (Frete USD)', header: 'Imp (Frete USD)' },
    { key: 'Importações (Seguro USD)', header: 'Imp (Seguro USD)' },
    { key: 'Preço Médio Exportação (US$ FOB/Ton)', header: 'Preço Médio Exp (US$/Ton)' },
    { key: 'Preço Médio Importação (US$ FOB/Ton)', header: 'Preço Médio Imp (US$/Ton)' },
    { key: 'Preço Médio Exportação (US$/KG)', header: 'Preço Médio Exp (US$/KG)' },
    { key: 'Preço Médio Importação (US$/KG)', header: 'Preço Médio Imp (US$/KG)' },
  ];
  const tradeTableFormatters = Object.fromEntries(
      tradeTableColumns.filter(c => !['year', 'Código NCM', 'Descrição NCM', 'Unidade Estatística'].includes(c.key))
          .map(c => [
              c.key, 
              (c.key.includes('Preço Médio') || c.key.includes('US$/KG')) ? formatDecimalPtBR : formatIntegerPtBR
          ])
  );
  
  const resumedTableColumns = [
    { key: 'year', header: 'Ano', LTR: true },
    { key: 'Exportações (US$ FOB)', header: 'Exp (US$ FOB)' },
    { key: 'Exportações (KG)', header: 'Exp (KG)' },
    { key: 'Importações (US$ FOB)', header: 'Imp (US$ FOB)' },
    { key: 'Importações (KG)', header: 'Imp (KG)' },
    { key: 'Balança Comercial (FOB)', header: 'Balança (FOB)' },
    { key: 'Balança Comercial (KG)', header: 'Balança (KG)' },
  ];
   const resumedTableFormatters = Object.fromEntries(
      resumedTableColumns.filter(c => c.key !=='year')
          .map(c => [c.key, formatIntegerPtBR])
  );

  const importSummaryColumns = [
    { key: 'Ano', header: 'Ano', LTR: true },
    { key: 'Importações (US$ FOB)', header: 'Imp (US$ FOB)'},
    { key: 'Var. (%) Imp (US$ FOB)', header: 'Var. (%) FOB'},
    { key: 'Importações (kg)', header: 'Imp (kg)'},
    { key: 'Var. (%) Imp (kg)', header: 'Var. (%) kg'},
    { key: 'Preço médio Importação (US$ FOB/Ton)', header: 'Preço Médio (US$/Ton)'},
    { key: 'Var. (%) Preço médio Imp', header: 'Var. (%) Preço Médio'},
  ];
  const importSummaryFormatters = {
    'Importações (US$ FOB)': formatIntegerPtBR,
    'Importações (kg)': formatIntegerPtBR,
    'Preço médio Importação (US$ FOB/Ton)': formatDecimalPtBR,
  };

  const exportSummaryColumns = [
    { key: 'Ano', header: 'Ano', LTR: true },
    { key: 'Exportações (US$ FOB)', header: 'Exp (US$ FOB)'},
    { key: 'Var. (%) Exp (US$ FOB)', header: 'Var. (%) FOB'},
    { key: 'Exportações (kg)', header: 'Exp (kg)'},
    { key: 'Var. (%) Exp (kg)', header: 'Var. (%) kg'},
    { key: 'Preço médio Exp (US$ FOB/Ton)', header: 'Preço Médio (US$/Ton)'},
    { key: 'Var. (%) Preço médio Exp', header: 'Var. (%) Preço Médio'},
  ];
    const exportSummaryFormatters = {
    'Exportações (US$ FOB)': formatIntegerPtBR,
    'Exportações (kg)': formatIntegerPtBR,
    'Preço médio Exp (US$ FOB/Ton)': formatDecimalPtBR,
  };

  const countryTableColumns = [
    { key: 'country', header: 'País', LTR: true },
    { key: 'metricFOB', header: 'Valor (US$ FOB)'},
    { key: 'metricKG', header: 'Peso (KG)'},
    { key: 'representatividadeFOB', header: 'Rep. FOB (%)'},
    { key: 'representatividadeKG', header: 'Rep. KG (%)'},
  ];
  const countryTableFormatters = {
    'metricFOB': formatIntegerPtBR,
    'metricKG': formatIntegerPtBR,
    'representatividadeFOB': (v:number) => formatDecimalPtBR(v) + '%',
    'representatividadeKG': (v:number) => formatDecimalPtBR(v) + '%',
  };
  
  // Chart data preparation
  const chartDataKg = combinedTradeData
    .filter(d => parseInt(d.year.substring(0,4)) >= 2010)
    .map(d => ({
      name: d.year,
      'Importações (KG)': d['Importações (KG)'],
      'Exportações (KG)': d['Exportações (KG)'],
    }));

  const chartDataFob = combinedTradeData
    .filter(d => parseInt(d.year.substring(0,4)) >= 2010)
    .map(d => ({
      name: d.year,
      'Importações (US$ FOB)': d['Importações (US$ FOB)'],
      'Exportações (US$ FOB)': d['Exportações (US$ FOB)'],
    }));

  const chartDataPrices = combinedTradeData
    .filter(d => parseInt(d.year.substring(0,4)) >= 2010)
    .map(d => ({
      name: d.year,
      'Preço Médio Importação (US$/KG)': d['Preço Médio Importação (US$/KG)'],
      'Preço Médio Exportação (US$/KG)': d['Preço Médio Exportação (US$/KG)'],
    }));

  const chartDataBalance: ChartDataPoint[] = combinedTradeData.map(d => ({
    name: d.year, 
    'Exportações (US$ FOB)': d['Exportações (US$ FOB)'] || 0,
    'Importações (US$ FOB) Neg': -(d['Importações (US$ FOB)'] || 0), 
    'Balança Comercial (FOB)': d['Balança Comercial (FOB)'] || 0,
  }));
  
  const chartDataForRollingSumKg: ChartDataPoint[] = rollingSumImportData.map(d => ({
    name: d.yearMonth, // This is 'YYYY-MM'
    rollingKG: d.rollingKG,
  }));
  // console.log("App.tsx render: chartDataForRollingSumKg:", chartDataForRollingSumKg); 

  // Excel table definitions
  const cgimNcmInfoColumns = [
    {key: 'Departamento Responsável', header: 'Depto. Responsável', LTR: true},
    {key: 'Coordenação-Geral Responsável', header: 'Coord. Geral Responsável', LTR: true},
    {key: 'Agrupamento', header: 'Agrupamento', LTR: true},
    {key: 'Setores', header: 'Setores', LTR: true},
    {key: 'Subsetores', header: 'Subsetores', LTR: true},
    {key: 'Produtos', header: 'Produtos', LTR: true},
  ];

  const entityContactsColumns = [
      {key: 'Aba', header: 'Origem (Aba)', LTR: true},
      {key: 'Sigla Entidade', header: 'Sigla', LTR: true},
      {key: 'Entidade', header: 'Entidade', LTR: true},
      {key: 'Nome do Dirigente', header: 'Dirigente', LTR: true},
      {key: 'Cargo', header: 'Cargo Dirigente', LTR: true},
      {key: 'E-mail', header: 'E-mail Dirigente', LTR: true},
      {key: 'Telefone', header: 'Telefone Dirigente', LTR: true},
  ];
  
  const nfeFullDataColumns = [
    {key: 'ano', header: 'Ano', LTR: true},
    {key: 'valor_producao', header: 'Valor Produção'},
    {key: 'qtd_tributavel_producao', header: 'Qtd Produção'},
    {key: 'valor_exp', header: 'Valor Exp'},
    {key: 'qtd_tributavel_exp', header: 'Qtd Exp'},
    {key: 'Vendas internas (KG)', header: 'Vendas Internas (KG)'},
    {key: 'valor_cif_imp_dolar', header: 'Valor Imp (CIF USD)'},
    {key: 'qtd_tributavel_imp', header: 'Qtd Imp'},
    {key: 'consumo_nacional_aparente_qtd', header: 'CNA (Qtd)'},
    {key: 'coeficiente_penetracao_imp_qtd', header: 'Coef. Penetração Imp (Qtd)'},
  ];
  const nfeFullDataFormatters = Object.fromEntries(
      nfeFullDataColumns.filter(c => c.key !=='ano')
          .map(c => [c.key, (v: any) => c.key.includes('coeficiente') ? formatDecimalPtBR(parseApiNumber(v) * 100)+'%' : formatIntegerPtBR(parseApiNumber(v))])
  );

  const nfeSalesTableColumns = [
    {key: 'ano', header: 'Ano', LTR: true},
    {key: 'Vendas totais (Kg)', header: 'Vendas Totais (Kg)'},
    {key: 'Δ Vendas totais (%)', header: 'Var. (%) Total'},
    {key: 'Vendas internas (KG)', header: 'Vendas Internas (KG)'},
    {key: 'Δ Vendas internas (%)', header: 'Var. (%) Internas'},
    {key: 'Exportações (Kg)', header: 'Exportações (Kg)'},
    {key: 'Δ Exportações (%)', header: 'Var. (%) Exp.'},
  ];

  const nfeCnaTableColumns = [
    {key: 'ano', header: 'Ano', LTR: true},
    {key: 'Vendas internas (KG)', header: 'Vendas Internas (KG)'},
    {key: 'Δ Vendas internas (%)', header: 'Var. (%) Internas'},
    {key: 'Importações (Kg)', header: 'Importações (Kg)'},
    {key: 'Δ Importações (%)', header: 'Var. (%) Imp.'},
    {key: 'CNA (Kg)', header: 'CNA (Kg)'},
    {key: 'Δ CNA (%)', header: 'Var. (%) CNA'},
    {key: 'Coeficiente de importação (%)', header: 'Coef. Imp (%)'},
  ];
  // Chart fill color functions
  const barChartColors = (data: any[], index: number) => {
    if (index === data.length - 2) return 'sandybrown'; 
    if (index === data.length - 1) return 'darksalmon'; 
    return 'orange';
  };

  const barChartColorsExports = (data: any[], index: number) => {
    if (index === data.length - 2) return 'lightskyblue';
    if (index === data.length - 1) return 'lightsteelblue';
    return 'steelblue';
  };

  const showNoDataMessage = ncmCode && !loading && 
    (
      (!sectionVisibility.showFullHistoricalData && !sectionVisibility.showResumedHistoricalData && !sectionVisibility.showAnnualVariationSummary && !sectionVisibility.showAnnualCharts) || 
      combinedTradeData.length === 0
    ) &&
    (!sectionVisibility.showRollingSumImportChart || (rollingSumImportData.length === 0 && !monthlyApiDataIssueForRollingSum)) && // Adjusted condition
    (!sectionVisibility.showCountryData || (importCountryData.length === 0 && exportCountryData.length === 0)) &&
    (!sectionVisibility.showExcelAnalysis || (
      (!cgimFile || (!parsedCgimData && parsedEntityContacts.length === 0)) &&
      (!nfeFile || parsedNfeDataForNcm.length === 0)
    )) &&
    // Check if any API-dependent section was selected and resulted in no data (excluding rolling sum if API issue)
    (
      (sectionVisibility.showFullHistoricalData && combinedTradeData.length === 0) ||
      (sectionVisibility.showResumedHistoricalData && resumedTradeData.length === 0) ||
      (sectionVisibility.showAnnualVariationSummary && importSummary.length === 0 && exportSummary.length === 0) ||
      (sectionVisibility.showAnnualCharts && combinedTradeData.length === 0) ||
      (sectionVisibility.showRollingSumImportChart && rollingSumImportData.length === 0 && !monthlyApiDataIssueForRollingSum) || // Adjusted
      (sectionVisibility.showCountryData && importCountryData.length === 0 && exportCountryData.length === 0)
    );


  return (
    <div className="container mx-auto p-4 md:p-8 bg-gray-50 min-h-screen">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-700 py-2">
          Analisador Comex Stat NCM
        </h1>
        <p className="text-gray-600 mt-1">Ferramenta para análise de dados de comércio exterior brasileiro.</p>
      </header>

      {!ncmCode && !loading && (
        <div className="text-center p-10 bg-white shadow-lg rounded-lg mb-6"> {/* Removed mt-6 as header provides mb-8 */}
          <p className="text-xl text-gray-700">Por favor, insira um código NCM e selecione as seções desejadas no relatório para iniciar a análise.</p>
        </div>
      )}

      <NcmInput onSubmit={handleNcmSubmit} loading={loading} />
      <ReportCustomizer visibility={sectionVisibility} onVisibilityChange={setSectionVisibility} />
      
      {loading && loadingMessage && <p className="text-center text-blue-600 my-4 p-3 bg-blue-50 rounded-md shadow">{loadingMessage}</p>}
      
      {ncmCode && <InfoDisplay ncmCode={ncmCode} lastUpdateData={lastUpdateData} ncmDetails={ncmDetails} appIsLoading={loading} />} {/* Changed prop name */}


      {ncmCode && !loading && (
        <>
          {sectionVisibility.showFullHistoricalData && combinedTradeData.length > 0 && (
            <Section title="Dados Históricos Consolidados (Comex Stat)" defaultOpen={false}>
              <DataTable title={`Dados Consolidados para NCM ${formatNcmCode(ncmCode)}`} data={combinedTradeData} columns={tradeTableColumns} formatters={tradeTableFormatters} source="Fonte: Comex Stat/MDIC. Elaboração própria."/>
            </Section>
          )}

          {sectionVisibility.showResumedHistoricalData && resumedTradeData.length > 0 && (
            <Section title="Dados Anuais Resumidos (Comex Stat)" defaultOpen={true}>
              <DataTable title={`Dados Resumidos para NCM ${formatNcmCode(ncmCode)}`} data={resumedTradeData} columns={resumedTableColumns} formatters={resumedTableFormatters} source="Fonte: Comex Stat/MDIC. Elaboração própria."/>
            </Section>
          )}

          {sectionVisibility.showAnnualVariationSummary && (importSummary.length > 0 || exportSummary.length > 0) && (
            <Section title="Quadros Resumo de Variação Anual (Importação e Exportação)" defaultOpen={true}>
              {importSummary.length > 0 && <DataTable title="Quadro Resumo das Importações (Variação Anual)" data={importSummary} columns={importSummaryColumns} formatters={importSummaryFormatters} source="Fonte: Comex Stat/MDIC. Elaboração própria."/>}
              {exportSummary.length > 0 && <DataTable title="Quadro Resumo das Exportações (Variação Anual)" data={exportSummary} columns={exportSummaryColumns} formatters={exportSummaryFormatters} source="Fonte: Comex Stat/MDIC. Elaboração própria."/>}
            </Section>
          )}
          
          {sectionVisibility.showAnnualCharts && combinedTradeData.length > 0 && (
            <Section title="Gráficos Anuais (Comex Stat)" defaultOpen={true}>
              <div className="grid md:grid-cols-2 gap-6">
                  <SimpleBarChart 
                      data={chartDataKg} 
                      xAxisKey="name" 
                      dataKey="Importações (KG)" 
                      title={`Importações (KG) da NCM ${formatNcmCode(ncmCode)} (desde 2010)`}
                      yAxisLabel="Importações (KG)"
                      fillColor={(entry, index) => barChartColors(chartDataKg, index)}
                  />
                  <SimpleBarChart 
                      data={chartDataFob} 
                      xAxisKey="name" 
                      dataKey="Importações (US$ FOB)" 
                      title={`Importações (US$ FOB) da NCM ${formatNcmCode(ncmCode)} (desde 2010)`}
                      yAxisLabel="Importações (US$ FOB)"
                      fillColor={(entry, index) => barChartColors(chartDataFob, index)}
                  />
                  <SimpleBarChart 
                      data={chartDataKg} 
                      xAxisKey="name" 
                      dataKey="Exportações (KG)" 
                      title={`Exportações (KG) da NCM ${formatNcmCode(ncmCode)} (desde 2010)`}
                      yAxisLabel="Exportações (KG)"
                      fillColor={(entry, index) => barChartColorsExports(chartDataKg, index)}
                  />
                  <SimpleBarChart 
                      data={chartDataFob} 
                      xAxisKey="name" 
                      dataKey="Exportações (US$ FOB)" 
                      title={`Exportações (US$ FOB) da NCM ${formatNcmCode(ncmCode)} (desde 2010)`}
                      yAxisLabel="Exportações (US$ FOB)"
                      fillColor={(entry, index) => barChartColorsExports(chartDataFob, index)}
                  />
              </div>
              <SimpleLineChart
                  data={chartDataPrices}
                  xAxisKey="name"
                  lines={[
                      { dataKey: 'Preço Médio Importação (US$/KG)', name: 'Preço Médio Importação (US$/KG)', color: '#FF0000' }, 
                      { dataKey: 'Preço Médio Exportação (US$/KG)', name: 'Preço Médio Exportação (US$/KG)', color: '#0000FF' }, 
                  ]}
                  title={`Preços Médios de Importação e Exportação (US$/KG) da NCM ${formatNcmCode(ncmCode)} (desde 2010)`}
                  yAxisLabel="Preço Médio (US$/KG)"
              />
              <CombinedTradeBalanceChart data={chartDataBalance} title={`Exportação, Importação e Balança Comercial (US$ FOB) – NCM ${formatNcmCode(ncmCode)}`}/>
            </Section>
          )}

          {sectionVisibility.showRollingSumImportChart && (
            <Section title="Gráfico de Importação Acumulada (12 Meses)" defaultOpen={true}>
              {chartDataForRollingSumKg.length > 0 ? (
                <SimpleBarChart
                  data={chartDataForRollingSumKg} 
                  xAxisKey="name" 
                  dataKey="rollingKG" 
                  title={`Importação Acumulada (KG) nos Últimos 12 Meses - NCM ${formatNcmCode(ncmCode!)}`}
                  yAxisLabel="Quantidade Acumulada (KG)"
                  fillColor="steelblue"
                  customTooltip={<RollingSumTooltip />} // Use the custom tooltip
                  showLegend={false}
                />
              ) : monthlyApiDataIssueForRollingSum ? (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-md text-center">
                  <p className="text-orange-700 font-semibold text-lg">
                    Não foi possível gerar o gráfico de importação acumulada.
                  </p>
                  <p className="text-gray-600 mt-2">
                    A API Comex Stat não retornou dados mensais válidos (com ano e mês corretos)
                    para o NCM <span className="font-mono bg-gray-200 px-1 rounded">{formatNcmCode(ncmCode!)}</span> e período solicitado.
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    Isso geralmente ocorre se a API não possui o detalhamento mensal para este NCM específico ou se os dados retornados não puderam ser processados.
                    Consulte os logs do console do navegador (F12) para verificar os avisos da função `fetchMonthlyComexData`.
                  </p>
                </div>
              ) : (
                 <SimpleBarChart /* Render with empty data to show its internal "no data" message */
                    data={[]} 
                    xAxisKey="name" 
                    dataKey="rollingKG" 
                    title={`Importação Acumulada (KG) nos Últimos 12 Meses - NCM ${formatNcmCode(ncmCode!)}`}
                    yAxisLabel="Quantidade Acumulada (KG)"
                    fillColor="steelblue"
                    customTooltip={<RollingSumTooltip />} // Also here for consistency if it ever shows due to other logic
                    showLegend={false}
                  />
              )}
            </Section>
          )}


          {sectionVisibility.showCountryData && (importCountryData.length > 0 || exportCountryData.length > 0) && (
            <Section title="Dados por País (2024)" defaultOpen={false}>
              {importCountryData.length > 0 && <DataTable title={`Principais Origens das Importações (2024) - NCM ${formatNcmCode(ncmCode)}`} data={importCountryData} columns={countryTableColumns} formatters={countryTableFormatters} source="Fonte: Comex Stat/MDIC. Elaboração própria."/>}
              {exportCountryData.length > 0 && <DataTable title={`Principais Destinos das Exportações (2024) - NCM ${formatNcmCode(ncmCode)}`} data={exportCountryData} columns={countryTableColumns} formatters={countryTableFormatters} source="Fonte: Comex Stat/MDIC. Elaboração própria."/>}
            </Section>
          )}
        </>
      )}

      {sectionVisibility.showExcelAnalysis && ( 
        <Section title="Análise de Arquivos Excel (Upload)" defaultOpen={!ncmCode}>
            <div className="grid md:grid-cols-2 gap-6 mb-6 p-4 border rounded-md bg-gray-50">
                <FileUpload 
                    label="Arquivo CGIM/DINTE (NCMs-CGIM-DINTE.xlsx)" 
                    onFileUpload={(file) => handleCgimFileUpload(file, ncmCode)} 
                    acceptedFileTypes=".xlsx,.xls"
                    loading={loading && loadingMessage.includes('CGIM')}
                    fileName={cgimFile?.name}
                />
                <FileUpload 
                    label="Arquivo NFE (dados_nfe_2016_2023.xlsx)" 
                    onFileUpload={(file) => handleNfeFileUpload(file, ncmCode)} 
                    acceptedFileTypes=".xlsx,.xls"
                    loading={loading && loadingMessage.includes('NFE')}
                    fileName={nfeFile?.name}
                />
            </div>

            {ncmCode && !loading && ( 
              <>
                {cgimFile && parsedCgimData && (
                    <DataTable title={`Informações CGIM/DINTE para NCM ${formatNcmCode(ncmCode)}`} data={[parsedCgimData]} columns={cgimNcmInfoColumns} source="Fonte: Arquivo 20241011_NCMs-CGIM-DINTE.xlsx"/>
                )}
                {cgimFile && parsedCgimData === null && sectionVisibility.showExcelAnalysis && ( 
                     <p className="text-gray-600 p-3">Nenhuma informação CGIM/DINTE encontrada para NCM {formatNcmCode(ncmCode)} no arquivo fornecido.</p>
                )}

                {cgimFile && parsedEntityContacts.length > 0 && (
                     <DataTable title={`Contatos de Entidades para NCM ${formatNcmCode(ncmCode)}`} data={parsedEntityContacts} columns={entityContactsColumns} source="Fonte: Arquivo 20241011_NCMs-CGIM-DINTE.xlsx"/>
                )}
                 {cgimFile && parsedEntityContacts.length === 0 && parsedCgimData !== undefined && sectionVisibility.showExcelAnalysis && ( 
                     <p className="text-gray-600 p-3">Nenhum contato de entidade encontrado para NCM {formatNcmCode(ncmCode)} no arquivo fornecido.</p>
                )}

                {nfeFile && parsedNfeDataForNcm.length > 0 && (
                    <>
                        <DataTable title={`Dados Completos NFE para NCM ${formatNcmCode(ncmCode)}`} data={parsedNfeDataForNcm} columns={nfeFullDataColumns} formatters={nfeFullDataFormatters} source="Fonte: Planilha com dados da nota fiscal da RFB, disponibilizada pela SECEX"/>
                        <DataTable title={`Vendas da Indústria Nacional - NCM ${formatNcmCode(ncmCode)}`} data={nfeSalesTable} columns={nfeSalesTableColumns} source="Fonte: Planilha com dados da nota fiscal da RFB, disponibilizada pela SECEX"/>
                        <DataTable title={`Consumo Nacional Aparente - NCM ${formatNcmCode(ncmCode)}`} data={nfeCnaTable} columns={nfeCnaTableColumns} source="Fonte: Planilha com dados da nota fiscal da RFB, disponibilizada pela SECEX"/>
                    </>
                )}
                {nfeFile && parsedNfeDataForNcm.length === 0 && sectionVisibility.showExcelAnalysis && (
                     <p className="text-gray-600 p-3">Nenhum dado NFE encontrado para NCM {formatNcmCode(ncmCode)} no arquivo fornecido.</p>
                )}
              </>
            )}
        </Section>
      )}
      
      {showNoDataMessage && (
         <div className="text-center p-10 bg-white shadow-lg rounded-lg mt-6">
          <p className="text-xl text-red-500">Nenhum dado encontrado para o NCM {formatNcmCode(ncmCode!)} nas seções selecionadas ou nos arquivos Excel fornecidos (se houver).</p>
          <p className="text-gray-600 mt-2">Verifique se o código NCM está correto ou tente outro código. Se estiver usando arquivos Excel, certifique-se de que eles contêm dados para o NCM informado e que a seção de análise de Excel está habilitada.</p>
        </div>
      )}

      <footer className="mt-12 text-center text-sm text-gray-500 py-4 border-t border-gray-300">
        <p>© {new Date().getFullYear()} Comex Stat NCM Analyzer. Desenvolvido como uma ferramenta de frontend.</p>
        <p>Todos os dados são provenientes da API Comex Stat do MDIC ou de arquivos Excel fornecidos pelo usuário.</p>
      </footer>
    </div>
  );
};

export default App;
