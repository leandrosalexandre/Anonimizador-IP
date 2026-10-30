// Detector de nomes de pessoas (SPEC Fase 4), em camadas:
// 1. blocos de qualificação ("NOME:", "Mãe:", "Testemunha:"…), com papel sugerido;
// 2. gatilhos no texto corrido ("a vítima", "filho de", "vulgo"…);
// 3. sequências de palavras capitalizadas ou em CAIXA ALTA, reforçadas por listas de prenomes e
//    sobrenomes e quebradas nas palavras da lista de exclusão;
// 5. autoridades (Delegado, Escrivão…) sugeridas como "manter";
// 6. apelidos ("vulgo", "conhecido como", "alcunha").
// A camada 4 (exclusão) está embutida na 3. Empresas privadas também são detectadas aqui.
import { AUTHORITY_TITLE } from './data/exclusoes';
import { FIRST_NAMES, SURNAMES } from './lexicon';
import { PARTICLES, fold } from './text';
import type { Candidate, PersonRole } from './types';

// Palavra capitalizada; ponto só em abreviações curtas ("Jr.", "Dr."), não no fim da frase.
const CAP_WORD =
  "(?:[\\p{Lu}][\\p{L}]{0,2}\\.(?=[ \\t]+\\p{Lu}[\\p{L}'’]+(?:[ \\t,]|$))|[\\p{Lu}][\\p{L}'’]*(?:-[\\p{L}]+)*)";
const PARTICLE = "(?:das|dos|da|de|do|e|d['’]|DAS|DOS|DA|DE|DO|E|D['’])(?![\\p{L}])";
/** Sequência de palavras capitalizadas (permitindo partículas e uma quebra de linha). */
const NAME_SEQUENCE = new RegExp(
  // Uma quebra de linha só continua o nome se a linha seguinte não for outro campo ("Rótulo:").
  `(?<![\\p{L}\\p{N}])${CAP_WORD}(?:(?:[ \\t]+|[ \\t]*\\n[ \\t]*(?![^\\n:]{1,30}:))(?:${PARTICLE}[ \\t]+)?${CAP_WORD})*`,
  'gu',
);

interface Span {
  start: number;
  end: number;
  text: string;
}

