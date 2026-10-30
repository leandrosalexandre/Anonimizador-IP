import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useSession } from '../vault/session';

/** Telas que mostram conteúdo do inquérito só aparecem com um cofre aberto. */
export function RequireVault({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.status === 'unlocked') return <>{children}</>;
  return (
    <div className="empty-state">
      <p>Abra um cofre para continuar.</p>
      <p>
        <Link to="/cofres">Ir para os cofres</Link>
      </p>
    </div>
  );
}
