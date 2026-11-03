// ブラウザの保存先 (sessionStorage・localStorage) の最小の形。読み書きが失敗しても (プライベートモードなど) 遊べるよう、例外を外に出さない。
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function safeGet(store: KeyValueStore, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** 書けたら true。 */
export function safeSet(store: KeyValueStore, key: string, value: string): boolean {
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(store: KeyValueStore, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // 保存先が使えないときは、消すものも無い
  }
}
