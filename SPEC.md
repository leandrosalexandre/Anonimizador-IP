# SPEC – Anonimizador de Inquéritos (PWA offline)

Oct 29, 2026 · @Leandro

## 1. Contexto, objetivo e regras de trabalho

**Para o Claude Code:** salve este documento inteiro como `SPEC.md` na raiz do repositório e trate-o como a fonte de verdade do projeto. Crie também um `CLAUDE.md` curto apontando para ele.

**Quem vai usar.** Um Delegado de Polícia Civil que analisa inquéritos policiais (IPs) com apoio de IA. O IP é sigiloso (art. 20 do CPP) e contém dados pessoais de vítimas, autores, testemunhas e terceiros.

**Problema.** O usuário quer submeter o conteúdo do IP a uma IA externa (Claude) para análise jurídica sem expor a identidade dos envolvidos.

**Solução.** Um aplicativo web progressivo (PWA), instalável e 100% offline, que:

1. importa o IP em PDF (com texto ou escaneado);
2. faz OCR local nas páginas que são só imagem;
3. detecta dados pessoais e permite ao usuário revisar e atribuir papéis (Vítima 1, Autor 1, Testemunha 1 etc.);
4. gera o texto **pseudonimizado**, com marcadores no lugar dos dados;
5. guarda a tabela marcador → dado real num **cofre criptografado** que nunca sai do aparelho;
6. recebe de volta a análise feita pela IA e **reidentifica** os marcadores.

O app **não se comunica com nenhuma IA** e não tem servidor. O usuário copia e cola o texto manualmente.

**Regras de trabalho:**

- Trabalhe **uma fase por vez**, na ordem das seções 5 a 7. Ao fim de cada fase: rode os testes, faça um resumo do que foi feito e de como testar no navegador, e **pare, aguardando a palavra "pode seguir"**.
- Antes de codificar cada fase, apresente um plano curto (arquivos e decisões). Se algo nesta SPEC for inviável ou houver alternativa claramente melhor, explique e proponha antes de mudar.
- Interface, textos, mensagens de erro e comentários do usuário final em **português do Brasil**. Código e nomes de variáveis em inglês.
- Nunca use dados reais nos testes. Crie um **IP fictício** de referência (ver Fase 8) e use-o desde a Fase 2.
- Faça commits pequenos e descritivos ao fim de cada fase.

## 2. Requisitos inegociáveis de privacidade e segurança

1. **Nenhum dado sai do aparelho.** Nenhuma requisição de rede após o carregamento do app, exceto o download dos próprios arquivos do app pelo service worker. Sem analytics, telemetria, fontes externas, CDN em tempo de execução ou relatórios de erro remotos.
2. **Todos os recursos empacotados localmente:** bibliotecas, worker e núcleo WASM do OCR e o modelo de idioma português (`por.traineddata`). Tudo servido pelo próprio app e cacheado pelo service worker.
3. **Content Security Policy restritiva** via meta tag: `default-src 'self'`; `connect-src 'self'`; sem `unsafe-eval`, salvo se o WASM exigir `wasm-unsafe-eval`; `img-src 'self' blob: data:`; `worker-src 'self' blob:`.
4. **Cofre criptografado em repouso.** Todo conteúdo (texto do IP, imagens das páginas, tabela de entidades) é gravado no IndexedDB **apenas cifrado** com AES-GCM 256 (WebCrypto). Chave derivada da senha do cofre com PBKDF2-SHA-256 (mínimo 600.000 iterações) e salt aleatório por cofre. A senha e a chave nunca são gravadas.
5. **Bloqueio automático** do cofre após inatividade configurável (padrão: 10 minutos) e ao fechar ou ocultar o app. Bloquear = descartar a chave da memória.
6. **Sem logs de conteúdo.** Nunca registre no console texto do IP, nomes ou entidades. Logs de depuração só com metadados (contagens, tempos).
7. **Apagar cofre** com confirmação digitada (o usuário digita o nome do cofre). **Apagar tudo** nas configurações.
8. **Área de transferência:** ao copiar texto reidentificado (com nomes reais), exibir aviso. Ao copiar texto pseudonimizado, exibir o resultado da varredura residual (Fase 6).
9. **Teste automatizado de rede:** um teste E2E que percorre o fluxo completo e falha se houver qualquer requisição para origem diferente da do app.

