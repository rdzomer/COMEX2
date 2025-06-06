
// Função para formatar números com separadores de milhar (português) (ponto como separador de milhar)
// e sem casas decimais. Ex: 259544 -> '259.544'
export function formatIntegerPtBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0';
  return new Intl.NumberFormat('pt-BR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// Função para formatar números com separadores de milhar (português) e duas casas decimais.
// Ex: 2595.449015 -> '2.595,45'
export function formatDecimalPtBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '0,00';
   // Handle cases like Infinity or -Infinity which can result from division by zero
  if (!isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('pt-BR', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercentagePtBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return ''; // Or '0,00%' or 'N/A'
  if (!isFinite(value)) return 'N/A';
  return `${formatDecimalPtBR(value)}%`;
}

export function getMonthNamePtBR(monthNumber: number): string {
  const date = new Date();
  date.setMonth(monthNumber - 1);
  return date.toLocaleString('pt-BR', { month: 'long' });
}

export function formatNcmCode(ncmCode: string): string {
  if (ncmCode && ncmCode.length === 8) {
    return `${ncmCode.substring(0, 4)}.${ncmCode.substring(4, 6)}.${ncmCode.substring(6, 8)}`;
  }
  return ncmCode;
}

// Função para parsear números que podem vir formatados da API (pt-BR)
export function parseApiNumber(value: any): number {
  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? 0 : value;
  }
  if (typeof value === 'string') {
    // Remove separadores de milhar (pontos) e substitui vírgula decimal por ponto
    const cleanedString = value.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleanedString);
    return isNaN(num) || !isFinite(num) ? 0 : num;
  }
  return 0;
}
