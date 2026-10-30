import { useEffect, useRef, useState } from 'react';
import { readBlob } from '../vault/repository';
import { getSession, useSession } from '../vault/session';

/** Miniatura decifrada sob demanda, quando aparece na tela. O URL é revogado ao desmontar. */
export function Thumbnail({ blobId, alt }: { blobId: string | null; alt: string }) {
  const session = useSession();
  // Depende só do id: regravar o conteúdo do cofre não deve decifrar tudo de novo.
  const vaultId = session.status === 'unlocked' ? session.vault.meta.id : null;
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const current = getSession();
    if (!visible || !blobId || !vaultId || current.status !== 'unlocked') return;
    const vault = current.vault;
    let objectUrl: string | null = null;
    let cancelled = false;
    readBlob(vault, blobId).then(
      (bytes) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
        setUrl(objectUrl);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, blobId, vaultId]);

  return (
    <div className="thumb" ref={ref}>
      {url && blobId ? <img src={url} alt={alt} /> : <span aria-hidden="true">PDF</span>}
    </div>
  );
}
