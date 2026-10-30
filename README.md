# Anonimizador de IP

Aplicativo web progressivo (PWA), **100% offline**, para pseudonimizar inquéritos policiais antes
de submetê-los a uma IA e reidentificar a análise devolvida. Nada sai do aparelho: não há servidor,
telemetria nem comunicação com IA — o texto é copiado e colado manualmente.

A especificação completa está em [`SPEC.md`](./SPEC.md); as decisões técnicas, em
[`docs/DECISOES.md`](./docs/DECISOES.md).

> **Estado atual:** Fase 1 — cofres criptografados (criar, abrir, bloquear, exportar, importar e
> apagar). As telas de Documentos em diante ainda são provisórias.

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
```

Os testes E2E usam o build de produção, que é onde valem a CSP e o service worker.

## Publicação (GitHub Pages)

O workflow `.github/workflows/deploy.yml` roda lint e testes em todo push e publica a pasta `dist/`
no GitHub Pages a cada push na branch `main`. Configuração única no repositório: **Settings → Pages →
Build and deployment → Source: GitHub Actions**.

O repositório pode ser público: contém apenas código, nunca dados de inquéritos.

## Limitações

- Revisão humana é obrigatória: a detecção automática pode deixar passar dados.
- A pseudonimização não elimina o risco de identificação pelo contexto.
