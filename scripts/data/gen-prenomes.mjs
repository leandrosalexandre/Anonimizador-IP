// Gera src/detectors/data/prenomes.txt: os 5.000 prenomes mais frequentes no Censo IBGE 2010,
// em maiúsculas e sem acentos, um por linha. Fonte: pacote brazilian-gender-assumption (MIT),
// que embala os dados públicos do IBGE. Uso: node scripts/data/gen-prenomes.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';

const LIMIT = 5000;
const dist = new URL('../../node_modules/brazilian-gender-assumption/dist/', import.meta.url);
const chunk = (await readdir(dist)).find((f) => /^chunk-.*\.js$/.test(f));
const source = await readFile(new URL(chunk, dist), 'utf8');
const rows = [...source.matchAll(/(?:^|`)([A-Z]+)\|\d+\|\d+\|(\d+)\|(\d+)\|/gm)].map((m) => ({
  name: m[1],
  rank: Number(m[3]),
}));
if (rows.length < LIMIT) throw new Error(`Base inesperada: ${rows.length} nomes`);
const names = rows
  .sort((a, b) => a.rank - b.rank)
  .slice(0, LIMIT)
  .map((r) => r.name)
  .filter((n) => n.length >= 2);
await writeFile(
  new URL('../../src/detectors/data/prenomes.txt', import.meta.url),
  names.join('\n') + '\n',
);
console.log(`${names.length} prenomes gravados.`);
