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

## Importação do Word

Ao importar um docx, o sistema aplica o padrão próprio: comandos viram caixas de código (por fonte
monoespaçada, caixas de uma célula ou reconhecimento de comandos), os títulos são reajustados,
"Atenção:" e "Dica:" viram avisos e a numeração vira passos. O botão "Arrumar formatação" faz o
mesmo em notas já salvas.
