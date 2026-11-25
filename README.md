# Segundo cérebro

Notas em Markdown, uma pasta por tema, com histórico em Git e busca instantânea.
Funciona no PC e no celular pelo navegador.

## Rodar

    npm install
    npm start          # http://localhost:3000

Variáveis opcionais: `PORT`, `NOTAS_DIR` (padrão `./notas`), `SENHA` (liga login básico).

    SENHA="uma-senha-forte" npm start

Requer Node 18+. Só há dependências em JavaScript puro, sem compilação nativa.

## Como funciona

- `notas/<tema>/<titulo>.md` com cabeçalho (título, tipo, tema, tags, datas) é a fonte da verdade.
- A busca roda em memória (sem banco) e o índice é refeito a partir dos arquivos a cada início e a cada salvamento.
- A pasta `notas/` é um repositório Git próprio: cada salvar, criar ou excluir vira um commit.
- Imagens de docx importados vão para `notas/_midia/`.
- Você pode editar os `.md` por fora (Obsidian, VS Code); reinicie o app para reindexar.

## Importar docx

Nova nota, Importar docx: o arquivo vira Markdown no editor. Escolha tema, tipo e tags e salve.
Nada é gravado antes de você salvar.

## Acesso pelo celular

Para usar fora de casa, deixe o app atrás de Nginx com HTTPS e acesse por VPN. Sem HTTPS,
o botão Copiar usa um método alternativo, mas funciona. Não exponha direto na internet.

## Próximos passos

Deploy (serviço systemd, Nginx, PWA) e, por último, a classificação automática.

## Formato das notas

O texto da nota usa duas marcas, no editor e nos arquivos:

- `// Título` é título de seção (`///` subseção, `////` item).
- `#` no começo da linha é código. Linhas seguidas formam uma caixa no estilo de prompt.

O resto é Markdown comum (negrito, listas, numeração em passos, tabelas, imagens, `Atenção:` e `Dica:`).
Notas antigas com `###` e blocos de código em Markdown continuam abrindo, e o editor as mostra já
convertidas para esse formato.

## Importação do Word

Ao importar um docx, `// Título` e `#` seguem a mesma regra. Também são reconhecidos títulos de estilo
do Word, fonte monoespaçada, caixas de uma célula e comandos comuns. O botão "Arrumar formatação"
no editor aplica tudo isso ao texto que você colar ou escrever.

## Início

Mapa de conexões: cada área é um nó ligado ao núcleo, e duas áreas se ligam quando compartilham tags.
Clique numa área para focar nela e ver suas notas e conexões. Há também anotação rápida (vai para
a área `caixa-de-entrada`) e números do acervo. Atalho `/` foca a busca.
