// Tela Exportar (SPEC Fase 6): opções, varredura residual obrigatória e saídas por parte.
import { useId, useMemo, useState, useSyncExternalStore } from 'react';
import { RequireVault } from '../../components/RequireVault';
import { ENTITY_TYPES, type EntityType } from '../../detectors/types';
import { buildExport, DEFAULT_AI_INSTRUCTIONS, toMarkdown } from '../../export/build';
import { scanResidual, type ResidualItem } from '../../export/residual';
import { getSettings, subscribeSettings } from '../../settings/settings';
import { TYPE_LABEL } from '../../review/labels';
import { addManual, exportBlocked, ignoreResidual, markExported } from '../../review/model';
import { useReviewData } from '../../review/useReviewData';
import { copyText } from '../../utils/clipboard';
import { downloadFile } from '../../utils/download';
import { userMessage } from '../../utils/errors';
import { updateVaultContent, useSession } from '../../vault/session';
import type { VaultContent } from '../../vault/types';
import { ExportGate } from '../ExportGate';

const PART_SIZES: [string, number | null][] = [
  ['Não dividir', null],
  ['~30 mil caracteres', 30_000],
  ['~60 mil caracteres', 60_000],
  ['~100 mil caracteres', 100_000],
  ['~150 mil caracteres', 150_000],
];

const KIND_LABEL: Record<ResidualItem['kind'], string> = {
  ...Object.fromEntries(ENTITY_TYPES.map((t) => [t, TYPE_LABEL[t].toLocaleLowerCase('pt-BR')])),
  PESSOA: 'possível nome',
  DIGITOS: 'sequência de dígitos',
  PRENOME: 'prenome',
} as Record<ResidualItem['kind'], string>;

function suggestedType(item: ResidualItem): EntityType {
  if (item.kind === 'DIGITOS') return 'OUTRO';
  if (item.kind === 'PRENOME') return 'PESSOA';
  return item.kind;
}

