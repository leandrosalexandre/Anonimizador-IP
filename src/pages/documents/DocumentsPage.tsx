import { useState } from 'react';
import { RequireVault } from '../../components/RequireVault';
import { documentBlobIds } from '../../documents/importPdf';
import { userMessage } from '../../utils/errors';
import { updateVaultContent, useSession } from '../../vault/session';
import type { StoredDocument } from '../../vault/types';
import { DocumentCard } from './DocumentCard';
import { ImportArea } from './ImportArea';
import { OcrPanel } from './OcrPanel';
import { PasteArea } from './PasteArea';

/** Documento criado por texto colado: sem páginas de PDF, folhas nem OCR. */
function PastedCard({ doc }: { doc: StoredDocument }) {
  const [showText, setShowText] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = doc.pages[0]?.text ?? '';

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
          <p className="meta">Texto colado · {text.length.toLocaleString('pt-BR')} caracteres</p>
        </div>
        <div className="actions">
          <button type="button" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>
            {showText ? 'Ocultar texto' : 'Ver texto'}
          </button>
          <button type="button" className="danger-outline" onClick={() => setConfirmRemove(true)}>
            Remover
          </button>
        </div>
      </header>
      {confirmRemove && (
        <div className="panel danger" role="alertdialog" aria-label="Confirmar remoção">
          <p>Remover este texto do cofre?</p>
          <div className="actions">
            <button type="button" onClick={() => setConfirmRemove(false)}>
              Cancelar
            </button>
            <button type="button" className="danger" onClick={() => void remove()}>
              Remover texto
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {showText && <pre className="page-text">{text}</pre>}
    </article>
  );
}

export function DocumentsPage() {
  const session = useSession();
  const documents = session.status === 'unlocked' ? session.vault.content.documents : [];
  const [tab, setTab] = useState<'pdf' | 'paste'>('pdf');

  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Documentos</h1>
      <p className="summary">
        Importe os PDFs do inquérito ou cole um texto avulso, e confira o texto de cada folha.
      </p>
      <RequireVault>
        <div className="tabs" role="tablist" aria-label="Origem do documento">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'pdf'}
            className={tab === 'pdf' ? 'active' : ''}
            onClick={() => setTab('pdf')}
          >
            Importar PDF
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'paste'}
            className={tab === 'paste' ? 'active' : ''}
            onClick={() => setTab('paste')}
          >
            Colar texto
          </button>
        </div>
        {tab === 'pdf' ? (
          <>
            <ImportArea />
            <OcrPanel />
          </>
        ) : (
          <PasteArea />
        )}
        {documents.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum documento neste cofre.</p>
            <p>Importe o PDF do inquérito (com texto ou escaneado) ou cole um texto.</p>
          </div>
        ) : (
          documents.map((doc) =>
            doc.pasted ? (
              <PastedCard key={doc.id} doc={doc} />
            ) : (
              <DocumentCard key={doc.id} doc={doc} />
            ),
          )
        )}
      </RequireVault>
    </section>
  );
}
