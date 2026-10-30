import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import { ROUTES, type AppRoute } from './routes';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';
import { VaultsPage } from './pages/vaults/VaultsPage';
import { DocumentsPage } from './pages/documents/DocumentsPage';
import { PageReviewPage } from './pages/documents/PageReviewPage';
import { ReviewPage } from './pages/review/ReviewPage';
import { ExportPage } from './pages/export/ExportPage';
import { ReidentifyPage } from './pages/reidentify/ReidentifyPage';
import { AutoLockController } from './components/AutoLockController';
import { RequireVault } from './components/RequireVault';
import { VaultStatus } from './components/VaultStatus';
import { UpdatePrompt } from './pwa/UpdatePrompt';
import { OnlineStatus } from './pwa/OnlineStatus';

function pageFor(route: AppRoute): ReactNode {
  switch (route.path) {
    case '/cofres':
      return <VaultsPage />;
    case '/documentos':
      return <DocumentsPage />;
    case '/revisao':
      return <ReviewPage />;
    case '/exportar':
      return <ExportPage />;
    case '/reidentificar':
      return <ReidentifyPage />;
    case '/configuracoes':
      return <SettingsPage />;
    default:
      return (
        <PlaceholderPage route={route}>
          <RequireVault>
            <div className="empty-state">
              <p>Esta etapa ainda está em construção.</p>
            </div>
          </RequireVault>
        </PlaceholderPage>
      );
  }
}

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
        <div className="header-status">
          <VaultStatus />
          <OnlineStatus />
        </div>
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
            <Route key={route.path} path={route.path} element={pageFor(route)} />
          ))}
          <Route path="/conferencia/:docId/:pdfPage" element={<PageReviewPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <AutoLockController />
      <UpdatePrompt />
    </div>
  );
}
