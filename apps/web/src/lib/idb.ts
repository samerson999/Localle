// Armazenamento local grande (amostras de telemetria) no IndexedDB do navegador
const DB = 'rastreio-white-label', STORE = 'kv';
function open(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
export async function idbGet<T = any>(key: string): Promise<T | undefined> { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE).objectStore(STORE).get(key); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); }
export async function idbSet(key: string, value: any) { const db = await open(); return new Promise<void>((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(value, key); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
