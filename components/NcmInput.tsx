import React, { useState } from 'react';

interface NcmInputProps {
  onSubmit: (ncmCode: string) => void;
  loading: boolean;
  variant?: 'hero' | 'bar';
}

/** Aceita o código com ou sem pontos (ex.: 7213.10.00 ou 72131000), como o notebook. */
const NcmInput: React.FC<NcmInputProps> = ({ onSubmit, loading, variant = 'bar' }) => {
  const [ncm, setNcm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = ncm.replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('NCM inválida. Informe 8 dígitos (ex.: 7213.10.00 ou 72131000).');
      return;
    }
    setError(null);
    onSubmit(digits);
  };

  const hero = variant === 'hero';
  return (
    <form onSubmit={handleSubmit} className={hero ? 'w-full max-w-xl' : 'w-full max-w-md'}>
      <div className={`flex items-center gap-2 rounded-xl bg-white ${hero ? 'p-2 shadow-lg ring-1 ring-slate-200' : 'p-1 ring-1 ring-white/20'}`}>
        <svg className={`ml-2 h-5 w-5 flex-none ${hero ? 'text-slate-400' : 'text-slate-400'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a.75.75 0 11-1.06 1.06l-3.08-3.08A7 7 0 012 9z" clipRule="evenodd" /></svg>
        <input
          id={`ncm-input-${variant}`}
          type="text"
          inputMode="numeric"
          value={ncm}
          onChange={e => { setNcm(e.target.value); setError(null); }}
          placeholder="Código NCM, ex.: 7213.10.00"
          maxLength={12}
          aria-label="Código NCM"
          className={`min-w-0 flex-1 bg-transparent font-medium tracking-wide text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none ${hero ? 'py-2 text-lg' : 'py-1.5 text-sm'}`}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className={`flex-none rounded-lg bg-brand-500 font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60 ${hero ? 'px-6 py-2.5' : 'px-4 py-1.5 text-sm'}`}
        >
          {loading ? 'Analisando…' : 'Analisar'}
        </button>
      </div>
      {error && <p className={`mt-2 text-sm ${hero ? 'text-red-600' : 'text-red-200'}`}>{error}</p>}
    </form>
  );
};

export default NcmInput;
