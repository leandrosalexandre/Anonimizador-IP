import { useId, useState, useSyncExternalStore } from 'react';
import { TYPE_LABEL, labelOf, normalizeRole } from '../../review/labels';
import {
  acceptSuggestion,
  addCustomRole,
  assignRole,
  cleanName,
  confirm,
  discard,
  keepSeparate,
  link,
  setCanonical,
  setDecision,
  setIndex,
  splitVariant,
  unify,
} from '../../review/model';
import {
  WARNING_TEXT,
  contextAround,
  entityWarnings,
  suspiciousWords,
} from '../../review/warnings';
import { getSettings, subscribeSettings } from '../../settings/settings';
import { formatFolhas, type ReviewData } from '../../review/useReviewData';
import { userMessage } from '../../utils/errors';
import type { StoredEntity, VaultContent } from '../../vault/types';
import { apply, rolesFor } from './common';

const NEW_ROLE = '__novo__';

interface Props {
  entity: StoredEntity;
  content: VaultContent;
  data: ReviewData;
  onShowInText: (pageKey: string) => void;
  onClose?: () => void;
}

function Snippets({ entity, data, onShowInText }: Pick<Props, 'entity' | 'data' | 'onShowInText'>) {
  const pages = data.stats.get(entity.id)?.pages ?? [];
  if (!pages.length) return <p className="hint">Nenhuma ocorrência no texto atual.</p>;
  return (
    <ul className="snippets">
      {pages.slice(0, 8).map((key) => {
        const page = data.byKey.get(key);
        const hit = data.located.get(key)?.find((l) => l.entityId === entity.id);
        if (!page || !hit) return null;
        const { before, hit: found, after } = contextAround(page.text, hit.start, hit.end);
        return (
          <li key={key}>
            <button type="button" className="link" onClick={() => onShowInText(key)}>
              {page.folha !== null ? `fls. ${page.folha}` : `PDF p. ${page.pdfPage}`}
            </button>{' '}
            <span className="meta">
              …{before} <mark className="snippet-hit">{found}</mark> {after}…
            </span>
          </li>
        );
      })}
      {pages.length > 8 && <li className="meta">e mais {pages.length - 8} páginas</li>}
    </ul>
  );
}

