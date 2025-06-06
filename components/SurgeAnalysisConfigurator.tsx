import React, { useState, useEffect } from 'react';
import { SurgeAnalysisConfig, LastUpdateData } from '../types.ts';
import { getMonthNamePtBR } from '../utils/formatting.ts';

interface SurgeAnalysisConfiguratorProps {
  onCalculate: (config: SurgeAnalysisConfig) => void;
  isLoading: boolean;
  lastUpdateData: LastUpdateData | null;
}

const currentYear = new Date().getFullYear();
const availableYears = Array.from({ length: currentYear - 2019 + 1 }, (_, i) => currentYear - i); // 2019 to currentYear
const months = Array.from({ length: 12 }, (_, i) => i + 1);

const SurgeAnalysisConfigurator: React.FC<SurgeAnalysisConfiguratorProps> = ({ onCalculate, isLoading, lastUpdateData }) => {
  const initialEndYear = lastUpdateData?.year || currentYear;
  const initialEndMonth = lastUpdateData?.month || new Date().getMonth() + 1;

  const [startYear, setStartYear] = useState<number>(initialEndYear);
  const [startMonth, setStartMonth] = useState<number>(1);
  const [endYear, setEndYear] = useState<number>(initialEndYear);
  const [endMonth, setEndMonth] = useState<number>(initialEndMonth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Adjust default end date if lastUpdateData becomes available
    if (lastUpdateData?.year && lastUpdateData?.month) {
      setEndYear(lastUpdateData.year);
      setEndMonth(lastUpdateData.month);
      // Also adjust startYear if it was based on a different default
      if (startYear > lastUpdateData.year) {
        setStartYear(lastUpdateData.year);
      }
    }
  }, [lastUpdateData, startYear]);


  const handleSubmit = () => {
    setError(null);
    const sYear = Number(startYear);
    const sMonth = Number(startMonth);
    const eYear = Number(endYear);
    const eMonth = Number(endMonth);

    if (isNaN(sYear) || isNaN(sMonth) || isNaN(eYear) || isNaN(eMonth)) {
      setError("Anos e meses devem ser números válidos.");
      return;
    }
    if (sYear < 2019 || eYear < 2019) {
      setError("O ano não pode ser anterior a 2019.");
      return;
    }
     if (sMonth < 1 || sMonth > 12 || eMonth < 1 || eMonth > 12) {
      setError("Mês inválido. Selecione um mês entre 1 e 12.");
      return;
    }

    const startDate = new Date(sYear, sMonth - 1);
    const endDate = new Date(eYear, eMonth - 1);

    if (endDate < startDate) {
      setError("A data final não pode ser anterior à data inicial.");
      return;
    }

    if (lastUpdateData && lastUpdateData.year && lastUpdateData.month) {
      const apiLastDate = new Date(lastUpdateData.year, lastUpdateData.month - 1);
      if (endDate > apiLastDate) {
        setError(`A data final selecionada (${getMonthNamePtBR(eMonth)}/${eYear}) excede a última atualização da API (${getMonthNamePtBR(lastUpdateData.month)}/${lastUpdateData.year}). Ajuste o período.`);
        return;
      }
       if (startDate > apiLastDate) {
        setError(`A data inicial selecionada (${getMonthNamePtBR(sMonth)}/${sYear}) excede a última atualização da API. Ajuste o período.`);
        return;
      }
    }


    onCalculate({ startYear: sYear, startMonth: sMonth, endYear: eYear, endMonth: eMonth });
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50 mb-6">
      <h3 className="text-lg font-semibold mb-3 text-gray-700">Configurar Período para Análise de Surto</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        {/* Start Period */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Período Inicial:</label>
          <div className="flex space-x-2">
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isLoading}
            >
              {months.map(m => <option key={`start-m-${m}`} value={m}>{getMonthNamePtBR(m)}</option>)}
            </select>
            <select
              value={startYear}
              onChange={(e) => setStartYear(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isLoading}
            >
              {availableYears.map(y => <option key={`start-y-${y}`} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* End Period */}
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Período Final:</label>
          <div className="flex space-x-2">
            <select
              value={endMonth}
              onChange={(e) => setEndMonth(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isLoading}
            >
              {months.map(m => <option key={`end-m-${m}`} value={m}>{getMonthNamePtBR(m)}</option>)}
            </select>
            <select
              value={endYear}
              onChange={(e) => setEndYear(Number(e.target.value))}
              className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
              disabled={isLoading}
            >
              {availableYears.map(y => <option key={`end-y-${y}`} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        className="mt-4 w-full md:w-auto px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 disabled:opacity-50"
      >
        {isLoading ? 'Analisando...' : 'Analisar Surto de Importação'}
      </button>
    </div>
  );
};

export default SurgeAnalysisConfigurator;