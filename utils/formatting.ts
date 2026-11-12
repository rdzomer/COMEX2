const intFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Inteiro com separador de milhar pt-BR. Ex: 259544 -> '259.544' */
export function formatIntegerPtBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '–';
  if (!isFinite(value)) return 'N/A';
  return intFmt.format(value);
}

/** Duas casas decimais pt-BR. Ex: 2595.449015 -> '2.595,45' */
export function formatDecimalPtBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '–';
  if (!isFinite(value)) return 'N/A';
  return decFmt.format(value);
}

/** Valor já em pontos percentuais. Ex: 12.345 -> '12,35%' */
export function formatPercentagePtBR(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '';
  if (!isFinite(value)) return 'N/A';
  return `${decFmt.format(value)}%`;
}

/** Número abreviado para eixos: 1.234.567 -> '1,2 mi' */
export function formatCompactPtBR(value: number): string {
  if (value === null || value === undefined || isNaN(value)) return '';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const f = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n);
  if (abs >= 1e9) return `${sign}${f(abs / 1e9)} bi`;
  if (abs >= 1e6) return `${sign}${f(abs / 1e6)} mi`;
  if (abs >= 1e3) return `${sign}${f(abs / 1e3)} mil`;
  return `${sign}${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(abs)}`;
}

export function getMonthNamePtBR(monthNumber: number): string {
  return MONTHS_LONG[(monthNumber - 1 + 12) % 12] ?? String(monthNumber);
}

export function formatNcmCode(ncmCode: string): string {
  if (ncmCode && ncmCode.length === 8) {
    return `${ncmCode.substring(0, 4)}.${ncmCode.substring(4, 6)}.${ncmCode.substring(6, 8)}`;
  }
  return ncmCode;
}

/** Remove pontos/espaços e completa com zeros à esquerda (NCMs lidas do Excel como número perdem o zero inicial). */
export function normalizeNcm(value: unknown): string {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  return digits.length < 8 ? digits.padStart(8, '0') : digits;
}

/** Converte números que podem vir formatados da API. */
export function parseApiNumber(value: any): number {
  if (typeof value === 'number') {
    return isNaN(value) || !isFinite(value) ? 0 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Se já está em formato numérico simples (ex.: "1234.56"), não remove o ponto decimal
    const cleaned = /^-?\d+(\.\d+)?$/.test(trimmed) ? trimmed : trimmed.replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) || !isFinite(num) ? 0 : num;
  }
  return 0;
}

export const pad2 = (n: number | string) => String(n).padStart(2, '0');
