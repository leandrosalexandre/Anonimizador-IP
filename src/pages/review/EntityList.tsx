import { useMemo, useState, useSyncExternalStore } from 'react';
import { PERSON_ROLES } from '../../detectors/types';
import { TYPE_TITLE, labelOf, normalizeRole } from '../../review/labels';
import { confirm, merge, pseudonymizeAllPeople } from '../../review/model';
import { formatFolhas, type ReviewData } from '../../review/useReviewData';
import { WARNING_BADGE, WARNING_TEXT, contextAround, entityWarnings } from '../../review/warnings';
import { fold } from '../../detectors/text';
import { getSettings, subscribeSettings } from '../../settings/settings';
import { userMessage } from '../../utils/errors';
import type { StoredEntity, VaultContent } from '../../vault/types';
import { apply, highlightClass } from './common';
import { EntityDetail } from './EntityDetail';

type Block = 'people' | 'documents' | 'suggestions';

interface Group {
  key: string;
  title: string;
  block: Block;
  entities: StoredEntity[];
}

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
  PERITO: 'Peritos',
  FAMILIAR: 'Familiares',
  PESSOA: 'Terceiros',
};

function groupEntities(entities: readonly StoredEntity[]): Group[] {
  const groups = new Map<string, Group>();
  const add = (key: string, title: string, e: StoredEntity) => {
    const g = groups.get(key) ?? { key, title, block: blockOf(e), entities: [] };
    g.entities.push(e);
    groups.set(key, g);
  };
  for (const e of entities) {
    if (e.suggested) add('SUGESTAO', 'Possíveis nomes sem sinal forte', e);
    else if (e.type === 'APELIDO') add('APELIDO', TYPE_TITLE.APELIDO, e);
    else if (e.type === 'CIDADE')
      add('CIDADE', `${TYPE_TITLE.CIDADE}${e.decision === 'keep' ? ' (em claro)' : ''}`, e);
    else if (e.type === 'PESSOA') {
      if (e.decision === 'keep')
        add('PESSOA:KEEP', 'Pessoas mantidas (autoridades e servidores)', e);
      else if (!e.role) add('PESSOA:?', 'Pessoas sem papel definido', e);
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
    if (key.startsWith('PESSOA:')) {
      const i = PERSON_ROLES.indexOf(key.slice(7) as (typeof PERSON_ROLES)[number]);
      return key === 'PESSOA:KEEP' ? 50 : i >= 0 ? i : 40;
    }
    return 100;
  };
  return [...groups.values()].sort((a, b) => order(a.key) - order(b.key));
}

interface Props {
  content: VaultContent;
  data: ReviewData;
  onShowInText: (pageKey: string, entityId: string) => void;
}

export function EntityList({ content, data, onShowInText }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [keepAuthorities, setKeepAuthorities] = useState(true);

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
          <button
            type="button"
            className="primary"
            onClick={() =>
              void run((c) => pseudonymizeAllPeople(c, { includeKept: !keepAuthorities }))
            }
          >
            Pseudonimizar todas as pessoas
          </button>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={keepAuthorities}
              onChange={(e) => setKeepAuthorities(e.target.checked)}
            />
            Manter as autoridades em claro (Delegado, Escrivão, Perito…)
          </label>
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

      {selected.length > 0 && (
        <div className="merge-bar" role="region" aria-label="Seleção">
          <span>
            {selected.length} {selected.length === 1 ? 'selecionada' : 'selecionadas'}
            {!canMerge &&
              selected.length >= 2 &&
              ' (só é possível mesclar entidades do mesmo tipo)'}
          </span>
          <button
            type="button"
            className="primary"
            disabled={!canMerge}
            onClick={() => {
              void run((c) => merge(c, selected));
              setSelected([]);
            }}
          >
            Mesclar na primeira
          </button>
          <button type="button" onClick={() => setSelected([])}>
            Limpar seleção
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
            {blockGroups.map((group) => (
              <EntityGroup
                key={group.key}
                group={group}
                content={content}
                data={data}
                openId={openId}
                setOpenId={setOpenId}
                selected={selected}
                setSelected={setSelected}
                exclusions={settings.detectionExclusions}
                onConfirm={(ids) => void run((c) => confirm(c, ids))}
                onShowInText={onShowInText}
              />
            ))}
          </section>
        );
      })}
    </div>
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
  onConfirm,
  onShowInText,
}: GroupProps) {
  const pending = group.entities.filter((e) => !e.reviewed);
  return (
    <section className="entity-group" aria-label={group.title}>
      <header className="group-head">
        <h3>
          {group.title} <span className="meta">({group.entities.length})</span>
        </h3>
        {pending.length > 0 && (
          <button type="button" onClick={() => onConfirm(pending.map((e) => e.id))}>
            Confirmar sugestões ({pending.length})
          </button>
        )}
      </header>
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
    </section>
  );
}
