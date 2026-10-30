import { useId, useState, useSyncExternalStore } from 'react';
import { TYPE_LABEL, TYPE_TITLE, labelOf, normalizeRole } from '../../review/labels';
import {
  acceptSuggestion,
  addCustomRole,
  assignRole,
  changeType,
  cleanName,
  confirm,
  discard,
  keepSeparate,
  link,
  removeVariant,
  sameLabelOwner,
  setCanonical,
  setDecision,
  setIndex,
  splitVariant,
  unify,
  unifyInto,
} from '../../review/model';
import { ENTITY_TYPES, type EntityType } from '../../detectors/types';
import {
  WARNING_TEXT,
  contextAround,
  entityWarnings,
  suspiciousWords,
} from '../../review/warnings';
import { getSettings, subscribeSettings, updateSettings } from '../../settings/settings';
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
                onClick={() => setConfirmDiscard(true)}
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
          <IndexForm
            key={`${entity.role ?? ''}-${entity.index ?? ''}`}
            entity={entity}
            content={content}
            data={data}
            run={run}
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

      {entity.type === 'PESSOA' && !entity.suggested && (
        <SamePerson entity={entity} people={people} data={data} run={run} />
      )}

      {entity.type !== 'PESSOA' &&
        entity.type !== 'CIDADE' &&
        entity.type !== 'NUM_PROCESSO' &&
        entity.type !== 'NUM_BO' &&
        entity.type !== 'NUM_IP' && (
          <LinkOwner entity={entity} people={people} data={data} run={run} />
        )}

      <div className="inline-form">
        <label htmlFor={`${id}-type`}>Tipo</label>
        <select
          id={`${id}-type`}
          value={entity.type}
          onChange={(e) => void run((c) => changeType(c, entity.id, e.target.value as EntityType))}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'CIDADE' ? 'Cidade ou lugar (fica em claro)' : TYPE_TITLE[t].replace(/s$/, '')}
            </option>
          ))}
        </select>
      </div>

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
              <span className="actions">
                <button
                  type="button"
                  onClick={() => void run((c) => splitVariant(c, entity.id, v))}
                >
                  Separar
                </button>
                <button
                  type="button"
                  className="danger-outline"
                  aria-label={`Apagar a variante ${v}`}
                  onClick={() => void run((c) => removeVariant(c, entity.id, v))}
                >
                  Apagar
                </button>
              </span>
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
        {!confirmDiscard && (
          <button type="button" className="danger-outline" onClick={() => setConfirmDiscard(true)}>
            Descartar (não é dado pessoal)
          </button>
        )}
      </div>
      {confirmDiscard && (
        <DiscardForm entity={entity} run={run} onCancel={() => setConfirmDiscard(false)} />
      )}
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

type Run = (op: (c: VaultContent) => VaultContent) => Promise<void>;

const roleTitle = (e: StoredEntity) =>
  e.decision === 'keep'
    ? 'Mantidas (autoridades)'
    : e.role
      ? normalizeRole(e.role).charAt(0) + normalizeRole(e.role).slice(1).toLocaleLowerCase('pt-BR')
      : 'Pessoa (sem papel)';

/** Pessoas agrupadas por papel, para os campos de escolha. */
function byRole(people: readonly StoredEntity[]): [string, StoredEntity[]][] {
  const groups = new Map<string, StoredEntity[]>();
  for (const p of people) {
    if (p.suggested) continue;
    const key = roleTitle(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
}

const personOption = (p: StoredEntity, data: ReviewData) =>
  `${p.decision === 'pseudonymize' ? `${labelOf(p, data.byId)} ` : ''}${p.canonical}`;

/** Número do marcador: aplicado ao confirmar; se já for de outra pessoa, unifica as duas. */
function IndexForm({
  entity,
  content,
  data,
  run,
}: {
  entity: StoredEntity;
  content: VaultContent;
  data: ReviewData;
  run: Run;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(entity.index ?? ''));
  const n = Number(draft);
  const valid = Number.isInteger(n) && n >= 1;
  const owner =
    valid && n !== entity.index ? sameLabelOwner(content, entity.id, entity, n) : undefined;
  return (
    <form
      className="inline-form index-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && n !== entity.index) void run((c) => setIndex(c, entity.id, n));
      }}
    >
      <label htmlFor={`${id}-index`}>Número</label>
      <input
        id={`${id}-index`}
        type="number"
        min={1}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit" disabled={!valid || n === entity.index}>
        {owner ? 'Aplicar e unificar' : 'Aplicar'}
      </button>
      {owner && (
        <p className="hint">
          {labelOf(owner, data.byId)} já é <strong>{owner.canonical}</strong>: as duas serão
          unificadas numa só pessoa.
        </p>
      )}
    </form>
  );
}

