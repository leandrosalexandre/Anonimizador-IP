// Detector de nomes de pessoas (SPEC Fase 4, revisto para "precisão primeiro"), em camadas:
// 1. blocos de qualificação ("Nome:", "Filiação:", "Vítima:", "ACUSADOS:"…), com papel sugerido.
//    O nome termina na quebra de linha, no próximo rótulo ("Data de Nascimento:"), na troca de
//    CAIXA ALTA para outra caixa ou numa palavra da lista de exclusão; no máximo 7 palavras.
//    Filiação e listas ("A, B E C") viram pessoas distintas;
// 2. gatilhos no texto corrido ("a vítima", "o acusado", "filho de", "vulgo"…);
// 3. sequências de palavras capitalizadas ou em CAIXA ALTA. Só são aplicadas automaticamente se
//    começarem por um prenome conhecido e tiverem 2 ou mais palavras; as demais vão para
//    "Sugestões (não aplicadas)" na revisão;
// 4. lista de exclusão e trechos bloqueados (municípios, instituições, valores de rótulos de lugar);
// 5. autoridades (Delegado, Escrivão, Perito…) sugeridas como "manter"; profissionais pelo contexto
//    (médico com CRM, advogado com OAB) recebem papel próprio;
// 6. apelidos ("vulgo", "conhecido como", "alcunha").
// Empresas privadas também são detectadas aqui.
import { AUTHORITY_TITLE } from './data/exclusoes';
import { FIRST_NAMES, SURNAMES } from './lexicon';
import { blockedRanges, labelStartsField, nextLabelStart, overlapsAny, type Range } from './places';
import { PARTICLES, fold, isUpper } from './text';
import type { Candidate, PersonRole } from './types';

/** Máximo de palavras (sem partículas) num nome. */
export const MAX_NAME_TOKENS = 7;

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
/** A mesma sequência, sem atravessar a quebra de linha (blocos de qualificação). */
const NAME_ON_LINE = new RegExp(
  `(?<![\\p{L}\\p{N}])${CAP_WORD}(?:[ \\t]+(?:${PARTICLE}[ \\t]+)?${CAP_WORD})*`,
  'u',
);

interface Span {
  start: number;
  end: number;
  text: string;
}

export interface NameContext {
  exclusions: ReadonlySet<string>;
  /** Trechos que não podem fazer parte de nomes (municípios, instituições…). */
  blocked: readonly Range[];
}

export function nameContext(text: string, exclusions: ReadonlySet<string>): NameContext {
  return { exclusions, blocked: blockedRanges(text) };
}

