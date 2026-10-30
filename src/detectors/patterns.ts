// Detectores por padrão (regex + validação), SPEC Fase 4. Cada um devolve candidatos com tipo,
// trecho, posição e confiança. Erram para o lado de detectar demais: números com forma de CPF
// mas dígitos inválidos (possível erro de OCR) entram com confiança menor.
import type { Candidate, EntityType } from './types';
import { ocrDigits, onlyDigits } from './text';

/** Limites: não colado em letra/dígito. */
const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

function candidate(
  type: EntityType,
  m: RegExpMatchArray,
  confidence: number,
  detector: string,
  group = 0,
): Candidate {
  const text = m[group] ?? '';
  const offset = group === 0 ? 0 : (m[0] ?? '').indexOf(text);
  const start = (m.index ?? 0) + offset;
  return { type, start, end: start + text.length, text, confidence, detector };
}

/** Rótulo imediatamente antes (até `window` caracteres). */
function labelBefore(text: string, index: number, label: RegExp, window = 30): boolean {
  return label.test(text.slice(Math.max(0, index - window), index));
}

// ---------------------------------------------------------------- CPF e CNPJ

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

const CPF_LABEL = /\bC\.?\s?P\.?\s?F\.?\s*(?:\/\s*MF)?\s*(?:n[º°o.]*)?\s*[:-]?\s*$/i;

export function detectCpf(text: string): Candidate[] {
  const out: Candidate[] = [];
  const re = new RegExp(
    `${B}[\\dOoIl]{3}[.\\s]?[\\dOoIl]{3}[.\\s]?[\\dOoIl]{3}[-.\\s]?[\\dOoIl]{2}${E}`,
    'gu',
  );
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const digits = onlyDigits(ocrDigits(raw));
    if (digits.length !== 11) continue;
    const hasOcrLetters = /[OoIl]/.test(raw);
    if (hasOcrLetters && !/\d{3}/.test(raw)) continue;
    const labeled = labelBefore(text, m.index ?? 0, CPF_LABEL);
    const valid = isValidCpf(digits);
    const formatted = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(raw);
    if (!valid && !labeled && !formatted) continue;
    const confidence = valid ? (labeled ? 0.99 : 0.9) : labeled ? 0.75 : 0.5;
    out.push(candidate('CPF', m, confidence, 'cpf'));
  }
  return out;
}

export function detectCnpj(text: string): Candidate[] {
  const re = new RegExp(`${B}\\d{2}\\.?\\d{3}\\.?\\d{3}\\/?\\d{4}-?\\d{2}${E}`, 'gu');
  return [...text.matchAll(re)]
    .filter((m) => /[./-]/.test(m[0]) || isValidCnpj(m[0]))
    .map((m) => candidate('CNPJ', m, isValidCnpj(m[0]) ? 0.95 : 0.55, 'cnpj'));
}

// ---------------------------------------------------------------- RG, CNH, veículo

export function detectRg(text: string): Candidate[] {
  const re =
    /\b(?:R\.?\s?G\.?|RGs?|identidade(?:\s+civil)?|carteira\s+de\s+identidade|C\.?I\.?)\s*(?:n[º°o.]*)?\s*[:-]?\s*(\d[\d.\-\s]{3,16}[\dxX])(?=\s*(?:[-/–]?\s*(?:SSP|SSPDS|SDS|SESP|PC|IFP|IIRGD|DETRAN|PCCE|SEJUS|SSPCE)\b|[\s,.;)]|$))/giu;
  return [...text.matchAll(re)]
    .filter((m) => onlyDigits(m[1] ?? '').length >= 5 && !/\s{2,}/.test(m[1] ?? ''))
    .map((m) => {
      const c = candidate('RG', m, 0.9, 'rg', 1);
      const trimmed = c.text.trimEnd();
      return { ...c, text: trimmed, end: c.start + trimmed.length };
    });
}

export function detectCnh(text: string): Candidate[] {
  const re =
    /\b(?:CNH|carteira\s+nacional\s+de\s+habilita[çc][ãa]o|habilita[çc][ãa]o)\s*(?:n[º°o.]*)?\s*[:-]?\s*(\d{9,11})(?!\d)/giu;
  return [...text.matchAll(re)].map((m) => candidate('CNH', m, 0.95, 'cnh', 1));
}

// ---------------------------------------------------------------- Título, CNS, passaporte, prontuário