## 3. Stack técnica, dispositivos-alvo e publicação

**Dispositivos-alvo:**

- Tablet **Xiaomi Mi Pad 5** (Android, Chrome), uso principal, com toque, telas de 11" em retrato e paisagem.
- Notebook e desktop com Chrome ou Edge atualizados.
- Interface responsiva, alvos de toque com no mínimo 44 px, tema claro e escuro.

**Stack sugerida** (proponha ajuste se houver motivo técnico):

| Necessidade | Escolha |
| --- | --- |
| Build e linguagem | Vite + TypeScript (modo strict) |
| Interface | React |
| PWA e offline | `vite-plugin-pwa` (Workbox), com pré-cache de todos os assets, incluindo WASM e `por.traineddata` |
| Leitura de PDF | `pdfjs-dist`, com worker local |
| OCR | `tesseract.js` (v5 ou superior), com worker, núcleo WASM e idioma `por` hospedados no próprio app |
| PDF pesquisável (opcional) | saída PDF do próprio Tesseract por página, unida com `pdf-lib` |
| Armazenamento | IndexedDB via `idb` ou Dexie, gravando apenas blobs cifrados |
| Criptografia | WebCrypto nativa (AES-GCM e PBKDF2), sem biblioteca externa |
| Testes | Vitest (unitários) e Playwright (E2E) |

**Desempenho no tablet:** OCR e extração de PDF sempre em **Web Worker**, nunca na thread principal. Processar página por página, com barra de progresso, estimativa de tempo e botão cancelar. Liberar memória das imagens após cada página.

**Publicação:** GitHub Pages via GitHub Actions, com `base` do Vite configurado para o caminho do repositório. O repositório pode ser público, porque contém apenas código e nenhum dado. Documente no `README.md` como instalar o PWA no Android (menu ⋮ → "Instalar app") e no computador (ícone de instalação na barra de endereço), e como o app recebe atualizações.

## 4. Modelo de dados e formato dos marcadores

**Cofre** (um por inquérito): `id`, `nome` (ex.: "IP 123/2026 – 24ª DP"), `criadoEm`, `atualizadoEm`, `salt`, `iteracoes`, `payloadCifrado`. Apenas `id`, `nome` e datas ficam em claro, para listar os cofres. O nome deve ser escolhido pelo usuário, e a tela de criação deve avisar para não usar nomes de pessoas no título.

**Conteúdo cifrado do cofre:**

- `documentos[]`: arquivo de origem (nome, hash SHA-256) e `paginas[]`.
- `pagina`: `numeroPdf`, `folha` (número de **fls.** do IP, ver abaixo), `origemTexto` (`pdf` ou `ocr`), `confiancaOcr`, `texto` (texto final, após correções do usuário), `imagem` (miniatura opcional, para revisão).
- `entidades[]`: `id`, `tipo`, `papel`, `indice`, `rotulo` (o marcador), `valorCanonico`, `variantes[]`, `decisao` (`pseudonimizar` ou `manter`), `ocorrencias[]` (página e posição).
- `config`: papéis personalizados e lista de nomes a manter.

**Tipos de entidade:** PESSOA, CPF, RG, CNH, TELEFONE, EMAIL, ENDERECO, CEP, PLACA, CHASSI\_RENAVAM, CONTA\_BANCARIA, CHAVE\_PIX, DATA\_NASCIMENTO, NUM\_PROCESSO, NUM\_BO, NUM\_IP, APELIDO, EMPRESA\_PRIVADA, OUTRO.

**Papéis para PESSOA (com índice):** VÍTIMA, AUTOR, INVESTIGADO, CONDUZIDO, TESTEMUNHA, INFORMANTE, COMUNICANTE, ADVOGADO, PESSOA (terceiro sem papel definido), FAMILIAR (filiação e parentes). O usuário pode criar papéis novos.

