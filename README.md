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

## Cestas de NCMs (`#/cestas`)

Duas famílias de cestas, escolhidas pelo seletor *Por entidade / Temáticas*:

- **Por entidade** (ABAL, IABR, IBÁ…): NCMs de cada entidade setorial, vindas da planilha CGIM/DINTE.
- **Temáticas**: cestas montadas por tema. Hoje há a de **Minerais críticos e estratégicos**, com os 27 minerais da lista
  do CIMCE em três classes de prioridade (I, II e III) e, no topo da página, pizzas de importação e exportação de cada classe,
  por mineral, mais o balanço por mineral.

Em todas há filtros por categoria e subcategorias,
séries anuais, composição, tabela hierárquica até NCM (com link para a ficha individual), importações
acumuladas em 12 meses e países.

- **Dados:** `public/cestas/*.json`, gerados pela tarefa do GitHub Actions *Atualizar cestas de NCMs*
  (`.github/workflows/atualizar-cestas.yml`), que roda nos dias 7, 10 e 15 de cada mês e consulta a API
  devagar (1 chamada a cada 8 s). Se a API ainda não publicou mês novo, ela não faz nada.
  Para rodar na hora: *Actions → Atualizar cestas de NCMs → Run workflow* (o campo *only* aceita, por exemplo, `MINERAIS`).
- **Classificação das NCMs:** `public/cestas/dicionario.json` (sem dados de contato), gerado a partir da
  planilha em `dados-fonte/` (veja `dados-fonte/README.md`).
- **Minerais críticos e estratégicos:** a lista (classes → minerais → etapas da cadeia → prefixos de NCM) fica em
  `dados-fonte/minerais-criticos.json`. `scripts/build-tematicas.mjs` expande cada prefixo para as NCMs de 8 dígitos da tabela
  oficial do Comex Stat e grava `public/cestas/dicionario-tematicas.json`. Para incluir ou tirar uma NCM, edite o JSON no GitHub:
  a tarefa refaz o dicionário e reconsulta a API. Cada NCM entra uma só vez (no mineral principal), e manufaturas ficam de fora.
