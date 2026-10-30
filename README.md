# Anonimizador de IP

Aplicativo web progressivo (PWA), **100% offline**, para pseudonimizar inquéritos policiais antes
de submetê-los a uma IA e reidentificar a análise devolvida. Nada sai do aparelho: não há servidor,
telemetria nem comunicação com IA — o texto é copiado e colado manualmente.

A especificação completa está em [`SPEC.md`](./SPEC.md); as decisões técnicas, em
[`docs/DECISOES.md`](./docs/DECISOES.md).

> **Estado atual:** Fase 6 — cofres criptografados, importação de PDFs, OCR offline, detecção e
> revisão de dados pessoais e exportação do texto pseudonimizado. A reidentificação (Fase 7) vem a
> seguir.

## Endereço

Depois de publicado: `https://leandrosalexandre.github.io/Anonimizador-IP/`

## Instalação

### Android (Chrome) — Xiaomi Mi Pad 5

1. Abra o endereço acima no Chrome, **com internet**, e aguarde a página carregar.
2. Toque no menu **⋮** (canto superior direito) → **Instalar app** (ou "Adicionar à tela inicial").
3. Confirme. O ícone "Anonimizador" aparece na tela inicial e abre em tela cheia.

### Computador (Chrome ou Edge)

1. Abra o endereço acima.
2. Clique no **ícone de instalação** no lado direito da barra de endereço (um monitor com uma seta)
   ou, no menu, em **Instalar Anonimizador de IP…** (no Edge: **Aplicativos → Instalar este site
   como um aplicativo**).

### Como testar o funcionamento offline

1. Abra o app uma vez com internet. Um aviso "Pronto para uso sem internet" confirma que todos os
   arquivos foram guardados no aparelho.
2. Ative o **modo avião** (ou desligue o Wi-Fi).
3. Abra o app pelo ícone instalado: ele carrega normalmente e o selo no topo mostra
   "Sem internet · funcionando offline". Navegue por todas as etapas.

No computador, dá para simular em DevTools (F12) → **Application → Service workers → Offline**, ou
**Network → No throttling → Offline**, e recarregar a página.

## Atualizações

O app verifica se há versão nova sempre que é aberto com internet. Quando houver, aparece o aviso
**"Há uma nova versão do app disponível"** com o botão **Atualizar agora**. A atualização nunca é
aplicada sozinha, para não interromper uma revisão em andamento. Sem internet, o app continua na
versão instalada. Os cofres (Fase 1 em diante) ficam guardados no aparelho e não são afetados pela
atualização.

## Cofres e segurança

- Cada inquérito fica num **cofre** protegido por senha. O conteúdo é gravado no aparelho só
  cifrado (AES-GCM 256, chave derivada da senha com PBKDF2-SHA-256 e 600.000 iterações). O nome do
  cofre e as datas ficam visíveis para listar os cofres, por isso **não use nomes de pessoas no
  nome do cofre**.
- **Não há recuperação de senha.** Sem a senha, o cofre não pode ser aberto.
- O cofre **bloqueia sozinho** após 10 minutos sem uso e quando o app sai da tela. Os dois tempos
  podem ser ajustados em Configurações.
- **Levar para outro aparelho:** em Cofres, toque em **Exportar** para baixar um arquivo
  `.ipcofre` (cifrado com a mesma senha). No outro aparelho, use **Importar cofre** e digite a
  senha.

## Documentos e folhas

- Em **Documentos**, selecione um ou mais PDFs (no computador, também dá para arrastar). Cada
  página é lida neste aparelho e classificada como **Texto** ou **Imagem** (escaneada, sem
  texto; o OCR vem na próxima etapa).
- O app procura o carimbo de folha de cada página ("Fls. 12", "Fl. 12" ou número no canto
  superior direito). Se a numeração não for detectada, informe "a página 1 do PDF corresponde à
  fls. N" ou corrija página por página em **Corrigir fls.**
