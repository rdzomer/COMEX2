# Planilha das cestas (CGIM/DINTE)

Coloque aqui a planilha `*.xlsx` com as abas das entidades (ABAL, IABR, IBÁ...), no mesmo formato de
`cgim_dinte.xlsx` (colunas NCM, NO_NCM_POR, Categoria, Subcategoria (1) a (4)).

**Para atualizar as cestas:** no GitHub, abra esta pasta → *Add file* → *Upload files*, envie a planilha
nova (apague a antiga, se o nome for diferente) e confirme. A tarefa "Atualizar cestas por entidade"
roda sozinha, gera `public/cestas/dicionario.json` (só NCM, descrição, categoria e subcategorias —
nenhum contato vai para o site) e reconsulta a API. Leva cerca de 1 hora.

> ⚠️ Só coloque a planilha aqui com o repositório **privado**, porque ela contém contatos pessoais.
