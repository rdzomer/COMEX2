# Analisador Comex Stat NCM

Aplicação web (React + Vite) que gera a ficha de comércio exterior de uma NCM com dados da API Comex Stat (MDIC), espelhando o notebook `Ficha_NCM_individual.ipynb`:

- Séries anuais desde 2004 (US$ FOB, kg, quantidade estatística, CIF, frete, seguro, balança e preços médios), com o ano corrente e o mesmo período do ano anterior (até o último mês disponível).
- Quadros resumo de variação anual de importações e exportações.
- Gráficos anuais, preços médios, balança comercial e importações acumuladas em 12 meses.
- Blocos de 12 meses (P1–P5) com as comparações P5 vs P4, P5 vs Média(P2:P4) e P5 vs Média(P1:P4).
- Análise de surto de importação.
- Origem/destino por país (ano anterior completo e ano corrente até o mês), com treemaps em US$ FOB e kg.
- Planilhas internas (CGIM/DINTE e NF-e) lidas no navegador, por upload.
- Exportação para Excel e geração da **Ficha individual da NCM em Word (.docx)**.

## Rodar localmente

```bash
npm install
npm run dev
```

O deploy no Netlify usa `npm run build` e publica a pasta `dist` (ver `netlify.toml`).
