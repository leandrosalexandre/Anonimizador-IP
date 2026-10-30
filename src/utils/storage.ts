/** Pede ao navegador para não apagar os dados do app quando faltar espaço. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Sem suporte: os dados continuam gravados, apenas sem a garantia extra.
  }
}
