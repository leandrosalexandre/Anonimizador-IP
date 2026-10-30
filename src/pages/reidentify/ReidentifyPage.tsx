// Tela Reidentificar (SPEC Fase 7): cola-se a análise da IA; o app troca os marcadores pelos
// valores reais e relata os marcadores desconhecidos.
import { useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { RequireVault } from '../../components/RequireVault';
import { reidentify, type ReidentifyFormat } from '../../reidentify/reidentify';
import { copyText } from '../../utils/clipboard';
import { downloadFile } from '../../utils/download';
import { userMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { updateVaultContent, useSession } from '../../vault/session';
import type { StoredAnalysis, VaultContent } from '../../vault/types';

const MAX_INPUT = 2_000_000;

function History({
  analyses,
  onOpen,
}: {
  analyses: StoredAnalysis[];
  onOpen: (a: StoredAnalysis) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  if (!analyses.length) return null;
  async function remove(id: string) {
    try {
      await updateVaultContent((c) => ({
        ...c,
        analyses: (c.analyses ?? []).filter((a) => a.id !== id),
      }));
    } catch (e) {
      setError(userMessage(e));
    }
  }
  return (
    <div className="panel no-print">
      <h2>Análises salvas neste cofre</h2>
      <ul className="part-list">
        {analyses.map((a) => (
          <li key={a.id}>
            <span>
              <strong>{a.title}</strong> <span className="meta">{formatDateTime(a.createdAt)}</span>
            </span>
            <div className="actions">
              <button type="button" onClick={() => onOpen(a)}>
                Abrir
              </button>
              <button type="button" className="danger-outline" onClick={() => void remove(a.id)}>
                Apagar
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ReidentifyView({ content }: { content: VaultContent }) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [format, setFormat] = useState<ReidentifyFormat>('name');
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () => (input.trim() ? reidentify(input, content.entities, format) : null),
    [input, content.entities, format],
  );
  const pseudonymized = content.entities.some((e) => e.decision === 'pseudonymize');

  async function loadFile(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_INPUT * 2) return setError('Arquivo grande demais.');
    setInput((await file.text()).slice(0, MAX_INPUT));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function save() {
    setError(null);
    const entry: StoredAnalysis = {
      id: crypto.randomUUID(),
      title: title.trim() || `Análise de ${formatDateTime(new Date().toISOString())}`,
      createdAt: new Date().toISOString(),
      text: input,
    };
    try {
      await updateVaultContent((c) => ({ ...c, analyses: [entry, ...(c.analyses ?? [])] }));
      setTitle('');
      setMessage('Análise salva no cofre (cifrada).');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  async function copy() {
    if (!result) return;
    try {
      await copyText(result.text);
      setMessage(
        'Texto reidentificado copiado. Ele contém nomes reais: cole apenas em documentos internos.',
      );
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setConfirmCopy(false);
    }
  }

  return (
    <>
      {!pseudonymized && (
        <p className="notice warn no-print">
          Este cofre ainda não tem entidades revisadas: não há marcadores para reidentificar.
        </p>
      )}
      <div className="panel no-print">
        <label htmlFor={`${id}-input`}>Análise devolvida pela IA</label>
        <textarea
          id={`${id}-input`}
          className="analysis-input"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
          placeholder="Cole aqui o texto da IA, com os marcadores [VÍTIMA 1], [AUTOR 1]…"
          spellCheck={false}
        />
        <div className="toolbar">
          <label htmlFor={`${id}-file`} className="button-like">
            Importar .txt ou .md
          </label>
          <input
            ref={fileRef}
            id={`${id}-file`}
            className="visually-hidden"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(e) => void loadFile(e)}
          />
          {input && (
            <button type="button" onClick={() => setInput('')}>
              Limpar
            </button>
          )}
        </div>
        <fieldset className="format-choice">
          <legend>Formato</legend>
          <label className="checkbox">
            <input
              type="radio"
              name={`${id}-fmt`}
              checked={format === 'name'}
              onChange={() => setFormat('name')}
            />
            Só o nome (Maria da Silva)
          </label>
          <label className="checkbox">
            <input
              type="radio"
              name={`${id}-fmt`}
              checked={format === 'nameRole'}
              onChange={() => setFormat('nameRole')}
            />
            Nome com papel (Maria da Silva (vítima))
          </label>
        </fieldset>
      </div>

      {result && (
        <>
          <div className="panel no-print" aria-label="Relatório de reidentificação">
            <h2>Relatório</h2>
            <p>
              <strong>{result.report.replaced.reduce((n, r) => n + r.count, 0)}</strong>{' '}
              substituições de <strong>{result.report.replaced.length}</strong> marcadores.
            </p>
            {result.report.unknown.length > 0 ? (
              <div className="notice warn" role="alert">
                <div>
                  <p>
                    <strong>Marcadores desconhecidos</strong> (não existem neste cofre; a IA pode
                    tê-los inventado). Verifique no texto, em vermelho:
                  </p>
                  <ul className="unknown-list">
                    {result.report.unknown.map((u) => (
                      <li key={u.text}>
                        <code>{u.text}</code> — {u.count}×
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="notice info">Nenhum marcador desconhecido.</p>
            )}
            {result.report.replaced.length > 0 && (
              <details>
                <summary>Ver marcadores substituídos</summary>
                <ul className="replaced-list">
                  {result.report.replaced.map((r) => (
                    <li key={r.label}>
                      <code>{r.label}</code> → {r.value} ({r.count}×)
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <div className="panel no-print">
            <div className="actions">
              <button type="button" className="primary" onClick={() => setConfirmCopy(true)}>
                Copiar
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile('analise-reidentificada.txt', result.text, 'text/plain')
                }
              >
                Baixar .txt
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile('analise-reidentificada.md', result.text, 'text/markdown')
                }
              >
                Baixar .md
              </button>
              <button type="button" onClick={() => window.print()}>
                Imprimir ou salvar em PDF
              </button>
            </div>
            {confirmCopy && (
              <div className="panel danger" role="alertdialog" aria-label="Aviso de cópia">
                <p>
                  <strong>Atenção:</strong> o texto reidentificado contém nomes e dados reais. Não o
                  cole em nenhuma IA ou serviço externo.
                </p>
                <div className="actions">
                  <button type="button" onClick={() => setConfirmCopy(false)}>
                    Cancelar
                  </button>
                  <button type="button" className="danger" onClick={() => void copy()}>
                    Entendi, copiar
                  </button>
                </div>
              </div>
            )}
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label htmlFor={`${id}-title`}>Guardar a análise no cofre</label>
              <input
                id={`${id}-title`}
                className="wide"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título (sem nomes de pessoas)"
              />
              <button type="submit">Salvar no cofre</button>
            </form>
            {message && (
              <p className="notice info" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
          </div>

          <article className="panel print-area" aria-label="Análise reidentificada">
            <h2 className="print-only">Análise reidentificada</h2>
            <div className="reid-result">
              {result.segments.map((s, i) =>
                s.kind === 'plain' ? (
                  s.text
                ) : s.kind === 'replaced' ? (
                  <mark key={i} className="reid-ok" title={`Era: ${s.original ?? ''}`}>
                    {s.text}
                  </mark>
                ) : (
                  <mark key={i} className="reid-unknown" title="Marcador desconhecido">
                    {s.text}
                  </mark>
                ),
              )}
            </div>
          </article>
        </>
      )}

      {error && !result && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <History analyses={content.analyses ?? []} onOpen={(a) => setInput(a.text)} />
    </>
  );
}

export function ReidentifyPage() {
  const session = useSession();
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina" className="no-print">
        Reidentificar
      </h1>
      <p className="summary no-print">
        Cole a análise devolvida pela IA para trocar os marcadores pelos nomes e dados reais. Isso
        acontece só neste aparelho.
      </p>
      <RequireVault>
        {session.status === 'unlocked' && <ReidentifyView content={session.vault.content} />}
      </RequireVault>
    </section>
  );
}
