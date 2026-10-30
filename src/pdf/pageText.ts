// Extração do texto de uma página do pdf.js. Usada no Web Worker e nos testes (Node).
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import { detectFolha } from './folhas';
import { classifyPage, groupLines, linesToText, type PositionedText } from './layout';

export interface ExtractedPageText {
  pdfPage: number;
  width: number;
  height: number;
  text: string;
  kind: 'text' | 'image';
  folhaDetected: number | null;
}

/** Multiplica duas matrizes afins [a, b, c, d, e, f]. */
function multiply(m1: number[], m2: number[]): number[] {
  const [a1 = 0, b1 = 0, c1 = 0, d1 = 0, e1 = 0, f1 = 0] = m1;
  const [a2 = 0, b2 = 0, c2 = 0, d2 = 0, e2 = 0, f2 = 0] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export async function extractPageText(page: PDFPageProxy): Promise<ExtractedPageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const items: PositionedText[] = [];
  for (const raw of content.items) {
    if (!('str' in raw)) continue;
    const item = raw as TextItem;
    const tx = multiply(viewport.transform, item.transform);
    const fontSize = Math.hypot(tx[2] ?? 0, tx[3] ?? 0);
    // Largura no espaço do viewport (pdf.js informa em unidades do PDF).
    const scaleX =
      Math.hypot(tx[0] ?? 0, tx[1] ?? 0) /
      Math.max(Math.hypot(item.transform[0] ?? 0, item.transform[1] ?? 0), 1e-6);
    items.push({
      str: item.str,
      x: tx[4] ?? 0,
      y: tx[5] ?? 0,
      width: item.width * (Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1),
      fontSize,
    });
  }
  const lines = groupLines(items);
  const text = linesToText(lines);
  return {
    pdfPage: page.pageNumber,
    width: viewport.width,
    height: viewport.height,
    text,
    kind: classifyPage(text),
    folhaDetected: detectFolha(lines, viewport.width, viewport.height),
  };
}