function ResidualRow({ item }: { item: ResidualItem }) {
  const id = useId();
  const [type, setType] = useState<EntityType>(suggestedType(item));
  const [error, setError] = useState<string | null>(null);

  async function run(op: (c: VaultContent) => VaultContent) {
    setError(null);
    try {
      await updateVaultContent(op);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <li className="residual-row">
      <p>
        <strong>{item.text}</strong>{' '}
        <span className="meta">
          {KIND_LABEL[item.kind]} · {item.count}× · {item.where.slice(0, 6).join(', ')}
          {item.where.length > 6 ? '…' : ''}
        </span>
      </p>
      <p className="meta residual-context">{item.context}</p>
      <div className="inline-form">
        <label htmlFor={id} className="visually-hidden">
          Tipo
        </label>
        <select id={id} value={type} onChange={(e) => setType(e.target.value as EntityType)}>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t].charAt(0) + TYPE_LABEL[t].slice(1).toLocaleLowerCase('pt-BR')}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="primary"
          onClick={() => void run((c) => addManual(c, item.text, type).content)}
        >
          Pseudonimizar
        </button>
        <button type="button" onClick={() => void run((c) => ignoreResidual(c, [item.key]))}>
          Não é dado pessoal
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

function ExportView({ content }: { content: VaultContent }) {
  const id = useId();
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const data = useReviewData(content);
  const [includeInstructions, setIncludeInstructions] = useState(true);
  const [includeLegend, setIncludeLegend] = useState(true);
  const [partSize, setPartSize] = useState<number | null>(null);
  const [previewPart, setPreviewPart] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const instructions = settings.aiInstructions ?? DEFAULT_AI_INSTRUCTIONS;
  const result = useMemo(
    () =>
      data
        ? buildExport(content.entities, data, {
            instructions: includeInstructions ? instructions : null,
            includeLegend,
            partSize,
          })
        : null,
    [content.entities, data, includeInstructions, instructions, includeLegend, partSize],
  );
  const residual = useMemo(
    () =>
      result && data
        ? scanResidual(result.pages, data, {
            exclusions: settings.detectionExclusions,
            ignored: content.config.residualIgnored ?? [],
            types: settings.enabledTypes,
            learnedTerms: settings.learnedTerms.map((t) => t.text),
          })
        : [],
    [
      result,
      data,
      settings.detectionExclusions,
      settings.enabledTypes,
      settings.learnedTerms,
      content.config.residualIgnored,
    ],
  );

  if (!result || !data) return null;
  const total = result.parts.reduce((n, p) => n + p.length, 0);
  const ready = residual.length === 0;
  const ignoredCount = content.config.residualIgnored?.length ?? 0;
  const residualSummary =
    `Varredura residual: nenhum dado pessoal aparente` +
    (ignoredCount
      ? ` (${ignoredCount} ${ignoredCount === 1 ? 'item confirmado' : 'itens confirmados'} como não pessoal).`
      : '.');
  const part = result.parts[Math.min(previewPart, result.parts.length - 1)] ?? '';
  const fileBase = (i: number) =>
    result.parts.length > 1
      ? `texto-pseudonimizado-parte-${i + 1}-de-${result.parts.length}`
      : 'texto-pseudonimizado';

  /** A partir da primeira exportação, os números dos marcadores não são mais renumerados. */
  async function exported() {
    if (!content.config.exportedAt) await updateVaultContent(markExported);
  }

  async function copy(i: number) {
    try {
      await copyText(result?.parts[i] ?? '');
      await exported();
      setMessage(
        `${result && result.parts.length > 1 ? `Parte ${i + 1} copiada` : 'Texto copiado'}. ${residualSummary}`,
      );
    } catch (e) {
      setMessage(userMessage(e));
    }
  }

  return (
    <>
      <div className="panel">
        <h2>Opções</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeInstructions}
            onChange={(e) => setIncludeInstructions(e.target.checked)}
          />
          Incluir instruções para a IA no topo (editáveis em Configurações)
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeLegend}
            onChange={(e) => setIncludeLegend(e.target.checked)}
          />
          Incluir legenda de papéis ([VÍTIMA 1] = vítima…), sem dados reais
        </label>
        <div className="inline-form">
          <label htmlFor={`${id}-size`}>Dividir em partes</label>
          <select
            id={`${id}-size`}
            value={partSize ?? ''}
            onChange={(e) => {
              setPartSize(e.target.value ? Number(e.target.value) : null);
              setPreviewPart(0);
            }}
          >
            {PART_SIZES.map(([label, size]) => (
              <option key={label} value={size ?? ''}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <p className="hint">
          {result.pages.length} páginas · {total.toLocaleString('pt-BR')} caracteres (cerca de{' '}
          {Math.round(total / 4).toLocaleString('pt-BR')} tokens) · {result.parts.length}{' '}
          {result.parts.length === 1 ? 'parte' : 'partes'}
        </p>
      </div>

      <div className={`panel${ready ? '' : ' danger'}`} aria-labelledby={`${id}-residual`}>
        <h2 id={`${id}-residual`}>Varredura residual</h2>
        {ready ? (
          <p className="notice info" role="status">
            {residualSummary}
          </p>
        ) : (
          <>
            <p>
              O texto já pseudonimizado foi analisado de novo. Confira{' '}
              <strong>
                {residual.length} {residual.length === 1 ? 'item' : 'itens'}
              </strong>{' '}
              que ainda parecem dado pessoal: pseudonimize ou confirme que não são. Copiar e baixar
              ficam liberados depois disso.
            </p>
            <ul className="residual-list">
              {residual.map((item) => (
                <ResidualRow key={item.key} item={item} />
              ))}
            </ul>
            {confirmAll ? (
              <div className="actions">
                <button type="button" onClick={() => setConfirmAll(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    void updateVaultContent((c) =>
                      ignoreResidual(
                        c,
                        residual.map((r) => r.key),
                      ),
                    );
                    setConfirmAll(false);
                  }}
                >
                  Confirmo que nenhum destes é dado pessoal
                </button>
              </div>
            ) : (
              <div className="actions">
                <button type="button" onClick={() => setConfirmAll(true)}>
                  Confirmar todos os itens restantes…
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h2>Saídas</h2>
        <ul className="part-list">
          {result.parts.map((p, i) => (
            <li key={i}>
              <span>
                {result.parts.length > 1
                  ? `Parte ${i + 1} de ${result.parts.length}`
                  : 'Texto completo'}{' '}
                · {p.length.toLocaleString('pt-BR')} caracteres
              </span>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!ready}
                  onClick={() => void copy(i)}
                >
                  Copiar
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => {
                    downloadFile(`${fileBase(i)}.txt`, p, 'text/plain');
                    void exported();
                  }}
                >
                  Baixar .txt
                </button>
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => {
                    downloadFile(`${fileBase(i)}.md`, toMarkdown(p), 'text/markdown');
                    void exported();
                  }}
                >
                  Baixar .md
                </button>
                {result.parts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPreviewPart(i)}
                    aria-pressed={previewPart === i}
                  >
                    Ver
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {message && (
          <p className="notice info" role="status">
            {message}
          </p>
        )}
        {!ready && <p className="hint">Resolva a varredura residual para liberar as saídas.</p>}
      </div>

      <div className="panel">
        <h2>Pré-visualização</h2>
        <p className="hint">
          Texto completo, sem cortes ({part.length.toLocaleString('pt-BR')} caracteres). A última
          linha (“=== FIM DO DOCUMENTO …” ou “=== FIM DA PARTE …”) confirma que nada ficou de fora
          ao copiar ou colar.
        </p>
        <pre className="page-text export-preview" aria-label="Texto exportado">
          {part}
        </pre>
      </div>
    </>
  );
}

export function ExportPage() {
  const session = useSession();
  const content = session.status === 'unlocked' ? session.vault.content : null;
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Exportar</h1>
      <p className="summary">Gere o texto pseudonimizado para colar na IA.</p>
      <RequireVault>
        {content && (exportBlocked(content) ? <ExportGate /> : <ExportView content={content} />)}
      </RequireVault>
    </section>
  );
}