**Mantidos por padrão (não pseudonimizados):** autoridades e servidores públicos no exercício da função (Delegado, Escrivão, Inspetor, Juiz, Promotor, Defensor Público), nomes de órgãos (Delegacia, PCCE, SSPDS, PEFOCE, Vara, MP) e dispositivos legais. O usuário pode inverter qualquer decisão.

**Formato dos marcadores:** sempre entre colchetes, maiúsculas e acentuação padronizada:

- Pessoas: `[VÍTIMA 1]`, `[AUTOR 2]`, `[TESTEMUNHA 3]`, `[FAMILIAR 1]`.
- Dados: `[CPF 1]`, `[TELEFONE 2]`, `[ENDEREÇO 1]`, `[PLACA 1]`, `[DATA DE NASCIMENTO 1]`, `[APELIDO 1]`.
- O apelido ligado a uma pessoa vira `[APELIDO DE AUTOR 1]`. Endereços de pessoas viram `[ENDEREÇO DE VÍTIMA 1]` quando o vínculo for conhecido.
- A numeração é estável dentro do cofre: a mesma pessoa recebe sempre o mesmo marcador, em todos os documentos do inquérito.

**Folhas (fls.):** o usuário cita elementos do IP sempre por **folhas**, não por página do PDF. O app deve: (a) tentar detectar o número da folha em cada página (carimbos como "fls. 12", "Fl. 12" ou número isolado no canto superior direito); (b) permitir ao usuário informar o deslocamento ("a página 1 do PDF corresponde à fls. 3") ou corrigir página a página; (c) incluir no texto exportado um cabeçalho por página no formato `=== fls. 12 (PDF p. 14) ===`.

## 5. Fases 0 a 3: estrutura PWA, cofre, importação de PDF e OCR

### Fase 0 – Estrutura e PWA offline

- Criar o projeto (Vite + React + TS strict), ESLint, Prettier, Vitest e Playwright.
- Configurar o `vite-plugin-pwa`: manifesto (nome "Anonimizador de IP", ícones 192 e 512, `display: standalone`, orientação livre) e service worker com pré-cache de todos os assets.
- Aplicar a CSP do item 2.3.
- Criar o esqueleto de navegação: **Cofres → Documentos → Revisão → Exportar → Reidentificar → Configurações**.
- Criar o workflow do GitHub Actions para publicar no GitHub Pages, e o README com instruções de instalação.
- **Aceite:** o app instala no Chrome, abre sem internet (modo avião) e a auditoria PWA do Lighthouse passa.

### Fase 1 – Cofre criptografado

- Criar cofre (nome + senha com confirmação + indicador de força). Abrir cofre com senha. Bloquear manualmente e por inatividade.
- Módulo `crypto.ts`: `deriveKey`, `encrypt` e `decrypt` (AES-GCM, IV aleatório de 12 bytes por gravação). Testes unitários de ida e volta e de senha errada.
- **Exportar cofre:** arquivo `.ipcofre` (JSON com metadados em claro + payload cifrado), protegido pela senha do cofre. **Importar cofre** a partir desse arquivo, para levar o inquérito a outro aparelho.
- Apagar cofre com confirmação digitada.
- **Aceite:** dados no IndexedDB ilegíveis sem a senha (verificar no DevTools); exportação e importação entre dois perfis de navegador funcionam; senha errada mostra erro claro, sem travar o app.

### Fase 2 – Importação de PDF e extração de texto

- Importar um ou mais PDFs para o cofre aberto (seletor de arquivos e arrastar e soltar no computador).
- Para cada página, extrair o texto com `pdfjs-dist`. Classificar a página como **"com texto"** se houver texto útil (por exemplo, mais de 30 caracteres alfanuméricos), ou **"imagem"** caso contrário.
- Reconstruir a ordem de leitura com quebras de linha razoáveis (juntar itens de texto por linha a partir das coordenadas).
- Detectar o número de **fls.** de cada página (item 4) e oferecer o ajuste de deslocamento.
- Tela **Documentos:** lista de páginas com miniatura, número do PDF, fls., tipo (texto, imagem ou OCR feito) e botão "Ver texto".
- **Aceite:** com o IP fictício de teste, todas as páginas com texto são extraídas corretamente e as escaneadas aparecem marcadas como "imagem".

