(function (scope) {
  'use strict';

  const sessionKey = 'north12b_password_session_v1';
  const cacheKey = 'north12b.conversion-report.v1';
  const storeName = 'reports';
  const encode = new TextEncoder();

  function currentLease() {
    try {
      if (!scope.frameElement?.closest('#panel-conversion') ||
          !scope.parent.DashboardB?.active() || scope.parent.PortalLogout?.isLocked()) return null;
      const proof = JSON.parse(scope.sessionStorage.getItem(sessionKey));
      const expiresAt = proof?.battleExpiresAt || proof?.expiresAt;
      if (!proof?.token || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return null;
      return { expiresAt, binding: JSON.stringify([proof.owner, proof.token, proof.deviceId, proof.logoutEpoch, expiresAt]) };
    } catch {
      return null;
    }
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = scope.indexedDB.open(cacheKey, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' }).createIndex('expiresAt', 'expiresAt');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
        const expired = store.index('expiresAt').openKeyCursor(IDBKeyRange.upperBound(Date.now()));
        expired.onsuccess = () => {
          const cursor = expired.result;
          if (!cursor) return;
          store.delete(cursor.primaryKey);
          cursor.continue();
        };
        resolve(db);
      };
    });
  }

  function open() {
    const lease = currentLease();
    if (!lease) return null;
    const storage = scope.sessionStorage;
    const subtle = scope.crypto.subtle;
    const valid = () => currentLease()?.binding === lease.binding;
    let database, key;

    function sessionKeyMaterial() {
      // Once the login proof is cleared, a residual browser record is unreadable.
      return key ??= subtle.digest('SHA-256', encode.encode(cacheKey + lease.binding))
        .then(bytes => subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']));
    }

    async function transaction(mode, operation) {
      const db = await (database ??= openDatabase());
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = operation(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    }

    function forget(id) {
      if (storage.getItem(cacheKey) === id) storage.removeItem(cacheKey);
      return transaction('readwrite', store => store.delete(id)).catch(() => {});
    }

    return {
      valid,
      async read() {
        const id = storage.getItem(cacheKey);
        if (!id || !valid()) return null;
        const record = await transaction('readonly', store => store.get(id));
        try {
          if (record?.expiresAt !== lease.expiresAt) throw Error('CONVERSION_CACHE_EXPIRED');
          const plain = await subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, await sessionKeyMaterial(), record.data);
          if (!valid() || storage.getItem(cacheKey) !== id) return null;
          const value = JSON.parse(new TextDecoder().decode(plain));
          if (!/^[a-f\d]{12}$/.test(value.batch) || !Array.isArray(value.history)) throw Error('CONVERSION_CACHE_INVALID');
          return { batch: value.batch, history: new Map(value.history) };
        } catch {
          await forget(id);
          return null;
        }
      },
      async save(history, batch, isCurrent) {
        const previous = storage.getItem(cacheKey);
        const id = scope.crypto.randomUUID();
        const iv = scope.crypto.getRandomValues(new Uint8Array(12));
        const plain = encode.encode(JSON.stringify({ history: [...history], batch }));
        const data = await subtle.encrypt({ name: 'AES-GCM', iv }, await sessionKeyMaterial(), plain);
        if (!isCurrent()) return;
        await transaction('readwrite', store => store.put({ id, expiresAt: lease.expiresAt, iv, data }));
        try {
          if (isCurrent()) storage.setItem(cacheKey, id);
        } finally {
          // Switch the tab's reference only after the new database write commits.
          const stale = storage.getItem(cacheKey) === id ? previous : id;
          if (stale) void forget(stale);
        }
      },
      async clear() {
        const id = storage.getItem(cacheKey);
        if (id) await forget(id);
      }
    };
  }

  scope.North12OfficerSession = { open };
})(window);
