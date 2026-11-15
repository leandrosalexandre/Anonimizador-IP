// Aba "Colar texto" (anonimização rápida): cola-se um relato ou depoimento, o app detecta e
// substitui os nomes na hora e mostra o texto pronto para copiar. O texto fica no cofre (cifrado)
// como um documento, para a Revisão e a Reidentificação funcionarem com os mesmos marcadores.
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { pastedDocument } from '../../documents/importPdf';
import { quickExport } from '../../export/build';
import { markExported } from '../../review/model';
import { runDetection } from '../../review/runDetection';
import { useReviewData } from '../../review/useReviewData';
import { copyText } from '../../utils/clipboard';
import { userMessage } from '../../utils/errors';
import { updateVaultContent, useSession } from '../../vault/session';

const MAX_PASTE = 2_000_000;

export function PasteArea() {
  const id = useId();
  const session = useSession();
  const content = session.status === 'unlocked' ? session.vault.content : null;
  const data = useReviewData(content);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [docId, setDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () =>
      content && data && docId && content.documents.some((d) => d.id === docId)
        ? quickExport(content.entities, data, docId)
        : null,
    [content, data, docId],
  );

  async function anonymize() {
    if (!content || text.trim().length < 20) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const doc = pastedDocument(title, text, content.documents.filter((d) => d.pasted).length);
      await updateVaultContent((c) => ({ ...c, documents: [...c.documents, doc] }));
      await runDetection();
      setDocId(doc.id);
      setText('');
      setTitle('');
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await copyText(result.text);
      await updateVaultContent(markExported);
      setMessage('Texto anonimizado copiado. Cole na IA e traga a resposta para Reidentificar.');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <div className="panel paste-area">
      <p>
        <strong>Colar texto e anonimizar</strong>
      </p>
      <p className="hint">
        Para um relato ou depoimento avulso (por exemplo, de um flagrante). O texto fica guardado
        neste cofre, cifrado.
      </p>
      <label htmlFor={`${id}-title`}>Título (opcional, sem nomes de pessoas)</label>
      <input
        id={`${id}-title`}
        className="wide"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex.: Depoimento do condutor"
        maxLength={80}
      />
      <label htmlFor={`${id}-text`}>Texto</label>
      <textarea
        id={`${id}-text`}
        className="analysis-input"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_PASTE))}
        placeholder="Cole aqui o relato ou depoimento…"
        spellCheck={false}
      />
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || text.trim().length < 20}
          onClick={() => void anonymize()}
        >
          {busy ? 'Anonimizando…' : 'Anonimizar texto'}
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="paste-result" role="region" aria-label="Texto anonimizado">
          <h2>Texto anonimizado</h2>
          <p>
            <strong>{result.people}</strong> {result.people === 1 ? 'pessoa' : 'pessoas'} e{' '}
            <strong>{result.data}</strong> {result.data === 1 ? 'documento' : 'documentos'}{' '}
            substituídos.
            {result.suggestions > 0 &&
              ` ${result.suggestions} ${result.suggestions === 1 ? 'possível nome ficou' : 'possíveis nomes ficaram'} em claro (Sugestões).`}
          </p>
          <p className="notice warn">
            Leia o texto antes de copiar: confira se nenhum nome ficou em claro. Para corrigir, use
            a <Link to="/revisao">Revisão</Link>.
          </p>
          <pre className="page-text export-preview" aria-label="Resultado da anonimização">
            {result.text}
          </pre>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void copy()}>
              Copiar texto anonimizado
            </button>
            <Link className="button-like" to="/reidentificar">
              Ir para Reidentificar
            </Link>
          </div>
          {message && (
            <p className="notice info" role="status">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
