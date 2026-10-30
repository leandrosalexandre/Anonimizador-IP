import { useMemo, useState } from 'react';
import { PERSON_ROLES } from '../../detectors/types';
import { TYPE_TITLE, labelOf, normalizeRole } from '../../review/labels';
import { confirm, merge } from '../../review/model';
import { formatFolhas, type ReviewData } from '../../review/useReviewData';
import { fold } from '../../detectors/text';
import { userMessage } from '../../utils/errors';
import type { StoredEntity, VaultContent } from '../../vault/types';
import { apply, highlightClass } from './common';
import { EntityDetail } from './EntityDetail';

interface Group {
  key: string;
  title: string;
  entities: StoredEntity[];
}

const ROLE_TITLES: Record<string, string> = {
  VÍTIMA: 'Vítimas',
  AUTOR: 'Autores',
  INVESTIGADO: 'Investigados',
  CONDUZIDO: 'Conduzidos',
  TESTEMUNHA: 'Testemunhas',
  INFORMANTE: 'Informantes',
  COMUNICANTE: 'Comunicantes',
  ADVOGADO: 'Advogados',
  FAMILIAR: 'Familiares',
  PESSOA: 'Terceiros',
};

function groupEntities(entities: readonly StoredEntity[]): Group[] {
  const groups = new Map<string, Group>();
  const add = (key: string, title: string, e: StoredEntity) => {
    const g = groups.get(key) ?? { key, title, entities: [] };
    g.entities.push(e);
    groups.set(key, g);
  };
  for (const e of entities) {
    if (e.type === 'PESSOA') {
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
    if (key === 'PESSOA:?') return -1;
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

      {groups.map((group) => {
        const pending = group.entities.filter((e) => !e.reviewed);
        return (
          <section key={group.key} className="entity-group" aria-label={group.title}>
            <header className="group-head">
              <h2>
                {group.title} <span className="meta">({group.entities.length})</span>
              </h2>
              {pending.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    void run((c) =>
                      confirm(
                        c,
                        pending.map((e) => e.id),
                      ),
                    )
                  }
                >
                  Confirmar sugestões ({pending.length})
                </button>
              )}
            </header>
            <ul className="entity-rows">
              {group.entities.map((e) => {
                const stats = data.stats.get(e.id);
                const open = openId === e.id;
                const label = e.decision === 'pseudonymize' ? labelOf(e, data.byId) : 'mantido';
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
                            {e.variants.length > 1 ? ` · ${e.variants.length} variantes` : ''}
                          </span>
                        </span>
                        <span className="row-badges">
                          {e.ambiguousWith.length > 0 && (
                            <span className="badge warn">ambígua</span>
                          )}
                          {e.reviewed ? (
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
      })}
    </div>
  );
}
