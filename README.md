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

## Cestas por entidade (`#/cestas`)

Análise das cestas de NCMs de cada entidade (ABAL, IABR, IBÁ…), com filtros por categoria e subcategorias,
séries anuais, composição, tabela hierárquica até NCM (com link para a ficha individual), importações
acumuladas em 12 meses e países.

- **Dados:** `public/cestas/*.json`, gerados pela tarefa do GitHub Actions *Atualizar cestas por entidade*
  (`.github/workflows/atualizar-cestas.yml`), que roda nos dias 7, 10 e 15 de cada mês e consulta a API
  devagar (1 chamada a cada 8 s). Se a API ainda não publicou mês novo, ela não faz nada.
  Para rodar na hora: *Actions → Atualizar cestas por entidade → Run workflow*.
- **Classificação das NCMs:** `public/cestas/dicionario.json` (sem dados de contato), gerado a partir da
  planilha em `dados-fonte/` (veja `dados-fonte/README.md`).
