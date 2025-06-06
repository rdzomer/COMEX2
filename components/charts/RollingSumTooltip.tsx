import React from 'react';
import { formatIntegerPtBR } from '../../utils/formatting.ts';

interface RollingSumTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string; // This is the yearMonth, e.g., "2024-07"
}

const RollingSumTooltip: React.FC<RollingSumTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length && label) {
    // console.log('Standard RollingSumTooltip ACTIVE. Label:', label); // Keep for focused debugging if needed

    const dataPoint = payload[0].payload; 
    const accumulatedKG = dataPoint.rollingKG; 

    return (
      <div className="bg-white p-3 border border-gray-300 shadow-lg rounded-md text-sm" style={{pointerEvents: 'none'}}>
        <p className="font-semibold text-gray-800 mb-1">{label}</p>
        <p className="text-gray-600">Mês de Referência (Fim do Período de 12m): <span className="font-medium text-gray-700">{label}</span></p>
        <p className="text-gray-600">Quantidade Acumulada (KG): <span className="font-bold text-blue-600">{formatIntegerPtBR(accumulatedKG)}</span></p>
      </div>
    );
  }
  return null;
};

export default RollingSumTooltip;