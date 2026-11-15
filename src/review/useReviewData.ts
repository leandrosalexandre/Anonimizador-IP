// Dados derivados para a revisão e a exportação: páginas com texto, ocorrências de cada entidade
// (recalculadas sobre o texto atual) e folhas onde cada uma aparece.
import { useMemo } from 'react';
import { footerFolha, joinHyphenated, stripNoise } from '../documents/cleanText';
import { checkFolhas, resolveFolhas } from '../pdf/folhas';
import type { StoredEntity, VaultContent } from '../vault/types';
import { labelOf } from './labels';
import { accentInsensitive } from '../detectors/text';
import { buildLocator, type Located } from './locate';

export interface ReviewPage {
  key: string;
  docId: string;
  fileName: string;
  pdfPage: number;
  folha: number | null;
  /** Folha para o texto exportado: só carimbo lido, correção ou deslocamento (nunca inferida). */
  exportFolha: number | null;
  /** Folha repetida ou fora de ordem: conferir. */
  folhaInconsistent: boolean;
  /** Texto da revisão e da exportação: hífens de fim de linha unidos e ruído removido. */
  text: string;
  /** Texto para a detecção: hífens unidos, com o bloco de assinatura (diz quem é quem). */
  detectText: string;
  /** Página de um texto colado (sem folha nem página de PDF). */
  pasted: boolean;
}

export interface EntityStats {
  count: number;
  folhas: number[];
  /** Páginas (chave) com ocorrência, na ordem. */
  pages: string[];
}

export interface ReviewData {
  pages: ReviewPage[];
  byKey: Map<string, ReviewPage>;
  located: Map<string, Located[]>;
  stats: Map<string, EntityStats>;
  byId: Map<string, StoredEntity>;
  labelFor: (entityId: string) => string | null;
}

export const pageKey = (docId: string, pdfPage: number) => `${docId}|${pdfPage}`;

export function collectPages(content: VaultContent): ReviewPage[] {
  return content.documents.flatMap((doc) => {
    const joined = doc.pages.map((p) => joinHyphenated(p.text));
    const clean = stripNoise(joined);
    // Procedimentos eletrônicos não têm carimbo: a folha está no rodapé "N de M".
    const folhas = resolveFolhas(
      doc.pages.map((p) => ({
        ...p,
        folhaDetected: p.folhaDetected ?? footerFolha(p.text),
      })),
      doc.folhaOffset,
    );
    const checked = checkFolhas(folhas);
    return doc.pages
      .map((p, i) => ({
        key: pageKey(doc.id, p.pdfPage),
        docId: doc.id,
        fileName: doc.fileName,
        pdfPage: p.pdfPage,
        folha: folhas[i]?.folha ?? null,
        exportFolha: checked[i]?.folha ?? null,
        folhaInconsistent: checked[i]?.inconsistent ?? false,
        text: clean[i] ?? '',
        detectText: joined[i] ?? '',
        pasted: !!doc.pasted,
      }))
      .filter((p) => p.text.trim().length > 0);
  });
}

/** Início da página que completa o nome cortado no fim da página anterior. */
function continuation(
  prevText: string,
  last: Located,
  nextText: string,
  byId: ReadonlyMap<string, StoredEntity>,
): Located | null {
  if (prevText.slice(last.end).trim() !== '') return null;
  const entity = byId.get(last.entityId);
  if (!entity || entity.type !== 'PESSOA') return null;
  const head = accentInsensitive(last.text);
  const lead = /^\s*/.exec(nextText)?.[0].length ?? 0;
  for (const v of [...entity.variants].sort((a, b) => b.length - a.length)) {
    const m = new RegExp(`^${head}\\s+(.+)$`, 'iu').exec(v.trim());
    if (!m?.[1]) continue;
    const rest = new RegExp(`^${accentInsensitive(m[1])}(?![\\p{L}\\p{N}])`, 'iu').exec(
      nextText.slice(lead),
    );
    if (rest) {
      return { entityId: entity.id, start: lead, end: lead + rest[0].length, text: rest[0] };
    }
  }
  return null;
}

export function computeReviewData(content: VaultContent): ReviewData {
  const pages = collectPages(content);
  const locator = buildLocator(content.entities);
  const byIdEarly = new Map(content.entities.map((e) => [e.id, e]));
  const located = new Map<string, Located[]>();
  const stats = new Map<string, EntityStats>();
  let previous: { page: ReviewPage; last: Located | undefined } | null = null;
  for (const page of pages) {
    let found = locator.locate(page.text);
    // Nome que começa no fim de uma página e termina no início da seguinte ("… filho de MARIA
    // DA SILVA" / "dos Santos; QUE …"): o resto do nome recebe o mesmo marcador.
    if (previous?.last && previous.page.docId === page.docId) {
      const rest = continuation(previous.page.text, previous.last, page.text, byIdEarly);
      if (rest) found = [rest, ...found.filter((l) => l.start >= rest.end)];
    }
    previous = { page, last: found[found.length - 1] };
    located.set(page.key, found);
    for (const l of found) {
      const s = stats.get(l.entityId) ?? { count: 0, folhas: [], pages: [] };
      s.count++;
      if (page.folha !== null && !s.folhas.includes(page.folha)) s.folhas.push(page.folha);
      if (!s.pages.includes(page.key)) s.pages.push(page.key);
      stats.set(l.entityId, s);
    }
  }
  const byId = new Map(content.entities.map((e) => [e.id, e]));
  const labelFor = (entityId: string) => {
    const e = byId.get(entityId);
    return e && e.decision === 'pseudonymize' ? labelOf(e, byId) : null;
  };
  return { pages, byKey: new Map(pages.map((p) => [p.key, p])), located, stats, byId, labelFor };
}

export function useReviewData(content: VaultContent | null): ReviewData | null {
  return useMemo(() => (content ? computeReviewData(content) : null), [content]);
}

/** "3, 5–7, 12" */
export function formatFolhas(folhas: readonly number[]): string {
  const sorted = [...new Set(folhas)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && (sorted[j + 1] ?? 0) === (sorted[j] ?? 0) + 1) j++;
    parts.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j + 1;
  }
  return parts.join(', ');
}