/** Título de eleitor: 8 dígitos sequenciais, 2 da UF (01 a 28) e 2 verificadores. */
export function isValidTituloEleitor(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 12) return false;
  const uf = Number(d.slice(8, 10));
  if (uf < 1 || uf > 28) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * (i + 2);
  let dv1 = sum % 11;
  if (dv1 === 10) dv1 = 0;
  else if (dv1 === 0 && (uf === 1 || uf === 2)) dv1 = 1;
  let dv2 = (Number(d[8]) * 7 + Number(d[9]) * 8 + dv1 * 9) % 11;
  if (dv2 === 10) dv2 = 0;
  else if (dv2 === 0 && (uf === 1 || uf === 2)) dv2 = 1;
  return dv1 === Number(d[10]) && dv2 === Number(d[11]);
}

export function detectTituloEleitor(text: string): Candidate[] {
  const re =
    /\bt[íi]tulo(?:\s+de)?\s+eleitor(?:al)?\s*(?:n[º°o.]*)?\s*[:-]?\s*(\d{4}[\s.]?\d{4}[\s.]?\d{4})(?!\d)/giu;
  return [...text.matchAll(re)].map((m) =>
    candidate('TITULO_ELEITOR', m, isValidTituloEleitor(m[1] ?? '') ? 0.98 : 0.85, 'titulo', 1),
  );
}

/** Cartão Nacional de Saúde (15 dígitos; definitivo começa com 1 ou 2, provisório com 7, 8 ou 9). */
export function isValidCns(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 15 || !/^[12789]/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += Number(d[i]) * (15 - i);
  return sum % 11 === 0;
}

export function detectCns(text: string): Candidate[] {
  const out: Candidate[] = [];
  const labeled =
    /\b(?:CNS|cart[ãa]o\s+(?:nacional\s+de\s+sa[úu]de|(?:do\s+)?SUS))\s*(?:n[º°o.]*)?\s*[:-]?\s*(\d{3}[\s.]?\d{4}[\s.]?\d{4}[\s.]?\d{4})(?!\d)/giu;
  for (const m of text.matchAll(labeled)) {
    out.push(candidate('CNS', m, isValidCns(m[1] ?? '') ? 0.98 : 0.85, 'cns', 1));
  }
  // Sem rótulo, só com os dígitos verificadores válidos e no formato 000 0000 0000 0000.
  const bare = new RegExp(`${B}[12789]\\d{2} \\d{4} \\d{4} \\d{4}${E}`, 'gu');
  for (const m of text.matchAll(bare)) {
    if (!isValidCns(m[0]) || out.some((o) => o.start === m.index)) continue;
    out.push(candidate('CNS', m, 0.9, 'cns'));
  }
  return out;
}

export function detectPassaporte(text: string): Candidate[] {
  const re = /\bpassaporte\s*(?:n[º°o.]*)?\s*[:-]?\s*([A-Z]{2}\s?\d{6,7})(?![\p{L}\p{N}])/giu;
  return [...text.matchAll(re)].map((m) => candidate('PASSAPORTE', m, 0.95, 'passaporte', 1));
}

export function detectProntuario(text: string): Candidate[] {
  const re =
    /\b(?:prontu[áa]rio(?:\s+m[ée]dico)?|registro\s+hospitalar|matr[íi]cula\s+(?:hospitalar|do\s+paciente)|n[º°]\s*(?:do\s+)?atendimento)\s*(?:n[º°o.]*)?\s*[:-]?\s*([A-Z]{0,3}\d[\d./-]{1,18}\d)(?![\p{L}\p{N}])/giu;
  return [...text.matchAll(re)].map((m) => candidate('PRONTUARIO', m, 0.95, 'prontuario', 1));
}

export function detectRenavam(text: string): Candidate[] {
  const re = /\bRenavam\s*(?:n[º°o.]*)?\s*[:-]?\s*([\dOo]{9,11})(?![\dOo])/giu;
  return [...text.matchAll(re)].map((m) => candidate('CHASSI_RENAVAM', m, 0.95, 'renavam', 1));
}

export function detectChassi(text: string): Candidate[] {
  const out: Candidate[] = [];
  const re = new RegExp(`${B}[A-HJ-NPR-Z0-9]{17}${E}`, 'gu');
  for (const m of text.matchAll(re)) {
    const v = m[0];
    const digits = (v.match(/\d/g) ?? []).length;
    if (digits < 5 || digits === 17 || !/[A-Z]/.test(v)) continue;
    const labeled = labelBefore(text, m.index ?? 0, /chassi\s*(?:n[º°o.]*)?\s*[:-]?\s*$/i);
    out.push(candidate('CHASSI_RENAVAM', m, labeled ? 0.97 : 0.8, 'chassi'));
  }
  // Com rótulo, aceita a letra O (troca comum de OCR por zero), que o padrão VIN não permite.
  const ocr = /\bchassi\s*(?:n[º°o.]*)?\s*[:-]?\s*([A-Z0-9]{17,18})(?![A-Z0-9])/giu;
  for (const m of text.matchAll(ocr)) {
    const c = candidate('CHASSI_RENAVAM', m, 0.85, 'chassi', 1);
    if (!out.some((o) => o.start === c.start)) out.push(c);
  }
  return out;
}

