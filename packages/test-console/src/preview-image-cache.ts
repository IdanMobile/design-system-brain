const loaded = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

export function isPreviewImageCached(url: string): boolean {
  return loaded.has(url);
}

export function preloadPreviewImage(url: string): Promise<boolean> {
  if (loaded.has(url)) return Promise.resolve(true);
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      loaded.add(url);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url;
  }).finally(() => {
    inflight.delete(url);
  });

  inflight.set(url, promise);
  return promise;
}

export function preloadPreviewImages(urls: Iterable<string | null | undefined>): void {
  for (const url of urls) {
    if (url) void preloadPreviewImage(url);
  }
}
