// Varredura residual (SPEC Fase 6): roda de novo os detectores sobre o texto já pseudonimizado e
// lista o que ainda parece dado pessoal — sequências de dígitos, sequências capitalizadas fora da
// lista de exclusão e prenomes da lista. Marcadores e trechos mantidos de propósito não contam.
import { detectPage } from '../detectors';
import { buildExclusions, FIRST_NAMES } from '../detectors/lexicon';
import { fold } from '../detectors/text';
import type { EntityType } from '../detectors/types';
import type { ReviewData } from '../review/useReviewData';
import type { ExportPage } from './build';

export interface ResidualItem {
  /** Texto normalizado (chave para "não é dado pessoal"). */
  key: string;
  text: string;
  kind: EntityType | 'DIGITOS' | 'PRENOME';
  count: number;
  /** Folhas/páginas onde aparece (rótulos prontos, ex.: "fls. 3"). */
  where: string[];
  context: string;
}

const MARKER = /\[[^\]\n]{1,60}\]/gu;

export function residualKey(text: string): string {
  return fold(text).replace(/\s+/g, ' ').trim();
}

/** Troca por espaços os trechos que não devem ser analisados, preservando as posições. */
function blank(text: string, spans: readonly [number, number][]): string {
  let out = '';
  let pos = 0;
  for (const [s, e] of [...spans].sort((a, b) => a[0] - b[0])) {
    if (s < pos) continue;
    out += text.slice(pos, s) + ' '.repeat(e - s);
    pos = e;
  }
  return out + text.slice(pos);
}

const DIGITS = /(?<![\p{L}\p{N}])\d[\d.\-/ ]{3,}\d(?![\p{L}\p{N}])/gu;
const DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

export function scanResidual(
  pages: readonly ExportPage[],
  data: ReviewData,
  options: {
    exclusions?: readonly string[];
    ignored?: readonly string[];
    types?: readonly EntityType[];
  } = {},
): ResidualItem[] {
  const exclusions = buildExclusions(options.exclusions);
  const ignored = new Set((options.ignored ?? []).map(residualKey));
  const items = new Map<string, ResidualItem>();

  const add = (
    kind: ResidualItem['kind'],
    text: string,
    page: ExportPage,
    start: number,
    end: number,
  ) => {
    const key = residualKey(text);
    if (!key || ignored.has(key)) return;
    const reviewPage = data.byKey.get(page.key);
    const where =
      reviewPage?.folha != null
        ? `fls. ${reviewPage.folha}`
        : `PDF p. ${reviewPage?.pdfPage ?? '?'}`;
    const item = items.get(key) ?? {
      key,
      text: text.replace(/\s+/g, ' ').trim(),
      kind,
      count: 0,
      where: [],
      context: `…${page.text.slice(Math.max(0, start - 50), end + 50).replace(/\s+/g, ' ')}…`,
    };
    item.count++;
    if (!item.where.includes(where)) item.where.push(where);
    items.set(key, item);
  };

  for (const page of pages) {
    // Ignora marcadores e o que foi mantido de propósito (autoridades, órgãos).
    const markers = [...page.text.matchAll(MARKER)].map(
      (m) => [m.index, m.index + m[0].length] as [number, number],
    );
    const original = data.byKey.get(page.key)?.text ?? '';
    const keptTexts = (data.located.get(page.key) ?? [])
      // Sugestões não aplicadas não foram mantidas de propósito: continuam sendo verificadas.
      .filter((l) => data.labelFor(l.entityId) === null && !data.byId.get(l.entityId)?.suggested)
      .map((l) => original.slice(l.start, l.end));
    const keptSpans: [number, number][] = [];
    for (const kept of new Set(keptTexts)) {
      let from = 0;
      for (let i = page.text.indexOf(kept, from); i >= 0; i = page.text.indexOf(kept, from)) {
        keptSpans.push([i, i + kept.length]);
        from = i + kept.length;
      }
    }
    const text = blank(page.text, [...markers, ...keptSpans]);
    const taken: [number, number][] = [];
    const free = (s: number, e: number) => !taken.some(([a, b]) => a < e && s < b);

    const detectOptions = {
      exclusions: options.exclusions ?? [],
      ...(options.types ? { types: options.types } : {}),
    };
    for (const c of detectPage(text, detectOptions)) {
      if (c.authority) continue;
      add(c.type, c.text, page, c.start, c.end);
      taken.push([c.start, c.end]);
    }
    for (const m of text.matchAll(DIGITS)) {
      const value = m[0].trim();
      const digits = value.replace(/\D/g, '').length;
      if (digits < 6 || DATE.test(value) || !free(m.index, m.index + m[0].length)) continue;
      add('DIGITOS', value, page, m.index, m.index + m[0].length);
      taken.push([m.index, m.index + m[0].length]);
    }
    for (const m of text.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{L}'’]{2,}(?![\p{L}\p{N}])/gu)) {
      const token = fold(m[0]);
      if (!FIRST_NAMES.has(token) || exclusions.has(token) || !free(m.index, m.index + m[0].length))
        continue;
      add('PRENOME', m[0], page, m.index, m.index + m[0].length);
    }
  }
  return [...items.values()].sort(
    (a, b) => b.count - a.count || a.text.localeCompare(b.text, 'pt-BR'),
  );
}