export function detectPlaca(text: string): Candidate[] {
  const out: Candidate[] = [];
  const old = new RegExp(`${B}[A-Z]{3}[-\\s]?\\d{4}${E}`, 'gu');
  const mercosul = new RegExp(`${B}[A-Z]{3}\\d[A-Z]\\d{2}${E}`, 'gu');
  for (const m of text.matchAll(old)) {
    const labeled = labelBefore(text, m.index ?? 0, /placas?\s*(?:n[º°o.]*)?\s*[:-]?\s*$/i);
    out.push(candidate('PLACA', m, labeled ? 0.98 : 0.85, 'placa'));
  }
  for (const m of text.matchAll(mercosul)) out.push(candidate('PLACA', m, 0.95, 'placa-mercosul'));
  return out;
}

// ---------------------------------------------------------------- Contato

export function detectTelefone(text: string): Candidate[] {
  const out: Candidate[] = [];
  // +55 opcional, DDD com ou sem parênteses, 8 ou 9 dígitos com hífen ou espaço.
  const re =
    /(?<![\p{L}\p{N}/.-])(?:\+?55[\s.-]?)?(?:\(\s?\d{2}\s?\)\s?|\d{2}[\s.-])?(?:9[\s.]?\d{4}|[2-5]\d{3})[-\s]\d{4}(?![\p{N}/-]|\.\d)/gu;
  for (const m of text.matchAll(re)) {
    const digits = onlyDigits(m[0]);
    if (digits.length < 8 || digits.length > 13) continue;
    const labeled = labelBefore(
      text,
      m.index ?? 0,
      /(?:tel(?:efone)?s?|cel(?:ular)?|fone|whats(?:app)?|contato)\.?\s*(?:n[º°o.]*)?\s*[:-]?\s*$/i,
    );
    const hasDdd = digits.length >= 10;
    out.push(candidate('TELEFONE', m, labeled ? 0.98 : hasDdd ? 0.9 : 0.7, 'telefone'));
  }
  // Com rótulo, aceita também números sem separador.
  const plain =
    /\b(?:tel(?:efone)?|cel(?:ular)?|fone|whats(?:app)?)\.?\s*[:-]?\s*(\(?\d{2}\)?\s?\d{8,9})(?!\d)/giu;
  for (const m of text.matchAll(plain)) {
    const c = candidate('TELEFONE', m, 0.95, 'telefone', 1);
    if (!out.some((o) => o.start <= c.start && o.end >= c.end)) out.push(c);
  }
  return out;
}

export function detectEmail(text: string): Candidate[] {
  const out: Candidate[] = [];
  const re = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
  for (const m of text.matchAll(re)) out.push(candidate('EMAIL', m, 0.99, 'email'));
  // OCR costuma ler "@" como "Q", "&Q" ou "(@": aceita quando termina em domínio conhecido.
  const ocr =
    /[\p{L}\p{N}._%+-]+\.[\p{L}\p{N}._%+-]*(?:&?Q|\(@|@\))[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|br|net|org|gov|edu)(?:\.br)?\b/gu;
  for (const m of text.matchAll(ocr)) {
    const c = candidate('EMAIL', m, 0.7, 'email-ocr');
    if (!out.some((o) => o.start < c.end && c.start < o.end)) out.push(c);
  }
  return out;
}

export function detectPixAleatoria(text: string): Candidate[] {
  // Chave aleatória (UUID). Tolera quebra de linha ou espaço após os hífens (texto de OCR).
  const re = /\b[0-9a-f]{8}-\s?[0-9a-f]{4}-\s?[0-9a-f]{4}-\s?[0-9a-f]{4}-\s?[0-9a-f]{12}\b/giu;
  return [...text.matchAll(re)].map((m) => candidate('CHAVE_PIX', m, 0.97, 'pix'));
}

export function detectCep(text: string): Candidate[] {
  const out: Candidate[] = [];
  const re = new RegExp(`${B}\\d{2}\\.?\\d{3}-\\d{3}${E}`, 'gu');
  for (const m of text.matchAll(re)) {
    const labeled = labelBefore(text, m.index ?? 0, /CEP\s*[:-]?\s*$/i);
    out.push(candidate('CEP', m, labeled ? 0.98 : 0.75, 'cep'));
  }
  const plain = /\bCEP\s*[:-]?\s*(\d{8})(?!\d)/giu;
  for (const m of text.matchAll(plain)) out.push(candidate('CEP', m, 0.95, 'cep', 1));
  return out;
}

