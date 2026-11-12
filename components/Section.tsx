import React, { useState, ReactNode } from 'react';

interface SectionProps {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

const Section: React.FC<SectionProps> = ({ id, title, description, actions, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <section id={id} className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <button onClick={() => setIsOpen(!isOpen)} className="group flex flex-1 items-start gap-3 text-left" aria-expanded={isOpen}>
          <span className={`mt-1 inline-flex h-5 w-5 flex-none items-center justify-center rounded-md text-slate-400 transition-transform group-hover:text-slate-600 ${isOpen ? 'rotate-90' : ''}`}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.17 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
          </span>
          <span>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </span>
        </button>
        {actions && <div className="flex flex-none items-center gap-2">{actions}</div>}
      </div>
      {isOpen && <div className="space-y-6 border-t border-slate-100 px-5 py-5">{children}</div>}
    </section>
  );
};

export default Section;
