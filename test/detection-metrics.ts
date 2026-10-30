// Métricas da detecção contra o gabarito do IP fictício: cobertura (recall) por tipo, precisão e
// acerto da decisão "manter" para autoridades.
import { findAll, fold } from '../src/detectors/text';
import type { DetectedEntity, EntityType } from '../src/detectors/types';

export interface GabaritoEntity {
  id: string;
  type: EntityType;
  role?: string;
  decision: 'pseudonymize' | 'keep';
  canonical: string;
  occurrences: { pdfPage: number; text: string }[];
}

export interface Gabarito {
  pages: { pdfPage: number; folha: number; text: string }[];
  entities: GabaritoEntity[];
  files: { text: string; scanned: string; mixed: { file: string; imagePages: number[] } };
}

interface Instance {
  pdfPage: number;
  start: number;
  end: number;
  entity: GabaritoEntity;
}

export interface TypeMetrics {
  type: string;
  expected: number;
  found: number;
  recall: number;
  missed: string[];
}

export interface DetectionReport {
  byType: TypeMetrics[];
  peopleRecall: number;
  detectedSpans: number;
  falsePositives: string[];
  precision: number;
  keepExpected: number;
  keepCorrect: number;
  keepMissed: string[];
  /** Ocorrências do gabarito que não existem no texto (perdidas no OCR). */
  notInText: number;
}

const normalizeWs = (s: string) => s.replace(/\s+/g, ' ');

/** Localiza as ocorrências do gabarito no texto da página (sem duplicar trechos contidos). */
export function locateInstances(
  pageTexts: Map<number, string>,
  gabarito: Gabarito,
  tolerant = false,
): { instances: Instance[]; notInText: number } {
  const instances: Instance[] = [];
  let notInText = 0;
  for (const [pdfPage, text] of pageTexts) {
    const wanted = new Map<string, { entity: GabaritoEntity; text: string; count: number }>();
    for (const e of gabarito.entities) {
      for (const o of e.occurrences) {
        if (o.pdfPage !== pdfPage) continue;
        const key = `${e.id}|${o.text}`;
        const w = wanted.get(key) ?? { entity: e, text: o.text, count: 0 };
        w.count++;
        wanted.set(key, w);
      }
    }
    const pageInstances: Instance[] = [];
    for (const w of wanted.values()) {
      let found = findAll(text, w.text, !tolerant);
      if (!found.length && tolerant) found = findAll(text, normalizeWs(w.text), false);
      if (!found.length) {
        notInText += w.count;
        continue;
      }
      for (const [start, end] of found)
        pageInstances.push({ pdfPage, start, end, entity: w.entity });
    }
    // Remove trechos contidos em outro maior ("MARIA" dentro de "MARIA DA CONCEIÇÃO…").
    for (const inst of pageInstances) {
      const contained = pageInstances.some(
        (o) =>
          o !== inst &&
          o.start <= inst.start &&
          o.end >= inst.end &&
          o.end - o.start > inst.end - inst.start,
      );
      if (!contained) instances.push(inst);
    }
  }
  return { instances, notInText };
}

function compatible(expected: EntityType, detected: EntityType): boolean {
  if (expected === detected) return true;
  if (expected === 'APELIDO' && detected === 'PESSOA') return true;
  return false;
}

