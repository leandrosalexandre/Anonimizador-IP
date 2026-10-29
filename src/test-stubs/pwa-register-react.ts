// Substitui o módulo virtual do vite-plugin-pwa nos testes unitários.
export function useRegisterSW() {
  const noop = () => undefined;
  return {
    needRefresh: [false, noop] as const,
    offlineReady: [false, noop] as const,
    updateServiceWorker: () => Promise.resolve(),
  };
}
