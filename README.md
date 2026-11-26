# NEXUM

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

## Subpastas

Além da pasta (tema), uma nota pode ter uma **subpasta** opcional: `linux` com `zabbix` e `ad`, por exemplo.
No mapa, a subpasta aparece como uma cápsula tracejada ligada à pasta, e as notas saem dela. A subpasta é
gravada no cabeçalho da nota (`sub`); o arquivo continua em `notas/<tema>/`.

## Modos de acesso: editor e somente leitura

Um único processo atende duas portas:

| Porta | Modo | Variável |
|---|---|---|
| 3000 | Editor (padrão) | `PORT` |
| 3001 | Somente leitura | `PORT_VIEW` (use `0` para desligar) |

A porta de leitura recusa qualquer escrita no servidor e esconde os botões de edição. Senhas separadas:
`SENHA` protege o editor e `SENHA_VIEW` protege a leitura. Sem `SENHA_VIEW`, a porta de leitura fica aberta.

    SENHA="senha-do-editor" SENHA_VIEW="senha-de-leitura" npm start

Para compartilhar só a leitura, exponha apenas a porta 3001 (no Nginx ou no firewall).

## Tipos de nota

Tutorial, Erro e solução, **Script**, Ideia e Anotação. O Script tem modelo próprio (o que faz, requisitos,
como executar, código).

## Ligações entre notas

Uma nota pode ser ligada a outras, em par (grava `liga` no cabeçalho das duas). O uso principal é
ligar um **script** ao **manual** do mesmo item: o manual mostra o script que o automatiza, e o script
mostra o manual. No editor, o campo "Ligações" aceita o título da outra nota.

O sistema também **sugere** ligações quando os títulos parecem tratar do mesmo item (ignorando palavras
como "script" e "manual") e permite resolver com um clique, no editor, na nota e no início.
"Ignorar" guarda a decisão no navegador. No mapa, notas ligadas aparecem unidas por uma linha dourada.

## Início

Mapa de conexões: cada área é um nó ligado ao núcleo, e duas áreas se ligam quando compartilham tags.
Clique numa área para focar nela e ver suas notas e conexões. Há também anotação rápida (vai para
a área `caixa-de-entrada`) e números do acervo. Atalho `/` foca a busca.