export function evaluate(
  entities: readonly DetectedEntity[],
  pageTexts: Map<number, string>,
  gabarito: Gabarito,
  tolerant = false,
): DetectionReport {
  const { instances, notInText } = locateInstances(pageTexts, gabarito, tolerant);
  const detected = entities.flatMap((e) =>
    e.occurrences.map((o) => ({ ...o, type: e.type, decision: e.decision })),
  );

  const covered = (inst: Instance, sameType: boolean) =>
    detected.some((d) => {
      if (d.pdfPage !== inst.pdfPage) return false;
      const overlap = Math.min(d.end, inst.end) - Math.max(d.start, inst.start);
      if (overlap <= 0) return false;
      if (sameType && !compatible(inst.entity.type, d.type)) return false;
      return overlap / (inst.end - inst.start) >= 0.8;
    });

  const groups = new Map<string, Instance[]>();
  for (const inst of instances) {
    const key =
      inst.entity.type === 'PESSOA'
        ? inst.entity.decision === 'keep'
          ? 'PESSOA (autoridades)'
          : 'PESSOA (envolvidos)'
        : inst.entity.type;
    groups.set(key, [...(groups.get(key) ?? []), inst]);
  }
  const byType: TypeMetrics[] = [...groups].map(([type, list]) => {
    const hits = list.filter((i) => covered(i, true));
    return {
      type,
      expected: list.length,
      found: hits.length,
      recall: hits.length / list.length,
      missed: list
        .filter((i) => !hits.includes(i))
        .map((i) => `p${i.pdfPage}: ${pageTexts.get(i.pdfPage)?.slice(i.start, i.end)}`),
    };
  });

  const people = groups.get('PESSOA (envolvidos)') ?? [];
  const peopleRecall = people.filter((i) => covered(i, true)).length / Math.max(people.length, 1);

  // Precisão: trechos detectados (para pseudonimizar) que não correspondem a nada no gabarito.
  const toPseudonymize = detected.filter((d) => d.decision === 'pseudonymize');
  const falsePositives = toPseudonymize.filter(
    (d) => !instances.some((i) => i.pdfPage === d.pdfPage && i.start < d.end && d.start < i.end),
  );

  const keepInstances = instances.filter((i) => i.entity.decision === 'keep');
  const keepHits = keepInstances.filter((i) =>
    detected.some(
      (d) => d.pdfPage === i.pdfPage && d.decision === 'keep' && d.start < i.end && i.start < d.end,
    ),
  );
  const keepCorrect = keepHits.length;
  const keepMissed = keepInstances
    .filter((i) => !keepHits.includes(i))
    .map((i) => `p${i.pdfPage}: ${pageTexts.get(i.pdfPage)?.slice(i.start, i.end)}`);

  return {
    byType: byType.sort((a, b) => a.type.localeCompare(b.type)),
    peopleRecall,
    detectedSpans: toPseudonymize.length,
    falsePositives: falsePositives.map((d) => `p${d.pdfPage} [${d.type}] ${normalizeWs(d.text)}`),
    precision: (toPseudonymize.length - falsePositives.length) / Math.max(toPseudonymize.length, 1),
    keepExpected: keepInstances.length,
    keepCorrect,
    keepMissed,
    notInText,
  };
}

export function formatReport(title: string, r: DetectionReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines = [
    `\n=== ${title} ===`,
    ...r.byType.map(
      (t) =>
        `${t.type.padEnd(22)} ${String(t.found).padStart(3)}/${String(t.expected).padEnd(3)} ${pct(t.recall)}`,
    ),
    `Cobertura de nomes de envolvidos: ${pct(r.peopleRecall)}`,
    `Precisão (trechos a pseudonimizar): ${pct(r.precision)} (${r.detectedSpans - r.falsePositives.length}/${r.detectedSpans})`,
    `Autoridades sugeridas como "manter": ${r.keepCorrect}/${r.keepExpected}`,
  ];
  if (r.notInText) lines.push(`Ocorrências ausentes do texto (perdidas no OCR): ${r.notInText}`);
  const missed = r.byType.flatMap((t) => t.missed.map((m) => `  não detectado [${t.type}] ${m}`));
  if (missed.length) lines.push(...missed);
  lines.push(...r.keepMissed.map((m) => `  autoridade não marcada como manter: ${m}`));
  if (r.falsePositives.length) lines.push(...r.falsePositives.map((f) => `  falso positivo ${f}`));
  return lines.join('\n');
}

export { fold };
