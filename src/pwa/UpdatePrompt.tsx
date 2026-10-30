import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useSession } from '../vault/session';

/** Avisa quando há nova versão do app ou quando ele já está pronto para uso offline. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  // Ao reabrir o app com uma versão nova baixada e nenhum cofre aberto, atualiza sozinho (nada
  // a perder). Com um cofre aberto, pergunta antes, para não interromper o trabalho.
  const session = useSession();
  const locked = session.status !== 'unlocked';
  useEffect(() => {
    if (needRefresh && locked) void updateServiceWorker(true);
  }, [needRefresh, locked, updateServiceWorker]);

  // O aviso de "pronto para offline" é só informativo: some sozinho.
  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <p>Há uma nova versão do app disponível.</p>
          <div className="toast-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void updateServiceWorker(true)}
            >
              Atualizar agora
            </button>
            <button type="button" onClick={() => setNeedRefresh(false)}>
              Depois
            </button>
          </div>
        </>
      ) : (
        <>
          <p>Pronto para uso sem internet.</p>
          <div className="toast-actions">
            <button type="button" onClick={() => setOfflineReady(false)}>
              Fechar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