/** Divide uma sequência capitalizada nas palavras excluídas e remove partículas nas pontas. */
export function splitOnExclusions(span: Span, exclusions: ReadonlySet<string>): Span[] {
  const parts: Span[] = [];
  const words = [...span.text.matchAll(/[^\s]+/gu)];
  let current: RegExpMatchArray[] = [];
  const flush = () => {
    while (current.length && PARTICLES.has(fold(current[0]?.[0] ?? ''))) current.shift();
    while (current.length && PARTICLES.has(fold(current[current.length - 1]?.[0] ?? '')))
      current.pop();
    const first = current[0];
    const last = current[current.length - 1];
    if (first && last) {
      const start = span.start + (first.index ?? 0);
      const end = span.start + (last.index ?? 0) + last[0].length;
      parts.push({ start, end, text: span.text.slice(start - span.start, end - span.start) });
    }
    current = [];
  };
  for (const w of words) {
    const token = fold(w[0]).replace(/[.'’]+$/u, '');
    // "e" entre nomes separa duas pessoas ("JOSÉ NUNES e ANTÔNIA NUNES").
    const head = token.split('-')[0] ?? token; // "Intime-se" → "intime"
    if (exclusions.has(token) || exclusions.has(head) || /^\d/.test(token) || token === 'e')
      flush();
    else current.push(w);
  }
  flush();
  return parts
    .map((p) => {
      // Ponto final colado na última palavra não faz parte do nome ("SOUZA." no fim da frase).
      const trimmed = p.text.replace(/\.$/u, '');
      return { ...p, text: trimmed, end: p.start + trimmed.length };
    })
    .filter((p) => p.text.length > 1);
}

function nameScore(text: string): { tokens: string[]; first: boolean; surname: number } {
  const tokens = fold(text)
    .split(/[\s\n]+/)
    .map((t) => t.replace(/[.'’]+$/u, ''))
    .filter((t) => t && !PARTICLES.has(t));
  return {
    tokens,
    first: FIRST_NAMES.has(tokens[0] ?? ''),
    surname: tokens.filter((t) => SURNAMES.has(t) || FIRST_NAMES.has(t)).length,
  };
}

/** Confiança de que uma sequência capitalizada é nome de pessoa (0 = descartar). */
export function sequenceConfidence(text: string): number {
  const { tokens, first, surname } = nameScore(text);
  if (tokens.length === 0) return 0;
  if (tokens.some((t) => t.length === 1 && !/^[a-z]$/.test(t))) return 0;
  if (tokens.length === 1) return 0; // nome isolado só por gatilho ou variante conhecida
  let c = 0.35;
  if (first) c += 0.35;
  if (surname >= 2) c += 0.15;
  else if (surname === 1 && !first) c += 0.1;
  if (tokens.length > 7) c -= 0.3;
  return Math.min(c, 0.9);
}

function personCandidate(
  span: Span,
  confidence: number,
  detector: string,
  role?: PersonRole,
): Candidate {
  return { type: 'PESSOA', ...span, confidence, detector, ...(role ? { role } : {}) };
}

/** Primeiro nome válido em `text` a partir de `offset` (para rótulos e gatilhos). */
function nameAt(
  text: string,
  offset: number,
  exclusions: ReadonlySet<string>,
  allowSingle: boolean,
): Span | null {
  const slice = text.slice(offset, offset + 160);
  const re = new RegExp(NAME_SEQUENCE.source, 'u');
  const m = re.exec(slice);
  if (!m || (m.index ?? 0) > 2) return null;
  const span = { start: offset + (m.index ?? 0), end: 0, text: m[0] };
  span.end = span.start + span.text.length;
  const first = splitOnExclusions(span, exclusions)[0];
  if (!first || first.start !== span.start) return null;
  const tokens = nameScore(first.text).tokens;
  if (tokens.length === 1 && !allowSingle) return null;
  return first;
}

// ---------------------------------------------------------------- 1. Qualificação

const LABELS: [RegExp, PersonRole | 'KEEP' | null][] = [
  [/nome(?:\s+completo)?|qualificado|declarante|interrogad[oa]/, null],
  [/filia[çc][ãa]o|m[ãa]e|pai|genitora?|genitor/, 'FAMILIAR'],
  [/v[íi]tima|ofendid[oa]/, 'VÍTIMA'],
  [/testemunha/, 'TESTEMUNHA'],
  [/investigad[oa]|suspeit[oa]/, 'INVESTIGADO'],
  [/indiciad[oa]|autor(?:a)?(?:\s+do\s+fato)?|acusad[oa]|r[ée]u|denunciad[oa]/, 'AUTOR'],
  [/conduzid[oa]|preso|presa|flagranteado/, 'CONDUZIDO'],
  [/comunicante|noticiante|requerente/, 'COMUNICANTE'],
  [/informante/, 'INFORMANTE'],
  [/advogad[oa]|defensor(?:a)?\s+constitu[íi]d[oa]|procurador[a]?/, 'ADVOGADO'],
  [
    /c[ôo]njuge|companheir[oa]|espos[oa]|irm[ãa]o?|filh[oa]s?|respons[áa]vel(?:\s+legal)?/,
    'FAMILIAR',
  ],
  [
    /atendente|escriv[ãa]o?|escriv[ãa]|delegad[oa]|inspetor[a]?|perit[oa](?:\s+criminal)?|agente|autoridade|condutor(?:\s+do\s+flagrante)?/,
    'KEEP',
  ],
];

const LABEL_RE = new RegExp(
  `(?:^|[\\n;]|\\b)(${LABELS.map(([re]) => re.source).join('|')})\\s*:\\s*`,
  'giu',
);

function labelRole(label: string): PersonRole | 'KEEP' | null {
  const f = label.toLowerCase();
  for (const [re, role] of LABELS) if (new RegExp(`^(?:${re.source})$`, 'iu').test(f)) return role;
  return null;
}

export function detectQualification(text: string, exclusions: ReadonlySet<string>): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(LABEL_RE)) {
    const role = labelRole(m[1] ?? '');
    let offset = (m.index ?? 0) + m[0].length;
    // Filiação: "PAI e MÃE" ou "MÃE e PAI".
    for (let i = 0; i < 2; i++) {
      const span = nameAt(text, offset, exclusions, true);
      if (!span) break;
      const c = personCandidate(
        span,
        0.95,
        'qualificacao',
        role && role !== 'KEEP' ? role : undefined,
      );
      if (role === 'KEEP') c.authority = true;
      out.push(c);
      const and = /^\s+e\s+/iu.exec(text.slice(span.end, span.end + 6));
      if (!and || role !== 'FAMILIAR') break;
      offset = span.end + and[0].length;
    }
  }
  return out;
}

// ---------------------------------------------------------------- 2. Gatilhos no texto corrido

const TRIGGERS: [string, PersonRole | null][] = [
  ['(?:a|à|da|pela|como|com\\s+a)?\\s*v[íi]tima', 'VÍTIMA'],
  ['(?:pel[oa]|do|da)\\s+(?:interrogad[oa]|depoente)', null],
  ['(?:o|do|pelo)\\s+autor(?:\\s+do\\s+fato)?', 'AUTOR'],
  ['(?:o|a|do|da)\\s+indiciad[oa]', 'AUTOR'],
  ['(?:o|a|do|da)\\s+investigad[oa]', 'INVESTIGADO'],
  ['(?:o|a|do|da)\\s+suspeit[oa]', 'INVESTIGADO'],
  ['(?:o|a|do|da)\\s+conduzid[oa]', 'CONDUZIDO'],
  ['(?:a|da|pela)\\s+testemunha', 'TESTEMUNHA'],
  ['(?:a|o|da|do)\\s+informante', 'INFORMANTE'],
  ['(?:a|o)\\s+comunicante', 'COMUNICANTE'],
  ['(?:a|o|pel[ao])\\s+declarante', null],
  ['(?:o|a)\\s+nacional', null],
  ['(?:o|a)\\s+senhor[a]?', null],
  ['(?:o|a)\\s+sr[a]?\\.?', null],
  ['filh[oa]\\s+de', 'FAMILIAR'],
  [
    '(?:o|a|seu|sua)\\s+(?:pai|m[ãa]e|genitor[a]?|irm[ãa]o?|espos[oa]|marido|companheir[oa]|namorad[oa]|filh[oa]|av[ôóo]|tio|tia|primo|prima)',
    'FAMILIAR',
  ],
  ['(?:o|a)\\s+vizinh[oa]', null],
  ['(?:o|a)\\s+advogad[oa]', 'ADVOGADO'],
  ['como\\s+sendo', null],
  ['de\\s+propriedade\\s+de', null],
  ['em\\s+nome\\s+de', null],
  ['titularidade\\s+de', null],
  ['contra', null],
  ['(?:intime|ou[çc]a|notifique|oficie)-se', null],
];

const TRIGGER_RE = new RegExp(
  `(?<![\\p{L}])(?:${TRIGGERS.map(([t]) => `(${t})`).join('|')})[\\s,:]+(?:["“]\\s*)?`,
  'giu',
);

export function detectTriggers(text: string, exclusions: ReadonlySet<string>): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(TRIGGER_RE)) {
    const groupIndex = m.slice(1).findIndex((g) => g !== undefined);
    const role = TRIGGERS[groupIndex]?.[1] ?? null;
    const span = nameAt(text, (m.index ?? 0) + m[0].length, exclusions, true);
    if (!span) continue;
    const { tokens, first } = nameScore(span.text);
    // Nome isolado só se for prenome conhecido ou estiver em caixa alta.
    if (tokens.length === 1 && !first) continue;
    out.push(
      personCandidate(span, tokens.length === 1 ? 0.75 : 0.85, 'gatilho', role ?? undefined),
    );
  }
  return out;
}

// ---------------------------------------------------------------- 3. Sequências capitalizadas

/** Nomes de pessoas que batizam leis, ruas, escolas etc. não são envolvidos ("Lei Maria da Penha"). */
const NAMED_AFTER =
  /(?:^|[^\p{L}])(?:lei|leis|rua|avenida|av\.|travessa|pra[çc]a|escola|col[ée]gio|hospital|instituto|universidade|faculdade|funda[çc][ãa]o|f[óo]rum|est[áa]dio|terminal|conjunto|residencial|edif[íi]cio|condom[íi]nio|ponte|viaduto|unidade|creche|posto|igreja|par[óo]quia|capela|comunidade|associa[çc][ãa]o)(?:\s+(?:estadual|municipal|federal|dr\.?|dra\.?|prof\.?|profa\.?|padre|pe\.|santo|santa|s[ãa]o|governador|presidente|deputado|senador|general|coronel|marechal))*[\s:]*$/iu;

export function detectCapitalized(text: string, exclusions: ReadonlySet<string>): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(NAME_SEQUENCE)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] };
    for (const part of splitOnExclusions(span, exclusions)) {
      if (NAMED_AFTER.test(text.slice(Math.max(0, part.start - 40), part.start))) continue;
      const confidence = sequenceConfidence(part.text);
      if (confidence >= 0.3) out.push(personCandidate(part, confidence, 'sequencia'));
    }
  }
  return out;
}

