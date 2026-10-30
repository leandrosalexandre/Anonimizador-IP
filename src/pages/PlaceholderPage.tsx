import type { ReactNode } from 'react';
import type { AppRoute } from '../routes';

interface Props {
  route: AppRoute;
  children?: ReactNode;
}

/** Tela provisória; cada fase substitui a sua. */
export function PlaceholderPage({ route, children }: Props) {
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">{route.label}</h1>
      <p className="summary">{route.summary}</p>
      {children}
    </section>
  );
}
