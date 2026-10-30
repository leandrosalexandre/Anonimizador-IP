// Listas embarcadas: prenomes (IBGE), sobrenomes e exclusões.
import prenomesRaw from './data/prenomes.txt?raw';
import { DEFAULT_EXCLUSIONS } from './data/exclusoes';
import { SOBRENOMES } from './data/sobrenomes';
import { fold } from './text';

export const FIRST_NAMES: ReadonlySet<string> = new Set(
  prenomesRaw
    .split('\n')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean),
);

export const SURNAMES: ReadonlySet<string> = new Set(SOBRENOMES);

export function buildExclusions(extra: readonly string[] = []): ReadonlySet<string> {
  return new Set(
    [...DEFAULT_EXCLUSIONS, ...extra.flatMap((e) => fold(e).split(/\s+/))].filter(Boolean),
  );
}
