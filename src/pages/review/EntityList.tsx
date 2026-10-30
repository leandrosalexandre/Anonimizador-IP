import { useMemo, useState, useSyncExternalStore } from 'react';
import { authoritySection } from '../../review/authority';
import { PERSON_ROLES } from '../../detectors/types';
import { TYPE_TITLE, labelOf, normalizeRole } from '../../review/labels';
import {
  confirm,
  merge,
  pseudonymizeAllPeople,
  pseudonymizeInvolved,
  setDecisionMany,
} from '../../review/model';
import { formatFolhas, type ReviewData } from '../../review/useReviewData';
import { WARNING_BADGE, WARNING_TEXT, contextAround, entityWarnings } from '../../review/warnings';
import { fold } from '../../detectors/text';
import { getSettings, subscribeSettings } from '../../settings/settings';
import { userMessage } from '../../utils/errors';
import { useSession } from '../../vault/session';
import type { StoredEntity, VaultContent } from '../../vault/types';
import { apply, highlightClass } from './common';
import { EntityDetail } from './EntityDetail';

type Block = 'people' | 'documents' | 'suggestions';

interface Group {
  key: string;
  title: string;
  block: Block;
  entities: StoredEntity[];
  /** Seção que contém este grupo (as funções ficam dentro de "Autoridades"). */
  parent?: string;
}

const AUTHORITIES = 'AUTORIDADES';

/** Seções recolhidas por cofre, lembradas enquanto o app estiver aberto (B5). */
const collapsedByVault = new Map<string, Set<string>>();

const BLOCK_TITLES: Record<Block, string> = {
  people: 'Pessoas',
  documents: 'Documentos',
  suggestions: 'Sugestões (não aplicadas)',
};

const blockOf = (e: StoredEntity): Block =>
  e.suggested
    ? 'suggestions'
    : e.type === 'PESSOA' || e.type === 'APELIDO'
      ? 'people'
      : 'documents';

const ROLE_TITLES: Record<string, string> = {
  VÍTIMA: 'Vítimas',
  AUTOR: 'Autores',
  INVESTIGADO: 'Investigados',
  CONDUZIDO: 'Conduzidos',
  TESTEMUNHA: 'Testemunhas',
  INFORMANTE: 'Informantes',
  COMUNICANTE: 'Comunicantes',
  ADVOGADO: 'Advogados',
  MÉDICO: 'Médicos',
  ENFERMEIRO: 'Enfermeiros',
  'TÉCNICO DE ENFERMAGEM': 'Técnicos de enfermagem',
  'AUXILIAR DE ENFERMAGEM': 'Auxiliares de enfermagem',
  PERITO: 'Peritos',
  FAMILIAR: 'Familiares',
  PESSOA: 'Terceiros',
};

function groupEntities(entities: readonly StoredEntity[]): Group[] {
  const groups = new Map<string, Group>();
  const add = (key: string, title: string, e: StoredEntity, parent?: string) => {
    const g = groups.get(key) ?? {
      key,
      title,
      block: blockOf(e),
      entities: [],
      ...(parent ? { parent } : {}),
    };
    g.entities.push(e);
    groups.set(key, g);
  };
  for (const e of entities) {
    if (e.suggested) add('SUGESTAO', 'Possíveis nomes sem sinal forte', e);
    else if (e.type === 'APELIDO') add('APELIDO', TYPE_TITLE.APELIDO, e);
    else if (e.type === 'CIDADE')
      add('CIDADE', `${TYPE_TITLE.CIDADE}${e.decision === 'keep' ? ' (em claro)' : ''}`, e);
    else if (e.type === 'OUTRO' && e.category)
      add(
        `OUTRO:${e.category}`,
        `Outros: ${e.category}${e.decision === 'keep' ? ' (em claro)' : ''}`,
        e,
      );
    else if (e.type === 'PESSOA') {
      if (e.decision === 'keep') {
        const section = authoritySection(e);
        add(`KEEP:${section}`, section, e, AUTHORITIES);
      } else if (!e.role) add('PESSOA:?', 'Pessoas sem papel definido', e);
      else {
        const role = normalizeRole(e.role);
        add(`PESSOA:${role}`, ROLE_TITLES[role] ?? `Papel: ${role}`, e);
      }
    } else {
      add(e.type, TYPE_TITLE[e.type], e);
    }
  }
  const order = (key: string) => {
    if (key === 'SUGESTAO') return 1000;
    if (key === 'PESSOA:?') return -1;
    if (key === 'APELIDO') return 45;
    if (key.startsWith('KEEP:')) return 50;
    if (key.startsWith('PESSOA:')) {
      const i = PERSON_ROLES.indexOf(key.slice(7) as (typeof PERSON_ROLES)[number]);
      return i >= 0 ? i : 40;
    }
    return 100;
  };
  return [...groups.values()].sort(
    (a, b) => order(a.key) - order(b.key) || a.title.localeCompare(b.title, 'pt-BR'),
  );
}

