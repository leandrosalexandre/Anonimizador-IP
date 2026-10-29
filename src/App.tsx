import { Navigate, NavLink, Route, Routes } from 'react-router';
import { ROUTES } from './routes';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { OnlineStatus } from './pwa/OnlineStatus';

export function App() {
  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <div className="app-title">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Anonimizador de IP</span>
        </div>
        <OnlineStatus />
      </header>
      <nav className="app-nav" aria-label="Etapas">
        <ol>
          {ROUTES.map((route, index) => (
            <li key={route.path}>
              <NavLink to={route.path}>
                <span className="step" aria-hidden="true">
                  {index + 1}
                </span>
                {route.label}
              </NavLink>
            </li>
          ))}
        </ol>
      </nav>
      <main id="conteudo" className="app-main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Navigate to="/cofres" replace />} />
          {ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={<PlaceholderPage route={route} />} />
          ))}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <UpdatePrompt />
    </div>
  );
}