const wordKey = (w: string) => fold(w).replace(/[.'’:,;]+$/u, '');

/** Divide uma sequência nas palavras excluídas ou bloqueadas e remove partículas nas pontas. */
export function splitOnExclusions(
  span: Span,
  exclusions: ReadonlySet<string>,
  blocked: readonly Range[] = [],
): Span[] {
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
    const token = wordKey(w[0]);
    // "e" entre nomes separa duas pessoas ("JOSÉ NUNES e ANTÔNIA NUNES").
    const head = token.split('-')[0] ?? token; // "Intime-se" → "intime"
    const start = span.start + (w.index ?? 0);
    if (
      exclusions.has(token) ||
      exclusions.has(head) ||
      /^\d/.test(token) ||
      token === 'e' ||
      overlapsAny(blocked, start, start + w[0].length)
    )
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

function nameScore(text: string): { tokens: string[]; first: boolean; known: number } {
  const tokens = fold(text)
    .split(/[\s\n]+/)
    .map((t) => t.replace(/[.'’]+$/u, ''))
    .filter((t) => t && !PARTICLES.has(t));
  return {
    tokens,
    first: FIRST_NAMES.has(tokens[0] ?? ''),
    known: tokens.filter((t) => SURNAMES.has(t) || FIRST_NAMES.has(t)).length,
  };
}

/** Confiança de que uma sequência capitalizada é nome de pessoa (0 = descartar). */
export function sequenceConfidence(text: string): number {
  const { tokens, first, known } = nameScore(text);
  if (tokens.length === 0) return 0;
  if (tokens.some((t) => t.length === 1 && !/^[a-z]$/.test(t))) return 0;
  if (tokens.length === 1) return 0; // nome isolado só por gatilho ou variante conhecida
  // Nenhuma palavra é prenome ou sobrenome conhecido: não é tratado como nome.
  if (known === 0) return 0;
  let c = 0.35;
  if (first) c += 0.35;
  if (known >= 2) c += 0.15;
  else if (known === 1 && !first) c += 0.1;
  if (tokens.length > MAX_NAME_TOKENS) c -= 0.3;
  return Math.min(c, 0.9);
}

/** Aplicado automaticamente só com prenome conhecido no início e 2 ou mais palavras. */
export function strongSequence(text: string): boolean {
  const { tokens, first } = nameScore(text);
  return first && tokens.length >= 2 && tokens.length <= MAX_NAME_TOKENS;
}

function personCandidate(
  span: Span,
  confidence: number,
  detector: string,
  role?: PersonRole,
): Candidate {
  return { type: 'PESSOA', ...span, confidence, detector, ...(role ? { role } : {}) };
}

/** Corta o nome em no máximo MAX_NAME_TOKENS palavras (sem contar partículas). */
function capTokens(span: Span): Span {
  const words = [...span.text.matchAll(/[^\s]+/gu)];
  let count = 0;
  for (const w of words) {
    if (!PARTICLES.has(fold(w[0]))) count++;
    if (count === MAX_NAME_TOKENS) {
      const end = span.start + (w.index ?? 0) + w[0].length;
      return { start: span.start, end, text: span.text.slice(0, end - span.start) };
    }
  }
  return span;
}

/** Em CAIXA ALTA, o nome termina na primeira palavra que não está em caixa alta ("Data", "Sexo"). */
function cutAtCaseChange(span: Span): Span {
  const words = [...span.text.matchAll(/[^\s]+/gu)];
  if (!words[0] || !isUpper(words[0][0]) || words[0][0].length < 2) return span;
  for (const w of words.slice(1)) {
    if (PARTICLES.has(fold(w[0])) || isUpper(w[0])) continue;
    const end = (w.index ?? 0) - 1;
    const text = span.text.slice(0, end).trimEnd();
    return { start: span.start, end: span.start + text.length, text };
  }
  return span;
}

/**
 * Primeiro nome válido em `text` a partir de `offset` (para rótulos e gatilhos). Em blocos de
 * qualificação (`line`), não atravessa a quebra de linha e para no próximo rótulo.
 */
function nameAt(
  text: string,
  offset: number,
  ctx: NameContext,
  options: { allowSingle: boolean; line: boolean },
): Span | null {
  // Tratamentos antes do nome ("Dr. FULANO", "Sra. FULANA") não fazem parte dele.
  const honorific = /^(?:dr|dra|sr|sra|prof|profa)\.?[ \t]+/iu.exec(text.slice(offset, offset + 8));
  if (honorific) offset += honorific[0].length;
  const limit = options.line ? nextLabelStart(text, offset) : offset + 160;
  const slice = text.slice(offset, limit);
  const re = options.line ? NAME_ON_LINE : new RegExp(NAME_SEQUENCE.source, 'u');
  const m = re.exec(slice);
  if (!m || (m.index ?? 0) > 2) return null;
  let span: Span = { start: offset + (m.index ?? 0), end: 0, text: m[0] };
  span.end = span.start + span.text.length;
  span = cutAtCaseChange(span);
  const first = splitOnExclusions(span, ctx.exclusions, ctx.blocked)[0];
  if (!first || first.start !== span.start) return null;
  const capped = capTokens(first);
  const tokens = nameScore(capped.text).tokens;
  if (tokens.length === 1 && !options.allowSingle) return null;
  return capped;
}

// ---------------------------------------------------------------- 1. Qualificação

type LabelKind = PersonRole | 'KEEP' | null;

interface LabelRule {
  re: RegExp;
  role: LabelKind;
  /** Aceita mais de um nome: filiação (2) ou lista ("ACUSADOS: A, B E C"). */
  many?: 'pair' | 'list';
}

const S = '(?:\\(?s\\)?|es)?'; // plural opcional: "acusado(s)", "acusados", "autores"
const LABELS: LabelRule[] = [
  { re: /nome(?:\s+completo)?|qualificad[oa]|declarante|interrogad[oa]|paciente/, role: null },
  { re: /filia[çc][ãa]o/, role: 'FAMILIAR', many: 'pair' },
  { re: /m[ãa]e|pai|genitora?|genitor/, role: 'FAMILIAR' },
  { re: new RegExp(`v[íi]tima${S}|ofendid[oa]${S}`), role: 'VÍTIMA', many: 'list' },
  { re: new RegExp(`testemunha${S}`), role: 'TESTEMUNHA', many: 'list' },
  { re: new RegExp(`investigad[oa]${S}|suspeit[oa]${S}`), role: 'INVESTIGADO', many: 'list' },
  {
    re: new RegExp(
      `indiciad[oa]${S}|autor${S}(?:\\s+do\\s+fato)?|autora|acusad[oa]${S}|r[ée]u|r[ée]us|denunciad[oa]${S}`,
    ),
    role: 'AUTOR',
    many: 'list',
  },
  { re: new RegExp(`conduzid[oa]${S}|pres[oa]|flagranteado`), role: 'CONDUZIDO', many: 'list' },
  { re: new RegExp(`comunicante${S}|noticiante${S}|requerente`), role: 'COMUNICANTE' },
  { re: /informante/, role: 'INFORMANTE' },
  { re: /advogad[oa]|defensor(?:a)?\s+constitu[íi]d[oa]|procurador[a]?/, role: 'ADVOGADO' },
  { re: /m[ée]dic[oa](?:\s+(?:respons[áa]vel|plantonista|assistente))?/, role: 'MÉDICO' },
  {
    re: /c[ôo]njuge|companheir[oa]|espos[oa]|irm[ãa]o?|filh[oa]s?|respons[áa]vel(?:\s+legal)?/,
    role: 'FAMILIAR',
  },
  {
    re: /atendente|escriv[ãa]o?|escriv[ãa]|delegad[oa]|inspetor[a]?|perit[oa](?:\s+criminal)?|agente|autoridade|condutor(?:\s+do\s+flagrante)?/,
    role: 'KEEP',
  },
];

const LABEL_RE = new RegExp(
  `(?<![\\p{L}])(${LABELS.map((l) => l.re.source).join('|')})[ \\t]*:[ \\t]*`,
  'giu',
);

function labelRule(label: string): LabelRule | null {
  const f = label.toLowerCase();
  return LABELS.find((l) => new RegExp(`^(?:${l.re.source})$`, 'iu').test(f)) ?? null;
}

/** Separadores entre nomes: filiação ("A / B", "A e B") e listas ("A, B E C"). */
const PAIR_SEP = /^[ \t]*(?:\/|&|;|\be\b|\bE\b)[ \t]*/u;
const LIST_SEP = /^[ \t]*(?:,|;|\/|\be\b|\bE\b)[ \t]*/u;

let groupCounter = 0;

/** Lê um ou mais nomes a partir de `offset`, conforme o tipo de rótulo ou gatilho. */
function readNames(
  text: string,
  offset: number,
  ctx: NameContext,
  options: { many: 'pair' | 'list' | undefined; line: boolean; allowSingle: boolean },
): Span[] {
  const out: Span[] = [];
  const max = options.many === 'pair' ? 2 : options.many === 'list' ? 12 : 1;
  let pos = offset;
  while (out.length < max) {
    const span = nameAt(text, pos, ctx, { allowSingle: options.allowSingle, line: options.line });
    if (!span) break;
    out.push(span);
    const sep = (options.many === 'pair' ? PAIR_SEP : LIST_SEP).exec(
      text.slice(span.end, span.end + 8),
    );
    if (!sep || !options.many) break;
    pos = span.end + sep[0].length;
  }
  return out;
}

export function detectQualification(text: string, ctx: NameContext): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(LABEL_RE)) {
    // "Relação com a vítima: VIZINHO" não é o rótulo "Vítima:".
    if (!labelStartsField(text, m.index ?? 0)) continue;
    const rule = labelRule(m[1] ?? '');
    const role = rule?.role ?? null;
    const names = readNames(text, (m.index ?? 0) + m[0].length, ctx, {
      many: rule?.many,
      line: true,
      allowSingle: true,
    });
    const group = names.length > 1 ? `g${++groupCounter}` : undefined;
    for (const span of names) {
      const c = personCandidate(
        span,
        0.95,
        'qualificacao',
        role && role !== 'KEEP' ? role : undefined,
      );
      if (role === 'KEEP') c.authority = true;
      if (group) c.group = group;
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 2. Gatilhos no texto corrido

interface Trigger {
  re: string;
  role: PersonRole | null;
  /** Sinal fraco: só aplica se o nome também começar por prenome conhecido. */
  weak?: boolean;
  many?: 'pair' | 'list';
}

const TRIGGERS: Trigger[] = [
  { re: '(?:a|à|da|pela|como|com\\s+a)?\\s*v[íi]tima', role: 'VÍTIMA' },
  { re: '(?:as|das|pelas)\\s+v[íi]timas', role: 'VÍTIMA', many: 'list' },
  { re: '(?:pel[oa]|do|da)\\s+(?:interrogad[oa]|depoente)', role: null },
  { re: '(?:o|do|pelo)\\s+autor(?:\\s+do\\s+fato)?', role: 'AUTOR' },
  { re: '(?:os|dos|pelos)\\s+autores', role: 'AUTOR', many: 'list' },
  { re: '(?:o|a|do|da|pel[oa])\\s+acusad[oa]', role: 'AUTOR' },
  { re: '(?:os|as|dos|das|pel[oa]s)\\s+acusad[oa]s', role: 'AUTOR', many: 'list' },
  { re: '(?:o|a|do|da)\\s+indiciad[oa]', role: 'AUTOR' },
  { re: '(?:o|a|do|da)\\s+investigad[oa]', role: 'INVESTIGADO' },
  { re: '(?:os|as|dos|das)\\s+investigad[oa]s', role: 'INVESTIGADO', many: 'list' },
  { re: '(?:o|a|do|da)\\s+suspeit[oa]', role: 'INVESTIGADO' },
  { re: '(?:o|a|do|da)\\s+conduzid[oa]', role: 'CONDUZIDO' },
  { re: '(?:a|da|pela)\\s+testemunha', role: 'TESTEMUNHA' },
  { re: '(?:as|das|pelas)\\s+testemunhas', role: 'TESTEMUNHA', many: 'list' },
  { re: '(?:a|o|da|do)\\s+informante', role: 'INFORMANTE' },
  { re: '(?:a|o)\\s+(?:comunicante|noticiante)', role: 'COMUNICANTE' },
  { re: '(?:a|o|pel[ao])\\s+declarante', role: null },
  { re: '(?:o|a)\\s+nacional', role: null },
  { re: 'filh[oa](?:\\s*\\(\\s*[oa]\\s*\\))?\\s+de', role: 'FAMILIAR', many: 'pair' },
  {
    re: '(?:o|a|seu|sua)\\s+(?:pai|m[ãa]e|genitor[a]?|irm[ãa]o?|espos[oa]|marido|companheir[oa]|namorad[oa]|filh[oa](?!\\s+de\\b)|av[ôóo]|tio|tia|primo|prima)',
    role: 'FAMILIAR',
  },
  { re: '(?:o|a)\\s+advogad[oa]', role: 'ADVOGADO' },
  { re: '(?:o|a)\\s+m[ée]dic[oa](?:\\s+plantonista)?', role: 'MÉDICO' },
  { re: '(?:o|a)\\s+senhor[a]?', role: null, weak: true },
  { re: '(?:o|a)\\s+sr[a]?\\.?', role: null, weak: true },
  { re: '(?:o|a)\\s+vizinh[oa]', role: null, weak: true },
  { re: 'como\\s+sendo', role: null, weak: true },
  { re: 'de\\s+propriedade\\s+de', role: null, weak: true },
  { re: 'em\\s+nome\\s+de', role: null, weak: true },
  { re: 'titularidade\\s+de', role: null, weak: true },
  { re: 'contra', role: null, weak: true },
  { re: '(?:intime|ou[çc]a|notifique|oficie)-se', role: null, weak: true },
];

const TRIGGER_RE = new RegExp(
  `(?<![\\p{L}])(?:${TRIGGERS.map((t) => `(${t.re})`).join('|')})[\\s,:]+(?:["“]\\s*)?`,
  'giu',
);

export function detectTriggers(text: string, ctx: NameContext): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(TRIGGER_RE)) {
    const groupIndex = m.slice(1).findIndex((g) => g !== undefined);
    const trigger = TRIGGERS[groupIndex];
    if (!trigger) continue;
    const names = readNames(text, (m.index ?? 0) + m[0].length, ctx, {
      many: trigger.many,
      line: false,
      allowSingle: true,
    });
    const group = names.length > 1 && trigger.many === 'pair' ? `g${++groupCounter}` : undefined;
    for (const span of names) {
      const { tokens, first } = nameScore(span.text);
      // Nome isolado só se for prenome conhecido.
      if (tokens.length === 1 && !first) continue;
      const c = personCandidate(
        span,
        tokens.length === 1 ? 0.75 : 0.85,
        'gatilho',
        trigger.role ?? undefined,
      );
      if (trigger.weak && !strongSequence(span.text)) c.suggestion = true;
      if (group) c.group = group;
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 3. Sequências capitalizadas

/** Nomes de pessoas que batizam leis, ruas, escolas etc. não são envolvidos ("Lei Maria da Penha"). */
const NAMED_AFTER =
  /(?:^|[^\p{L}])(?:lei|leis|rua|avenida|av\.|travessa|pra[çc]a|escola|col[ée]gio|hospital|instituto|universidade|faculdade|funda[çc][ãa]o|f[óo]rum|est[áa]dio|terminal|conjunto|residencial|edif[íi]cio|condom[íi]nio|ponte|viaduto|unidade|creche|posto|igreja|par[óo]quia|capela|comunidade|associa[çc][ãa]o)(?:\s+(?:estadual|municipal|federal|dr\.?|dra\.?|prof\.?|profa\.?|padre|pe\.|santo|santa|s[ãa]o|governador|presidente|deputado|senador|general|coronel|marechal))*[\s:]*$/iu;

export function detectCapitalized(text: string, ctx: NameContext): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(NAME_SEQUENCE)) {
    const span = { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, text: m[0] };
    for (const part of splitOnExclusions(span, ctx.exclusions, ctx.blocked)) {
      if (NAMED_AFTER.test(text.slice(Math.max(0, part.start - 40), part.start))) continue;
      const confidence = sequenceConfidence(part.text);
      if (confidence < 0.3) continue;
      const c = personCandidate(part, confidence, 'sequencia');
      if (!strongSequence(part.text)) c.suggestion = true;
      out.push(c);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 5. Autoridades e profissionais

const PERITO_TITLE = /perit[oa]/iu;

/**
 * Marca como autoridade os nomes precedidos (na mesma linha) ou seguidos de um cargo, e dá papel
 * próprio aos profissionais identificados pelo contexto: médico (CRM), advogado (OAB), perito.
 */
export function markAuthorities(text: string, candidates: Candidate[]): void {
  const titleBefore = new RegExp(`(${AUTHORITY_TITLE.source})[\\s:,]*(?:dr[a]?\\.?\\s*)?$`, 'iu');
  const titleAfter = new RegExp(`^${AUTHORITY_TITLE.source}`, 'iu');
  for (const c of candidates) {
    if (c.type !== 'PESSOA') continue;
    const before = text.slice(Math.max(0, c.start - 45), c.start);
    const sameLine = before.split('\n').pop() ?? '';
    const after = text.slice(c.end, c.end + 70);
    const nextLine = /^[ \t,]*\n[ \t]*([^\n]*)/u.exec(after)?.[1] ?? '';
    const sameLineAfter = /^[ \t]*[,–-][ \t]*([^\n]*)/u.exec(after)?.[1] ?? '';
    const restOfLine = after.split('\n')[0] ?? '';

    const before1 = titleBefore.exec(sameLine)?.[1];
    const after1 = titleAfter.exec(nextLine)?.[0] ?? titleAfter.exec(sameLineAfter)?.[0];
    if (before1 || after1 || /^(?:mat(?:r[íi]cula)?\.?|DPC)\b/iu.test(nextLine)) {
      c.authority = true;
      if (PERITO_TITLE.test(before1 ?? after1 ?? '')) c.role = 'PERITO';
    }
    // Médico: "Dr. FULANO - CRM 12345", "médico FULANO", "Médico: Dr. FULANO".
    if (
      /^[ \t]*[,–-]?[ \t]*(?:\(?\s*)?CRM\b/iu.test(restOfLine) ||
      /m[ée]dic[oa](?:\s+plantonista)?\s*:?\s*(?:dr[a]?\.?\s*)?$/iu.test(sameLine)
    ) {
      c.role = 'MÉDICO';
      c.authority = false;
      c.suggestion = false;
    }
    // Advogado: "FULANO, OAB/CE 12.345".
    if (/^[ \t]*[,–-]?[ \t]*(?:\(?\s*)?OAB\b/iu.test(restOfLine)) {
      c.role = 'ADVOGADO';
      c.authority = false;
      c.suggestion = false;
    }
  }
}

// ---------------------------------------------------------------- Papel pela seção da peça

interface Section {
  start: number;
  role: PersonRole;
}

/** Cabeçalhos de bloco e de peça que indicam o papel de quem é qualificado em seguida. */
const SECTION_RULES: [RegExp, PersonRole][] = [
  [/^(?:dados\s+d[aoe]s?\s*(?:\(s\))?\s*)?v[íi]tima(?:\(s\)|s)?\s*:?$/iu, 'VÍTIMA'],
  [
    /^(?:dados\s+d[aoe]s?\s*(?:\(s\))?\s*)?(?:noticiante|comunicante)(?:\(s\)|s)?\s*:?$/iu,
    'COMUNICANTE',
  ],
  [/^(?:dados\s+d[aoe]s?\s*(?:\(s\))?\s*)?testemunha(?:\(s\)|s)?\s*:?$/iu, 'TESTEMUNHA'],
  [
    /^(?:dados\s+d[aoe]s?\s*(?:\(s\))?\s*)?(?:acusad[oa]|autor|indiciad[oa])(?:\(s\)|s|es)?\s*:?$/iu,
    'AUTOR',
  ],
  [
    /^(?:dados\s+d[aoe]s?\s*(?:\(s\))?\s*)?(?:investigad[oa]|suspeit[oa])(?:\(s\)|s)?\s*:?$/iu,
    'INVESTIGADO',
  ],
  [/^(?:dados\s+d[aoe]s?\s*(?:\(s\))?\s*)?conduzid[oa](?:\(s\)|s)?\s*:?$/iu, 'CONDUZIDO'],
  [/^termo\s+de\s+(?:depoimento|declara[çc][õo]es)\s+d[ae]\s+testemunha\b/iu, 'TESTEMUNHA'],
  [/^termo\s+de\s+declara[çc][õo]es\s+d[ae]\s+v[íi]tima\b/iu, 'VÍTIMA'],
  [/^termo\s+de\s+declara[çc][õo]es\s+d[oe]\s+(?:comunicante|noticiante)\b/iu, 'COMUNICANTE'],
  [/^termo\s+de\s+declara[çc][õo]es\s+d[oe]\s+informante\b/iu, 'INFORMANTE'],
];

function sections(text: string): Section[] {
  const out: Section[] = [];
  let pos = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length <= 70) {
      const rule = SECTION_RULES.find(([re]) => re.test(trimmed));
      if (rule) out.push({ start: pos, role: rule[1] });
      // Outra peça ou bloco sem papel encerra a seção anterior.
      else if (/^(?:dados\s+d|termo\s+de|auto\s+de|relat[óo]rio|boletim\s+de)/iu.test(trimmed))
        out.push({ start: pos, role: 'PESSOA' });
    }
    pos += line.length + 1;
  }
  return out;
}

/** "Nome:" sem papel recebe o papel da seção em que está ("DADOS DA(S) VÍTIMA(S)"). */
export function applySectionRoles(text: string, candidates: Candidate[]): void {
  const list = sections(text);
  if (!list.length) return;
  for (const c of candidates) {
    if (c.type !== 'PESSOA' || c.role || c.authority || c.detector !== 'qualificacao') continue;
    const section = [...list].reverse().find((s) => s.start <= c.start);
    if (section && section.role !== 'PESSOA') c.role = section.role;
  }
}

// ---------------------------------------------------------------- 6. Apelidos

const NICKNAME_RE =
  /(?<![\p{L}])(?:vulgo|alcunha(?:\s+de)?|conhecid[oa](?:\s+(?:apenas|somente|no\s+bairro|na\s+regi[ãa]o|pela?s?\s+\p{L}+))?\s+(?:como|por)|(?:pelo\s+)?apelido\s+(?:de\s+)?|apelidad[oa]\s+(?:de\s+)?)[ \t]*[:,]?[ \t]*/giu;

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
    if (bare) push(offset, cutAtCaseChange({ start: offset, end: 0, text: bare[0] }).text, 0.85);
  }
  // "Alcunha: CHICO BALA" em blocos de qualificação (até o próximo rótulo).
  for (const m of text.matchAll(/\b(?:alcunha|apelido|vulgo)[ \t]*:[ \t]*/giu)) {
    const start = (m.index ?? 0) + m[0].length;
    const raw = text.slice(start, nextLabelStart(text, start));
    const value = (/^[^\n,;]{2,40}/u.exec(raw)?.[0] ?? '').replace(/["“”]/g, '').trimEnd();
    if (value && !out.some((o) => o.start === start)) push(start, value, 0.95);
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
