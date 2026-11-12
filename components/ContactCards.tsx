import React from 'react';
import { EntityContactInfo } from '../types.ts';

/** Cartões de contato das entidades responsáveis pela NCM (dados da planilha CGIM/DINTE). */
const get = (r: EntityContactInfo, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(r).find(h => h.trim().toLowerCase() === k.toLowerCase());
    const v = hit ? String(r[hit] ?? '').trim() : '';
    if (v && v !== '0' && v.toLowerCase() !== 'nan') return v;
  }
  return '';
};

const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;

function Person({ role, name, cargo, email, phone, mobile }: { role: string; name: string; cargo: string; email: string; phone: string; mobile: string }) {
  if (!name && !email && !phone && !mobile) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{role}</p>
      {name && <p className="mt-0.5 font-semibold text-slate-900">{name}</p>}
      {cargo && <p className="text-xs text-slate-500">{cargo}</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {email && email.split(/[;,\s]+/).filter(e => e.includes('@')).map(e => (
          <li key={e} className="flex items-center gap-2 truncate">
            <span aria-hidden className="text-slate-400">✉</span>
            <a href={`mailto:${e}`} className="truncate text-brand-600 hover:underline">{e}</a>
          </li>
        ))}
        {phone && <li className="flex items-center gap-2"><span aria-hidden className="text-slate-400">☎</span><a href={telHref(phone.split('/')[0])} className="text-slate-700 hover:text-brand-600">{phone}</a></li>}
        {mobile && <li className="flex items-center gap-2"><span aria-hidden className="text-slate-400">📱</span><a href={telHref(mobile)} className="text-slate-700 hover:text-brand-600">{mobile}</a></li>}
      </ul>
    </div>
  );
}

const ContactCards: React.FC<{ contacts: EntityContactInfo[]; title: string }> = ({ contacts, title }) => (
  <div>
    <h3 className="mb-3 font-semibold text-slate-800">{title}</h3>
    <div className="grid gap-4 lg:grid-cols-2">
      {contacts.map((r, i) => {
        const sigla = get(r, 'Sigla Entidade') || r['Aba'];
        const nome = get(r, 'Entidade');
        return (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-10 min-w-10 flex-none items-center justify-center rounded-lg bg-brand-50 px-2 text-xs font-bold text-brand-700">{sigla}</span>
              <p className="pt-2 text-sm font-medium leading-snug text-slate-700">{nome.replace(new RegExp(`^${sigla}\\s*-\\s*`, 'i'), '') || sigla}</p>
            </div>
            <div className="mt-4 grid gap-5 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <Person role="Dirigente" name={get(r, 'Nome do Dirigente')} cargo={get(r, 'Cargo')} email={get(r, 'E-mail')} phone={get(r, 'Telefone')} mobile={get(r, 'Celular')} />
              <Person role="Contato" name={get(r, 'Contato Importante')} cargo={get(r, 'Cargo (Contato Importante)')} email={get(r, 'E-mail (Contato Importante)')} phone={get(r, 'Telefone (Contato Importante)')} mobile={get(r, 'Celular (Contato Importante)')} />
            </div>
          </div>
        );
      })}
    </div>
    <p className="mt-2 text-[11px] text-slate-400">Fonte: planilha CGIM/DINTE enviada.</p>
  </div>
);

export default ContactCards;
