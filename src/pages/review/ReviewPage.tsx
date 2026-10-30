import { useState } from 'react';
import { Link } from 'react-router';
import { RequireVault } from '../../components/RequireVault';
import { duplicateLabels } from '../../review/labels';
import { resetReview, reviewProgress } from '../../review/model';
import { runDetection } from '../../review/runDetection';
import { useReviewData } from '../../review/useReviewData';
import { userMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { updateVaultContent, useSession } from '../../vault/session';
import type { VaultContent } from '../../vault/types';
import { EntityList } from './EntityList';
import { TextView } from './TextView';

function ReviewView({ content }: { content: VaultContent }) {
  const data = useReviewData(content);
  const [tab, setTab] = useState<'entities' | 'text'>('entities');
  const [pageKey, setPageKey] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  if (!data) return null;
  const hasText = data.pages.length > 0;
  const progress = reviewProgress(content.entities);
  const duplicates = duplicateLabels(content.entities);
  const pendingOcr = content.documents.reduce(
    (n, d) => n + d.pages.filter((p) => p.kind === 'image' && p.textSource !== 'ocr').length,
    0,
  );

  async function detect(fromScratch = false) {
    setBusy(true);
    setError(null);
    setConfirmReset(false);
    try {
      if (fromScratch) await updateVaultContent(resetReview);
      await runDetection();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!hasText) {
    return (
      <div className="empty-state">
        <p>Nenhuma página com texto neste cofre.</p>
        <p>
          Importe os PDFs e faça o OCR das páginas escaneadas em{' '}
          <Link to="/documentos">Documentos</Link>.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="panel detection-bar">
        {content.config.detectedAt ? (
          <p>
            Detecção feita em {formatDateTime(content.config.detectedAt)}. Rode de novo depois de
            importar documentos ou corrigir textos: as decisões já tomadas são mantidas.
          </p>
        ) : (
          <p>
            A detecção procura nomes de pessoas e documentos pessoais (CPF, RG, telefone, data de
            nascimento…) em todas as páginas. Outros tipos podem ser ativados em Configurações.
            Depois, revise cada sugestão.
          </p>
        )}
        {pendingOcr > 0 && (
          <p className="notice warn">
            {pendingOcr}{' '}
            {pendingOcr === 1 ? 'página escaneada ainda está' : 'páginas escaneadas ainda estão'}{' '}
            sem OCR e não serão analisadas.
          </p>
        )}
        <div className="actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void detect()}>
            {busy
              ? 'Detectando…'
              : content.config.detectedAt
                ? 'Detectar de novo'
                : 'Detectar dados pessoais'}
          </button>
          {content.entities.length > 0 && !confirmReset && (
            <button type="button" disabled={busy} onClick={() => setConfirmReset(true)}>
              Recomeçar a revisão do zero
            </button>
          )}
        </div>
        {confirmReset && (
          <div className="panel danger" role="alertdialog" aria-label="Recomeçar a revisão">
            <p>
              Todas as entidades, papéis e decisões deste cofre serão apagados e a detecção será
              feita de novo. Os documentos e as correções de texto continuam.
              {content.config.exportedAt &&
                ' Atenção: um texto já exportado usa os marcadores atuais; depois de recomeçar, os números podem mudar.'}
            </p>
            <div className="actions">
              <button type="button" onClick={() => setConfirmReset(false)}>
                Cancelar
              </button>
              <button type="button" className="danger" onClick={() => void detect(true)}>
                Recomeçar
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {content.entities.length > 0 && (
        <div className="panel review-progress" role="status">
          <p>
            <strong>
              {progress.reviewed} de {progress.total}
            </strong>{' '}
            entidades revisadas
            {progress.pendingPeople > 0 &&
              ` · ${progress.pendingPeople} ${progress.pendingPeople === 1 ? 'pessoa' : 'pessoas'} sem decisão (a exportação fica bloqueada)`}
          </p>
          <progress
            max={progress.total}
            value={progress.reviewed}
            aria-label="Progresso da revisão"
          />
          {duplicates.length > 0 && (
            <p className="field-error">
              Marcadores repetidos: {duplicates.join(', ')}. Ajuste o número de uma das entidades.
            </p>
          )}
        </div>
      )}

      {content.entities.length > 0 && (
        <>
          <div className="tabs" role="tablist" aria-label="Modo da revisão">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'entities'}
              className={tab === 'entities' ? 'active' : ''}
              onClick={() => setTab('entities')}
            >
              Entidades
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'text'}
              className={tab === 'text' ? 'active' : ''}
              onClick={() => setTab('text')}
            >
              Texto
            </button>
          </div>
          {tab === 'entities' ? (
            <EntityList
              content={content}
              data={data}
              onShowInText={(key, entityId) => {
                setPageKey(key);
                setFocusId(entityId);
                setTab('text');
              }}
            />
          ) : (
            <TextView
              content={content}
              data={data}
              pageKey={pageKey}
              onPageChange={setPageKey}
              focusEntityId={focusId}
              onFocusEntity={setFocusId}
            />
          )}
        </>
      )}
    </>
  );
}

export function ReviewPage() {
  const session = useSession();
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Revisão</h1>
      <p className="summary">
        Revise os dados pessoais encontrados, atribua papéis aos envolvidos e marque o que a
        detecção perdeu. As decisões valem para o inquérito inteiro.
      </p>
      <RequireVault>
        {session.status === 'unlocked' && <ReviewView content={session.vault.content} />}
      </RequireVault>
    </section>
  );
}
