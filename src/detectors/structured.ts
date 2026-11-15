// Leitura dos campos do próprio documento (procedimentos gerados pelo sistema eletrônico): o
// quadro do auto ("INFRATOR:", "CONDUTOR:", "TESTEMUNHAS:"), o índice ("TERMO DE DEPOIMENTO -
// NOME 2", com nomes truncados por "…"), a qualificação ("NOME , CPF …, mãe …, pai …") e a
// assinatura eletrônica ("por NOME (DELEGADO), em …"). Esses campos dizem o nome completo e o
// papel de cada pessoa; o restante do texto é comparado com essa lista.
import { PARTICLES, fold } from './text';
import type { Candidate, PersonRole } from './types';

const WORD = "[\\p{Lu}][\\p{L}'’]*";
const NAME_RE = new RegExp(
  `${WORD}(?:[ \\t]+(?:(?:da|de|do|das|dos|e|DA|DE|DO|DAS|DOS|E)[ \\t]+)?${WORD}){1,8}`,
  'gu',
);

/** Funções policiais e de autoridade declaradas no depoimento ("Disse: que é …"). */
const POLICE_FUNCTION =
  /Oficial(?:a)? Investigador[a]? de Pol[íi]cia|Inspetor[a]?(?: de Pol[íi]cia(?: Civil)?)?|Escriv[ãa]o?(?: de Pol[íi]cia(?: Civil)?)?|Delegad[oa](?: de Pol[íi]cia(?: Civil)?)?|Policial (?:Militar|Civil|Penal|Rodovi[áa]ri[oa](?: Federal)?|Federal)|Perit[oa](?: Criminal| Legista)?|Guarda Municipal|Agente de Pol[íi]cia|(?:Soldado|Cabo|Sargento|Subtenente|Tenente|Capit[ãa]o|Major|Coronel)(?: (?:da |do )?(?:PM|Pol[íi]cia Militar|PMCE))?/iu;

interface Found {
  start: number;
  text: string;
}

function isName(text: string, exclusions: ReadonlySet<string>, minTokens = 2): boolean {
  const tokens = fold(text)
    .split(/\s+/)
    .filter((t) => t && !PARTICLES.has(t));
  if (tokens.length < minTokens || tokens.length > 8) return false;
  if (/^(?:n[ãa]o|ignorad|desconhecid|sem)\b/iu.test(text.trim())) return false;
  return !tokens.some((t) => exclusions.has(t) || t.length < 2);
}

/** Nomes dentro do valor de um campo ("A, B E C"), com a posição de cada um. */
function namesIn(value: string, offset: number, exclusions: ReadonlySet<string>): Found[] {
  const out: Found[] = [];
  let pos = 0;
  for (const piece of value.split(/([,;]|\s+[eE]\s+)/)) {
    const m = new RegExp(NAME_RE.source, 'u').exec(piece);
    if (m && m[0].length >= piece.trim().length - 1 && isName(m[0], exclusions)) {
      out.push({ start: offset + pos + (m.index ?? 0), text: m[0] });
    }
    pos += piece.length;
  }
  return out;
}

function candidate(found: Found, extra: Partial<Candidate> = {}): Candidate {
  return {
    type: 'PESSOA',
    start: found.start,
    end: found.start + found.text.length,
    text: found.text,
    confidence: 0.99,
    detector: 'cadastro',
    ...extra,
  };
}

const FIELD_ROLES: [RegExp, Partial<Candidate>][] = [
  [/^(?:infrator(?:es)?|autuad[oa]s?|indiciad[oa]s?)$/i, { role: 'AUTOR' }],
  [/^conduzid[oa]s?$/i, { role: 'CONDUZIDO' }],
  [/^condutor$/i, { authority: true }],
  [/^testemunhas?$/i, { role: 'TESTEMUNHA' }],
  [/^v[íi]timas?$/i, { role: 'VÍTIMA' }],
  [/^(?:noticiante|comunicante)$/i, { role: 'COMUNICANTE' }],
  [/^declarante$/i, {}],
];

const SIGNATURE_ROLES: [RegExp, Partial<Candidate>][] = [
  [/^delegad[oa]/i, { authority: true, position: 'Delegado' }],
  [/^escriv/i, { authority: true, position: 'Escrivão' }],
  [/^perit/i, { authority: true, role: 'PERITO', position: 'Perito' }],
  [/^condutor/i, { authority: true }],
  [/^(?:interrogad|autuad|indiciad|conduzid|infrator)/i, { role: 'AUTOR' }],
  [/^v[íi]tima/i, { role: 'VÍTIMA' }],
  [/^testemunha/i, { role: 'TESTEMUNHA' }],
  [/^(?:noticiante|comunicante)/i, { role: 'COMUNICANTE' }],
  [/^advogad/i, { role: 'ADVOGADO' }],
];

const INDEX_TYPES =
  /^(?:TERMO|NOTA|COMUNICA[ÇC][ÃA]O DE PRIS|FOLHA DE ANTECEDENTES|GUIA DE RECOLHIMENTO|BOLETIM|AUTO DE QUALIFICA|INTIMA|MANDADO|REQUISI)/i;

