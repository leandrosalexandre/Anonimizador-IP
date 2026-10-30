# Métricas (IP fictício de referência)

Medidas com o IP fictício de `test/fixtures/` (15 páginas, 51 entidades, 125 ocorrências; todos os
dados são inventados). Para reproduzir: `npm run metrics` (detecção) e
`npm run build && npm run bench:ocr` (OCR).

## OCR (PDF escaneado: 200 DPI, rotação de até 0,8°, ruído)

| Métrica                                                                         | Resultado                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tempo médio por página (servidor de CI, Chromium headless, 1 núcleo por worker) | **2,2 a 3,4 s** (variação entre execuções)                                                                                                                                                                                        |
| Estimativa para o Xiaomi Mi Pad 5 (Snapdragon 860)                              | **6 a 9 s por página**: estimativa por desempenho de núcleo, não medida (a emulação de CPU do Chrome não afeta Web Workers). O app mostra o tempo médio real ao fim de cada OCR                                                   |
| Taxa de erro de caracteres (CER)                                                | **0,52%**                                                                                                                                                                                                                         |
| Folhas detectadas no carimbo                                                    | **15/15**                                                                                                                                                                                                                         |
| Ocorrências encontradas no texto do OCR                                         | nomes 98%; CPF, RG, CNH, telefone, placa, CEP, datas, BO, IP e CNJ 100%; endereço 89%; chassi/Renavam 75%; e-mail e chave Pix 0% (grafia alterada pelo OCR: `@`→`Q`, quebra de linha), compensados pela tolerância dos detectores |

## Detecção de dados pessoais (antes da revisão)

| Texto                         | Nomes de envolvidos | CPF · telefone · placa | Demais tipos                            | Precisão            | Autoridades sugeridas "manter" |
| ----------------------------- | ------------------- | ---------------------- | --------------------------------------- | ------------------- | ------------------------------ |
| PDF com texto                 | **100%** (45/45)    | **100%** (8 · 7 · 6)   | 100% em todos                           | **99,1%** (112/113) | 13/13                          |
| Texto do OCR do PDF escaneado | **100%** (53/53)    | **100%**               | 100% das ocorrências presentes no texto | 93,8%*              | 17/17                          |

Aceite do SPEC (Fase 4): 100% de CPFs, telefones e placas e ≥ 95% dos nomes. **Atingido.**

\* No texto do OCR, a maioria dos "falsos positivos" são dados verdadeiros com a grafia alterada
pelo OCR (e-mail com `Q`, chassi com `O`, endereço com `;`), que não batem letra a letra com o
gabarito. O único falso positivo real nas duas medições é "Avenida Central" (um logradouro citado no
relato).

**Ressalva:** o IP fictício foi criado junto com o app; num IP real, espere mais falsos positivos e
alguma perda. Por isso os detectores têm também 49 testes com casos variados fora do gabarito, e a
revisão humana é obrigatória.

## Exportação e reidentificação

| Verificação                                                                                                               | Resultado                                                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Texto exportado do IP fictício (aceitando as sugestões) contém algum nome, CPF, telefone, placa ou endereço de envolvido? | **Nenhum** (teste unitário e E2E procuram todas as variantes reais do gabarito) |
| Itens da varredura residual depois de aceitar as sugestões                                                                | 3, todos números não pessoais (matrícula do Delegado, laudo, ofício)            |
| Reidentificação com variações da IA (sem colchetes, sem acento, caixa, artigo, plural com lista)                          | correta; `[VÍTIMA 9]` inventado aparece como desconhecido                       |

## Desempenho

| Operação                                                             | Resultado     |
| -------------------------------------------------------------------- | ------------- |
| Detecção em 450 páginas                                              | ~0,5 s (Node) |
| Fluxo completo (PDF misto com 4 páginas de OCR) no E2E, sem internet | ~19 s         |

## Testes automatizados

- **Unitários (Vitest): 183** — criptografia, cofre e `.ipcofre`, força da senha, bloqueio
  automático, extração de PDF e folhas, pré-processamento e texto do OCR, cada detector,
  agrupamento de variantes, revisão, substituição, exportação, varredura residual e
  reidentificação tolerante.
- **E2E (Playwright)**: fluxo completo offline; zero requisições externas (verificado em todos os
  fluxos); funcionamento offline; instalabilidade e CSP; cofre (criar, senha errada, bloqueio,
  exportar/importar entre perfis, apagar); documentos; OCR e conferência; revisão; exportação;
  reidentificação; acessibilidade (axe, temas claro e escuro, sem violações sérias ou críticas) e
  navegação por teclado. Rodam no desktop e no formato tablet (800 × 1280, toque).
