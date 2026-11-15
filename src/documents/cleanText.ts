// Limpeza do texto das páginas antes da detecção e da exportação:
// - une palavras cortadas por hífen no fim da linha ("BRU-\nNO" → "BRUNO");
// - lê a folha no rodapé "N de M" dos procedimentos eletrônicos;
// - remove ruído que se repete em toda página (código de verificação, bloco de assinatura
//   eletrônica, cabeçalhos e rodapés), que só atrapalha a leitura pela IA.
// A detecção usa o texto só com os hífens unidos (o bloco de assinatura diz quem é o Delegado, o
// interrogado etc.); a revisão e a exportação usam o texto sem o ruído.

/** Pronomes que ficam depois do hífen ("constatou-\nse"): o hífen é mantido. */
const CLITICS = /^(?:se|me|te|lhe|lhes|nos|vos|o|a|os|as|lo|la|los|las)$/;

export function joinHyphenated(text: string): string {
  return text.replace(/(\p{L}+)-\n[ \t]*(\p{L}+)[ \t]?/gu, (_m, a: string, b: string) =>
    CLITICS.test(b) ? `${a}-${b}\n` : `${a}${b}\n`,
  );
}

const HASH_LINE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b.*$/i;
const SIGNATURE_START = /^ASSINATURA ELETR[ÔO]NICA\s*$/;
const FOLIO = /(?:^|\s)(\d{1,4}) de (\d{1,4})\s*$/;

/** Folha pelo rodapé "N de M" (últimas linhas da página). */
export function footerFolha(text: string): number | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-3);
  for (const line of lines.reverse()) {
    const m = FOLIO.exec(line);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= Number(m[2])) return Number(m[1]);
  }
  return null;
}

const footKey = (line: string) => line.trim().replace(/\d+/g, '#').toLocaleLowerCase('pt-BR');
const headKey = (line: string) => line.trim().toLocaleLowerCase('pt-BR');
/** Só letras e espaços (um título ou um nome): nunca é tratado como cabeçalho ou rodapé. */
const wordsOnly = (line: string) => /^[\p{L}\s'’]+$/u.test(line.trim());
const candidateLine = (line: string) =>
  line.trim().length > 0 && line.trim().length <= 200 && !wordsOnly(line);

/**
 * Remove o ruído das páginas de um documento: o código de verificação, o bloco de assinatura
 * eletrônica e as linhas de cabeçalho (3 primeiras, idênticas) ou de rodapé (8 últimas, iguais a
 * menos dos números) que se repetem em pelo menos 3 páginas e 10% do documento. Linhas só com
 * palavras (títulos, nomes) e a capa nunca são removidas.
 */
export function stripNoise(pages: readonly string[]): string[] {
  const HEAD = 3;
  const TAIL = 8;
  const withoutBlocks = pages.map((text) => {
    const lines = text.split('\n');
    const sig = lines.findIndex((l) => SIGNATURE_START.test(l.trim()));
    return (sig >= 0 ? lines.slice(0, sig) : lines).filter((l) => !HASH_LINE.test(l.trim()));
  });
  const heads = new Map<string, number>();
  const foots = new Map<string, number>();
  const edges = (lines: string[]) => {
    const filled = lines.map((l, i) => ({ l, i })).filter((x) => x.l.trim());
    return { head: filled.slice(0, HEAD), foot: filled.slice(-TAIL) };
  };
  for (const lines of withoutBlocks) {
    const { head, foot } = edges(lines);
    for (const k of new Set(head.map((x) => headKey(x.l)))) heads.set(k, (heads.get(k) ?? 0) + 1);
    for (const k of new Set(foot.map((x) => footKey(x.l)))) foots.set(k, (foots.get(k) ?? 0) + 1);
  }
  const min = Math.max(3, Math.ceil(pages.length / 10));
  return withoutBlocks.map((lines, page) => {
    const tidy = (ls: string[]) =>
      ls
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    // A primeira página (capa) fica inteira: o número do procedimento aparece nela.
    if (page === 0) return tidy(lines);
    const { head, foot } = edges(lines);
    const drop = new Set<number>();
    for (const x of head)
      if (candidateLine(x.l) && (heads.get(headKey(x.l)) ?? 0) >= min) drop.add(x.i);
    for (const x of foot)
      if (
        /^\d{1,4} de \d{1,4}$/.test(x.l.trim()) ||
        (candidateLine(x.l) && (foots.get(footKey(x.l)) ?? 0) >= min)
      )
        drop.add(x.i);
    return tidy(lines.filter((_, i) => !drop.has(i)));
  });
}
