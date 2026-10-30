// Trechos que nunca são nomes de pessoas e ficam em claro: municípios do Ceará, instituições
// ("SANTA CASA DE SOBRAL") e os valores de rótulos de lugar ("Bairro: CENTRO", "Local do Fato: …").
// Os detectores de nomes não capturam palavras dentro desses trechos.
import { MUNICIPIOS_CE } from './data/municipios-ce';
import { FIRST_NAMES, SURNAMES } from './lexicon';
import { accentInsensitive, fold } from './text';

export type Range = readonly [number, number];

const nameLike = (token: string) => FIRST_NAMES.has(token) || SURNAMES.has(token);

const MUNICIPALITIES = MUNICIPIOS_CE.map((m) => ({
  pattern: accentInsensitive(m),
  // "Aurora", "Sobral", "Pires Ferreira": também são nomes de pessoas; só contam como lugar
  // quando o contexto indica.
  ambiguous: fold(m)
    .split(/\s+/)
    .filter((t) => !['de', 'do', 'da'].includes(t))
    .every(nameLike),
}));

const MUNICIPALITY_RE = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${MUNICIPALITIES.map((m) => `(${m.pattern})`).join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
);

/** Contexto de lugar antes ("Município:", "natural de", "em") ou depois ("/CE", "- Ceará"). */
const PLACE_BEFORE =
  /(?:munic[íi]pio|cidade|comarca|naturalidade|natural|distrito|localidade|termo|zona\s+rural)\s*(?:de|do|da)?\s*:?\s*$|(?:^|\s)(?:de|em|para|at[ée])\s+$/iu;
const PLACE_AFTER = /^\s*(?:[/–-]\s*(?:CE|Cear[áa])\b|\(CE\))/iu;

const INSTITUTION_RE =
  /(?<![\p{L}\p{N}])(?:santa\s+casa(?:\s+de\s+miseric[óo]rdia)?|hospital|maternidade|policl[íi]nica|cl[íi]nica|instituto|upa|unidade\s+de\s+pronto\s+atendimento|posto\s+de\s+sa[úu]de|escola|col[ée]gio)(?![\p{L}\p{N}])/giu;
/** Palavras capitalizadas que seguem o nome da instituição ("Regional Norte", "de Sobral"). */
const INSTITUTION_TAIL = /^(?:[ \t]+(?:d[eao]s?[ \t]+)?[\p{Lu}][\p{L}.]*)*/u;

/** Rótulos cujo valor é lugar, órgão ou natureza do fato (nunca nome de pessoa). */
const PLACE_LABEL_RE =
  /(?<![\p{L}])(?:munic[íi]pio|cidade|bairro|local(?:\s+do\s+fato)?|logradouro|endere[çc]o|naturalidade|unidade(?:\s+de\s+sa[úu]de)?|requisitante|natureza(?:\s+do\s+fato)?|[óo]rg[ãa]o(?:\s+expedidor)?|lota[çc][ãa]o|hospital|destino|proced[êe]ncia|zona|distrito|delegacia|circunscri[çc][ãa]o)[ \t]*:[ \t]*/giu;

/** Palavra imediatamente antes de um rótulo que indica que ele está no meio da frase. */
const CONNECTOR_BEFORE =
  /(?:^|[\s(])(?:a|o|as|os|à|ao|da|do|de|das|dos|na|no|em|com|pela|pelo|e)\s*$/iu;

/** O rótulo começa no início de um campo (linha ou após o valor de outro rótulo)? */
export function labelStartsField(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  const before = text.slice(lineStart, index);
  return !CONNECTOR_BEFORE.test(before);
}

/** Início do próximo rótulo ("Palavra:") na mesma linha, a partir de `from`. */
export function nextLabelStart(text: string, from: number): number {
  const lineEnd = text.indexOf('\n', from);
  const end = lineEnd < 0 ? text.length : lineEnd;
  const colon = text.indexOf(':', from);
  if (colon < 0 || colon >= end) return end;
  // Volta pelas palavras do rótulo: a última antes de ":" e as anteriores que são partículas ou
  // palavras de rótulo comuns ("Data de Nascimento:", "Data/Hora do Registro:").
  const words = [...text.slice(from, colon).matchAll(/[^\s]+/gu)];
  let i = words.length - 1;
  while (i > 0) {
    const prev = fold(words[i - 1]?.[0] ?? '').replace(/[^a-z/()]/g, '');
    if (
      !/^(?:de|do|da|dos|das|e|data|data\/hora|hora|nome|numero|n|tipo|local|grau|estado|orgao)$/.test(
        prev,
      )
    )
      break;
    i--;
  }
  const w = words[Math.max(0, i)];
  return w ? from + (w.index ?? 0) : colon;
}

/** Trechos da página que não podem fazer parte de nomes de pessoas. */
export function blockedRanges(text: string): Range[] {
  const out: [number, number][] = [];
  for (const m of text.matchAll(MUNICIPALITY_RE)) {
    const index = m.index ?? 0;
    const groupIndex = m.slice(1).findIndex((g) => g !== undefined);
    const municipality = MUNICIPALITIES[groupIndex];
    if (municipality?.ambiguous) {
      const before = text.slice(Math.max(0, index - 40), index);
      const after = text.slice(index + m[0].length, index + m[0].length + 12);
      if (!PLACE_BEFORE.test(before) && !PLACE_AFTER.test(after)) continue;
    }
    out.push([index, index + m[0].length]);
  }
  for (const m of text.matchAll(INSTITUTION_RE)) {
    const end = (m.index ?? 0) + m[0].length;
    const tail = INSTITUTION_TAIL.exec(text.slice(end, end + 120))?.[0] ?? '';
    out.push([m.index ?? 0, end + tail.length]);
  }
  for (const m of text.matchAll(PLACE_LABEL_RE)) {
    const index = m.index ?? 0;
    if (!labelStartsField(text, index)) continue;
    const start = index + m[0].length;
    out.push([start, nextLabelStart(text, start)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export function overlapsAny(ranges: readonly Range[], start: number, end: number): boolean {
  return ranges.some(([s, e]) => s < end && start < e);
}
