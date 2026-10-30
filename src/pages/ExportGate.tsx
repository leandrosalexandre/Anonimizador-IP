import { Link } from 'react-router';
import { duplicateLabels } from '../review/labels';
import { reviewProgress } from '../review/model';
import { useSession } from '../vault/session';

/** A exportação fica bloqueada enquanto houver pessoa sem decisão (SPEC Fase 5). */
export function ExportGate() {
  const session = useSession();
  if (session.status !== 'unlocked') return null;
  const { entities } = session.vault.content;
  const progress = reviewProgress(entities);
  const duplicates = duplicateLabels(entities);

  if (!entities.length) {
    return (
      <div className="empty-state">
        <p>Faça a detecção e a revisão dos dados pessoais antes de exportar.</p>
        <p>
          <Link to="/revisao">Ir para a Revisão</Link>
        </p>
      </div>
    );
  }
  if (progress.pendingPeople > 0 || duplicates.length > 0) {
    return (
      <div className="panel danger" role="status">
        <p>
          <strong>Exportação bloqueada.</strong>{' '}
          {progress.pendingPeople > 0 &&
            `${progress.pendingPeople} ${progress.pendingPeople === 1 ? 'pessoa ainda está' : 'pessoas ainda estão'} sem decisão. `}
          {duplicates.length > 0 && `Marcadores repetidos: ${duplicates.join(', ')}.`}
        </p>
        <p>
          <Link to="/revisao">Concluir a revisão</Link>
        </p>
      </div>
    );
  }
  return null;
}
