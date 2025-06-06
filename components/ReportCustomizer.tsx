import React from 'react';
import { SectionVisibility } from '../types.ts';

interface ReportCustomizerProps {
  visibility: SectionVisibility;
  onVisibilityChange: (newVisibility: SectionVisibility) => void;
}

type SectionKey = keyof SectionVisibility;

const sectionLabels: Record<SectionKey, string> = {
  showFullHistoricalData: "Dados Anuais Completos (Comex Stat)",
  showResumedHistoricalData: "Dados Anuais Resumidos (Comex Stat)",
  showAnnualVariationSummary: "Quadros Resumo de Variação Anual",
  showAnnualCharts: "Gráficos Anuais (Comex Stat)",
  showRollingSumImportChart: "Gráfico de Importação Acumulada (12m)",
  showCountryData: "Dados por País (2024)",
  showExcelAnalysis: "Análise de Arquivos Excel (Upload)",
  showSurgeAnalysis: "Análise de Surto de Importação", // Nova seção
};

const ReportCustomizer: React.FC<ReportCustomizerProps> = ({ visibility, onVisibilityChange }) => {
  const handleToggle = (section: SectionKey) => {
    onVisibilityChange({
      ...visibility,
      [section]: !visibility[section],
    });
  };

  return (
    <div className="p-6 bg-white shadow-lg rounded-lg mb-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-700">Personalizar Relatório</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.keys(visibility) as SectionKey[]).map((key) => (
          <label key={key} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer">
            <input
              type="checkbox"
              checked={visibility[key]}
              onChange={() => handleToggle(key)}
              className="form-checkbox h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 transition duration-150"
            />
            <span className="text-gray-700 select-none">{sectionLabels[key]}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default ReportCustomizer;