// Texto das páginas com destaques coloridos por papel. Tocar num destaque abre a entidade;
// selecionar um trecho permite marcá-lo como nova entidade. Pré-visualização lado a lado:
// original × pseudonimizado.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ENTITY_TYPES, type EntityType } from '../../detectors/types';
import { TYPE_LABEL, labelOf } from '../../review/labels';
import { substitute } from '../../review/locate';
import { addManual } from '../../review/model';
import type { ReviewData } from '../../review/useReviewData';
import { userMessage } from '../../utils/errors';
import type { VaultContent } from '../../vault/types';
import { apply, highlightClass, rolesFor } from './common';
import { EntityDetail } from './EntityDetail';

interface Props {
  content: VaultContent;
  data: ReviewData;
  pageKey: string | null;
  onPageChange: (key: string) => void;
  focusEntityId: string | null;
  onFocusEntity: (id: string | null) => void;
}

function HighlightedPage({
  text,
  data,
  pageKey,
  focusEntityId,
  onPick,
}: {
  text: string;
  data: ReviewData;
  pageKey: string;
  focusEntityId: string | null;
  onPick: (id: string) => void;
}) {
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const l of data.located.get(pageKey) ?? []) {
    if (l.start > pos) parts.push(text.slice(pos, l.start));
    const entity = data.byId.get(l.entityId);
    const label =
      entity && entity.decision === 'pseudonymize' ? labelOf(entity, data.byId) : 'mantido';
    parts.push(
      // <mark> (e não <button>) para que a seleção de texto atravesse os destaques.
      <mark
        key={l.start}
        role="button"
        tabIndex={0}
        className={`${highlightClass(entity)}${focusEntityId === l.entityId ? ' hl-focus' : ''}`}
        title={label}
        onClick={() => onPick(l.entityId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick(l.entityId);
          }
        }}
      >
        {l.text}
      </mark>,
    );
    pos = l.end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

/** Barra para marcar o trecho selecionado como entidade (seleção nativa, também no toque). */
function SelectionBar({
  content,
  selection,
  onDone,
}: {
  content: VaultContent;
  selection: string;
  onDone: (id: string | null) => void;
}) {
  const id = useId();
  const [type, setType] = useState<EntityType>('PESSOA');
  const [role, setRole] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      let createdId: string | null = null;
      await apply((c) => {
        const r = addManual(c, selection, type, {
          role: role || null,
          ...(target ? { addToId: target } : {}),
        });
        createdId = r.id;
        return r.content;
      });
      onDone(createdId);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const sameType = content.entities.filter((e) => e.type === type);
  return (
    <div className="selection-bar" role="dialog" aria-label="Marcar trecho selecionado">
      <p>
        Trecho selecionado: <strong>{selection}</strong>
      </p>
      <div className="inline-form">
        <label htmlFor={`${id}-type`}>Tipo</label>
        <select
          id={`${id}-type`}
          value={type}
          onChange={(e) => setType(e.target.value as EntityType)}
        >
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t].charAt(0) + TYPE_LABEL[t].slice(1).toLocaleLowerCase('pt-BR')}
            </option>
          ))}
        </select>
        <label htmlFor={`${id}-target`}>Como</label>
        <select id={`${id}-target`} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">nova entidade</option>
          {sameType.map((e) => (
            <option key={e.id} value={e.id}>
              variante de {e.canonical}
            </option>
          ))}
        </select>
        {type === 'PESSOA' && !target && (
          <>
            <label htmlFor={`${id}-role`}>Papel</label>
            <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">sem papel</option>
              {rolesFor(content)
                .filter((r) => r !== 'PESSOA')
                .map((r) => (
                  <option key={r} value={r}>
                    {r.charAt(0) + r.slice(1).toLocaleLowerCase('pt-BR')}
                  </option>
                ))}
            </select>
          </>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="button" onClick={() => onDone(null)}>
          Cancelar
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          Marcar
        </button>
      </div>
    </div>
  );
}

export function TextView({
  content,
  data,
  pageKey,
  onPageChange,
  focusEntityId,
  onFocusEntity,
}: Props) {
  const id = useId();
  const [sideBySide, setSideBySide] = useState(false);
  const [selection, setSelection] = useState('');
  const [marking, setMarking] = useState<string | null>(null);
  const textRef = useRef<HTMLPreElement>(null);
  const index = Math.max(
    0,
    data.pages.findIndex((p) => p.key === pageKey),
  );
  const page = data.pages[index];

  // Acompanha a seleção de texto dentro da página (mouse ou toque longo).
  useEffect(() => {
    const onChange = () => {
      const sel = document.getSelection();
      const el = textRef.current;
      if (!sel || sel.isCollapsed || !el || !sel.anchorNode || !el.contains(sel.anchorNode)) {
        setSelection('');
        return;
      }
      setSelection(sel.toString().trim());
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  const pseudonymized = useMemo(
    () => (page ? substitute(page.text, data.located.get(page.key) ?? [], data.labelFor) : ''),
    [page, data],
  );

  if (!page) return <p className="hint">Nenhuma página com texto.</p>;
  const focus = focusEntityId ? data.byId.get(focusEntityId) : undefined;

  return (
    <div className="text-view">
      <div className="toolbar page-picker">
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => onPageChange(data.pages[index - 1]?.key ?? page.key)}
        >
          ‹ Anterior
        </button>
        <label htmlFor={`${id}-page`} className="visually-hidden">
          Página
        </label>
        <select id={`${id}-page`} value={page.key} onChange={(e) => onPageChange(e.target.value)}>
          {data.pages.map((p) => (
            <option key={p.key} value={p.key}>
              {p.folha !== null ? `fls. ${p.folha}` : `PDF p. ${p.pdfPage}`}
              {content.documents.length > 1 ? ` — ${p.fileName}` : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={index >= data.pages.length - 1}
          onClick={() => onPageChange(data.pages[index + 1]?.key ?? page.key)}
        >
          Próxima ›
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={sideBySide}
            onChange={(e) => setSideBySide(e.target.checked)}
          />
          Original × pseudonimizado
        </label>
      </div>
      <p className="hint">
        Toque num destaque para abrir a entidade. Para marcar algo que a detecção perdeu, selecione
        o trecho no texto.
      </p>

      {focus && (
        <div className="panel focus-panel">
          <EntityDetail
            key={focus.id}
            entity={focus}
            content={content}
            data={data}
            onShowInText={onPageChange}
            onClose={() => onFocusEntity(null)}
          />
        </div>
      )}

      <div className={sideBySide ? 'compare-grid' : ''}>
        <div>
          {sideBySide && <h2 className="compare-title">Original</h2>}
          <pre
            ref={textRef}
            className="page-text review-text-body"
            aria-label="Texto original com destaques"
          >
            <HighlightedPage
              text={page.text}
              data={data}
              pageKey={page.key}
              focusEntityId={focusEntityId}
              onPick={onFocusEntity}
            />
          </pre>
        </div>
        {sideBySide && (
          <div>
            <h2 className="compare-title">Pseudonimizado</h2>
            <pre className="page-text" aria-label="Texto pseudonimizado">
              {pseudonymized}
            </pre>
          </div>
        )}
      </div>

      {selection && !marking && (
        <div className="floating-action">
          <button type="button" className="primary" onClick={() => setMarking(selection)}>
            Marcar seleção como dado pessoal
          </button>
        </div>
      )}
      {marking && (
        <SelectionBar
          content={content}
          selection={marking}
          onDone={(created) => {
            setMarking(null);
            document.getSelection()?.removeAllRanges();
            if (created) onFocusEntity(created);
          }}
        />
      )}
    </div>
  );
}
