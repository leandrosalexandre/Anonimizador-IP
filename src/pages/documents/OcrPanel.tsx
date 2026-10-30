import { cancelOcr, dismissOcr, estimateSecondsLeft, useOcrState } from '../../ocr/ocrStore';
import { downloadBytes } from '../../utils/download';
import { useSession } from '../../vault/session';

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function searchablePdfName(fileName: string): string {
  return `${fileName.replace(/\.pdf$/i, '')}-pesquisavel.pdf`;
}

export function OcrPanel() {
  const state = useOcrState();
  const session = useSession();
  const vaultId = session.status === 'unlocked' ? session.vault.meta.id : null;
  if (state.status === 'idle' || state.vaultId !== vaultId) return null;

  if (state.status === 'running') {
    const total = state.pages.length;
    const overall = Math.round(((state.done + state.pageFraction) / total) * 100);
    const left = estimateSecondsLeft(state);
    return (
      <div className="panel ocr-panel" role="status" aria-live="polite">
        <h2>OCR em andamento</h2>
        <p>
          <strong>{state.fileName}</strong> —{' '}
          {state.preparing
            ? 'preparando o reconhecimento de texto…'
            : `${state.done} de ${total} ${total === 1 ? 'página' : 'páginas'} concluídas`}
          {left !== null && ` · cerca de ${formatSeconds(left)} restantes`}
        </p>
        {state.currentPage !== null && (
          <>
            <p className="hint">Página {state.currentPage} do PDF</p>
            <progress
              max={100}
              value={Math.round(state.pageFraction * 100)}
              aria-label="Progresso da página"
            />
          </>
        )}
        <p className="hint">Total</p>
        <progress max={100} value={overall} aria-label="Progresso geral do OCR" />
        <p className="hint">
          Mantenha o app aberto na tela até terminar. Você pode conferir as páginas já concluídas
          enquanto isso.
        </p>
        <div className="actions">
          <button type="button" onClick={() => cancelOcr()}>
            Cancelar OCR
          </button>
        </div>
      </div>
    );
  }

  const messages = {
    complete: 'OCR concluído',
    cancelled: 'OCR cancelado',
    locked: 'OCR interrompido porque o cofre foi bloqueado',
    error: 'OCR interrompido',
  } as const;
  return (
    <div className="panel ocr-panel" role="status">
      <h2>{messages[state.outcome]}</h2>
      <p>
        <strong>{state.fileName}</strong> — {state.done} de {state.total}{' '}
        {state.total === 1 ? 'página reconhecida' : 'páginas reconhecidas'}
        {state.averageMs !== null &&
          ` · tempo médio de ${(state.averageMs / 1000).toLocaleString('pt-BR', {
            maximumFractionDigits: 1,
          })} s por página`}
        .
      </p>
      {state.outcome !== 'complete' && state.done > 0 && (
        <p className="hint">As páginas concluídas foram salvas no cofre.</p>
      )}
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="actions">
        {state.searchablePdf && (
          <button
            type="button"
            className="primary"
            onClick={() =>
              state.searchablePdf &&
              downloadBytes(
                searchablePdfName(state.fileName),
                state.searchablePdf,
                'application/pdf',
              )
            }
          >
            Baixar PDF pesquisável
          </button>
        )}
        <button type="button" onClick={dismissOcr}>
          Fechar
        </button>
      </div>
    </div>
  );
}
