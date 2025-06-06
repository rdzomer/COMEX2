
import React from 'react';
import { LastUpdateData, NcmDetails } from '../types.ts';
import { getMonthNamePtBR, formatNcmCode } from '../utils/formatting.ts';

interface InfoDisplayProps {
  ncmCode: string | null;
  lastUpdateData: LastUpdateData | null;
  ncmDetails: NcmDetails | null;
  appIsLoading: boolean; // Renamed from 'loading' to 'appIsLoading' for clarity
}

const InfoDisplay: React.FC<InfoDisplayProps> = ({ ncmCode, lastUpdateData, ncmDetails, appIsLoading }) => {
  // Show loading message if the app is globally loading AND specific data for this component is missing
  if (appIsLoading && (!lastUpdateData || !ncmDetails)) {
    return (
      <div className="p-6 bg-white shadow-lg rounded-lg mb-6 text-center">
        <p className="text-gray-600">Carregando informações básicas...</p>
      </div>
    );
  }

  if (!ncmCode) return null; // Don't display if no NCM code submitted yet

  const formattedNcm = formatNcmCode(ncmCode);
  const hasBasicData = lastUpdateData && lastUpdateData.date && ncmDetails && ncmDetails.description;

  // Show error message ONLY if the app is NOT globally loading AND basic data is still missing
  if (!appIsLoading && ncmCode && (!lastUpdateData || !ncmDetails || !lastUpdateData.date || !ncmDetails.description)) {
     return (
        <div className="p-6 bg-white shadow-lg rounded-lg mb-6 space-y-3">
            <p className="text-md text-red-500">
                Não foi possível carregar todas as informações básicas para o NCM {formattedNcm}.
                { !lastUpdateData?.date && " (Data da última atualização indisponível)"}
                { !ncmDetails?.description && " (Descrição do NCM indisponível)"}
            </p>
        </div>
     );
  }


  return (
    <div className="p-6 bg-white shadow-lg rounded-lg mb-6 space-y-3">
      {lastUpdateData && lastUpdateData.date && (
        <p className="text-md text-gray-700">
          <span className="font-semibold">Última Atualização Comex Stat:</span> {lastUpdateData.date} 
          {lastUpdateData.month && lastUpdateData.year && 
            ` (Dados consolidados até ${getMonthNamePtBR(lastUpdateData.month)} de ${lastUpdateData.year})`}
        </p>
      )}
      {ncmDetails && (
        <>
          <p className="text-md text-gray-700">
            <span className="font-semibold">NCM {formattedNcm}:</span> {ncmDetails.description || 'N/A'}
          </p>
          <p className="text-md text-gray-700">
            <span className="font-semibold">Unidade Estatística:</span> {ncmDetails.unit || 'N/A'}
          </p>
        </>
      )}
      {/* A mensagem de erro agora é tratada acima, de forma mais precisa */}
    </div>
  );
};

export default InfoDisplay;
