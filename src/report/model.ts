// Estrutura do relatório (modelo "RELATÓRIO FINAL DE INQUÉRITO"): transforma o texto da análise,
// já reidentificado, em blocos — título, quadro de referência, vocativos, títulos de seção,
// parágrafos, citações recuadas, local e data e assinatura.
export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'reference'; lines: Run[][] }
  | { kind: 'vocative'; runs: Run[] }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'date'; text: string }
  | { kind: 'signature'; lines: Run[] };

export interface ReportTemplate {
  /** Linhas do rodapé (unidade, endereço, contato). */
  unitLines: string[];
  /** "Fortaleza/CE" — usada na linha de local e data. */
  city: string;
  signerName: string;
  signerTitle: string;
  signerUnit: string;
}

export const DEFAULT_TITLE = 'RELATÓRIO FINAL DE INQUÉRITO';

const REFERENCE_LABEL =
  /^(REFER[ÊE]NCIA|Incid[êe]ncia Penal|Indiciad[oa]\(?s?\)?|Investigad[oa]\(?s?\)?|Autuad[oa]\(?s?\)?|V[íi]tima\(?s?\)?|Infra[çc][ãa]o Penal|Natureza)\s*:\s*/iu;

/** **negrito**, *itálico* e _itálico_ do texto da IA viram formatação. */
export function inlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu;
  let pos = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > pos) runs.push({ text: text.slice(pos, m.index) });
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true });
    else runs.push({ text: m[2] ?? m[3] ?? '', italic: true });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos) });
  return runs.filter((r) => r.text);
}

const plain = (s: string) =>
  s
    .replace(/\*\*|__/g, '')
    .replace(/^#+\s*/, '')
    .trim();

function isHeading(line: string): boolean {
  if (/^#{1,6}\s+\S/.test(line)) return true;
  const t = plain(line);
  return (
    t.length >= 3 &&
    t.length <= 90 &&
    !/[.;:]$/.test(t) &&
    t === t.toLocaleUpperCase('pt-BR') &&
    /\p{L}{3}/u.test(t) &&
    !/\d{2}\/\d{2}\/\d{4}/.test(t)
  );
}

const DATE_LINE =
  /^[\p{Lu}][\p{L} .'-]+(?:\/[A-Z]{2})?,\s+.{0,12}\d{1,2}º?\s+de\s+\p{L}+\s+de\s+\d{4}\.?$/u;

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function dateLine(city: string, date: Date): string {
  const day = date.getDate() === 1 ? '1º' : String(date.getDate());
  return `${city.trim() || 'Fortaleza/CE'}, ${day} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}.`;
}

/** Monta os blocos do relatório a partir do texto (uma linha em branco separa parágrafos). */
export function buildReport(text: string, template: ReportTemplate, today = new Date()): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];
  let reference: Run[][] = [];
  let signature: Run[] | null = null;

  const flush = () => {
    if (paragraph.length) {
      const joined = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      // Parágrafo inteiro entre aspas e longo: transcrição de depoimento (citação recuada).
      const quoted = /^[“"].{150,}[”"]\.?$/u.test(joined);
      blocks.push({ kind: quoted ? 'quote' : 'paragraph', runs: inlineRuns(joined) });
      paragraph = [];
    }
    if (quote.length) {
      blocks.push({ kind: 'quote', runs: inlineRuns(quote.join(' ').replace(/\s+/g, ' ').trim()) });
      quote = [];
    }
    if (reference.length) {
      blocks.push({ kind: 'reference', lines: reference });
      reference = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (signature) {
      if (trimmed) signature.push(...inlineRuns(plain(trimmed)).slice(0, 1));
      continue;
    }
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) {
      flush();
      continue;
    }
    const ref = REFERENCE_LABEL.exec(plain(trimmed));
    if (ref) {
      if (paragraph.length || quote.length) flush();
      const body = plain(trimmed).slice(ref[0].length);
      reference.push([{ text: `${ref[1]}: `, bold: true }, ...inlineRuns(body)]);
      continue;
    }
    if (reference.length) flush();
    if (/^(?:>|\t| {4,})/.test(line)) {
      if (paragraph.length) flush();
      quote.push(trimmed.replace(/^>\s?/, ''));
      continue;
    }
    if (quote.length) flush();
    if (/^Excelent[íi]ssim/iu.test(plain(trimmed))) {
      flush();
      blocks.push({ kind: 'vocative', runs: [{ text: plain(trimmed), bold: true }] });
      continue;
    }
    if (DATE_LINE.test(plain(trimmed))) {
      flush();
      blocks.push({ kind: 'date', text: plain(trimmed) });
      signature = [];
      continue;
    }
    if (isHeading(trimmed)) {
      flush();
      const t = plain(trimmed);
      const first = !blocks.some((b) => b.kind === 'title');
      blocks.push(
        first && /RELAT[ÓO]RIO|REPRESENTA|PARECER|DESPACHO/iu.test(t) && !blocks.length
          ? { kind: 'title', text: t }
          : { kind: 'heading', text: t },
      );
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();

  if (!blocks.some((b) => b.kind === 'title'))
    blocks.unshift({ kind: 'title', text: DEFAULT_TITLE });

  // Fecho: local e data e assinatura do modelo, se o texto não trouxer.
  const signer = [template.signerName, template.signerTitle, template.signerUnit]
    .map((s) => s.trim())
    .filter(Boolean);
  const typed = (signature ?? []).filter((r) => !/assinatura eletr/i.test(r.text));
  if (!blocks.some((b) => b.kind === 'date')) {
    blocks.push({ kind: 'date', text: dateLine(template.city, today) });
  }
  const names = typed.length ? typed.map((r) => r.text) : signer;
  if (names.length) {
    blocks.push({
      kind: 'signature',
      lines: [
        { text: '– assinatura eletrônica –', italic: true },
        ...names.map((text, i) => (i === 0 ? { text, bold: true } : { text })),
      ],
    });
  }
  return blocks;
}
