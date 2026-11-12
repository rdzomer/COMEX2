/**
 * Gera public/cestas/alertas.json (radar com os critérios padrão) e, opcionalmente,
 * o resumo em Markdown usado no aviso mensal por e-mail (issue do GitHub).
 * Uso: npx tsx scripts/gerar-alertas.ts [arquivo-resumo.md]
 */
import fs from 'node:fs';
import { alertasDaCesta, juntarAlertas, CRITERIOS_PADRAO, ROTULO_SINAL } from '../utils/alertas.ts';

const DIR = 'public/cestas';
const SITE = 'https://comexstat.netlify.app';
const manifest = JSON.parse(fs.readFileSync(`${DIR}/manifest.json`, 'utf8'));
const listas = [];
for (const e of manifest.entidades.filter((x: any) => x.arquivo)) {
  listas.push(alertasDaCesta(JSON.parse(fs.readFileSync(`${DIR}/${e.arquivo}`, 'utf8'))));
}
const alertas = juntarAlertas(listas);
const { ano, mes } = manifest.atualizacao;
fs.writeFileSync(`${DIR}/alertas.json`, JSON.stringify({
  geradoEm: new Date().toISOString(),
  atualizacao: manifest.atualizacao,
  criterios: CRITERIOS_PADRAO,
  alertas,
}));
const n = (lv: string) => alertas.filter(a => a.nivel === lv).length;
console.log(`Alertas: ${alertas.length} (alto ${n('alto')}, médio ${n('medio')}, atenção ${n('atencao')})`);

const resumo = process.argv[2];
if (resumo) {
  const fmtNcm = (c: string) => `${c.slice(0, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;
  const usd = (v: number) => `US$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v / 1e6)} mi`;
  const linha = (a: any) => `| [${fmtNcm(a.ncm)}](${SITE}/#/ncm/${a.ncm}) | ${a.entidades.map((e: any) => e.rotulo).join(', ')} | ${usd(a.importacao12mUsd)} | ${a.sinais.map((s: any) => `**${ROTULO_SINAL[s.tipo as keyof typeof ROTULO_SINAL]}:** ${s.texto}`).join('<br>')} |`;
  const tabela = (lv: string) => {
    const l = alertas.filter(a => a.nivel === lv);
    return l.length ? ['| NCM | Cesta | Importações 12 meses | Sinais |', '|---|---|---|---|', ...l.slice(0, 40).map(linha), l.length > 40 ? `\n…e mais ${l.length - 40}.` : ''].join('\n') : '_Nenhum._';
  };
  fs.writeFileSync(resumo, [
    `Dados Comex Stat atualizados até **${String(mes).padStart(2, '0')}/${ano}**. Radar completo, com filtros e critérios ajustáveis: ${SITE}/#/cestas`,
    '',
    `**${n('alto')}** alertas altos · **${n('medio')}** médios · ${n('atencao')} em observação`,
    '',
    '## 🔴 Alertas altos', tabela('alto'),
    '',
    '## 🟠 Alertas médios', tabela('medio'),
    '',
    '_Triagem automática para orientar a análise; confirme na ficha individual e na análise de surto da NCM._',
    '',
    'cc @rdzomer',
  ].join('\n'));
}
