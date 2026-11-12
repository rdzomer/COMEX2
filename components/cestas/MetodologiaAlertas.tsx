import React from 'react';
import { CRITERIOS_PADRAO as C } from '../../utils/alertas.ts';

const pct = (x: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(x * 100)}%`;
const mi = (x: number) => `US$ ${new Intl.NumberFormat('pt-BR').format(x / 1e6)} milhões`;

function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} className="mt-10 border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">{children}</h2>;
}

const MetodologiaAlertas: React.FC = () => (
  <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 text-[15px] leading-relaxed text-slate-700 shadow-sm md:p-10">
    <a href="#/alertas" className="text-sm font-medium text-brand-600 hover:underline">← Voltar ao radar</a>
    <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-red-600">Radar de alertas das cestas</p>
    <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Metodologia</h1>
    <p className="mt-3 text-slate-600">
      O radar faz uma <b>triagem automática</b> das NCMs de cada cesta para apontar comportamentos fora do padrão
      que mereçam análise. Ele não substitui a análise técnica: a confirmação deve ser feita na ficha individual
      e na análise de surto da NCM.
    </p>

    <H2>1. Dados</H2>
    <ul className="mt-3 list-disc space-y-1.5 pl-5">
      <li><b>Fonte:</b> API Comex Stat (MDIC/SECEX). Importações mensais por NCM desde 2019 (US$ FOB e kg), séries anuais de importação e exportação desde 2010, e importações por país de origem (ano anterior completo e ano corrente até o último mês).</li>
      <li><b>Cestas:</b> NCMs de cada entidade segundo a planilha CGIM/DINTE (abas das entidades).</li>
      <li><b>Atualização:</b> automática, nos dias 7, 10 e 15 de cada mês, quando o Comex Stat publica o mês novo. Os alertas são recalculados na mesma rotina.</li>
      <li><b>Volume:</b> todos os cálculos de quantidade usam o peso líquido (kg).</li>
      <li><b>Consumo nacional aparente (opcional):</b> planilha de NF-e (RFB/SECEX), carregada pelo usuário e lida só no navegador dele.</li>
    </ul>

    <H2>2. Quais NCMs entram</H2>
    <p className="mt-3">
      Para evitar alertas sobre fluxos insignificantes, uma NCM só é avaliada nos sinais de importação se for <b>relevante</b>:
      importações nos últimos 12 meses de pelo menos <b>{mi(C.relevanciaUsd)}</b> <i>ou</i> pelo menos <b>{pct(C.relevanciaParticipacao)}</b> das
      importações da cesta no mesmo período. Para o sinal de exportação, exige-se pelo menos {mi(C.relevanciaUsd)} exportados no mesmo período do ano anterior.
    </p>

    <H2>3. Sinais</H2>
    <p className="mt-3">Os “12 meses” são sempre os 12 meses terminados no último mês publicado (ex.: nov/25 a out/26).</p>
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr><th className="px-3 py-2">Sinal</th><th className="px-3 py-2">Regra</th><th className="px-3 py-2 text-right">Pontos</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 align-top">
          <tr><td className="px-3 py-2 font-medium">📈 Surto em 12 meses</td><td className="px-3 py-2">Importações (kg) dos últimos 12 meses ≥ <b>{pct(1 + C.surto12m)}</b> da média dos três períodos de 12 meses anteriores (P5 vs média de P2, P3 e P4), o mesmo critério da análise de surto.</td><td className="px-3 py-2 text-right">3 · 4 se ≥ {pct(1 + 2 * C.surto12m)}</td></tr>
          <tr><td className="px-3 py-2 font-medium">⚡ Aceleração recente</td><td className="px-3 py-2">Importações (kg) dos últimos 3 meses ≥ <b>+{pct(C.aceleracao3m)}</b> sobre os mesmos 3 meses do ano anterior, ou fluxo novo (sem registro no ano anterior e mais da metade dos 12 meses concentrada nos últimos 3). É o sinal antecipado: aparece antes de o surto chegar à média de 12 meses.</td><td className="px-3 py-2 text-right">2 · 3 se ≥ +{pct(2 * C.aceleracao3m)}</td></tr>
          <tr><td className="px-3 py-2 font-medium">💲 Queda de preço com volume subindo</td><td className="px-3 py-2">Preço médio (US$ FOB/kg) dos últimos 12 meses ≥ <b>{pct(C.quedaPreco)}</b> abaixo dos 12 meses anteriores <i>e</i> volume maior. Pode indicar prática desleal de preço.</td><td className="px-3 py-2 text-right">2 · 3 se ≥ {pct(2 * C.quedaPreco)}</td></tr>
          <tr><td className="px-3 py-2 font-medium">📉 Queda de exportações</td><td className="px-3 py-2">Exportações (US$) do ano até o último mês ≥ <b>{pct(C.quedaExportacao)}</b> abaixo do mesmo período do ano anterior.</td><td className="px-3 py-2 text-right">2 · 3 se ≥ {pct(2 * C.quedaExportacao)}</td></tr>
          <tr><td className="px-3 py-2 font-medium">📍 Pico atípico no mês</td><td className="px-3 py-2">Importação (kg) do último mês acima da média + <b>{C.picoDesvios}</b> desvios-padrão dos 24 meses anteriores. <i>Só reforça:</i> sozinho não gera alerta.</td><td className="px-3 py-2 text-right">1</td></tr>
          <tr><td className="px-3 py-2 font-medium">🌐 Mudança de origem</td><td className="px-3 py-2">Um país ganha ≥ <b>{C.mudancaOrigemPp} p.p.</b> de participação nas importações (US$) entre o ano anterior e o ano corrente até o mês, ou entra entre os 3 maiores fornecedores com ≥ 10% (tendo menos de 5% antes). <i>Só reforça:</i> sozinho não gera alerta.</td><td className="px-3 py-2 text-right">1</td></tr>
        </tbody>
      </table>
    </div>

    <H2>4. Tamanho do movimento (materialidade)</H2>
    <p className="mt-3">
      Variações percentuais altas podem esconder volumes irrelevantes: passar de 1 t para 5 t é +400%, mas não afeta o mercado.
      Por isso, cada alerta mostra três medidas de tamanho:
    </p>
    <ul className="mt-3 list-disc space-y-1.5 pl-5">
      <li><b>Peso na cesta:</b> importações da NCM nos últimos 12 meses ÷ importações de toda a cesta no mesmo período (US$).</li>
      <li><b>Tamanho do aumento:</b> importações dos últimos 12 meses − importações dos 12 meses anteriores (US$ e kg), e esse aumento ÷ importações da cesta. Para alertas só de exportação, usa-se a queda das exportações ÷ exportações da cesta.</li>
      <li><b>Peso no consumo aparente (com NF-e):</b> importações ÷ consumo nacional aparente (produção vendida no mercado interno + importações), em kg, no último ano da NF-e, com a variação em pontos percentuais sobre o ano anterior.</li>
    </ul>
    <p className="mt-3"><b>Regra de materialidade:</b> um alerta só pode ser <b>alto</b> ou <b>médio</b> se o aumento for de pelo menos <b>{pct(C.impactoMinimo)}</b> das importações da cesta
      <i> ou </i> de pelo menos <b>{mi(C.impactoMinimoUsd)}</b>. Abaixo disso, ele fica <b>em observação</b>, com a indicação
      “variação grande, mas pequena em valor”. Se a NF-e estiver carregada, o alerta volta ao nível original quando as importações representam
      ≥ 10% do consumo aparente ou quando essa participação subiu ≥ 2 p.p. no último ano.</p>

    <H2>5. Gravidade</H2>
    <p className="mt-3">Os pontos dos sinais são somados, com dois acréscimos:</p>
    <ul className="mt-3 list-disc space-y-1.5 pl-5">
      <li>+1 se a NCM representa ≥ 5% das importações da cesta;</li>
      <li>+1 se o aumento equivale a ≥ 1% das importações da cesta.</li>
    </ul>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border-l-4 border-l-red-500 bg-red-50 p-3"><p className="font-semibold text-red-700">Alto</p><p className="text-sm">8 pontos ou mais, e material</p></div>
      <div className="rounded-xl border-l-4 border-l-orange-400 bg-orange-50 p-3"><p className="font-semibold text-orange-700">Médio</p><p className="text-sm">5 a 7 pontos, e material</p></div>
      <div className="rounded-xl border-l-4 border-l-amber-300 bg-amber-50 p-3"><p className="font-semibold text-amber-700">Em observação</p><p className="text-sm">até 4 pontos, ou sem materialidade</p></div>
    </div>
    <p className="mt-3 text-sm text-slate-500">Exemplo: surto forte (4) + aceleração (2) + queda de preço (2) = 8 → alto, desde que o aumento seja material.
      Uma NCM presente em mais de uma cesta aparece uma vez, com a avaliação da cesta em que pontuou mais.</p>

    <H2>6. Ajustes e e-mail</H2>
    <ul className="mt-3 list-disc space-y-1.5 pl-5">
      <li>Todos os limites acima podem ser alterados em <b>⚙ Critérios</b> no radar; o recálculo vale só para quem alterou.</li>
      <li>Todo mês, após a atualização, o resumo dos alertas altos e médios (com os critérios padrão) é enviado por e-mail.</li>
    </ul>

    <H2>7. Limitações</H2>
    <ul className="mt-3 list-disc space-y-1.5 pl-5">
      <li>Os dados do Comex Stat do último mês podem ser revisados nas publicações seguintes.</li>
      <li>A comparação de origens usa o ano anterior completo contra o ano corrente parcial; sazonalidade pode afetar as participações.</li>
      <li>A NF-e costuma estar disponível só até o ano anterior, então o peso no consumo aparente tem defasagem.</li>
      <li>O preço médio por kg mistura produtos diferentes dentro da mesma NCM; mudanças de composição também alteram o preço.</li>
      <li>As cestas dependem da classificação da planilha CGIM/DINTE; NCMs fora dela não são monitoradas.</li>
    </ul>
  </article>
);

export default MetodologiaAlertas;