interface Props {
  content: VaultContent;
  data: ReviewData;
  onShowInText: (pageKey: string, entityId: string) => void;
}

export function EntityList({ content, data, onShowInText }: Props) {
  const session = useSession();
  const vaultId = session.status === 'unlocked' ? session.vault.meta.id : '';
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsedState] = useState<Set<string>>(
    () => new Set(collapsedByVault.get(vaultId) ?? []),
  );
  const setCollapsed = (next: Set<string>) => {
    collapsedByVault.set(vaultId, next);
    setCollapsedState(next);
  };
  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
  };

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return content.entities.filter(
      (e) =>
        (!onlyPending || !e.reviewed) &&
        (!q ||
          e.variants.some((v) => fold(v).includes(q)) ||
          fold(labelOf(e, data.byId)).includes(q)),
    );
  }, [content.entities, onlyPending, query, data.byId]);
  const groups = useMemo(() => groupEntities(visible), [visible]);
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const counts = useMemo(() => {
    const c = { people: 0, documents: 0, suggestions: 0 };
    for (const e of content.entities) c[blockOf(e)]++;
    return c;
  }, [content.entities]);
  const peopleIds = groups
    .filter((g) => g.block === 'people')
    .flatMap((g) => g.entities.map((e) => e.id));
  const allKeys = [
    ...groups.map((g) => g.key),
    ...(groups.some((g) => g.parent) ? [AUTHORITIES] : []),
  ];

  const selectedEntities = selected
    .map((s) => data.byId.get(s))
    .filter((e): e is StoredEntity => !!e);
  const canMerge =
    selectedEntities.length >= 2 &&
    selectedEntities.every((e) => e.type === selectedEntities[0]?.type);

  async function run(op: (c: VaultContent) => VaultContent) {
    setError(null);
    try {
      await apply(op);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const groupProps = (group: Group) => ({
    group,
    content,
    data,
    openId,
    setOpenId,
    selected,
    setSelected,
    exclusions: settings.detectionExclusions,
    collapsed: collapsed.has(group.key),
    onToggle: () => toggle(group.key),
    onConfirm: (ids: string[]) => void run((c) => confirm(c, ids)),
    onShowInText,
  });

  return (
    <div className="entity-list">
      <p className="entity-counts" aria-label="Totais">
        <strong>{counts.people}</strong> {counts.people === 1 ? 'pessoa' : 'pessoas'} ·{' '}
        <strong>{counts.documents}</strong> {counts.documents === 1 ? 'documento' : 'documentos'} ·{' '}
        <strong>{counts.suggestions}</strong>{' '}
        {counts.suggestions === 1 ? 'sugestão não aplicada' : 'sugestões não aplicadas'}
      </p>
      {counts.people > 0 && (
        <div className="panel all-people">
          <div className="bulk-choice">
            <button
              type="button"
              onClick={() => void run((c) => pseudonymizeAllPeople(c, { includeKept: true }))}
            >
              Pseudonimizar todos
            </button>
            <p className="hint">
              Todas as pessoas, inclusive Delegado, Escrivão e demais autoridades.
            </p>
          </div>
          <div className="bulk-choice">
            <button
              type="button"
              className="primary"
              onClick={() => void run(pseudonymizeInvolved)}
            >
              Pseudonimizar autores, vítimas, testemunhas e familiares
            </button>
            <p className="hint">Só os envolvidos; as autoridades continuam com o nome real.</p>
          </div>
        </div>
      )}
      <div className="toolbar list-filters">
        <input
          type="search"
          aria-label="Procurar entidade"
          placeholder="Procurar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
          />
          Só pendentes
        </label>
      </div>
      <div className="toolbar list-controls">
        <SelectAll
          ids={peopleIds}
          selected={selected}
          setSelected={setSelected}
          label="Marcar todos"
        />
        <button type="button" onClick={() => setCollapsed(new Set(allKeys))}>
          Recolher todas
        </button>
        <button type="button" onClick={() => setCollapsed(new Set())}>
          Expandir todas
        </button>
      </div>

      {selected.length > 0 && (
        <div className="merge-bar" role="region" aria-label="Seleção">
          <span>
            {selected.length} {selected.length === 1 ? 'marcada' : 'marcadas'}
          </span>
          <button
            type="button"
            className="primary"
            onClick={() => void run((c) => setDecisionMany(c, selected, 'pseudonymize'))}
          >
            Pseudonimizar marcadas
          </button>
          <button
            type="button"
            onClick={() => void run((c) => setDecisionMany(c, selected, 'keep'))}
          >
            Manter marcadas (autoridade)
          </button>
          <button type="button" onClick={() => void run((c) => confirm(c, selected))}>
            Confirmar marcadas
          </button>
          <button
            type="button"
            disabled={!canMerge}
            title={canMerge ? undefined : 'Marque duas ou mais entidades do mesmo tipo'}
            onClick={() => {
              void run((c) => merge(c, selected));
              setSelected(() => []);
            }}
          >
            Mesclar na primeira
          </button>
          <button type="button" onClick={() => setSelected(() => [])}>
            Desmarcar
          </button>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {groups.length === 0 && (
        <div className="empty-state">
          <p>{onlyPending ? 'Nenhuma entidade pendente.' : 'Nenhuma entidade encontrada.'}</p>
        </div>
      )}

      {(['people', 'documents', 'suggestions'] as const).map((block) => {
        const blockGroups = groups.filter((g) => g.block === block);
        if (!blockGroups.length) return null;
        const top = blockGroups.filter((g) => !g.parent);
        const authorities = blockGroups.filter((g) => g.parent === AUTHORITIES);
        const authorityIds = authorities.flatMap((g) => g.entities.map((e) => e.id));
        return (
          <section
            key={block}
            className={`entity-block block-${block}`}
            aria-label={BLOCK_TITLES[block]}
          >
            <h2 className="block-title">
              {BLOCK_TITLES[block]}{' '}
              <span className="meta">
                ({blockGroups.reduce((n, g) => n + g.entities.length, 0)})
              </span>
            </h2>
            {block === 'suggestions' && (
              <p className="hint">
                Palavras capitalizadas que podem ser nomes, mas sem rótulo, gatilho ou prenome
                conhecido. Não são substituídas. Abra uma delas para aplicar ou descartar.
              </p>
            )}
            {top.map((group) => (
              <EntityGroup key={group.key} {...groupProps(group)} />
            ))}
            {authorities.length > 0 && (
              <section className="entity-group authorities" aria-label="Autoridades">
                <header className="group-head">
                  <SelectAll
                    ids={authorityIds}
                    selected={selected}
                    setSelected={setSelected}
                    label="Marcar todos: Autoridades"
                  />
                  <h3>
                    <button
                      type="button"
                      className="collapse-toggle"
                      aria-expanded={!collapsed.has(AUTHORITIES)}
                      onClick={() => toggle(AUTHORITIES)}
                    >
                      Autoridades ({authorityIds.length}){' '}
                      <span aria-hidden="true">{collapsed.has(AUTHORITIES) ? '▸' : '▾'}</span>
                    </button>
                  </h3>
                </header>
                {!collapsed.has(AUTHORITIES) && (
                  <div className="subgroups">
                    {authorities.map((group) => (
                      <EntityGroup key={group.key} {...groupProps(group)} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** "Marcar todos" com estado parcial (algumas marcadas). */
function SelectAll({
  ids,
  selected,
  setSelected,
  label,
}: {
  ids: readonly string[];
  selected: readonly string[];
  setSelected: (fn: (s: string[]) => string[]) => void;
  label: string;
}) {
  const marked = ids.filter((id) => selected.includes(id)).length;
  const all = ids.length > 0 && marked === ids.length;
  return (
    <label className="checkbox select-all">
      <input
        type="checkbox"
        aria-label={label}
        checked={all}
        disabled={!ids.length}
        ref={(el) => {
          if (el) el.indeterminate = marked > 0 && !all;
        }}
        onChange={() =>
          setSelected((s) =>
            all ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])],
          )
        }
      />
      <span className="select-all-text">{label.startsWith('Marcar todos:') ? 'Todos' : label}</span>
    </label>
  );
}

function FirstContext({ entity, data }: { entity: StoredEntity; data: ReviewData }) {
  const key = data.stats.get(entity.id)?.pages[0];
  const page = key ? data.byKey.get(key) : undefined;
  const hit = key ? data.located.get(key)?.find((l) => l.entityId === entity.id) : undefined;
  if (!page || !hit) return null;
  const { before, hit: text, after } = contextAround(page.text, hit.start, hit.end);
  return (
    <span className="row-context">
      …{before} <mark className="snippet-hit">{text}</mark> {after}…
    </span>
  );
}

interface GroupProps {
  group: Group;
  content: VaultContent;
  data: ReviewData;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  selected: string[];
  setSelected: (fn: (s: string[]) => string[]) => void;
  exclusions: readonly string[];
  collapsed: boolean;
  onToggle: () => void;
  onConfirm: (ids: string[]) => void;
  onShowInText: (pageKey: string, entityId: string) => void;
}

function EntityGroup({
  group,
  content,
  data,
  openId,
  setOpenId,
  selected,
  setSelected,
  exclusions,
  collapsed,
  onToggle,
  onConfirm,
  onShowInText,
}: GroupProps) {
  const pending = group.entities.filter((e) => !e.reviewed);
  return (
    <section className="entity-group" aria-label={group.title}>
      <header className="group-head">
        <SelectAll
          ids={group.entities.map((e) => e.id)}
          selected={selected}
          setSelected={setSelected}
          label={`Marcar todos: ${group.title}`}
        />
        <h3>
          <button
            type="button"
            className="collapse-toggle"
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {group.title} ({group.entities.length}){' '}
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          </button>
        </h3>
        {pending.length > 0 && (
          <button type="button" onClick={() => onConfirm(pending.map((e) => e.id))}>
            Confirmar sugestões ({pending.length})
          </button>
        )}
      </header>
      {!collapsed && (
        <ul className="entity-rows">
          {group.entities.map((e) => {
            const stats = data.stats.get(e.id);
            const open = openId === e.id;
            const label = e.suggested
              ? 'não aplicada'
              : e.decision === 'pseudonymize'
                ? labelOf(e, data.byId)
                : 'mantido';
            const warnings = entityWarnings(e, exclusions);
            const others = e.variants.filter((v) => v !== e.canonical);
            return (
              <li key={e.id} className={`entity-row${open ? ' open' : ''}`}>
                <div className="row-main">
                  <input
                    type="checkbox"
                    aria-label={`Selecionar ${e.canonical} para mesclar`}
                    checked={selected.includes(e.id)}
                    onChange={(ev) =>
                      setSelected((s) =>
                        ev.target.checked ? [...s, e.id] : s.filter((x) => x !== e.id),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="row-button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    <span className={`chip ${highlightClass(e)}`}>{label}</span>
                    <span className="row-text">
                      <strong>{e.canonical}</strong>
                      <span className="meta">
                        {e.position ? `${e.position} · ` : ''}
                        {e.relation || e.relatedTo
                          ? `${e.relation ?? ''}${
                              e.relatedTo && data.labelFor(e.relatedTo)
                                ? ` de ${data.labelFor(e.relatedTo)}`
                                : ''
                            } · `
                          : ''}
                        {stats?.count ?? 0} ocorr.
                        {stats?.folhas.length ? ` · fls. ${formatFolhas(stats.folhas)}` : ''}
                        {others.length
                          ? ` · também: ${others.slice(0, 3).join('; ')}${others.length > 3 ? '…' : ''}`
                          : ''}
                      </span>
                      {e.type === 'PESSOA' && <FirstContext entity={e} data={data} />}
                    </span>
                    <span className="row-badges">
                      {warnings.map((w) => (
                        <span key={w} className="badge warn" title={WARNING_TEXT[w]}>
                          {WARNING_BADGE[w]}
                        </span>
                      ))}
                      {e.suggested ? null : e.reviewed ? (
                        <span className="badge ok">revisada</span>
                      ) : (
                        <span className="badge pending">pendente</span>
                      )}
                    </span>
                  </button>
                </div>
                {open && (
                  <EntityDetail
                    key={e.id}
                    entity={e}
                    content={content}
                    data={data}
                    onShowInText={(key) => onShowInText(key, e.id)}
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
