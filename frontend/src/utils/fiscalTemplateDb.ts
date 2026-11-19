// FiscalTemplateDB (IndexedDB · 100% Local · Aislado por tenantId · TTL 90 días)
// Almacena perfiles estructurales livianos de proveedores venezolanos (SENIAT),
// huellas de plantillas (layoutHash + anchorTokens) y eventos de corrección del contador.

export interface LocalVendorProfile {
  id: string; // `${tenantId}::${normalizedRif}`
  tenantId: string;
  rif: string;
  razonSocial: string;
  aliases: string[];
  preferredChannel: 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA';
  currencyHint: 'VES' | 'USD';
  amountFormat: 'COMMA_DECIMAL' | 'DOT_DECIMAL' | 'AUTO';
  vatRateHint: number;
  hitCount: number;
  updatedAt: string;
}

export interface LocalInvoiceTemplate {
  templateId: string; // `${tenantId}::${normalizedRif}::${layoutHash}`
  tenantId: string;
  rif: string;
  layoutHash: string;
  anchorTokens: string[];
  docKind: 'THERMAL_80MM' | 'LETTER_A4' | 'UNKNOWN';
  confidenceScore: number;
  successCount: number;
  failureCount: number;
  lastUsedAt: string;
}

export interface LocalCorrectionEvent {
  id?: number;
  tenantId: string;
  rif: string;
  templateId: string;
  fieldName: string;
  correctedValue: string;
  timestamp: string;
}

export interface LocalTemplateHintPayload {
  rif: string;
  razonSocial: string;
  preferredChannel: 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA';
  currencyHint: 'VES' | 'USD';
  amountFormat: 'COMMA_DECIMAL' | 'DOT_DECIMAL' | 'AUTO';
  vatRateHint: number;
  templateConfidence: number;
  hitCount: number;
}

const DB_NAME = 'FiscalTemplateDB';
const DB_VERSION = 1;
const TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 días