### Fase 3 – OCR offline

- Botão **"Fazer OCR das páginas sem texto"** (e opção por página).
- Renderizar a página com pdf.js a cerca de 300 DPI. Pré-processamento leve (escala de cinza, contraste e binarização opcional). Rodar o `tesseract.js` com idioma `por` em worker.
- Barra de progresso por página e geral, estimativa de tempo restante e botão cancelar. Processar uma página por vez e liberar a memória.
- Guardar a confiança média por página e destacar em amarelo as palavras de baixa confiança.
- **Tela de conferência:** imagem da página e texto editável lado a lado (empilhados no tablet em retrato), com zoom na imagem. Correções do usuário substituem o texto da página.
- **Opcional (deixar atrás de uma opção):** gerar um **PDF pesquisável** (imagem original com camada de texto) e salvá-lo no aparelho.
- **Aceite:** sem internet, o OCR funciona nas páginas escaneadas do IP fictício, com taxa de acerto aceitável em nomes e números; medir e informar o tempo por página num aparelho Android de desempenho similar ao Mi Pad 5 (Snapdragon 860, 6 GB de RAM).

## 6. Fases 4 a 6: detecção, tela de revisão e exportação

### Fase 4 – Detecção de dados pessoais

Módulo `detectors/` com detectores independentes e testados, cada um retornando candidatos com tipo, trecho, posição e confiança. A detecção deve **errar para o lado de detectar demais**: é melhor o usuário descartar um falso positivo do que deixar passar um nome.

**Detectores por padrão (regex + validação):**

- CPF, com e sem pontuação, validando os dígitos verificadores. CNPJ de pessoa física e empresa.
- RG (formatos variados, com órgão emissor "SSP/CE" etc.) e CNH.
- Telefone (fixo e celular, com ou sem DDD, "+55").
- E-mail e chave Pix (CPF, telefone, e-mail ou chave aleatória UUID).
- Placa (padrão antigo AAA-9999 e Mercosul AAA9A99), chassi e Renavam.
- CEP e endereço (gatilhos: Rua, R., Avenida, Av., Travessa, Tv., Alameda, Rodovia, Conjunto, Quadra, Lote, nº, Apto, Bairro), capturando até o fim lógico do endereço.
- Data de nascimento (datas próximas de "nascido", "nascida", "DN", "data de nascimento" ou idade).
- Conta bancária e agência.
- Número de processo no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO), número de BO e número de IP.

**Detector de nomes de pessoas (heurístico, em camadas):**

1. **Blocos de qualificação:** capturar o valor após rótulos como "NOME:", "Nome:", "FILIAÇÃO:", "Mãe:", "Pai:", "Conduzido:", "Vítima:", "Testemunha:", "Investigado:", "Comunicante:", "Advogado:" e "OAB". Já sugerir o papel conforme o rótulo.
2. **Gatilhos no texto corrido:** "a vítima", "o autor", "o investigado", "o conduzido", "a testemunha", "o nacional", "a nacional", "filho de", "filha de", "vulgo", "conhecido como", "companheiro", "esposa" etc., seguidos de nome.
3. **Sequências de palavras capitalizadas ou em CAIXA ALTA**, com 2 ou mais tokens, aceitando partículas (da, de, do, das, dos, e), reforçadas por uma **lista embarcada de prenomes brasileiros comuns** (por exemplo, a partir de dados públicos do IBGE, cerca de 5 mil nomes) e de sobrenomes comuns.
4. **Lista de exclusão** (não é pessoa): cargos, órgãos, termos jurídicos, nomes de leis, meses, logradouros já capturados como endereço, "Estado do Ceará", "Fortaleza" etc. Editável nas configurações.
5. **Autoridades a manter:** nomes próximos de "Delegado(a) de Polícia", "Escrivão(ã)", "Inspetor(a)", "Juiz(a)", "Promotor(a)", "Defensor(a) Público(a)" e de assinaturas funcionais ("DPC", "matrícula") são sugeridos como **manter**, mas exibidos na revisão para confirmação.
6. **Apelidos:** capturar o termo após "vulgo", "conhecido como" ou "alcunha", vinculando-o à pessoa mais próxima.

