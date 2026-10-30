import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { startOcr, useOcrState } from '../../ocr/ocrStore';
import { Thumbnail } from '../../components/Thumbnail';
import { documentBlobIds } from '../../documents/importPdf';
import { resolveFolhas, suggestOffset, type ResolvedFolha } from '../../pdf/folhas';
import { userMessage } from '../../utils/errors';
import { updateVaultContent } from '../../vault/session';
import type { StoredDocument, StoredPage } from '../../vault/types';

const SOURCE_LABEL = {
  detected: 'detectada',
  inferred: 'estimada',
  offset: 'pelo deslocamento',
  manual: 'corrigida',
} as const;

function kindLabel(page: StoredPage): { text: string; className: string } {
  if (page.textSource === 'ocr') return { text: 'OCR feito', className: 'ocr' };
  if (page.kind === 'text') return { text: 'Texto', className: 'text' };
  return { text: 'Imagem', className: 'image' };
}

async function updateDocument(docId: string, fn: (doc: StoredDocument) => StoredDocument) {
  await updateVaultContent((c) => ({
    ...c,
    documents: c.documents.map((d) => (d.id === docId ? fn(d) : d)),
  }));
}

function FolhaOffsetForm({ doc, suggestion }: { doc: StoredDocument; suggestion: number | null }) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function apply(offset: number | null) {
    setError(null);
    try {
      await updateDocument(doc.id, (d) => ({ ...d, folhaOffset: offset }));
      setValue('');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const folha = Number(value);
    if (!Number.isInteger(folha) || folha < 1)
      return setError('Informe um número de folha válido.');
    void apply(folha - 1);
  }

  return (
    <div className="folha-offset">
      {doc.folhaOffset !== null ? (
        <p>
          Folhas pelo deslocamento: a página 1 do PDF corresponde à{' '}
          <strong>fls. {1 + doc.folhaOffset}</strong>.{' '}
          <button type="button" className="link" onClick={() => void apply(null)}>
            Voltar à detecção automática
          </button>
        </p>
      ) : (
        suggestion !== null && (
          <p className="hint">
            Detectado nos carimbos: a página 1 do PDF corresponde à fls. {1 + suggestion}.{' '}
            <button type="button" className="link" onClick={() => void apply(suggestion)}>
              Aplicar a todas as páginas
            </button>
          </p>
        )
      )}
      <form className="inline-form" onSubmit={onSubmit}>
        <label htmlFor={id}>A página 1 do PDF corresponde à fls.</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" disabled={!value}>
          Aplicar
        </button>
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PageRow({
  doc,
  page,
  folha,
}: {
  doc: StoredDocument;
  page: StoredPage;
  folha: ResolvedFolha;
}) {
  const id = useId();
  const [showText, setShowText] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const kind = kindLabel(page);
  const ocr = useOcrState();
  const ocrRunning = ocr.status === 'running';
  const inOcr =
    ocr.status === 'running' && ocr.docId === doc.id && ocr.currentPage === page.pdfPage;
  const queued =
    ocr.status === 'running' && ocr.docId === doc.id && ocr.pages.includes(page.pdfPage) && !inOcr;

  async function saveFolha(folhaManual: number | null) {
    setError(null);
    try {
      await updateDocument(doc.id, (d) => ({
        ...d,
        pages: d.pages.map((p) => (p.pdfPage === page.pdfPage ? { ...p, folhaManual } : p)),
      }));
      setEditing(false);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) return setError('Informe um número de folha válido.');
    void saveFolha(n);
  }

  return (
    <li className="page-row" aria-label={`Página ${page.pdfPage} do PDF`}>
      <Thumbnail blobId={page.thumbnailBlobId} alt={`Miniatura da página ${page.pdfPage}`} />
      <div className="page-info">
        <p className="page-labels">
          <span className="page-folha">
            {folha.folha !== null ? `fls. ${folha.folha}` : 'fls. ?'}
          </span>
          <span className="meta">PDF p. {page.pdfPage}</span>
          <span className={`kind-badge ${kind.className}`}>{kind.text}</span>
          {inOcr && <span className="kind-badge ocr">OCR em andamento…</span>}
          {queued && page.textSource !== 'ocr' && <span className="meta">na fila do OCR</span>}
          {page.textSource === 'ocr' && page.ocrConfidence !== null && (
            <span className="meta">confiança {Math.round(page.ocrConfidence)}%</span>
          )}
        </p>
        {folha.source && <p className="meta">Folha {SOURCE_LABEL[folha.source]}</p>}
        <div className="actions">
          <button type="button" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
            {showText ? 'Ocultar texto' : 'Ver texto'}
          </button>
          <Link className="button-like" to={`/conferencia/${doc.id}/${page.pdfPage}`}>
            Conferir
          </Link>
          {page.kind === 'image' && page.textSource !== 'ocr' && (
            <button
              type="button"
              disabled={ocrRunning}
              onClick={() => void startOcr(doc, [page.pdfPage])}
            >
              Fazer OCR
            </button>
          )}
          <button type="button" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            Corrigir fls.
          </button>
        </div>
        {editing && (
          <form className="inline-form" onSubmit={onSubmit}>
            <label htmlFor={id}>Folha desta página</label>
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={folha.folha !== null ? String(folha.folha) : ''}
              autoFocus
            />
            <button type="submit" className="primary" disabled={!value}>
              Salvar
            </button>
            {page.folhaManual !== null && (
              <button type="button" onClick={() => void saveFolha(null)}>
                Desfazer correção
              </button>
            )}
          </form>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {showText && (
        <div className="page-text-wrap">
          {page.text ? (
            <pre className="page-text" aria-label={`Texto da página ${page.pdfPage}`}>
              {page.text}
            </pre>
          ) : (
            <p className="hint">
              Página sem texto (imagem escaneada). Use “Fazer OCR” para reconhecer o texto.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function DocumentCard({ doc }: { doc: StoredDocument }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const folhas = useMemo(() => resolveFolhas(doc.pages, doc.folhaOffset), [doc]);
  const suggestion = useMemo(() => suggestOffset(doc.pages), [doc]);
  const pending = doc.pages.filter((p) => p.kind === 'image' && p.textSource !== 'ocr');
  const images = pending.length;
  const ocr = useOcrState();
  const first = folhas.find((f) => f.folha !== null)?.folha;
  const last = [...folhas].reverse().find((f) => f.folha !== null)?.folha;

  async function remove() {
    try {
      await updateVaultContent(
        (c) => ({ ...c, documents: c.documents.filter((d) => d.id !== doc.id) }),
        { deleteBlobIds: documentBlobIds(doc) },
      );
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <article className="doc-card" aria-label={doc.fileName}>
      <header className="doc-head">
        <div>
          <h2>{doc.fileName}</h2>
          <p className="meta">
            {doc.pages.length} {doc.pages.length === 1 ? 'página' : 'páginas'}
            {first !== undefined && last !== undefined && ` · fls. ${first} a ${last}`} ·{' '}
            {doc.pages.length - images} com texto · {images} sem texto
          </p>
        </div>
        <div className="actions">
          {images > 0 && (
            <button
              type="button"
              className="primary"
              disabled={ocr.status === 'running'}
              onClick={() =>
                void startOcr(
                  doc,
                  pending.map((p) => p.pdfPage),
                )
              }
            >
              Fazer OCR das páginas sem texto ({images})
            </button>
          )}
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Recolher' : 'Mostrar páginas'}
          </button>
          <button type="button" className="danger-outline" onClick={() => setConfirmRemove(true)}>
            Remover
          </button>
        </div>
      </header>
      {confirmRemove && (
        <div className="panel danger" role="alertdialog" aria-label="Confirmar remoção">
          <p>Remover este documento do cofre? As revisões ligadas a ele também serão perdidas.</p>
          <div className="actions">
            <button type="button" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </button>
            <button type="button" className="danger" onClick={() => void remove()}>
              Remover documento
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {expanded && (
        <>
          <FolhaOffsetForm doc={doc} suggestion={suggestion} />
          <ol className="page-list">
            {doc.pages.map((page, i) => (
              <PageRow
                key={page.pdfPage}
                doc={doc}
                page={page}
                folha={folhas[i] ?? { folha: null, source: null }}
              />
            ))}
          </ol>
        </>
      )}
    </article>
  );
}
