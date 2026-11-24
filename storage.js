const database =
  "planning-mmf-static:" + new URL("./", import.meta.url).pathname;
const bucket = "state";
let handle;

function open() {
  if (!handle) {
    handle = new Promise((resolve, reject) => {
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(bucket);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      handle = undefined;
      throw error;
    });
  }
  return handle;
}

export async function readWorkspace() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(bucket).objectStore(bucket).get("workspace");
    request.onsuccess = () =>
      resolve(request.result ?? { revision: 0, data: {} });
    request.onerror = () => reject(request.error);
  });
}

export async function writeWorkspace(revision, data) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(bucket, "readwrite");
    const store = transaction.objectStore(bucket);
    const current = store.get("workspace");
    let stale = false;
    current.onsuccess = () => {
      stale = (current.result?.revision ?? 0) !== revision;
      if (stale) transaction.abort();
      else store.put({ revision: revision + 1, data }, "workspace");
    };
    transaction.oncomplete = () => resolve(revision + 1);
    transaction.onabort = () => {
      if (stale) reject(new Error("conflict"));
      else reject(transaction.error ?? new Error("Guardado interrumpido"));
    };
  });
}