function indexRole(type: string, tag: string | undefined): PersonRole | undefined {
  const t = fold(`${type} ${tag ?? ''}`);
  if (/noticiante|comunicante/.test(t)) return 'COMUNICANTE';
  if (/vitima/.test(t)) return 'VÍTIMA';
  if (/testemunha/.test(t)) return 'TESTEMUNHA';
  if (
    /interrogat|nota de culpa|garantias|comunicacao de pris|antecedentes|recolhimento de preso/.test(
      t,
    )
  )
    return 'AUTOR';
  return undefined;
}

let groupCounter = 0;

export function detectStructured(text: string, exclusions: ReadonlySet<string>): Candidate[] {
  const out: Candidate[] = [];

  // 1. Quadro do auto: "INFRATOR: NOME", "TESTEMUNHAS: A, B".
  const field =
    /^[ \t]*(INFRATOR(?:ES)?|AUTUAD[OA]S?|INDICIAD[OA]S?|CONDUZID[OA]S?|CONDUTOR|TESTEMUNHAS?|V[ÍI]TIMAS?|NOTICIANTE|COMUNICANTE|DECLARANTE)[ \t]*:[ \t]*(.+)$/gimu;
  for (const m of text.matchAll(field)) {
    const extra = FIELD_ROLES.find(([re]) => re.test(m[1] ?? ''))?.[1] ?? {};
    const value = m[2] ?? '';
    const offset = (m.index ?? 0) + m[0].length - value.length;
    for (const f of namesIn(value, offset, exclusions)) out.push(candidate(f, extra));
  }

  // 2. Assinatura eletrônica: "por NOME (DELEGADO), em 27/10/2026".
  const signature =
    /(?:\bpor|;)\s+([^();\n]{5,90}?)\s+\(([\p{Lu} ]{4,30})\),\s+em\s+\d{2}\/\d{2}\/\d{4}/gu;
  for (const m of text.matchAll(signature)) {
    const name = (m[1] ?? '').trim();
    if (!isName(name, exclusions)) continue;
    const start = (m.index ?? 0) + m[0].indexOf(name);
    const extra = SIGNATURE_ROLES.find(([re]) => re.test(m[2] ?? ''))?.[1] ?? {};
    out.push(candidate({ start, text: name }, extra));
  }

  // 3. Índice: "8. TERMO DE QUALIFICAÇÃO E INTERROGATÓRIO - FULANO DE T... 19".
  const index =
    /^[ \t]*\d+\.[ \t]+(.+?)[ \t]+-[ \t]+(?:(NOTICIANTE|COMUNICANTE|V[ÍI]TIMA|TESTEMUNHA)[ \t]+-[ \t]+)?([\p{Lu}][\p{Lu}'’ ]*?)(\.\.\.|…)?[ \t]+\d+[ \t]*$/gmu;
  for (const m of text.matchAll(index)) {
    const name = (m[3] ?? '').trim();
    const truncated = !!m[4];
    if (!INDEX_TYPES.test(m[1] ?? '')) continue;
    if (truncated ? name.length < 4 : !isName(name, exclusions)) continue;
    const start = (m.index ?? 0) + m[0].lastIndexOf(name);
    const role = indexRole(m[1] ?? '', m[2]);
    out.push(
      candidate(
        { start, text: name },
        { ...(role ? { role } : {}), ...(truncated ? { truncated } : {}) },
      ),
    );
  }
  const intimation =
    /^[ \t]*\d+\.[ \t]+INTIMA[ÇC][ÃA]O[ \t]+(?:DE[ \t]+)?([\p{Lu}][\p{Lu}'’ ]*?)(\.\.\.|…)?[ \t]+\d+[ \t]*$/gmu;
  for (const m of text.matchAll(intimation)) {
    const name = (m[1] ?? '').trim();
    if (m[2] ? name.length < 4 : !isName(name, exclusions)) continue;
    const start = (m.index ?? 0) + m[0].lastIndexOf(name);
    out.push(candidate({ start, text: name }, m[2] ? { truncated: true } : {}));
  }

  // 4. Qualificação: "NOME , CPF 000…, mãe NOME, pai NOME, …" e a função declarada.
  const qualification = /^[ \t]*([\p{Lu}][\p{L}'’ ]{4,90}?)[ \t]*,[ \t]*(?:CPF|RG)\b/gmu;
  for (const m of text.matchAll(qualification)) {
    const name = (m[1] ?? '').trim();
    if (!isName(name, exclusions)) continue;
    const start = (m.index ?? 0) + m[0].indexOf(name);
    const after = text.slice(start, start + 1600);
    const said = /Disse:\s*que\s+é\s+([^;.\n]{3,90})/iu.exec(after)?.[1] ?? '';
    const fn = POLICE_FUNCTION.exec(said)?.[0];
    out.push(candidate({ start, text: name }, fn ? { authority: true, position: fn } : {}));
    const group = `q${++groupCounter}`;
    for (const [label, relation] of [
      ['m[ãa]e', 'mãe'],
      ['pai', 'pai'],
    ] as const) {
      const rel = new RegExp(
        `\\b${label}[ \\t]+([^,;\\n]{3,80}(?:\\n[^,;\\n]{1,60})?)[,;]`,
        'iu',
      ).exec(after.slice(0, 500));
      const parent = rel?.[1]?.trim();
      if (!rel || !parent || !isName(parent, exclusions)) continue;
      out.push(
        candidate(
          { start: start + rel.index + rel[0].indexOf(parent), text: parent },
          { role: 'FAMILIAR', relation, group },
        ),
      );
    }
  }
  return out;
}
