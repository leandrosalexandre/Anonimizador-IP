// Reconstrução da ordem de leitura a partir dos itens de texto do pdf.js.
// Coordenadas já convertidas para o espaço da página renderizada (origem no canto superior
// esquerdo, y para baixo), o que cobre páginas com rotação.

export interface PositionedText {
  str: string;
  /** Início da linha de base. */
  x: number;
  y: number;
  width: number;
  /** Altura aproximada da fonte. */
  fontSize: number;
}

export interface TextLine {
  text: string;
  x: number;
  y: number;
  right: number;
  fontSize: number;
}

/** Mínimo de caracteres alfanuméricos para considerar que a página tem texto útil. */
export const MIN_USEFUL_ALNUM = 30;

export function countAlnum(text: string): number {
  return text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}

export function classifyPage(text: string): 'text' | 'image' {
  return countAlnum(text) > MIN_USEFUL_ALNUM ? 'text' : 'image';
}

/** Agrupa os itens em linhas pela linha de base e ordena da esquerda para a direita. */
export function groupLines(items: readonly PositionedText[]): TextLine[] {
  const usable = items.filter((i) => i.str.length > 0 && i.str.trim().length > 0);
  const sorted = [...usable].sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: { y: number; fontSize: number; items: PositionedText[] }[] = [];

  for (const item of sorted) {
    const size = Math.max(item.fontSize, 1);
    // Procura entre as últimas linhas (itens sobrescritos podem ficar ligeiramente acima).
    let target: (typeof groups)[number] | undefined;
    for (let i = groups.length - 1; i >= 0 && i >= groups.length - 3; i--) {
      const g = groups[i];
      if (g && Math.abs(g.y - item.y) <= Math.min(g.fontSize, size) * 0.5) {
        target = g;
        break;
      }
    }
    if (target) {
      target.items.push(item);
      target.fontSize = Math.max(target.fontSize, size);
    } else {
      groups.push({ y: item.y, fontSize: size, items: [item] });
    }
  }

  return groups.map((g) => {
    const lineItems = g.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd: number | null = null;
    for (const item of lineItems) {
      if (prevEnd !== null) {
        const gap = item.x - prevEnd;
        const needsSpace =
          gap > g.fontSize * 0.15 && !text.endsWith(' ') && !item.str.startsWith(' ');
        if (needsSpace) text += ' ';
      }
      text += item.str;
      prevEnd = Math.max(prevEnd ?? -Infinity, item.x + item.width);
    }
    const first = lineItems[0];
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: first ? first.x : 0,
      y: g.y,
      right: prevEnd ?? 0,
      fontSize: g.fontSize,
    };
  });
}

/** Junta as linhas em texto; espaços verticais grandes viram linha em branco (parágrafo). */
export function linesToText(lines: readonly TextLine[]): string {
  const out: string[] = [];
  let prev: TextLine | null = null;
  for (const line of lines) {
    if (!line.text) continue;
    if (prev && line.y - prev.y > Math.max(prev.fontSize, line.fontSize) * 2.2) out.push('');
    out.push(line.text);
    prev = line;
  }
  return out.join('\n');
}
