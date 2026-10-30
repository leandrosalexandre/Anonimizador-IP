import { useId, useState, type FormEvent } from 'react';

interface Props {
  /** Texto que o usuário precisa digitar exatamente. */
  expected: string;
  prompt: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

/** Confirmação digitada para ações destrutivas (SPEC 2.7). */
export function TypedConfirm({ expected, prompt, confirmLabel, onConfirm, onCancel }: Props) {
  const id = useId();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const matches = value.trim() === expected;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!matches) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel danger" onSubmit={(e) => void handleSubmit(e)}>
      <p>{prompt}</p>
      <label htmlFor={id}>
        Digite <strong className="mono">{expected}</strong> para confirmar
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
      />
      <div className="actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="danger" disabled={!matches || busy}>
          {busy ? 'Apagando…' : confirmLabel}
        </button>
      </div>
    </form>
  );
}
