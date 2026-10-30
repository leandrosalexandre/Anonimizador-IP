// Dados derivados para a revisão e a exportação: páginas com texto, ocorrências de cada entidade
// (recalculadas sobre o texto atual) e folhas onde cada uma aparece.
import { useMemo } from 'react';
import { checkFolhas, resolveFolhas } from '../pdf/folhas';
import type { StoredEntity, VaultContent } from '../vault/types';
import { labelOf } from './labels';
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
  text: string;
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
    const folhas = resolveFolhas(doc.pages, doc.folhaOffset);
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
        text: p.text,
      }))
      .filter((p) => p.text.trim().length > 0);
  });
}

export function computeReviewData(content: VaultContent): ReviewData {
  const pages = collectPages(content);
  const locator = buildLocator(content.entities);
  const located = new Map<string, Located[]>();
  const stats = new Map<string, EntityStats>();
  for (const page of pages) {
    const found = locator.locate(page.text);
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