export function detectContaBancaria(text: string): Candidate[] {
  const out: Candidate[] = [];
  const both =
    /\bag[êe]ncia\s*(?:n[º°o.]*)?\s*[:-]?\s*\d{3,5}(?:-[\dxX])?\s*[,;/e]?\s*(?:e\s+)?(?:conta(?:\s+(?:corrente|poupan[çc]a|salário|pagamento))?|c\/c|cc)\s*(?:n[º°o.]*)?\s*[:-]?\s*[\d.]{3,15}-?[\dxX]?/giu;
  for (const m of text.matchAll(both)) out.push(candidate('CONTA_BANCARIA', m, 0.95, 'conta'));
  const single =
    /\b(?:conta(?:\s+(?:corrente|poupan[çc]a))?|c\/c)\s*(?:n[º°o.]*)?\s*[:-]?\s*(\d[\d.]{3,15}-?[\dxX]?)/giu;
  for (const m of text.matchAll(single)) {
    const c = candidate('CONTA_BANCARIA', m, 0.85, 'conta', 1);
    if (!out.some((o) => o.start <= c.start && o.end >= c.end)) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- Datas e números de procedimentos

export function detectDataNascimento(text: string): Candidate[] {
  const out: Candidate[] = [];
  const date = /\b\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}\b/gu;
  const context =
    /(?:nascid[oa]|nasc\.?|data\s+de\s+nascimento|D\.?\s?N\.?|natural\s+de[^\n]{0,40}?,?\s*nascid[oa])\s*(?:em|aos)?\s*[:-]?\s*$/i;
  for (const m of text.matchAll(date)) {
    const index = m.index ?? 0;
    const before = text.slice(Math.max(0, index - 40), index);
    const after = text.slice(index + m[0].length, index + m[0].length + 20);
    if (context.test(before) || /^\s*\(\s*\d{1,3}\s+anos/i.test(after)) {
      out.push(candidate('DATA_NASCIMENTO', m, 0.95, 'data-nascimento'));
    }
  }
  return out;
}

/** Valida os dígitos verificadores do número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO). */
export function isValidCnj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 20) return false;
  const n = d.slice(0, 7);
  const dd = d.slice(7, 9);
  const rest = d.slice(9);
  const check = 98n - (BigInt(`${n}${rest}00`) % 97n);
  return check === BigInt(dd);
}

export function detectProcesso(text: string): Candidate[] {
  const re = new RegExp(`${B}\\d{7}-?\\d{2}\\.?\\d{4}\\.?\\d\\.?\\d{2}\\.?\\d{4}${E}`, 'gu');
  return [...text.matchAll(re)].map((m) =>
    candidate('NUM_PROCESSO', m, isValidCnj(m[0]) ? 0.99 : 0.75, 'processo-cnj'),
  );
}

const NUMBER_AFTER_LABEL = '\\s*(?:n[º°o.]*|n[úu]mero)?\\s*[:\\-]?\\s*(\\d[\\d./-]{2,20}\\d)';

export function detectBo(text: string): Candidate[] {
  const re = new RegExp(
    `\\b(?:B\\.?\\s?O\\.?|boletim\\s+de\\s+ocorr[êe]ncia)${NUMBER_AFTER_LABEL}`,
    'giu',
  );
  return [...text.matchAll(re)].map((m) => candidate('NUM_BO', m, 0.95, 'bo', 1));
}

export function detectIp(text: string): Candidate[] {
  const re = new RegExp(
    `\\b(?:I\\.?\\s?P\\.?|inqu[ée]rito(?:\\s+policial)?|IPL)${NUMBER_AFTER_LABEL}`,
    'giu',
  );
  return [...text.matchAll(re)].map((m) => candidate('NUM_IP', m, 0.95, 'ip', 1));
}

export const PATTERN_DETECTORS: ((text: string) => Candidate[])[] = [
  detectCpf,
  detectCnpj,
  detectRg,
  detectCnh,
  detectTituloEleitor,
  detectCns,
  detectPassaporte,
  detectProntuario,
  detectRenavam,
  detectChassi,
  detectPlaca,
  detectTelefone,
  detectEmail,
  detectPixAleatoria,
  detectCep,
  detectContaBancaria,
  detectDataNascimento,
  detectProcesso,
  detectBo,
  detectIp,
];
