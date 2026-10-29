import type { AppRoute } from '../routes';

interface Props {
  route: AppRoute;
}

/** Tela provisória da Fase 0; cada fase substitui a sua. */
export function PlaceholderPage({ route }: Props) {
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">{route.label}</h1>
      <p className="summary">{route.summary}</p>
      <div className="empty-state">
        <p>Esta etapa ainda está em construção.</p>
      </div>
    </section>
  );
}
