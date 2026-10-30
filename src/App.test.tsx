import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';
import { ROUTES } from './routes';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('navegação', () => {
  it('segue a ordem do fluxo definida no SPEC', () => {
    expect(ROUTES.map((r) => r.label)).toEqual([
      'Cofres',
      'Documentos',
      'Revisão',
      'Exportar',
      'Reidentificar',
      'Configurações',
    ]);
  });

  it('mostra um link para cada etapa', () => {
    renderAt('/cofres');
    const nav = screen.getByRole('navigation', { name: 'Etapas' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(ROUTES.map((r, i) => `${i + 1}${r.label}`));
  });

  it('abre em Cofres a partir da raiz', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Cofres');
  });

  it.each(ROUTES)('renderiza a tela $label', (route) => {
    renderAt(route.path);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(route.label);
  });

  it('mostra aviso para rota inexistente', () => {
    renderAt('/nao-existe');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Página não encontrada');
  });
});
