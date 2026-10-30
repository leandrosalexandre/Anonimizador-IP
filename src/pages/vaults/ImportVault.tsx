import { useId, useRef, useState, type ChangeEvent } from 'react';
import { userMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { requestPersistentStorage } from '../../utils/storage';
import {
  VAULT_FILE_EXTENSION,
  VaultAlreadyExistsError,
  importVault,
  parseVaultFile,
} from '../../vault/exchange';
import { setUnlocked } from '../../vault/session';
import type { VaultRecord } from '../../vault/types';
import { PasswordForm } from './PasswordForm';

export function ImportVault({ onImported }: { onImported: () => void }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [record, setRecord] = useState<VaultRecord | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [conflict, setConflict] = useState<VaultAlreadyExistsError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setRecord(null);
    setPassword(null);
    setConflict(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    reset();
    try {
      setRecord(parseVaultFile(await file.text()));
    } catch (e) {
      setError(userMessage(e));
    }
  }

  async function finish(rec: VaultRecord, pw: string, replace: boolean) {
    try {
      const vault = await importVault(rec, pw, { replace });
      await requestPersistentStorage();
      setUnlocked(vault);
      reset();
      onImported();
    } catch (e) {
      if (e instanceof VaultAlreadyExistsError) {
        setPassword(pw);
        setConflict(e);
        return;
      }
      throw e;
    }
  }

  async function replace() {
    if (!record || !password) return;
    setBusy(true);
    try {
      await finish(record, password, true);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import">
      <label htmlFor={id} className="button-like">
        Importar cofre ({VAULT_FILE_EXTENSION})
      </label>
      <input
        ref={inputRef}
        id={id}
        className="visually-hidden"
        type="file"
        accept={`${VAULT_FILE_EXTENSION},application/json`}
        onChange={(e) => void handleFile(e)}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {record && !conflict && (
        <PasswordForm
          title={`Senha do cofre “${record.name}”`}
          submitLabel="Importar"
          busyLabel="Conferindo senha…"
          onSubmit={(pw) => finish(record, pw, false)}
          onCancel={reset}
        />
      )}
      {record && conflict && (
        <div className="panel danger" role="alertdialog" aria-labelledby={`${id}-conflict`}>
          <p id={`${id}-conflict`}>
            Este aparelho já tem o cofre <strong>{conflict.existing.name}</strong> (atualizado em{' '}
            {formatDateTime(conflict.existing.updatedAt)}). O arquivo foi atualizado em{' '}
            {formatDateTime(record.updatedAt)}.
          </p>
          <p>Substituir apaga a versão deste aparelho e mantém a do arquivo.</p>
          <div className="actions">
            <button type="button" onClick={reset} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="danger" onClick={() => void replace()} disabled={busy}>
              {busy ? 'Substituindo…' : 'Substituir'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
