// Número de folhas (fls.) de cada página: detecção automática, deslocamento e correção manual
// (SPEC 4, "Folhas").
import type { TextLine } from './layout';

export type FolhaSource = 'manual' | 'offset' | 'detected' | 'inferred';

export interface FolhaInput {
  pdfPage: number;
  folhaDetected: number | null;
  folhaManual: number | null;
}

export interface ResolvedFolha {
  folha: number | null;
  source: FolhaSource | null;
}

const MAX_FOLHA = 99_999;
const STAMP_RE = /\bfls?\s*[.:]*\s*(?:n[º°o.]*\s*)?(\d{1,5})(?!\s*[\d/.,]\d)/i;

/**
 * Procura um carimbo de folha no topo (ou no rodapé) da página: "Fls. 12", "Fl. 12", "FLS.: 12"
 * ou um número isolado no canto superior direito. Ignora citações no corpo ("às fls. 5 a 8").
 */
export function detectFolha(
  lines: readonly TextLine[],
  pageWidth: number,
  pageHeight: number,
): number | null {
  const top = lines.filter((l) => l.y <= pageHeight * 0.18);
  const bottom = lines.filter((l) => l.y >= pageHeight * 0.9);

  for (const region of [top, bottom]) {
    // Prefere o carimbo mais à direita.
    const candidates = region
      .map((l) => ({ line: l, match: STAMP_RE.exec(l.text) }))
      .filter((c) => c.match)
      .sort((a, b) => b.line.right - a.line.right);
    const value = Number(candidates[0]?.match?.[1]);
    if (value > 0 && value <= MAX_FOLHA) return value;
  }

  const bare = top
    .filter((l) => /^\d{1,5}$/.test(l.text) && l.x >= pageWidth * 0.55)
    .sort((a, b) => a.y - b.y)[0];
  const value = Number(bare?.text);
  return value > 0 && value <= MAX_FOLHA ? value : null;
}

/**
 * Lê a folha no texto reconhecido de um recorte do canto da página (carimbo): "Fls. 12" ou uma
 * linha só com o número.
 */
export function parseFolhaStamp(text: string): number | null {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/[|[\]{}()_—–-]/g, ' ').trim())
    .filter(Boolean);
  for (const line of lines) {
    const m = STAMP_RE.exec(line);
    const value = Number(m?.[1]);
    if (value > 0 && value <= MAX_FOLHA) return value;
  }
  const bare = lines.find((l) => /^\d{1,5}$/.test(l));
  const value = Number(bare);
  return value > 0 && value <= MAX_FOLHA ? value : null;
}

/**
 * Folha final de cada página. Prioridade: correção manual > deslocamento informado >
 * detectada > inferida a partir da página detectada mais próxima.
 */
export function resolveFolhas(
  pages: readonly FolhaInput[],
  offset: number | null,
): ResolvedFolha[] {
  const detected = pages.filter((p) => p.folhaDetected !== null);
  return pages.map((page) => {
    if (page.folhaManual !== null) return { folha: page.folhaManual, source: 'manual' };
    if (offset !== null) return { folha: page.pdfPage + offset, source: 'offset' };
    if (page.folhaDetected !== null) return { folha: page.folhaDetected, source: 'detected' };
    let nearest: FolhaInput | undefined;
    for (const d of detected) {
      const dist = Math.abs(d.pdfPage - page.pdfPage);
      const best = nearest ? Math.abs(nearest.pdfPage - page.pdfPage) : Infinity;
      // Em empate, prefere a página anterior.
      if (dist < best || (dist === best && d.pdfPage < page.pdfPage)) nearest = d;
    }
    if (nearest?.folhaDetected != null) {
      const folha = nearest.folhaDetected + (page.pdfPage - nearest.pdfPage);
      if (folha > 0) return { folha, source: 'inferred' };
    }
    return { folha: null, source: null };
  });
}

/** Deslocamento mais frequente entre folha detectada e página do PDF (exige maioria). */
export function suggestOffset(pages: readonly FolhaInput[]): number | null {
  const counts = new Map<number, number>();
  let total = 0;
  for (const p of pages) {
    if (p.folhaDetected === null) continue;
    total++;
    const off = p.folhaDetected - p.pdfPage;
    counts.set(off, (counts.get(off) ?? 0) + 1);
  }
  let best: [number, number] | null = null;
  for (const entry of counts) if (!best || entry[1] > best[1]) best = entry;
  if (!best || total < 2 || best[1] / total < 0.6) return null;
  return best[0];
}

export interface CheckedFolha {
  /** Folha a usar no texto; null quando não há carimbo legível (nunca inventada). */
  folha: number | null;
  /** Repetida ou fora da ordem crescente: conferir. */
  inconsistent: boolean;
}

/**
 * Folhas para o texto exportado: a inferida pela página vizinha não é usada ("fls. ?"), e as
 * lidas que quebram a sequência crescente (repetidas ou fora de ordem) são marcadas. A maior
 * sequência crescente de folhas é considerada correta; as demais, a conferir. Correções
 * manuais e o deslocamento informado pelo usuário nunca são marcados.
 */
export function checkFolhas(resolved: readonly ResolvedFolha[]): CheckedFolha[] {
  const values = resolved.map((r) =>
    r.folha !== null && r.source !== 'inferred' ? r.folha : null,
  );
  const idx = values.flatMap((v, i) => (v === null ? [] : [i]));
  // Maior subsequência estritamente crescente (O(n²): inquéritos têm centenas de páginas).
  const len = idx.map(() => 1);
  const prev = idx.map(() => -1);
  for (let a = 0; a < idx.length; a++) {
    for (let b = 0; b < a; b++) {
      const va = values[idx[a] ?? 0] ?? 0;
      const vb = values[idx[b] ?? 0] ?? 0;
      if (vb < va && (len[b] ?? 0) + 1 > (len[a] ?? 0)) {
        len[a] = (len[b] ?? 0) + 1;
        prev[a] = b;
      }
    }
  }
  const keep = new Set<number>();
  let best = -1;
  // Em empate, a sequência que termina mais cedo (preserva o início do inquérito).
  for (let a = 0; a < idx.length; a++) if (best < 0 || (len[a] ?? 0) > (len[best] ?? 0)) best = a;
  for (let a = best; a >= 0; a = prev[a] ?? -1) keep.add(idx[a] ?? -1);
  return resolved.map((r, i) => ({
    folha: values[i] ?? null,
    inconsistent:
      values[i] !== null && !keep.has(i) && r.source !== 'manual' && r.source !== 'offset',
  }));
}
