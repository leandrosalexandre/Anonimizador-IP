import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { TypedConfirm } from '../../components/TypedConfirm';
import { downloadFile } from '../../utils/download';
import { userMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { exportVault, vaultFileName } from '../../vault/exchange';
import { deleteVault, listVaults, unlockVault } from '../../vault/repository';
import {
  clearLockReason,
  lockVault,
  setUnlocked,
  useSession,
  type LockReason,
} from '../../vault/session';
import type { VaultMeta } from '../../vault/types';
import { CreateVaultForm } from './CreateVaultForm';
import { ImportVault } from './ImportVault';
import { PasswordForm } from './PasswordForm';

type Action = { kind: 'open' | 'delete'; vaultId: string } | null;

const LOCK_MESSAGES: Record<LockReason, string> = {
  manual: 'Cofre bloqueado.',
  idle: 'O cofre foi bloqueado por inatividade.',
  hidden: 'O cofre foi bloqueado porque o app saiu da tela.',
  deleted: 'O cofre foi apagado.',
};

export function VaultsPage() {
  const session = useSession();
  const [vaults, setVaults] = useState<VaultMeta[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);

  // Incrementar `version` recarrega a lista de cofres.
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const openId = session.status === 'unlocked' ? session.vault.meta.id : null;
  const openUpdatedAt = session.status === 'unlocked' ? session.vault.meta.updatedAt : null;
  useEffect(() => {
    let cancelled = false;
    listVaults().then(
      (list) => {
        if (!cancelled) setVaults(list);
      },
      (e: unknown) => {
        if (cancelled) return;
        setError(userMessage(e));
        setVaults([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version, openId, openUpdatedAt]);

  async function handleExport(vault: VaultMeta) {
    setError(null);
    try {
      downloadFile(vaultFileName(vault.name), await exportVault(vault.id), 'application/json');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  async function handleDelete(vault: VaultMeta) {
    try {
      await deleteVault(vault.id);
      if (openId === vault.id) lockVault('deleted');
      setAction(null);
      refresh();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const lockReason = session.status === 'locked' ? session.lastLockReason : null;

  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Cofres</h1>
      <p className="summary">
        Cada inquérito fica num cofre criptografado, protegido por senha. Nada sai deste aparelho.
      </p>

      {lockReason && (
        <div className="notice info" role="status">
          <span>{LOCK_MESSAGES[lockReason]}</span>
          <button type="button" className="link" onClick={clearLockReason}>
            Fechar
          </button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {session.status === 'unlocked' && (
        <div className="panel open-vault">
          <p>
            Cofre aberto: <strong>{session.vault.meta.name}</strong>
          </p>
          <div className="actions">
            <Link className="button-like primary" to="/documentos">
              Ir para Documentos
            </Link>
            <button type="button" onClick={() => lockVault('manual')}>
              Bloquear
            </button>
          </div>
        </div>
      )}

      <div className="toolbar">
        {!creating && (
          <button type="button" className="primary" onClick={() => setCreating(true)}>
            Novo cofre
          </button>
        )}
        <ImportVault onImported={() => refresh()} />
      </div>

      {creating && (
        <CreateVaultForm
          onDone={() => {
            setCreating(false);
            refresh();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {vaults === null ? (
        <p aria-busy="true">Carregando…</p>
      ) : vaults.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum cofre neste aparelho.</p>
          <p>Crie um cofre para o inquérito ou importe um arquivo {'.ipcofre'}.</p>
        </div>
      ) : (
        <ul className="vault-list" aria-label="Cofres neste aparelho">
          {vaults.map((vault) => {
            const isOpen = openId === vault.id;
            const current = action?.vaultId === vault.id ? action.kind : null;
            return (
              <li key={vault.id} className={`vault-card${isOpen ? ' is-open' : ''}`}>
                <div className="vault-card-head">
                  <h2>{vault.name}</h2>
                  {isOpen && <span className="badge online">Aberto</span>}
                </div>
                <p className="meta">
                  Criado em {formatDateTime(vault.createdAt)} · Atualizado em{' '}
                  {formatDateTime(vault.updatedAt)}
                </p>
                <div className="actions">
                  {!isOpen && current !== 'open' && (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setAction({ kind: 'open', vaultId: vault.id })}
                    >
                      Abrir
                    </button>
                  )}
                  <button type="button" onClick={() => void handleExport(vault)}>
                    Exportar
                  </button>
                  <button
                    type="button"
                    className="danger-outline"
                    onClick={() => setAction({ kind: 'delete', vaultId: vault.id })}
                  >
                    Apagar
                  </button>
                </div>
                {current === 'open' && (
                  <PasswordForm
                    title={`Senha do cofre “${vault.name}”`}
                    submitLabel="Abrir"
                    busyLabel="Abrindo…"
                    onSubmit={async (password) => {
                      setUnlocked(await unlockVault(vault.id, password));
                      setAction(null);
                    }}
                    onCancel={() => setAction(null)}
                  />
                )}
                {current === 'delete' && (
                  <TypedConfirm
                    expected={vault.name}
                    prompt="Apagar o cofre remove definitivamente todo o seu conteúdo deste aparelho. Exporte antes se quiser guardar uma cópia."
                    confirmLabel="Apagar cofre"
                    onConfirm={() => handleDelete(vault)}
                    onCancel={() => setAction(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
