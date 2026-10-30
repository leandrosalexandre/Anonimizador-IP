// Resolve candidatos sobrepostos na mesma página: fica o mais específico/confiável.
import type { Candidate, EntityType } from './types';

/** Prioridade em empate de confiança (maior vence). */
const PRIORITY: Record<EntityType, number> = {
  EMAIL: 20,
  CHAVE_PIX: 19,
  NUM_PROCESSO: 18,
  CNPJ: 17,
  CPF: 16,
  CHASSI_RENAVAM: 15,
  CNH: 14,
  CNS: 14,
  TITULO_ELEITOR: 14,
  PASSAPORTE: 14,
  PRONTUARIO: 13,
  RG: 13,
  TELEFONE: 12,
  PLACA: 11,
  CEP: 10,
  DATA_NASCIMENTO: 9,
  CONTA_BANCARIA: 8,
  NUM_BO: 7,
  NUM_IP: 6,
  ENDERECO: 5,
  EMPRESA_PRIVADA: 4,
  APELIDO: 3,
  PESSOA: 2,
  CIDADE: 1,
  OUTRO: 1,
};

function overlaps(a: Candidate, b: Candidate): boolean {
  return a.start < b.end && b.start < a.end;
}

function contains(a: Candidate, b: Candidate): boolean {
  return a.start <= b.start && a.end >= b.end;
}

function beats(a: Candidate, b: Candidate): boolean {
  // Pessoa dentro de endereço ou empresa: é nome de rua/bairro/empresa.
  if (
    b.type === 'PESSOA' &&
    (a.type === 'ENDERECO' || a.type === 'EMPRESA_PRIVADA') &&
    contains(a, b)
  ) {
    return true;
  }
  if (
    a.type === 'PESSOA' &&
    (b.type === 'ENDERECO' || b.type === 'EMPRESA_PRIVADA') &&
    contains(b, a)
  ) {
    return false;
  }
  // Nome lido de rótulo ou gatilho vence a sequência capitalizada que o contém
  // ("FILHO DE MARIA IVONE MOTA" → "MARIA IVONE MOTA").
  if (a.type === 'PESSOA' && b.type === 'PESSOA') {
    const strongA = !a.detector.startsWith('sequencia');
    const strongB = !b.detector.startsWith('sequencia');
    if (strongA !== strongB) return strongA;
  }
  // Mesmo tipo: o maior (mais completo) vence; empate, o mais confiável.
  if (a.type === b.type) {
    const la = a.end - a.start;
    const lb = b.end - b.start;
    if (la !== lb) return la > lb;
    return a.confidence >= b.confidence;
  }
  // Tipos diferentes: dado estruturado com rótulo vence formato genérico.
  if (Math.abs(a.confidence - b.confidence) > 0.15) return a.confidence > b.confidence;
  return PRIORITY[a.type] >= PRIORITY[b.type];
}

/** Mescla atributos de candidatos do mesmo tipo que coincidem (papel, autoridade). */
function absorb(winner: Candidate, loser: Candidate): Candidate {
  if (winner.type !== loser.type) return winner;
  return {
    ...winner,
    confidence: Math.max(winner.confidence, loser.confidence),
    ...((winner.role ?? loser.role) ? { role: winner.role ?? loser.role } : {}),
    ...(winner.authority || loser.authority ? { authority: true } : {}),
    // Basta um sinal forte para o nome deixar de ser só sugestão.
    ...(winner.suggestion && loser.suggestion ? { suggestion: true } : { suggestion: false }),
    ...((winner.group ?? loser.group) ? { group: winner.group ?? loser.group } : {}),
    ...((winner.relation ?? loser.relation) ? { relation: winner.relation ?? loser.relation } : {}),
    ...((winner.position ?? loser.position) ? { position: winner.position ?? loser.position } : {}),
    detector:
      winner.detector === loser.detector ? winner.detector : `${winner.detector}+${loser.detector}`,
  };
}

export function resolveOverlaps(candidates: readonly Candidate[]): Candidate[] {
  const sorted = [...candidates].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Candidate[] = [];
  for (const c of sorted) {
    let current: Candidate | null = c;
    for (let i = kept.length - 1; i >= 0 && current; i--) {
      const k = kept[i];
      if (!k || !overlaps(k, current)) continue;
      if (beats(k, current)) {
        kept[i] = absorb(k, current);
        current = null;
      } else {
        current = absorb(current, k);
        kept.splice(i, 1);
      }
    }
    if (current) kept.push(current);
  }
  return kept.sort((a, b) => a.start - b.start);
}