// ---------------------------------------------------------------- 5. Autoridades

/** Marca como autoridade os nomes precedidos (na mesma linha) ou seguidos de um cargo. */
export function markAuthorities(text: string, candidates: Candidate[]): void {
  for (const c of candidates) {
    if (c.type !== 'PESSOA') continue;
    const before = text.slice(Math.max(0, c.start - 45), c.start);
    const sameLine = before.split('\n').pop() ?? '';
    const titleBefore = new RegExp(`${AUTHORITY_TITLE.source}[\\s:,]*(?:dr[a]?\\.?\\s*)?$`, 'iu');
    const after = text.slice(c.end, c.end + 70);
    const nextLine = /^[ \t,]*\n[ \t]*([^\n]*)/u.exec(after)?.[1] ?? '';
    const sameLineAfter = /^[ \t]*[,–-][ \t]*([^\n]*)/u.exec(after)?.[1] ?? '';
    if (
      titleBefore.test(sameLine) ||
      new RegExp(`^${AUTHORITY_TITLE.source}`, 'iu').test(nextLine) ||
      /^(?:mat(?:r[íi]cula)?\.?|DPC)\b/iu.test(nextLine) ||
      new RegExp(`^${AUTHORITY_TITLE.source}`, 'iu').test(sameLineAfter)
    ) {
      c.authority = true;
    }
  }
}

