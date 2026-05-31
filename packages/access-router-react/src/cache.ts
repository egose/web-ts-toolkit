type CacheListener = () => void;

export class ModelCache {
  private data = new Map<string, unknown>();
  private listeners = new Set<CacheListener>();

  get<T>(key: string): T | undefined {
    return this.data.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.data.set(key, value);
    this.notify();
  }

  delete(key: string): void {
    if (this.data.delete(key)) {
      this.notify();
    }
  }

  clear(): void {
    if (this.data.size > 0) {
      this.data.clear();
      this.notify();
    }
  }

  subscribe(cb: CacheListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const globalCache = new ModelCache();
