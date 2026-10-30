import { useId, useState, type FormEvent } from 'react';
import { userMessage } from '../../utils/errors';

interface Props {
  title: string;
  submitLabel: string;
  busyLabel: string;
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
}

/** Pede a senha de um cofre existente (abrir ou importar). */
export function PasswordForm({ title, submitLabel, busyLabel, onSubmit, onCancel }: Props) {
  const id = useId();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSubmit(password);
    } catch (e) {
      setError(userMessage(e));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={(e) => void handleSubmit(e)}>
      <label htmlFor={id}>{title}</label>
      <input
        id={id}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        autoFocus
        required
        aria-invalid={error !== null}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={busy || !password}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
