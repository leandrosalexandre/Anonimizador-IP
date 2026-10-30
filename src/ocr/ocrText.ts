// Monta o texto da página a partir do resultado do Tesseract, guardando a posição das palavras de
// baixa confiança (para destacá-las) e as linhas com coordenadas (para detectar a folha).
import type { TextLine } from '../pdf/layout';

export interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBbox;
}

export interface OcrBlock {
  paragraphs: { lines: { words: OcrWord[]; bbox: OcrBbox }[] }[];
}

export interface OcrPageText {
  text: string;
  /** Confiança média das palavras (0 a 100), ponderada pelo tamanho. */
  confidence: number;
  /** Intervalos [início, fim) de `text` com palavras abaixo do limiar. */
  lowConfidence: [number, number][];
  lines: TextLine[];
}

export const LOW_CONFIDENCE_THRESHOLD = 70;

export function buildOcrText(
  blocks: readonly OcrBlock[],
  threshold = LOW_CONFIDENCE_THRESHOLD,
): OcrPageText {
  let text = '';
  const lowConfidence: [number, number][] = [];
  const lines: TextLine[] = [];
  let weighted = 0;
  let weight = 0;

  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      if (text && !text.endsWith('\n\n')) text += text.endsWith('\n') ? '\n' : '\n\n';
      for (const line of paragraph.lines) {
        const words = line.words.filter((w) => w.text.trim());
        if (!words.length) continue;
        const lineStart = text.length;
        words.forEach((word, i) => {
          if (i > 0) text += ' ';
          const start = text.length;
          const value = word.text.trim();
          text += value;
          weighted += word.confidence * value.length;
          weight += value.length;
          if (word.confidence < threshold) lowConfidence.push([start, text.length]);
        });
        lines.push({
          text: text.slice(lineStart),
          x: line.bbox.x0,
          y: line.bbox.y1,
          right: line.bbox.x1,
          fontSize: Math.max(1, line.bbox.y1 - line.bbox.y0),
        });
        text += '\n';
      }
    }
  }
  return {
    text: text.trimEnd(),
    confidence: weight ? Math.round((weighted / weight) * 10) / 10 : 0,
    lowConfidence,
    lines,
  };
}