export function EntityDetail({ entity, content, data, onShowInText, onClose }: Props) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [newRole, setNewRole] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [canonical, setCanonicalDraft] = useState(entity.canonical);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const roles = rolesFor(content);
  const people = content.entities.filter((e) => e.type === 'PESSOA' && e.id !== entity.id);
  const stats = data.stats.get(entity.id);

  async function run(op: (c: VaultContent) => VaultContent) {
    setError(null);
    try {
      await apply(op);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const label = entity.decision === 'pseudonymize' ? labelOf(entity, data.byId) : null;
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const warnings = entityWarnings(entity, settings.detectionExclusions).filter(
    (w) => w !== 'ambiguous',
  );

  return (
    <div className="entity-detail" aria-label={`Detalhes de ${entity.canonical}`}>
      <div className="detail-head">
        <div>
          <p className="detail-label">
            {label ?? <span className="badge keep">Mantido sem substituir</span>}
          </p>
          <p className="meta">
            {TYPE_LABEL[entity.type]} · {stats?.count ?? 0} ocorrências
            {stats?.folhas.length ? ` · fls. ${formatFolhas(stats.folhas)}` : ''}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fechar detalhes">
            ×
          </button>
        )}
      </div>

      {entity.suggested && (
        <div className="notice info suggestion-box">
          <div>
            <p>
              <strong>Sugestão não aplicada.</strong> Não está em bloco de qualificação, não vem
              depois de um gatilho (“a vítima”, “o acusado”…) e não começa por um prenome conhecido.
              Enquanto não for aplicada, fica em claro no texto exportado.
            </p>
            <div className="actions">
              <button
                type="button"
                className="primary"
                onClick={() => void run((c) => acceptSuggestion(c, entity.id))}
              >
                Aplicar (é nome de pessoa)
              </button>
              <button
                type="button"
                className="danger-outline"
                onClick={() => void run((c) => discard(c, entity.id))}
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {warnings.map((w) => (
        <p key={w} className="notice warn">
          {WARNING_TEXT[w]}
          {w === 'roles' && entity.roleConflicts?.length
            ? ` Encontrados: ${entity.roleConflicts.map((r) => r.toLocaleLowerCase('pt-BR')).join(', ')}. Foi escolhido o mais relevante.`
            : ''}
        </p>
      ))}

      {entity.ambiguousWith.length > 0 && (
        <div className="notice warn same-person" role="group" aria-label="Possível mesma pessoa">
          <div>
            <p>
              <strong>Possível mesma pessoa?</strong>
            </p>
            <ul>
              {entity.ambiguousWith
                .map((a) => data.byId.get(a))
                .filter((a): a is StoredEntity => !!a)
                .map((a) => (
                  <li key={a.id}>
                    {a.decision === 'pseudonymize' && !a.suggested
                      ? `${labelOf(a, data.byId)} `
                      : ''}
                    <strong>{a.canonical}</strong>{' '}
                    <button
                      type="button"
                      onClick={() => void run((c) => unify(c, a.id, entity.id))}
                    >
                      Unificar
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => void run((c) => keepSeparate(c, a.id, entity.id))}
                    >
                      Manter separados
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}

      {entity.type === 'PESSOA' && (
        <CleanName entity={entity} exclusions={settings.detectionExclusions} run={run} />
      )}

      {!entity.suggested && (
        <div className="decision-toggle" role="group" aria-label="Decisão">
          <button
            type="button"
            className={entity.decision === 'pseudonymize' ? 'primary' : ''}
            aria-pressed={entity.decision === 'pseudonymize'}
            onClick={() => void run((c) => setDecision(c, entity.id, 'pseudonymize'))}
          >
            Pseudonimizar
          </button>
          <button
            type="button"
            className={entity.decision === 'keep' ? 'primary' : ''}
            aria-pressed={entity.decision === 'keep'}
            onClick={() => void run((c) => setDecision(c, entity.id, 'keep'))}
          >
            Manter (autoridade/público)
          </button>
        </div>
      )}

      {entity.type === 'PESSOA' && entity.decision === 'pseudonymize' && (
        <div className="inline-form">
          <label htmlFor={`${id}-role`}>Papel</label>
          <select
            id={`${id}-role`}
            value={entity.role ? normalizeRole(entity.role) : ''}
            onChange={(e) => {
              if (e.target.value === NEW_ROLE) return setAddingRole(true);
              void run((c) => assignRole(c, entity.id, e.target.value || null));
            }}
          >
            <option value="">Pessoa (sem papel definido)</option>
            {roles
              .filter((r) => r !== 'PESSOA')
              .map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLocaleLowerCase('pt-BR')}
                </option>
              ))}
            <option value={NEW_ROLE}>Criar papel…</option>
          </select>
          <label htmlFor={`${id}-index`}>Número</label>
          <input
            id={`${id}-index`}
            type="number"
            min={1}
            inputMode="numeric"
            value={entity.index ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1) void run((c) => setIndex(c, entity.id, n));
            }}
          />
        </div>
      )}
      {addingRole && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const role = newRole.trim();
            if (!role) return;
            void run((c) => assignRole(addCustomRole(c, role), entity.id, role));
            setAddingRole(false);
            setNewRole('');
          }}
        >
          <label htmlFor={`${id}-newrole`}>Novo papel</label>
          <input
            id={`${id}-newrole`}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Ex.: PERITO PARTICULAR"
            autoFocus
          />
          <button type="submit" className="primary">
            Criar
          </button>
          <button type="button" onClick={() => setAddingRole(false)}>
            Cancelar
          </button>
        </form>
      )}

      {entity.type !== 'PESSOA' &&
        entity.type !== 'NUM_PROCESSO' &&
        entity.type !== 'NUM_BO' &&
        entity.type !== 'NUM_IP' && (
          <div className="inline-form">
            <label htmlFor={`${id}-link`}>Pertence a</label>
            <select
              id={`${id}-link`}
              value={entity.linkedTo ?? ''}
              onChange={(e) => void run((c) => link(c, entity.id, e.target.value || null))}
            >
              <option value="">— ninguém —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.decision === 'pseudonymize' ? `${labelOf(p, data.byId)} ` : ''}
                  {p.canonical}
                </option>
              ))}
            </select>
          </div>
        )}

      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run((c) => setCanonical(c, entity.id, canonical));
        }}
      >
        <label htmlFor={`${id}-canon`}>Valor canônico (usado ao reidentificar)</label>
        <input
          id={`${id}-canon`}
          className="wide"
          value={canonical}
          onChange={(e) => setCanonicalDraft(e.target.value)}
        />
        <button type="submit" disabled={canonical.trim() === entity.canonical}>
          Salvar
        </button>
      </form>

      <h3>Variantes ({entity.variants.length})</h3>
      <ul className="variants">
        {entity.variants.map((v) => (
          <li key={v}>
            <span>{v}</span>
            {entity.variants.length > 1 && (
              <button type="button" onClick={() => void run((c) => splitVariant(c, entity.id, v))}>
                Separar
              </button>
            )}
          </li>
        ))}
      </ul>

      <h3>Onde aparece</h3>
      <Snippets entity={entity} data={data} onShowInText={onShowInText} />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        {!entity.reviewed && (
          <button
            type="button"
            className="primary"
            onClick={() => void run((c) => confirm(c, [entity.id]))}
          >
            Confirmar sugestão
          </button>
        )}
        {confirmDiscard ? (
          <>
            <button type="button" onClick={() => setConfirmDiscard(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void run((c) => discard(c, entity.id))}
            >
              Confirmar descarte
            </button>
          </>
        ) : (
          <button type="button" className="danger-outline" onClick={() => setConfirmDiscard(true)}>
            Descartar (não é dado pessoal)
          </button>
        )}
      </div>
    </div>
  );
}

