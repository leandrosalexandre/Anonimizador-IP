import type { ReactNode } from 'react';

/** Texto com trechos destacados (palavras de baixa confiança no OCR). */
export function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: readonly [number, number][];
}) {
  const parts: ReactNode[] = [];
  let pos = 0;
  const sorted = [...ranges]
    .filter(([s, e]) => s >= 0 && e <= text.length && s < e)
    .sort((a, b) => a[0] - b[0]);
  for (const [start, end] of sorted) {
    if (start < pos) continue;
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      <mark key={start} className="low-confidence" title="Baixa confiança no OCR">
        {text.slice(start, end)}
      </mark>,
    );
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}
