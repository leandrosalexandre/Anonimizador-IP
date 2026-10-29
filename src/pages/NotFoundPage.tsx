import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Página não encontrada</h1>
      <p>
        <Link to="/cofres">Voltar para os cofres</Link>
      </p>
    </section>
  );
}