- O PDF original fica guardado cifrado no cofre, para o OCR e para levar o cofre a outro aparelho.

## OCR das páginas escaneadas

- Em **Documentos**, toque em **Fazer OCR das páginas sem texto** (ou em **Fazer OCR** numa página).
  O reconhecimento acontece neste aparelho, sem internet, uma página por vez, com progresso,
  estimativa de tempo e botão **Cancelar OCR**. Mantenha o app aberto na tela até terminar:
  se o cofre bloquear, o OCR para, e as páginas já concluídas ficam salvas.
- Em **Conferir**, a imagem da página aparece ao lado do texto (empilhados com o tablet em pé),
  com zoom. Palavras de baixa confiança ficam destacadas em amarelo. Use **Corrigir texto** para
  ajustar; a correção substitui o texto da página.
- Em Configurações: binarização (para cópias manchadas) e **PDF pesquisável** (cópia do PDF com
  camada de texto, para baixar; o arquivo baixado **não é cifrado**).
- Textos manuscritos e números de folha escritos à mão não são reconhecidos.

## Revisão dos dados pessoais

1. Em **Revisão**, toque em **Detectar dados pessoais**. O app sugere as entidades (pessoas,
   CPFs, telefones, endereços…), com papel (vítima, autor…) e número, e sugere **manter** as
   autoridades (Delegado, Escrivão…).
2. Na aba **Entidades**, abra cada uma para ajustar o papel e o número, decidir entre pseudonimizar
   e manter, vincular dados a uma pessoa, mesclar duplicadas, separar variantes ou descartar falsos
   positivos. **Confirmar sugestões** aceita um grupo inteiro.
3. Na aba **Texto**, confira os destaques página a página. Toque num destaque para abrir a entidade;
   selecione um trecho que a detecção perdeu para marcá-lo. Ligue **Original × pseudonimizado**
   para ver o resultado.
4. A exportação só é liberada quando todas as pessoas estiverem revisadas.

## Exportação

Em **Exportar** (liberado depois da revisão):

1. Escolha as opções: instruções para a IA no topo, legenda de papéis e divisão em partes para IPs
   longos.
2. **Varredura residual**: o app analisa de novo o texto já pseudonimizado e lista o que ainda
   parece dado pessoal. Para cada item, **Pseudonimizar** ou **Não é dado pessoal**. Copiar e
   baixar só são liberados depois disso.
3. **Copiar** (por parte), **Baixar .txt** ou **Baixar .md** e colar na IA.

## Desenvolvimento

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm run dev        # servidor de desenvolvimento (sem CSP e sem service worker)
npm run build      # build de produção em dist/
npm run preview    # serve dist/ em http://localhost:4173/Anonimizador-IP/
npm run lint       # ESLint + Prettier
npm test           # testes unitários (Vitest)
npm run test:e2e   # testes E2E (Playwright): offline, CSP, instalabilidade e zero requisições externas
npm run fixtures   # regera o IP fictício e o gabarito em test/fixtures/
npm run bench:ocr  # mede o OCR no IP fictício escaneado (tempo, CER, acerto de entidades)
npm run metrics    # precisão e cobertura da detecção de dados pessoais contra o gabarito
```

O **IP fictício** de referência (`test/fixtures/`) tem versões com texto, escaneada e mista, além
de `gabarito.json` com todas as entidades esperadas. Todos os dados são inventados.

Os testes E2E usam o build de produção, que é onde valem a CSP e o service worker.

## Publicação (GitHub Pages)

O workflow `.github/workflows/deploy.yml` roda lint e testes em todo push e publica a pasta `dist/`
no GitHub Pages a cada push na branch `main`. Configuração única no repositório: **Settings → Pages →
Build and deployment → Source: GitHub Actions**.

O repositório pode ser público: contém apenas código, nunca dados de inquéritos.

## Limitações

- Revisão humana é obrigatória: a detecção automática pode deixar passar dados.
- A pseudonimização não elimina o risco de identificação pelo contexto.
