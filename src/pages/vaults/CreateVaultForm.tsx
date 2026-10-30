import { useId, useState, type FormEvent } from 'react';
import { StrengthMeter } from '../../components/StrengthMeter';
import { userMessage } from '../../utils/errors';
import { requestPersistentStorage } from '../../utils/storage';
import {
  MIN_ACCEPTED_LEVEL,
  MIN_PASSWORD_LENGTH,
  estimatePasswordStrength,
} from '../../vault/passwordStrength';
import { MAX_VAULT_NAME_LENGTH, createVault } from '../../vault/repository';
import { setUnlocked } from '../../vault/session';

export function CreateVaultForm({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = estimatePasswordStrength(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const tooWeak = password.length < MIN_PASSWORD_LENGTH || strength.level < MIN_ACCEPTED_LEVEL;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (tooWeak) return setError('Escolha uma senha mais forte.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setBusy(true);
    try {
      const vault = await createVault(name, password);
      await requestPersistentStorage();
      setUnlocked(vault);
      onDone();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={(e) => void handleSubmit(e)} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>Novo cofre</h2>
      <label htmlFor={`${id}-name`}>Nome do cofre</label>
      <input
        id={`${id}-name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_VAULT_NAME_LENGTH}
        placeholder="Ex.: IP 123/2026 – 24ª DP"
        autoComplete="off"
        required
        aria-describedby={`${id}-name-hint`}
      />
      <p className="notice warn" id={`${id}-name-hint`}>
        O nome do cofre fica visível sem senha. <strong>Não use nomes de pessoas</strong> — use só o
        número do procedimento e a unidade.
      </p>

      <label htmlFor={`${id}-pw`}>Senha do cofre</label>
      <input
        id={`${id}-pw`}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        required
        aria-describedby={`${id}-strength`}
      />
      <StrengthMeter strength={strength} id={`${id}-strength`} />

      <label htmlFor={`${id}-pw2`}>Confirme a senha</label>
      <input
        id={`${id}-pw2`}
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
        aria-invalid={mismatch}
      />
      {mismatch && <p className="field-error">As senhas não conferem.</p>}

      <p className="notice">
        Guarde bem a senha: <strong>não há como recuperá-la</strong>. Sem ela, o conteúdo do cofre
        não pode ser aberto.
      </p>

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={busy || tooWeak || mismatch}>
          {busy ? 'Criando cofre…' : 'Criar cofre'}
        </button>
      </div>
    </form>
  );
}
