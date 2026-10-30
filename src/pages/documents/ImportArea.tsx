import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { prepareImport, type ImportProgress } from '../../documents/importPdf';
import { ExtractionCancelledError } from '../../pdf/pdfClient';
import { userMessage } from '../../utils/errors';
import { signalActivity } from '../../vault/autoLock';
import { getSession, updateVaultContent, useSession } from '../../vault/session';

interface ResultMessage {
  fileName: string;
  ok: boolean;
  text: string;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `cerca de ${Math.max(1, seconds)} s`;
  const minutes = Math.round(seconds / 60);
  return `cerca de ${minutes} min`;
}

export function ImportArea() {
  const id = useId();
  const session = useSession();
  const vaultId = session.status === 'unlocked' ? session.vault.meta.id : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [queued, setQueued] = useState(0);
  const [results, setResults] = useState<ResultMessage[]>([]);
  const [dragging, setDragging] = useState(false);

  // Bloqueou o cofre (ou trocou de cofre): cancela a leitura em andamento.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, [vaultId]);

  // Evita que soltar um arquivo fora da área abra o PDF no navegador.
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  async function importFiles(files: File[]) {
    if (!vaultId || abortRef.current) return;
    setResults([]);
    setQueued(files.length);
    const controller = new AbortController();
    abortRef.current = controller;
    for (const file of files) {
      if (controller.signal.aborted) break;
      try {
        const current = getSession();
        const existing = current.status === 'unlocked' ? current.vault.content.documents : [];
        const prepared = await prepareImport(file, {
          onProgress: (p) => {
            // Uma leitura longa, pedida pelo usuário, não é inatividade.
            signalActivity();
            setProgress(p);
          },
          signal: controller.signal,
          findDuplicate: (sha) => existing.find((d) => d.sha256 === sha)?.fileName ?? null,
        });
        await updateVaultContent(
          (c) => ({ ...c, documents: [...c.documents, prepared.document] }),
          { putBlobs: prepared.blobs },
          vaultId,
        );
        const pages = prepared.document.pages;
        const images = pages.filter((p) => p.kind === 'image').length;
        setResults((r) => [
          ...r,
          {
            fileName: file.name,
            ok: true,
            text: `${pages.length} ${pages.length === 1 ? 'página' : 'páginas'} importadas${
              images ? ` (${images} sem texto, precisam de OCR)` : ''
            }.`,
          },
        ]);
      } catch (e) {
        const cancelled = e instanceof ExtractionCancelledError;
        setResults((r) => [
          ...r,
          {
            fileName: file.name,
            ok: false,
            text: cancelled ? 'Importação cancelada.' : userMessage(e),
          },
        ]);
        if (cancelled) break;
      } finally {
        setQueued((q) => Math.max(0, q - 1));
      }
    }
    abortRef.current = null;
    setProgress(null);
    setQueued(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void importFiles(files);
  }

  const busy = progress !== null;
  const percent = progress?.pageCount
    ? Math.round((progress.pagesDone / progress.pageCount) * 100)
    : 0;

  return (
    <div className="panel">
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={busy ? (e) => e.preventDefault() : onDrop}
      >
        <p>
          <strong>Importar PDFs do inquérito</strong>
        </p>
        <p className="hint">
          Selecione um ou mais arquivos
          <span className="desktop-only"> ou arraste-os para cá</span>. A leitura acontece neste
          aparelho.
        </p>
        <label htmlFor={id} className={`button-like primary${busy ? ' disabled' : ''}`}>
          Selecionar PDFs
        </label>
        <input
          ref={inputRef}
          id={id}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy}
          onChange={(e) => void importFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      {progress && (
        <div className="import-progress" role="status" aria-live="polite">
          <p>
            Lendo <strong>{progress.fileName}</strong>
            {progress.pageCount
              ? ` — página ${progress.pagesDone} de ${progress.pageCount}`
              : ' — abrindo o arquivo…'}
            {progress.secondsLeft !== null && ` · ${formatSeconds(progress.secondsLeft)} restantes`}
            {queued > 1 && ` · mais ${queued - 1} na fila`}
          </p>
          <progress max={100} value={percent} aria-label="Progresso da leitura" />
          <p className="hint">Mantenha esta tela aberta até terminar.</p>
          <div className="actions">
            <button type="button" onClick={() => abortRef.current?.abort()}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <ul className="result-list">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? 'ok' : 'error'} role={r.ok ? undefined : 'alert'}>
              <strong>{r.fileName}:</strong> {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
