// Tela de conferência (SPEC Fase 3): imagem da página e texto lado a lado (empilhados no tablet
// em retrato), com zoom na imagem e edição do texto.
import { useEffect, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { HighlightedText } from '../../components/HighlightedText';
import { RequireVault } from '../../components/RequireVault';
import { startOcr, useOcrState } from '../../ocr/ocrStore';
import { resolveFolhas } from '../../pdf/folhas';
import { renderPage } from '../../pdf/pdfClient';
import { userMessage } from '../../utils/errors';
import { readBlob } from '../../vault/repository';
import { getSession, updateVaultContent, useSession } from '../../vault/session';
import type { StoredDocument, StoredPage } from '../../vault/types';

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200, 300];
const REVIEW_DPI = 150;

function PageImage({ doc, page }: { doc: StoredDocument; page: StoredPage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    renderPage(doc.id, page.pdfPage, REVIEW_DPI, async () => {
      const s = getSession();
      if (s.status !== 'unlocked') throw new Error('Cofre bloqueado');
      return readBlob(s.vault, doc.pdfBlobId);
    }).then(
      ({ image }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(image);
        setUrl(objectUrl);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled) setError(userMessage(e));
      },
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, doc.pdfBlobId, page.pdfPage]);

  const index = ZOOM_STEPS.indexOf(zoom);
  return (
    <div className="review-image">
      <div className="zoom-bar" role="group" aria-label="Zoom da imagem">
        <button
          type="button"
          aria-label="Diminuir zoom"
          disabled={index <= 0}
          onClick={() => setZoom(ZOOM_STEPS[index - 1] ?? zoom)}
        >
          −
        </button>
        <button type="button" onClick={() => setZoom(100)} aria-label="Ajustar à largura">
          {zoom}%
        </button>
        <button
          type="button"
          aria-label="Aumentar zoom"
          disabled={index >= ZOOM_STEPS.length - 1}
          onClick={() => setZoom(ZOOM_STEPS[index + 1] ?? zoom)}
        >
          +
        </button>
      </div>
      <div className="zoom-viewport">
        {url ? (
          <img
            src={url}
            alt={`Imagem da página ${page.pdfPage} do PDF`}
            style={{ width: `${zoom}%` }}
          />
        ) : (
          <p className="hint" aria-busy={!error}>
            {error ?? 'Carregando a imagem…'}
          </p>
        )}
      </div>
    </div>
  );
}

function PageTextEditor({ doc, page }: { doc: StoredDocument; page: StoredPage }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(page.text);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ocr = useOcrState();
  const ocrRunning = ocr.status === 'running';
  const ocrThisPage =
    ocr.status === 'running' && ocr.docId === doc.id && ocr.pages.includes(page.pdfPage);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await updateVaultContent((c) => ({
        ...c,
        documents: c.documents.map((d) =>
          d.id !== doc.id
            ? d
            : {
                ...d,
                pages: d.pages.map((p) =>
                  p.pdfPage === page.pdfPage
                    ? {
                        ...p,
                        text: draft,
                        ocrLowConfidence: [],
                        textEditedAt: new Date().toISOString(),
                      }
                    : p,
                ),
              },
        ),
      }));
      setEditing(false);
      setMessage('Correções salvas.');
    } catch (e) {
      setMessage(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const low = page.ocrLowConfidence ?? [];
  const hasText = page.text.length > 0;

  return (
    <div className="review-text">
      {page.textSource === 'ocr' && page.ocrConfidence !== null && (
        <p className="meta">
          Confiança média do OCR: <strong>{Math.round(page.ocrConfidence)}%</strong>
          {low.length > 0 &&
            ` · ${low.length} ${low.length === 1 ? 'palavra' : 'palavras'} em destaque`}
          {page.textEditedAt && ' · texto corrigido manualmente'}
        </p>
      )}
      {!hasText && !editing ? (
        <div className="empty-state">
          <p>
            {ocrThisPage
              ? 'O OCR desta página está na fila ou em andamento.'
              : 'Esta página ainda não tem texto (imagem escaneada).'}
          </p>
          {!ocrThisPage && (
            <button
              type="button"
              className="primary"
              disabled={ocrRunning}
              onClick={() => void startOcr(doc, [page.pdfPage])}
            >
              Fazer OCR desta página
            </button>
          )}
        </div>
      ) : editing ? (
        <>
          <label htmlFor={id}>Texto da página (as correções substituem o texto)</label>
          <textarea
            id={id}
            className="page-text-editor"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
          />
          <div className="actions">
            <button type="button" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
              disabled={busy || draft === page.text}
            >
              {busy ? 'Salvando…' : 'Salvar correções'}
            </button>
          </div>
        </>
      ) : (
        <>
          {low.length > 0 && (
            <p className="hint">
              <mark className="low-confidence">Destaque amarelo</mark>: palavras de baixa confiança,
              confira com a imagem.
            </p>
          )}
          <pre className="page-text" aria-label={`Texto da página ${page.pdfPage}`}>
            <HighlightedText text={page.text} ranges={low} />
          </pre>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setDraft(page.text);
                setEditing(true);
                setMessage(null);
              }}
            >
              Corrigir texto
            </button>
            {page.kind === 'image' && (
              <button
                type="button"
                disabled={ocrRunning}
                onClick={() => void startOcr(doc, [page.pdfPage])}
              >
                Refazer OCR
              </button>
            )}
          </div>
        </>
      )}
      {message && (
        <p className="notice info" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

export function PageReviewPage() {
  const params = useParams();
  const navigate = useNavigate();
  const session = useSession();
  const documents = session.status === 'unlocked' ? session.vault.content.documents : [];
  const doc = documents.find((d) => d.id === params.docId);
  const pdfPage = Number(params.pdfPage);
  const index = doc ? doc.pages.findIndex((p) => p.pdfPage === pdfPage) : -1;
  const page = doc?.pages[index];
  const folha = doc && index >= 0 ? resolveFolhas(doc.pages, doc.folhaOffset)[index] : undefined;

  const go = (i: number) => {
    const target = doc?.pages[i];
    if (doc && target) navigate(`/conferencia/${doc.id}/${target.pdfPage}`);
  };

  return (
    <section aria-labelledby="titulo-pagina" className="review-page">
      <p>
        <Link to="/documentos">‹ Voltar para Documentos</Link>
      </p>
      <h1 id="titulo-pagina">
        Conferência{folha?.folha != null ? ` – fls. ${folha.folha}` : ''}
        {page ? ` (PDF p. ${page.pdfPage})` : ''}
      </h1>
      <RequireVault>
        {!doc || !page ? (
          <div className="empty-state">
            <p>Página não encontrada neste cofre.</p>
          </div>
        ) : (
          <>
            <p className="summary">{doc.fileName}</p>
            <nav className="review-nav" aria-label="Páginas">
              <button type="button" disabled={index <= 0} onClick={() => go(index - 1)}>
                ‹ Anterior
              </button>
              <span>
                {index + 1} de {doc.pages.length}
              </span>
              <button
                type="button"
                disabled={index >= doc.pages.length - 1}
                onClick={() => go(index + 1)}
              >
                Próxima ›
              </button>
            </nav>
            <div className="review-grid">
              <PageImage doc={doc} page={page} />
              <PageTextEditor key={`${doc.id}-${page.pdfPage}`} doc={doc} page={page} />
            </div>
          </>
        )}
      </RequireVault>
    </section>
  );
}