function normalizeRifKey(rif: string): string {
  return String(rif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function openTemplateDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('vendors')) {
          const vs = db.createObjectStore('vendors', { keyPath: 'id' });
          vs.createIndex('tenantId', 'tenantId', { unique: false });
          vs.createIndex('rif', 'rif', { unique: false });
          vs.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('templates')) {
          const ts = db.createObjectStore('templates', { keyPath: 'templateId' });
          ts.createIndex('tenantId', 'tenantId', { unique: false });
          ts.createIndex('rif', 'rif', { unique: false });
          ts.createIndex('confidenceScore', 'confidenceScore', { unique: false });
        }
        if (!db.objectStoreNames.contains('correction_events')) {
          const cs = db.createObjectStore('correction_events', { keyPath: 'id', autoIncrement: true });
          cs.createIndex('tenantId', 'tenantId', { unique: false });
          cs.createIndex('rif', 'rif', { unique: false });
          cs.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise(resolve => {
    try {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

function idbGetAllByIndex<T>(store: IDBObjectStore, indexName: string, key: IDBValidKey): Promise<T[]> {
  return new Promise(resolve => {
    try {
      const idx = store.index(indexName);
      const req = idx.getAll(key);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function idbGetAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise(resolve => {
    try {
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Genera huella estructural determinista (layoutHash) basada en palabras ancla SENIAT
 * y su zona vertical relativa (TOP / MID / BOT), inmune a cambios de monto o fecha.
 */
export function computeStructuralLayoutHash(rawText: string): { layoutHash: string; anchorTokens: string[] } {
  const lines = String(rawText || '')
    .split('\n')
    .map(l => l.trim().toUpperCase())
    .filter(Boolean);
  if (lines.length === 0) return { layoutHash: 'GENERIC', anchorTokens: [] };

  const anchors: { key: string; pattern: RegExp }[] = [
    { key: 'SENIAT', pattern: /\bSENIAT\b/ },
    { key: 'RIF', pattern: /\bR\.?I\.?F\.?\b/ },
    { key: 'FACTURA', pattern: /\bFACT(?:URA)?\b/ },
    { key: 'CONTROL', pattern: /\bCONTROL\b/ },
    { key: 'FECHA', pattern: /\bFECHA\b/ },
    { key: 'EXENTO', pattern: /\bEXEN(?:TO)?\b/ },
    { key: 'BASE', pattern: /\b(?:BASE|B\.?I\.?\s*G)\b/ },
    { key: 'IVA', pattern: /\bI\.?V\.?A\.?\b/ },
    { key: 'IGTF', pattern: /\bIGTF\b/ },
    { key: 'TOTAL', pattern: /\bTOTAL\b/ },
    { key: 'MH', pattern: /\bMH\b/ }
  ];

  const found: string[] = [];
  const total = Math.max(1, lines.length);
  for (const a of anchors) {
    const idx = lines.findIndex(l => a.pattern.test(l));
    if (idx !== -1) {
      const ratio = idx / total;
      const zone = ratio < 0.35 ? 'T' : ratio < 0.7 ? 'M' : 'B';
      found.push(`${a.key}:${zone}`);
    }
  }

  // Hash FNV-1a compacto de 32 bits
  const signature = found.join('|') || 'EMPTY';
  let h = 2166136261;
  for (let i = 0; i < signature.length; i++) {
    h ^= signature.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const layoutHash = `L${(h >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  return { layoutHash, anchorTokens: found };
}

function extractCandidateRifKeys(rawText: string): string[] {
  const matches = [...String(rawText || '').matchAll(/\b([VEJPGCDvejpgcd])\s*[-–._]?\s*([0-9OoIlSsBb]{6,9})\s*[-–._]?\s*([0-9OoIlSsBb])?\b/g)];
  const out: string[] = [];
  for (const m of matches) {
    const clean = `${m[1]}${m[2]}${m[3] || ''}`
      .toUpperCase()
      .replace(/[OoQq]/g, '0')
      .replace(/[Il|!]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/[Bb]/g, '8');
    if (clean.length >= 8 && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/**
 * Busca en IndexedDB si ya conocemos el proveedor o la plantilla para este tenantId.
 */
export async function lookupLocalVendorHints(
  tenantId: string,
  rawText: string
): Promise<LocalTemplateHintPayload | null> {
  if (!tenantId || !rawText) return null;
  const db = await openTemplateDb();
  if (!db) return null;

  try {
    const rifKeys = extractCandidateRifKeys(rawText);
    if (rifKeys.length === 0) return null;

    const tx = db.transaction(['vendors', 'templates'], 'readonly');
    const vendorStore = tx.objectStore('vendors');
    const templateStore = tx.objectStore('templates');

    for (const rifKey of rifKeys) {
      const vendor = await idbGet<LocalVendorProfile>(vendorStore, `${tenantId}::${rifKey}`);
      if (vendor) {
        const templates = await idbGetAllByIndex<LocalInvoiceTemplate>(templateStore, 'rif', vendor.rif);
        const tenantTemplates = templates
          .filter(t => t.tenantId === tenantId)
          .sort((a, b) => b.confidenceScore - a.confidenceScore);
        const bestTpl = tenantTemplates[0];
        return {
          rif: vendor.rif,
          razonSocial: vendor.razonSocial,
          preferredChannel: vendor.preferredChannel,
          currencyHint: vendor.currencyHint,
          amountFormat: vendor.amountFormat,
          vatRateHint: vendor.vatRateHint,
          templateConfidence: bestTpl ? bestTpl.confidenceScore : 0.85,
          hitCount: vendor.hitCount
        };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Aprende automáticamente cada vez que el contador/cliente confirma o corrige una factura.
 * Ejecuta también limpieza liviana TTL (>90 días).
 */
export async function learnFromConfirmedInvoice(params: {
  tenantId: string;
  supplierRif: string;
  supplierName: string;
  channel?: 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA';
  currency?: 'VES' | 'USD';
  vatRate?: number;
  rawOcrText?: string;
  docKind?: 'THERMAL_80MM' | 'LETTER_A4' | 'UNKNOWN';
  hadUserCorrections?: boolean;
  correctionFields?: { fieldName: string; correctedValue: string }[];
}): Promise<void> {
  const { tenantId, supplierRif, supplierName } = params;
  const rifKey = normalizeRifKey(supplierRif);
  if (!tenantId || rifKey.length < 8) return;

  const db = await openTemplateDb();
  if (!db) return;

  const nowIso = new Date().toISOString();
  const { layoutHash, anchorTokens } = computeStructuralLayoutHash(params.rawOcrText || '');
  const vendorId = `${tenantId}::${rifKey}`;
  const templateId = `${tenantId}::${rifKey}::${layoutHash}`;

  try {
    const tx = db.transaction(['vendors', 'templates', 'correction_events'], 'readwrite');
    const vendorStore = tx.objectStore('vendors');
    const templateStore = tx.objectStore('templates');
    const corrStore = tx.objectStore('correction_events');

    const existingVendor = await idbGet<LocalVendorProfile>(vendorStore, vendorId);
    const cleanName = String(supplierName || '').trim();
    const aliases = existingVendor?.aliases ? [...existingVendor.aliases] : [];
    if (cleanName && existingVendor?.razonSocial && cleanName !== existingVendor.razonSocial && !aliases.includes(cleanName)) {
      aliases.push(cleanName);
    }

    const updatedVendor: LocalVendorProfile = {
      id: vendorId,
      tenantId,
      rif: supplierRif.toUpperCase(),
      razonSocial: cleanName || existingVendor?.razonSocial || `Proveedor (${supplierRif})`,
      aliases: aliases.slice(-5),
      preferredChannel: params.channel || existingVendor?.preferredChannel || 'DIGITAL',
      currencyHint: params.currency || existingVendor?.currencyHint || 'VES',
      amountFormat: existingVendor?.amountFormat || 'COMMA_DECIMAL',
      vatRateHint: typeof params.vatRate === 'number' ? params.vatRate : (existingVendor?.vatRateHint ?? 16),
      hitCount: (existingVendor?.hitCount || 0) + 1,
      updatedAt: nowIso
    };
    vendorStore.put(updatedVendor);

    const existingTpl = await idbGet<LocalInvoiceTemplate>(templateStore, templateId);
    const prevScore = existingTpl?.confidenceScore ?? 0.78;
    const targetScore = params.hadUserCorrections ? 0.82 : 0.99;
    const nextScore = Number((prevScore * 0.7 + targetScore * 0.3).toFixed(3));

    const updatedTpl: LocalInvoiceTemplate = {
      templateId,
      tenantId,
      rif: supplierRif.toUpperCase(),
      layoutHash,
      anchorTokens: anchorTokens.length > 0 ? anchorTokens : (existingTpl?.anchorTokens || []),
      docKind: params.docKind || existingTpl?.docKind || 'UNKNOWN',
      confidenceScore: nextScore,
      successCount: (existingTpl?.successCount || 0) + (params.hadUserCorrections ? 0 : 1),
      failureCount: (existingTpl?.failureCount || 0) + (params.hadUserCorrections ? 1 : 0),
      lastUsedAt: nowIso
    };
    templateStore.put(updatedTpl);

    if (Array.isArray(params.correctionFields)) {
      for (const c of params.correctionFields.slice(0, 6)) {
        corrStore.add({
          tenantId,
          rif: supplierRif.toUpperCase(),
          templateId,
          fieldName: c.fieldName,
          correctedValue: String(c.correctedValue || '').slice(0, 120),
          timestamp: nowIso
        });
      }
    }

    // Limpieza periódica ligera TTL > 90 días (se ejecuta en ~10% de las escrituras)
    if (Math.random() < 0.1) {
      const cutoff = Date.now() - TTL_MS;
      const allCorr = await idbGetAll<LocalCorrectionEvent>(corrStore);
      for (const ev of allCorr) {
        if (ev.id !== undefined && new Date(ev.timestamp).getTime() < cutoff) {
          corrStore.delete(ev.id);
        }
      }
    }
  } catch {
    // Nunca interrumpir flujo contable
  } finally {
    db.close();
  }
}

/**
 * Estadísticas de FiscalTemplateDB para mostrar en el Guardián VT.
 */
export async function getFiscalTemplateStats(): Promise<{
  vendorCount: number;
  templateCount: number;
  correctionCount: number;
}> {
  const db = await openTemplateDb();
  if (!db) return { vendorCount: 0, templateCount: 0, correctionCount: 0 };
  try {
    const tx = db.transaction(['vendors', 'templates', 'correction_events'], 'readonly');
    const [vendors, templates, corrections] = await Promise.all([
      idbGetAll<LocalVendorProfile>(tx.objectStore('vendors')),
      idbGetAll<LocalInvoiceTemplate>(tx.objectStore('templates')),
      idbGetAll<LocalCorrectionEvent>(tx.objectStore('correction_events'))
    ]);
    return {
      vendorCount: vendors.length,
      templateCount: templates.length,
      correctionCount: corrections.length
    };
  } catch {
    return { vendorCount: 0, templateCount: 0, correctionCount: 0 };
  } finally {
    db.close();
  }
}
