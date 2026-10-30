import { RequireVault } from '../../components/RequireVault';
import { useSession } from '../../vault/session';
import { DocumentCard } from './DocumentCard';
import { ImportArea } from './ImportArea';

export function DocumentsPage() {
  const session = useSession();
  const documents = session.status === 'unlocked' ? session.vault.content.documents : [];

  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Documentos</h1>
      <p className="summary">
        Importe os PDFs do inquérito e confira o texto extraído de cada folha.
      </p>
      <RequireVault>
        <ImportArea />
        {documents.length === 0 ? (
          <div className="empty-state">
            <p>Nenhum documento neste cofre.</p>
            <p>Importe o PDF do inquérito (com texto ou escaneado).</p>
          </div>
        ) : (
          documents.map((doc) => <DocumentCard key={doc.id} doc={doc} />)
        )}
      </RequireVault>
    </section>
  );
}
