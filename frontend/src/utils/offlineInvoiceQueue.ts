// Cola Offline Persistente en IndexedDB (VtOfflineSyncDB · 0 Pérdida sin Señal 4G/Wi-Fi)
// Permite que comercios y operadores tomen fotos y registren facturas completamente offline
// (almacenes, sótanos o cortes eléctricos/CANTV) y las sincroniza automáticamente al reconectar.

import { FiscalInvoice } from './seniatEngine';
import { safeApiRequest } from '../services/apiClient';

export interface QueuedOfflineInvoice {
  queueId: string;
  tenantId: string;
  invoice: FiscalInvoice;
  queuedAt: string;
  attempts: number;
}

const DB_NAME = 'VtOfflineSyncDB';
const DB_VERSION = 1;
const STORE_NAME = 'pending_invoices';

let flushingInProgress = false;

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'queueId' });
          store.createIndex('tenantId', 'tenantId', { unique: false });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGetAllItems(store: IDBObjectStore): Promise<QueuedOfflineInvoice[]> {
  return new Promise(resolve => {
    try {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as QueuedOfflineInvoice[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function idbPutItem(store: IDBObjectStore, item: QueuedOfflineInvoice): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function idbDeleteItem(store: IDBObjectStore, key: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function enqueueOfflineInvoice(tenantId: string, invoice: FiscalInvoice): Promise<boolean> {
  const db = await openOfflineDb();
  if (!db) return false;
  try {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const ok = await idbPutItem(store, {
      queueId: `${tenantId}::${invoice.id}`,
      tenantId,
      invoice,
      queuedAt: new Date().toISOString(),
      attempts: 0
    });
    return ok;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export async function getPendingOfflineCount(tenantId?: string): Promise<number> {
  const db = await openOfflineDb();
  if (!db) return 0;
  try {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const all = await idbGetAllItems(tx.objectStore(STORE_NAME));
    return tenantId ? all.filter(i => i.tenantId === tenantId).length : all.length;
  } catch {
    return 0;
  } finally {
    db.close();
  }
}

export async function flushOfflineInvoiceQueue(): Promise<{ synced: number; remaining: number }> {
  if (flushingInProgress) return { synced: 0, remaining: await getPendingOfflineCount() };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, remaining: await getPendingOfflineCount() };
  }
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('vt_auth_token') : null;
  if (!token) return { synced: 0, remaining: await getPendingOfflineCount() };

  flushingInProgress = true;
  const db = await openOfflineDb();
  if (!db) {
    flushingInProgress = false;
    return { synced: 0, remaining: 0 };
  }

  let synced = 0;
  try {
    const readTx = db.transaction([STORE_NAME], 'readonly');
    const items = await idbGetAllItems(readTx.objectStore(STORE_NAME));
    if (items.length === 0) return { synced: 0, remaining: 0 };

    // Orden cronológico de captura
    items.sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));

    for (const item of items) {
      const res = await safeApiRequest<{ ok: boolean }>('/api/invoices/client-upload', {
        method: 'POST',
        body: JSON.stringify({ tenantId: item.tenantId, invoice: item.invoice }),
        timeoutMs: 12000
      });

      // 200/201 sincronizada o 409 idempotente (ya recibida previamente en el servidor)
      if (res.ok || res.status === 409) {
        const delTx = db.transaction([STORE_NAME], 'readwrite');
        await idbDeleteItem(delTx.objectStore(STORE_NAME), item.queueId);
        synced += 1;
      } else if (res.status === 400 || res.status === 403) {
        // Error permanente de validación: descartar tras 3 intentos para no bloquear la cola
        if ((item.attempts || 0) >= 2) {
          const delTx = db.transaction([STORE_NAME], 'readwrite');
          await idbDeleteItem(delTx.objectStore(STORE_NAME), item.queueId);
        } else {
          const updTx = db.transaction([STORE_NAME], 'readwrite');
          await idbPutItem(updTx.objectStore(STORE_NAME), { ...item, attempts: (item.attempts || 0) + 1 });
        }
      } else {
        // Fallo de red transitorio: cortar barrido y reintentar en el próximo evento online
        break;
      }
    }

    const remTx = db.transaction([STORE_NAME], 'readonly');
    const remainingItems = await idbGetAllItems(remTx.objectStore(STORE_NAME));
    return { synced, remaining: remainingItems.length };
  } catch {
    return { synced, remaining: 0 };
  } finally {
    db.close();
    flushingInProgress = false;
  }
}
