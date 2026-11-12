import React, { useRef, useState } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  label: string;
  hint?: string;
  acceptedFileTypes?: string;
  loading?: boolean;
  fileName?: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, label, hint, acceptedFileTypes = '.xlsx,.xls', loading, fileName }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const take = (files: FileList | null) => {
    if (files && files[0]) onFileUpload(files[0]);
    if (ref.current) ref.current.value = '';
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}
      className={`rounded-xl border-2 border-dashed p-4 transition ${drag ? 'border-brand-500 bg-brand-50' : fileName ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-300 bg-slate-50'}`}
    >
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3 flex items-center gap-3">
        <input type="file" ref={ref} onChange={e => take(e.target.files)} accept={acceptedFileTypes} className="hidden" disabled={loading} />
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? 'Processando…' : fileName ? 'Substituir arquivo' : 'Selecionar arquivo'}
        </button>
        <span className="truncate text-xs text-slate-500" title={fileName ?? undefined}>
          {fileName ? <>✓ {fileName}</> : 'ou arraste o arquivo aqui'}
        </span>
      </div>
    </div>
  );
};

export default FileUpload;
