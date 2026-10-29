import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Indicador informativo: o app funciona igual com ou sem rede. */
export function OnlineStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <span
      className={`badge ${online ? 'online' : 'offline'}`}
      title="O app não envia dados pela rede"
    >
      {online ? 'Conectado · nada é enviado' : 'Sem internet · funcionando offline'}
    </span>
  );
}
