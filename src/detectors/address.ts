// Endereços (SPEC Fase 4): a partir de um gatilho (Rua, Av., Travessa…), captura o nome do
// logradouro e os segmentos seguintes separados por vírgula enquanto parecerem endereço
// (número, complemento, bairro, cidade/UF). Para no CEP (detectado à parte), em ";" ou no
// início de outro campo ("Telefone:").
import type { Candidate } from './types';

const TRIGGER =
  /(?<![\p{L}\p{N}])(?:Rua|R\.|Avenida|Av\.|Travessa|Tv\.|Trav\.|Alameda|Al\.|Rodovia|Rod\.|Estrada|Conjunto|Conj\.|Quadra|Qd\.|Lote|Praça|Pça\.|Vila|Beco|Viela|Sítio|Fazenda|Loteamento|Residencial|Condomínio)\s+/gu;

/** Nome do logradouro: palavras capitalizadas, números e partículas, até 8 palavras. Ponto só
 * em abreviações curtas ("Sto.", "Gov."), para não engolir o fim da frase. */
const STREET_WORD =
  "(?:[\\p{Lu}][\\p{L}]{0,3}\\.(?=[ \\t]+[\\p{Lu}\\d])|[\\p{Lu}\\d][\\p{L}\\d'’-]*|(?:das|dos|da|de|do|e)(?![\\p{L}])|d['’])";
const STREET_NAME = new RegExp(`^${STREET_WORD}(?:[ \\t]+${STREET_WORD}){0,7}`, 'u');

const SEGMENT =
  /^\s*(?:n[º°o.]?\s*\d+[\w-]*|n[úu]mero\s*\d+[\w-]*|\d+[A-Za-z]?|s\/?n[º°]?|km\s*[\d.,]+|apto?\.?\s*\w+|apartamento\s*\w+|bloco\s*\w+|bl\.?\s*\w+|casa\s*\w+|lote\s*\w+|lt\.?\s*\w+|quadra\s*\w+|qd\.?\s*\w+|sala\s*\w+|andar\s*\w+|fundos|t[ée]rreo|bairro\s+[^,;\n]+?(?:\n[^,;\n:]+)?|(?:conjunto|conj\.)\s+[^,;\n]+|[\p{Lu}][\p{L}'’ -]*\/\s?[A-Z]{2}|[\p{Lu}][\p{L}'’-]+(?:\s+(?:[\p{Lu}][\p{L}'’-]+|da|de|do|das|dos))*\s*[-–]\s*[A-Z]{2}|próximo\s+[^,;\n]+|perto\s+[^,;\n]+)\s*$/iu;

function trimEnd(text: string): string {
  return text.replace(/[\s,.;:–-]+$/u, '');
}

export function detectEndereco(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of text.matchAll(TRIGGER)) {
    const start = m.index ?? 0;
    const afterTrigger = start + m[0].length;
    const name = STREET_NAME.exec(text.slice(afterTrigger, afterTrigger + 120));
    if (!name || !/[\p{Lu}\d]/u.test(name[0])) continue;
    let end = afterTrigger + trimEnd(name[0]).length;

    // Segmentos separados por vírgula ou hífen.
    let pos = end;
    for (let i = 0; i < 8; i++) {
      const sep = /^\s*[,–-]\s*/.exec(text.slice(pos));
      if (!sep) break;
      const segStart = pos + sep[0].length;
      const rest = text.slice(segStart, segStart + 100);
      // O segmento vai até a próxima vírgula, ";" ou fim de linha seguido de rótulo.
      const raw = /^[^,;]*/.exec(rest)?.[0] ?? '';
      // Corta em outro campo ("Telefone:"), no CEP ou no fim da frase ("Fortaleza/CE. Disse").
      const cut = raw.search(
        /\n\s*[\p{L} ]{2,25}:|\bCEP\b|\b(?:Telefone|Tel|Fone|CPF|RG)\b|(?<=[\p{L}\d]{2})\.(?=\s+\p{Lu})/iu,
      );
      const segment = trimEnd(cut >= 0 ? raw.slice(0, cut) : raw);
      if (!segment || !SEGMENT.test(segment)) break;
      end = segStart + segment.length;
      pos = end;
    }

    const value = text.slice(start, end);
    const words = value.split(/\s+/).length;
    out.push({
      type: 'ENDERECO',
      start,
      end,
      text: value,
      confidence: words >= 3 ? 0.9 : 0.75,
      detector: 'endereco',
    });
  }
  return out;
}