**Agrupamento de variantes:** normalizar (sem acentos, minúsculas, sem partículas) e agrupar "MARIA DA SILVA SOUZA", "Maria da Silva Souza", "Maria Souza" e "Maria" na mesma entidade quando houver compatibilidade de tokens. Os casos ambíguos (dois "João" diferentes) vão para a revisão como sugestão, nunca como fusão automática. Tolerância a erros de OCR por distância de edição pequena (1 a 2 caracteres em nomes longos).

**Aceite:** no IP fictício, 100% dos CPFs, telefones e placas e pelo menos 95% das ocorrências de nomes de envolvidos detectados antes da revisão. Testes unitários para cada detector, com casos positivos e negativos.

### Fase 5 – Tela de revisão

- Lista de entidades agrupadas por tipo e papel, mostrando: valor canônico, variantes, número de ocorrências, fls. onde aparece e decisão (pseudonimizar ou manter).
- Ações: **atribuir papel** (Vítima, Autor etc., com numeração automática e editável), **mesclar** entidades, **separar** variante, **descartar** (falso positivo), **manter** (autoridade ou público), **vincular** dado a uma pessoa (CPF, telefone e endereço da VÍTIMA 1).
- **Visualização do texto** com destaques coloridos por papel. Tocar num destaque abre a entidade. **Selecionar um trecho manualmente** e marcar como nova entidade (para o que o detector perdeu).
- **Aplicar a todo o cofre:** uma decisão vale para todas as ocorrências em todos os documentos.
- Pré-visualização lado a lado: original × pseudonimizado.
- Indicador de progresso da revisão (por exemplo, "38 de 42 entidades revisadas"). A exportação fica bloqueada enquanto houver entidade de PESSOA sem decisão.

### Fase 6 – Exportação do texto pseudonimizado

- Gerar o texto final substituindo cada ocorrência pelo marcador (substituir da maior para a menor variante, para não quebrar nomes compostos).
- Cabeçalho por página `=== fls. X (PDF p. Y) ===`.
- **Bloco de instruções para a IA** no topo do texto exportado, editável nas configurações. Texto padrão: "Este texto foi pseudonimizado. Mantenha todos os marcadores entre colchetes exatamente como estão (ex.: \[VÍTIMA 1\], \[AUTOR 2\]); não tente inferir identidades. Cite os elementos pelas folhas indicadas nos cabeçalhos (fls.)."
- **Legenda de papéis** opcional ("\[VÍTIMA 1\] = vítima; \[AUTOR 1\] = autor"), sem nenhum dado real.
- **Varredura residual obrigatória** antes de copiar: rodar de novo todos os detectores sobre o texto já pseudonimizado e listar o que ainda parece dado pessoal (sequências de dígitos, palavras capitalizadas fora da lista de exclusão, prenomes da lista). O usuário corrige ou confirma.
- **Divisão em partes** para IPs longos: opção de dividir por número aproximado de caracteres, respeitando os limites das páginas, com "Parte 1 de N" no topo de cada uma.
- Saídas: copiar para a área de transferência (por parte), baixar `.txt` e baixar `.md`.
- **Aceite:** no IP fictício, o texto exportado não contém nenhum nome, CPF, telefone, placa ou endereço de envolvido (verificado por teste automatizado que procura os valores reais conhecidos).

## 7. Fases 7 e 8: reidentificação, testes e polimento

### Fase 7 – Reidentificação da análise