// ---------------------------------------------------------------- 6. Apelidos

const NICKNAME_RE =
  /(?<![\p{L}])(?:vulgo|alcunha(?:\s+de)?|conhecid[oa](?:\s+(?:apenas|somente|no\s+bairro|na\s+regi[ãa]o|pela?s?\s+\p{L}+))?\s+(?:como|por)|(?:pelo\s+)?apelido\s+(?:de\s+)?|apelidad[oa]\s+(?:de\s+)?)\s*[:,]?\s*/giu;

export function detectApelidos(text: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (start: number, value: string, confidence: number) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    const s = start + value.indexOf(trimmed);
    out.push({
      type: 'APELIDO',
      start: s,
      end: s + trimmed.length,
      text: trimmed,
      confidence,
      detector: 'apelido',
    });
  };
  for (const m of text.matchAll(NICKNAME_RE)) {
    const offset = (m.index ?? 0) + m[0].length;
    const rest = text.slice(offset, offset + 60);
    const quoted = /^["“'‘]([^"”'’\n]{2,40})["”'’]/u.exec(rest);
    if (quoted?.[1]) {
      push(offset + 1, quoted[1], 0.95);
      continue;
    }
    const bare = /^[\p{Lu}][\p{L}'’-]*(?:[ \t]+[\p{Lu}][\p{L}'’-]*){0,2}/u.exec(rest);
    if (bare) push(offset, bare[0], 0.85);
  }
  // "Alcunha: CHICO BALA" em blocos de qualificação.
  for (const m of text.matchAll(/\b(?:alcunha|apelido|vulgo)\s*:\s*([^\n,;]{2,40})/giu)) {
    const value = m[1] ?? '';
    const start = (m.index ?? 0) + m[0].length - value.length;
    if (!out.some((o) => o.start === start)) push(start, value.replace(/["“”]/g, ''), 0.95);
  }
  return out;
}

// ---------------------------------------------------------------- Empresas privadas

const COMPANY_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${CAP_WORD}|&|${PARTICLE})(?:[ \\t]+(?:${CAP_WORD}|&|${PARTICLE})){0,7}[ \\t]+(?:Ltda\\.?|LTDA\\.?|S\\.?\\s?/?A\\.?|EIRELI|Eireli|ME|EPP|MEI)(?![\\p{L}])`,
  'gu',
);

export function detectEmpresas(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(COMPANY_RE)) {
    let value = m[0];
    let start = m.index ?? 0;
    // Remove palavras iniciais genéricas ("Ao Senhor Gerente do", "Empresa").
    const lead =
      /^(?:(?:Ao|À|A|O|Na|No|Pela|Pelo|Empresa|Estabelecimento|Loja|Firma)\s+|(?:Senhor|Senhora|Sr\.?|Sra\.?|Ilmo\.?|Ilma\.?)\s+(?:(?:Gerente|Diretor[a]?|Representante|Presidente)\s+)?(?:(?:do|da|de)\s+)?|(?:Gerente|Diretor[a]?|Representante)\s+(?:(?:do|da|de)\s+)?)+/u.exec(
        value,
      );
    if (lead) {
      start += lead[0].length;
      value = value.slice(lead[0].length);
    }
    // Bancos e instituições financeiras são mantidos por padrão (não identificam pessoas).
    const isBank = /^(?:Banco|Caixa|Cooperativa)\b/iu.test(value);
    out.push({
      type: 'EMPRESA_PRIVADA',
      start,
      end: start + value.length,
      text: value,
      confidence: 0.85,
      detector: 'empresa',
      ...(isBank ? { authority: true } : {}),
    });
  }
  return out;
}
