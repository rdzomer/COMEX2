import React from 'react';
import { SurgeAnalysisResult } from '../types.ts';
import { formatIntegerPtBR, formatDecimalPtBR } from '../utils/formatting.ts';

interface SurgeAnalysisDisplayProps {
  result: SurgeAnalysisResult | null;
  isLoading: boolean;
}

const SurgeAnalysisDisplay: React.FC<SurgeAnalysisDisplayProps> = ({ result, isLoading }) => {
  if (isLoading) {
    return <div className="text-center p-4 text-gray-600">Calculando análise de surto...</div>;
  }

  if (!result) {
    return <div className="text-center p-4 text-gray-500">Configure o período e clique em "Analisar Surto" para ver os resultados.</div>;
  }

  if (result.error) {
    return (
      <div className="p-4 border rounded-lg bg-red-50 text-red-700">
        <p className="font-semibold">Erro na Análise de Surto:</p>
        <p>{result.error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg bg-white shadow">
      <h3 className="text-lg font-semibold mb-3 text-gray-800">Resultado da Análise de Surto</h3>
      
      <div className="mb-4 p-3 bg-blue-50 rounded-md">
        <h4 className="font-medium text-blue-700">Período Atual Analisado:</h4>
        <p className="text-gray-700">{result.currentPeriod.periodLabel}</p>
        <p className="text-gray-700">Soma KG: <span className="font-bold">{formatIntegerPtBR(result.currentPeriod.sumKg)}</span></p>
      </div>

      <div className="mb-4">
        <h4 className="font-medium text-gray-700 mb-1">Três Períodos Anteriores Equivalentes:</h4>
        <ul className="list-disc list-inside space-y-1 pl-1">
          {result.previousPeriods.map((period, index) => (
            <li key={index} className="text-sm text-gray-600">
              {period.periodLabel}: <span className="font-semibold">{formatIntegerPtBR(period.sumKg)} KG</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-4 p-3 bg-gray-100 rounded-md">
        <p className="text-gray-700">Média KG dos 3 Períodos Anteriores: <span className="font-bold">{formatIntegerPtBR(result.averagePreviousKg)}</span></p>
      </div>
      
      <div className={`mb-2 p-3 rounded-md ${result.isSurge ? 'bg-red-100 border border-red-300' : 'bg-green-50 border border-green-200'}`}>
        <p className={`font-bold text-lg ${result.isSurge ? 'text-red-600' : 'text-green-700'}`}>
          {result.isSurge ? 'SURTO DE IMPORTAÇÃO DETECTADO!' : 'Nenhum surto de importação detectado.'}
        </p>
        <p className={`text-sm ${result.isSurge ? 'text-red-500' : 'text-green-600'}`}>
          Variação do período atual em relação à média dos 3 anteriores: 
          <span className="font-semibold"> {result.percentageChange === Infinity ? '+∞%' : `${formatDecimalPtBR(result.percentageChange)}%`}</span>
        </p>
        {result.isSurge && (
          <p className="text-xs text-red-500 mt-1">(O período atual teve um aumento de 30% ou mais em relação à média dos 3 períodos anteriores)</p>
        )}
         {!result.isSurge && currentIsPositive(result) && (
          <p className="text-xs text-green-500 mt-1">(O período atual não atingiu um aumento de 30% em relação à média dos 3 períodos anteriores)</p>
        )}
      </div>
    </div>
  );
};

const currentIsPositive = (result: SurgeAnalysisResult) => {
    if(result.percentageChange === Infinity && result.currentPeriod.sumKg > 0) return true;
    return result.percentageChange > 0;
}


export default SurgeAnalysisDisplay;