/** "É a mesma pessoa que…": unifica esta entidade numa pessoa já existente. */
function SamePerson({
  entity,
  people,
  data,
  run,
}: {
  entity: StoredEntity;
  people: readonly StoredEntity[];
  data: ReviewData;
  run: Run;
}) {
  const id = useId();
  const [target, setTarget] = useState('');
  const groups = byRole(people);
  if (!groups.length) return null;
  const chosen = people.find((p) => p.id === target);
  return (
    <div className="inline-form same-as">
      <label htmlFor={`${id}-same`}>É a mesma pessoa que</label>
      <select id={`${id}-same`} value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">— escolha —</option>
        {groups.map(([title, list]) => (
          <optgroup key={title} label={title}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {personOption(p, data)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button
        type="button"
        className="primary"
        disabled={!chosen}
        onClick={() => chosen && void run((c) => unifyInto(c, chosen.id, entity.id))}
      >
        Unificar
      </button>
      {chosen && (
        <p className="hint">
          “{entity.canonical}” deixa de existir e todas as suas ocorrências passam a ser{' '}
          {chosen.decision === 'pseudonymize' ? labelOf(chosen, data.byId) : chosen.canonical}.
        </p>
      )}
    </div>
  );
}

/** "Pertence a": primeiro o papel (vítima, autor…), depois a pessoa. */
function LinkOwner({
  entity,
  people,
  data,
  run,
}: {
  entity: StoredEntity;
  people: readonly StoredEntity[];
  data: ReviewData;
  run: Run;
}) {
  const id = useId();
  const groups = byRole(people);
  const owner = entity.linkedTo ? data.byId.get(entity.linkedTo) : undefined;
  const [group, setGroup] = useState(owner ? roleTitle(owner) : '');
  const list = groups.find(([title]) => title === group)?.[1] ?? [];
  return (
    <div className="inline-form link-owner">
      <label htmlFor={`${id}-role`}>Pertence a: papel</label>
      <select id={`${id}-role`} value={group} onChange={(e) => setGroup(e.target.value)}>
        <option value="">— escolha o papel —</option>
        {groups.map(([title]) => (
          <option key={title} value={title}>
            {title}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-link`}>pessoa</label>
      <select
        id={`${id}-link`}
        value={entity.linkedTo ?? ''}
        disabled={!group && !entity.linkedTo}
        onChange={(e) => void run((c) => link(c, entity.id, e.target.value || null))}
      >
        <option value="">— ninguém —</option>
        {owner && !list.includes(owner) && (
          <option value={owner.id}>{personOption(owner, data)}</option>
        )}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {personOption(p, data)}
          </option>
        ))}
      </select>
    </div>
  );
}

const DISCARD_KINDS = [
  'bairro',
  'rua',
  'cidade',
  'distrito ou localidade',
  'órgão ou instituição',
  'hospital',
  'empresa',
  'termo técnico',
  'rótulo de formulário',
];

/**
 * Descartar com o motivo digitado ("bairro", "rua"…). "Ensinar ao app" grava o termo nas
 * preferências: ele fica em claro e não é detectado de novo, em todos os cofres.
 */
function DiscardForm({
  entity,
  run,
  onCancel,
}: {
  entity: StoredEntity;
  run: Run;
  onCancel: () => void;
}) {
  const id = useId();
  const [kind, setKind] = useState('');
  const [learn, setLearn] = useState(true);
  const confirmDiscard = async () => {
    await run((c) => discard(c, entity.id));
    const reason = kind.trim();
    if (!learn || !reason) return;
    const current = getSettings().learnedTerms;
    const known = new Set(current.map((t) => t.text.toLocaleLowerCase('pt-BR')));
    const added = [entity.canonical, ...entity.variants]
      .map((v) => v.replace(/\s+/g, ' ').trim())
      .filter((v) => {
        const k = v.toLocaleLowerCase('pt-BR');
        if (!v || known.has(k)) return false;
        known.add(k);
        return true;
      })
      .map((text) => ({ text, kind: reason }));
    if (added.length) updateSettings({ learnedTerms: [...current, ...added] });
  };
  return (
    <form
      className="panel discard-form"
      onSubmit={(e) => {
        e.preventDefault();
        void confirmDiscard();
      }}
    >
      <h3>Descartar “{entity.canonical}”</h3>
      <label htmlFor={`${id}-kind`}>Não é dado pessoal porque é (digite ou escolha)</label>
      <input
        id={`${id}-kind`}
        list={`${id}-kinds`}
        value={kind}
        onChange={(e) => setKind(e.target.value)}
        placeholder="Ex.: bairro, rua, órgão"
        maxLength={40}
      />
      <datalist id={`${id}-kinds`}>
        {DISCARD_KINDS.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={learn}
          disabled={!kind.trim()}
          onChange={(e) => setLearn(e.target.checked)}
        />
        Ensinar ao app: não detectar “{entity.canonical}” de novo, em nenhum cofre
      </label>
      <p className="hint">
        O termo ensinado fica gravado sem cifra neste aparelho, junto com as preferências, e pode
        ser apagado em Configurações. Use só para lugares, órgãos e termos, nunca para nomes de
        pessoas.
      </p>
      <div className="actions">
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="danger">
          Confirmar descarte
        </button>
      </div>
    </form>
  );
}