/** "Limpar nome": marcar as palavras que não fazem parte do nome e removê-las. */
function CleanName({
  entity,
  exclusions,
  run,
}: {
  entity: StoredEntity;
  exclusions: readonly string[];
  run: (op: (c: VaultContent) => VaultContent) => Promise<void>;
}) {
  const words = entity.canonical.split(/\s+/).filter(Boolean);
  const suspicious = new Set(suspiciousWords(entity, exclusions));
  const [marked, setMarked] = useState<string[]>(() => [...suspicious]);
  const [open, setOpen] = useState(suspicious.size > 0);
  if (words.length < 2) return null;
  if (!open) {
    return (
      <p>
        <button type="button" className="link" onClick={() => setOpen(true)}>
          Limpar nome (cortar palavras que não fazem parte dele)
        </button>
      </p>
    );
  }
  return (
    <div className="panel clean-name">
      <h3>Limpar nome</h3>
      <p className="hint">
        Toque nas palavras que não fazem parte do nome. Elas saem do nome e das variantes, e a
        entidade é unificada com a pessoa de mesmo nome, se houver.
      </p>
      <div className="word-chips" role="group" aria-label="Palavras do nome">
        {words.map((w, i) => {
          const on = marked.includes(w);
          return (
            <button
              key={`${w}-${i}`}
              type="button"
              className={`word-chip${on ? ' removed' : ''}`}
              aria-pressed={on}
              onClick={() => setMarked((m) => (on ? m.filter((x) => x !== w) : [...m, w]))}
            >
              {w}
            </button>
          );
        })}
      </div>
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={!marked.length || marked.length >= words.length}
          onClick={() => {
            void run((c) => cleanName(c, entity.id, marked));
            setMarked([]);
          }}
        >
          Remover palavras marcadas
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
    </div>
  );
}
