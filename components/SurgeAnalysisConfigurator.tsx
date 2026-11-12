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
      setStartYear(lastUpdateData.year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdateData?.year, lastUpdateData?.month]);


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

  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm capitalize text-slate-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Início do período</label>
          <div className="flex gap-2">
            <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))} className={sel} disabled={isLoading}>
              {months.map(m => <option key={`sm-${m}`} value={m}>{getMonthNamePtBR(m)}</option>)}
            </select>
            <select value={startYear} onChange={e => setStartYear(Number(e.target.value))} className={sel} disabled={isLoading}>
              {availableYears.map(y => <option key={`sy-${y}`} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Fim do período</label>
          <div className="flex gap-2">
            <select value={endMonth} onChange={e => setEndMonth(Number(e.target.value))} className={sel} disabled={isLoading}>
              {months.map(m => <option key={`em-${m}`} value={m}>{getMonthNamePtBR(m)}</option>)}
            </select>
            <select value={endYear} onChange={e => setEndYear(Number(e.target.value))} className={sel} disabled={isLoading}>
              {availableYears.map(y => <option key={`ey-${y}`} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-50"
        >
          {isLoading ? 'Analisando…' : 'Analisar surto'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default SurgeAnalysisConfigurator;