- Tela **Reidentificar:** o usuário cola a análise devolvida pela IA, ou importa um `.txt` ou `.md`.
- Substituir cada marcador pelo valor canônico da entidade, com opção de formato: só o nome ("Maria da Silva") ou nome com papel ("Maria da Silva (vítima)").
- **Tolerância a variações** que a IA possa introduzir: sem colchetes ("Vítima 1"), sem acento ("VITIMA 1"), caixa diferente ("vitima 1"), plural ou artigo ("a \[VÍTIMA 1\]"). Restrinja a tolerância a rótulos existentes no cofre, para não substituir palavras comuns.
- **Relatório de reidentificação:** marcadores substituídos (com contagem), marcadores **desconhecidos** (que não existem no cofre, possivelmente inventados pela IA), destacados para o usuário verificar.
- Saídas: visualizar, copiar (com o aviso do item 2.8), baixar `.txt` e `.md`, e **imprimir ou salvar como PDF** pelo diálogo de impressão do navegador, com folha de estilo de impressão limpa.
- Opcional: guardar no cofre o histórico de análises reidentificadas (cifrado).
- **Aceite:** um texto de análise de teste contendo todas as variações acima é reidentificado corretamente, e um marcador inventado ("\[VÍTIMA 9\]") aparece no relatório como desconhecido.

### Fase 8 – Testes, IP fictício e polimento

- **IP fictício de referência** em `test/fixtures/`, gerado por script, com cerca de 15 páginas: portaria, BO, termos de declaração de vítima e testemunhas, termo de qualificação e interrogatório, auto de apreensão, laudo, despacho e relatório. Deve incluir: nomes compostos, nomes em caixa alta, apelido ("vulgo"), filiação, CPF, RG, telefones, placas nos dois padrões, endereços, número CNJ, Delegado e Escrivão (a manter) e carimbo de fls. Gerar duas versões: PDF com texto e PDF "escaneado" (páginas rasterizadas, com leve rotação e ruído), além de um `gabarito.json` com todas as entidades esperadas.
- **Testes unitários** (Vitest): criptografia, cada detector, agrupamento de variantes, substituição, reidentificação tolerante e mapeamento de folhas.
- **Testes E2E** (Playwright): fluxo completo criar cofre → importar → OCR → revisar → exportar → reidentificar; teste de **zero requisições externas**; teste **offline** (contexto sem rede após a primeira carga); exportar e importar cofre.
- **Métricas** a reportar com o IP fictício: precisão e cobertura da detecção (comparando com o gabarito) e tempo de OCR por página.
- **Polimento:** acessibilidade (rótulos, contraste, navegação por teclado no computador), mensagens de erro em português claro, estados vazios explicativos, tela "Como usar" com o fluxo em 7 passos e tela "Sobre" explicando que nada sai do aparelho.
- **Entrega final:** app publicado no GitHub Pages, README com instalação, uso e limitações (manuscritos não são reconhecidos; pseudonimização não elimina o risco de identificação pelo contexto; revisão humana obrigatória).

## 8. Comandos curtos por fase

Depois que o `SPEC.md` estiver salvo no repositório, use um comando por vez e teste antes de liberar o seguinte.

| Momento | Comando para colar no Claude Code |
| --- | --- |
| Início | "Salve este documento como SPEC.md, crie o CLAUDE.md apontando para ele e apresente o plano da Fase 0. Não codifique ainda." |
| Fase 0 | "Execute a Fase 0 do SPEC.md. Ao final, rode os testes, explique como instalar e testar offline e pare." |
| Fase 1 | "Pode seguir: execute a Fase 1 do SPEC.md e pare ao final." |
| Fase 2 | "Pode seguir: gere primeiro o IP fictício da Fase 8 e depois execute a Fase 2." |
| Fase 3 | "Pode seguir: execute a Fase 3 (OCR) e informe o tempo médio por página." |
| Fase 4 | "Pode seguir: execute a Fase 4 e me mostre a precisão e a cobertura contra o gabarito." |
| Fase 5 | "Pode seguir: execute a Fase 5 (tela de revisão)." |
| Fase 6 | "Pode seguir: execute a Fase 6 e mostre um trecho do texto exportado do IP fictício." |
| Fase 7 | "Pode seguir: execute a Fase 7 (reidentificação)." |
| Fase 8 | "Pode seguir: conclua a Fase 8, publique no GitHub Pages e me passe o endereço do app." |
| Correções | "No teste da Fase X, aconteceu \[descrever\]. Corrija sem alterar o que já funciona e rode os testes de novo." |
