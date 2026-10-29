# CLAUDE.md

A fonte de verdade deste projeto é o [`SPEC.md`](./SPEC.md). Leia-o antes de qualquer tarefa.

Resumo das regras (detalhes no SPEC):

- PWA 100% offline para pseudonimizar inquéritos policiais. **Nenhuma requisição de rede** a outra origem, sem telemetria, sem CDN; todos os assets (incl. WASM e `por.traineddata`) empacotados localmente.
- Conteúdo do cofre gravado **apenas cifrado** (AES-GCM 256, PBKDF2-SHA-256 ≥ 600.000 iterações). Nunca registrar conteúdo do IP, nomes ou entidades no console.
- **Uma fase por vez** (seções 5 a 7 do SPEC). Plano curto antes de codificar; ao fim de cada fase: testes, resumo, como testar, commit — e parar até ouvir "pode seguir".
- Interface e textos ao usuário em **português do Brasil**; código e identificadores em inglês.
- Nunca usar dados reais em testes; usar o IP fictício de `test/fixtures/` (Fase 8).
- Decisões técnicas tomadas ao longo das fases ficam registradas em `docs/DECISOES.md`.

Comandos (a partir da Fase 0): `npm run dev`, `npm run build`, `npm run lint`, `npm test` (Vitest), `npm run test:e2e` (Playwright).
