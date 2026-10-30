import { useId, useState, useSyncExternalStore } from 'react';
import { DEFAULT_EXCLUSIONS } from '../detectors/data/exclusoes';
import {
  DEFAULT_ENABLED_TYPES,
  ENTITY_TYPES,
  MANUAL_ONLY_TYPES,
  type EntityType,
} from '../detectors/types';
import { TYPE_TITLE } from '../review/labels';
import { DEFAULT_AI_INSTRUCTIONS } from '../export/build';
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
          Padrão: não bloquear ao sair da tela. O cofre fecha quando você toca em “Bloquear”, após o
          tempo de inatividade acima (o tempo fora da tela conta) ou ao fechar o app. Escolher
          arquivos (PDFs, cofres) nunca bloqueia o cofre.
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

      <TypesPanel
        value={settings.enabledTypes}
        onChange={(enabledTypes) => updateSettings({ enabledTypes })}
      />

      <InstructionsPanel
        value={settings.aiInstructions}
        onSave={(aiInstructions) => updateSettings({ aiInstructions })}
      />

      <ExclusionsPanel
        value={settings.detectionExclusions}
        onSave={(detectionExclusions) => updateSettings({ detectionExclusions })}
      />

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

function ExclusionsPanel({
  value,
  onSave,
}: {
  value: string[];
  onSave: (terms: string[]) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value.join('\n'));
  const [saved, setSaved] = useState(false);
  const parsed = draft
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
  const changed = parsed.join('\n') !== value.join('\n');

  return (
    <div className="panel">
      <h2>Termos que não são nomes de pessoas</h2>
      <p className="hint">
        A detecção já ignora {DEFAULT_EXCLUSIONS.length} palavras comuns em inquéritos (cargos,
        órgãos, termos jurídicos, meses, logradouros). Acrescente outras, uma por linha: nomes de
        bairros, empresas públicas ou palavras que aparecem como falsos nomes. Não coloque aqui
        nomes de pessoas: para manter autoridades, use a decisão “manter” na revisão.
      </p>
      <label htmlFor={id}>Termos extras</label>
      <textarea
        id={id}
        className="terms-editor"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        rows={5}
        spellCheck={false}
      />
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!changed}
          onClick={() => {
            onSave(parsed);
            setSaved(true);
          }}
        >
          Salvar termos
        </button>
        {saved && <span className="hint">Salvo. Vale para as próximas detecções.</span>}
      </div>
    </div>
  );
}

function InstructionsPanel({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (text: string | null) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value ?? DEFAULT_AI_INSTRUCTIONS);
  const [saved, setSaved] = useState(false);
  const current = value ?? DEFAULT_AI_INSTRUCTIONS;

  return (
    <div className="panel">
      <h2>Instruções para a IA</h2>
      <p className="hint">
        Texto colocado no topo de cada parte exportada. Não escreva aqui nenhum dado do inquérito.
      </p>
      <label htmlFor={id}>Instruções</label>
      <textarea
        id={id}
        className="terms-editor"
        rows={5}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
      />
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={draft.trim() === current.trim()}
          onClick={() => {
            onSave(draft.trim() === DEFAULT_AI_INSTRUCTIONS ? null : draft);
            setSaved(true);
          }}
        >
          Salvar instruções
        </button>
        <button
          type="button"
          disabled={draft === DEFAULT_AI_INSTRUCTIONS}
          onClick={() => {
            setDraft(DEFAULT_AI_INSTRUCTIONS);
            onSave(null);
            setSaved(true);
          }}
        >
          Restaurar padrão
        </button>
        {saved && <span className="hint">Salvo.</span>}
      </div>
    </div>
  );
}

/** Tipos de dado que a detecção procura e pseudonimiza (nomes de pessoas sempre). */
function TypesPanel({
  value,
  onChange,
}: {
  value: readonly EntityType[];
  onChange: (types: EntityType[]) => void;
}) {
  const optional = ENTITY_TYPES.filter((t) => t !== 'PESSOA' && !MANUAL_ONLY_TYPES.includes(t));
  const isDefault =
    value.length === DEFAULT_ENABLED_TYPES.length &&
    DEFAULT_ENABLED_TYPES.every((t) => value.includes(t));
  const toggle = (type: EntityType, on: boolean) =>
    onChange(ENTITY_TYPES.filter((t) => t === 'PESSOA' || (t === type ? on : value.includes(t))));
  return (
    <div className="panel">
      <h2>O que pseudonimizar</h2>
      <p className="hint">
        Padrão: nomes de pessoas (com apelidos) e documentos pessoais. Municípios, bairros, ruas,
        hospitais, órgãos, datas do fato e números de BO/IP/processo ficam em claro. Depois de
        mudar, toque em “Detectar de novo” na Revisão.
      </p>
      <fieldset className="type-choice">
        <legend className="visually-hidden">Tipos de dado</legend>
        <label className="checkbox">
          <input type="checkbox" checked disabled />
          {TYPE_TITLE.PESSOA} (sempre)
        </label>
        {optional.map((t) => (
          <label key={t} className="checkbox">
            <input
              type="checkbox"
              checked={value.includes(t)}
              onChange={(e) => toggle(t, e.target.checked)}
            />
            {TYPE_TITLE[t]}
          </label>
        ))}
      </fieldset>
      {!isDefault && (
        <button type="button" onClick={() => onChange([...DEFAULT_ENABLED_TYPES])}>
          Voltar ao padrão
        </button>
      )}
    </div>
  );
}
