import { useId, useState, useSyncExternalStore } from 'react';
import { TypedConfirm } from '../components/TypedConfirm';
import {
  IDLE_LOCK_OPTIONS,
  getSettings,
  resetSettings,
  subscribeSettings,
  updateSettings,
  type LockOnHide,
} from '../settings/settings';
import { userMessage } from '../utils/errors';
import { deleteDatabase } from '../vault/db';
import { lockVault } from '../vault/session';

const DELETE_ALL_PHRASE = 'APAGAR TUDO';

const LOCK_ON_HIDE_LABELS: Record<LockOnHide, string> = {
  immediate: 'Imediatamente',
  '1min': 'Após 1 minuto fora da tela',
  '5min': 'Após 5 minutos fora da tela',
  never: 'Não bloquear ao sair da tela',
};

export function SettingsPage() {
  const id = useId();
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function deleteEverything() {
    try {
      lockVault('deleted');
      await deleteDatabase();
      resetSettings();
      setConfirmingDelete(false);
      setMessage('Todos os cofres e preferências foram apagados deste aparelho.');
    } catch (e) {
      setMessage(userMessage(e));
    }
  }

  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Configurações</h1>
      <p className="summary">Ajustes de segurança. As preferências valem para todos os cofres.</p>

      <div className="panel">
        <h2>Bloqueio automático</h2>
        <label htmlFor={`${id}-idle`}>Bloquear o cofre após inatividade de</label>
        <select
          id={`${id}-idle`}
          value={settings.idleLockMinutes}
          onChange={(e) => updateSettings({ idleLockMinutes: Number(e.target.value) })}
        >
          {IDLE_LOCK_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? 'minuto' : 'minutos'}
            </option>
          ))}
        </select>

        <label htmlFor={`${id}-hide`}>Ao ocultar o app (trocar de app, apagar a tela)</label>
        <select
          id={`${id}-hide`}
          value={settings.lockOnHide}
          onChange={(e) => updateSettings({ lockOnHide: e.target.value as LockOnHide })}
        >
          {(Object.keys(LOCK_ON_HIDE_LABELS) as LockOnHide[]).map((k) => (
            <option key={k} value={k}>
              {LOCK_ON_HIDE_LABELS[k]}
            </option>
          ))}
        </select>
        <p className="hint">
          Ao colar o texto no app da IA, o Anonimizador sai da tela. Com “Imediatamente”, será
          preciso digitar a senha de novo ao voltar. Fechar o app sempre bloqueia o cofre.
        </p>
      </div>

      <div className="panel">
        <h2>OCR (páginas escaneadas)</h2>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.ocrBinarize}
            onChange={(e) => updateSettings({ ocrBinarize: e.target.checked })}
          />
          Converter para preto e branco antes do OCR (binarização)
        </label>
        <p className="hint">
          Pode ajudar em cópias manchadas ou com fundo escuro. Em páginas limpas, deixe desligado.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.ocrSearchablePdf}
            onChange={(e) => updateSettings({ ocrSearchablePdf: e.target.checked })}
          />
          Gerar PDF pesquisável ao fim do OCR
        </label>
        <p className="hint">
          Oferece para baixar uma cópia do PDF com camada de texto nas páginas escaneadas. O arquivo
          baixado não é cifrado: guarde-o em local seguro.
        </p>
      </div>

      <div className="panel">
        <h2>Apagar tudo</h2>
        <p>
          Remove todos os cofres e preferências deste aparelho. O app continua instalado. Não pode
          ser desfeito.
        </p>
        {message && (
          <p className="notice info" role="status">
            {message}
          </p>
        )}
        {confirmingDelete ? (
          <TypedConfirm
            expected={DELETE_ALL_PHRASE}
            prompt="Todos os cofres serão apagados definitivamente."
            confirmLabel="Apagar tudo"
            onConfirm={deleteEverything}
            onCancel={() => setConfirmingDelete(false)}
          />
        ) : (
          <button
            type="button"
            className="danger-outline"
            onClick={() => {
              setMessage(null);
              setConfirmingDelete(true);
            }}
          >
            Apagar tudo…
          </button>
        )}
      </div>
    </section>
  );
}
