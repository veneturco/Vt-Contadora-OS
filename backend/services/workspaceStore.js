// Almacenamiento particionado Multi-Tenant + Sub-Particionado Mensual (YYYY-MM) para VeneTurco Fiscal OS v3.5.
// 1. `vt_workspace_tenants/{tenantId}`: documento maestro ligero por empresa (metadatos, empleados, pagos, últimos 150 auditLogs, revisión).
// 2. `vt_workspace_periods/{tenantId}__{YYYY-MM}`: shards mensuales de facturas y movimientos bancarios.
//    Elimina definitivamente el techo de 1 MiB de Firestore incluso en Sujetos Pasivos Especiales (SPE) con >30.000 facturas en 10 años (COT).
// 3. Operaciones Delta (`applyWorkspaceDelta`) + Control de Concurrencia + Protección Inmutable COT (10 años).

const PARTITIONED_COLLECTION = 'vt_workspace_tenants';
const PERIOD_SHARDS_COLLECTION = 'vt_workspace_periods';
const ARCHIVED_COLLECTION = 'vt_archived_tenants';
const LEGACY_COLLECTION = 'vt_workspace';
const LEGACY_DOC_ID = 'shared_state';
const LOCKED_FISCAL_STATUSES = new Set(['APROBADA', 'AJUSTADA', 'ANULADA_CON_NC']);

// Umbral automático: hasta 200 facturas se mantienen también inline para 1 sola lectura rápida;
// al superar el umbral (o si ya está particionado por período), las facturas residen en shards mensuales YYYY-MM.
const DEFAULT_INLINE_SHARD_THRESHOLD = 200;

function resolvePeriodKey(dateStr) {
  const clean = String(dateStr || '').trim();
  if (/^\d{4}-\d{2}/.test(clean)) return clean.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function buildPeriodDocId(tenantId, periodKey) {
  return `${String(tenantId).trim()}__${resolvePeriodKey(periodKey)}`;
}

function groupByTenantId(items = []) {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (!item || !item.tenantId) continue;
    if (!map.has(item.tenantId)) map.set(item.tenantId, []);
    map.get(item.tenantId).push(item);
  }
  return map;
}

function groupByPeriodKey(items = [], dateField = 'emissionDate') {
  const map = new Map();
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (!item) continue;
    const pk = resolvePeriodKey(item[dateField] || item.date || item.createdAt);
    if (!map.has(pk)) map.set(pk, []);
    map.get(pk).push(item);
  }
  return map;
}

/**
 * Hidrata las facturas y movimientos bancarios de un documento maestro de empresa,
 * leyendo automáticamente desde los shards mensuales `vt_workspace_periods` cuando `shardedByPeriod === true`.
 */
async function hydrateTenantDocShards(db, docData, options = {}) {
  if (!docData || !docData.tenant) return docData;
  if (!docData.shardedByPeriod || !Array.isArray(docData.periodKeys) || docData.periodKeys.length === 0) {
    return docData;
  }

  const tid = String(docData.tenantId || docData.tenant.id);
  const filterPeriod = options.period ? resolvePeriodKey(options.period) : null;
  const keysToLoad = filterPeriod
    ? docData.periodKeys.filter(k => k === filterPeriod)
    : docData.periodKeys;

  if (keysToLoad.length === 0) {
    return { ...docData, invoices: [], bankMovements: docData.bankMovements || [] };
  }

  const shardSnaps = await Promise.all(
    keysToLoad.map(pk => db.collection(PERIOD_SHARDS_COLLECTION).doc(buildPeriodDocId(tid, pk)).get())
  );

  const mergedInvoices = [];
  const seenInvIds = new Set();
  const mergedBankMoves = [];
  const seenMoveIds = new Set();

  // Ordenar períodos del más reciente al más antiguo
  const sortedShards = shardSnaps
    .filter(s => s && s.exists)
    .map(s => s.data() || {})
    .sort((a, b) => String(b.period || '').localeCompare(String(a.period || '')));

  for (const shard of sortedShards) {
    if (Array.isArray(shard.invoices)) {
      for (const inv of shard.invoices) {
        if (inv && inv.id && !seenInvIds.has(inv.id)) {
          seenInvIds.add(inv.id);
          mergedInvoices.push(inv);
        }
      }
    }
    if (Array.isArray(shard.bankMovements)) {
      for (const bm of shard.bankMovements) {
        if (bm && bm.id && !seenMoveIds.has(bm.id)) {
          seenMoveIds.add(bm.id);
          mergedBankMoves.push(bm);
        }
      }
    }
  }

  return {
    ...docData,
    invoices: mergedInvoices,
    bankMovements: mergedBankMoves.length > 0 ? mergedBankMoves : (docData.bankMovements || [])
  };
}

function aggregatePartitionDocs(docs) {
  const tenants = [];
  const invoices = [];
  const employees = [];
  const payments = [];
  const bankMovements = [];
  const auditLogs = [];
  const revisionsByTenant = {};
  let latestUpdatedAt = null;

  for (const docData of docs) {
    if (!docData || !docData.tenant) continue;
    const tid = docData.tenantId || docData.tenant.id;
    tenants.push(docData.tenant);
    revisionsByTenant[tid] = Number(docData.revision || 1);
    if (Array.isArray(docData.invoices)) invoices.push(...docData.invoices);
    if (Array.isArray(docData.employees)) employees.push(...docData.employees);
    if (Array.isArray(docData.payments)) payments.push(...docData.payments);
    if (Array.isArray(docData.bankMovements)) bankMovements.push(...docData.bankMovements);
    if (Array.isArray(docData.auditLogs)) auditLogs.push(...docData.auditLogs);
    if (docData.updatedAt && (!latestUpdatedAt || String(docData.updatedAt) > String(latestUpdatedAt))) {
      latestUpdatedAt = docData.updatedAt;
    }
  }

  return {
    tenants,
    invoices,
    employees,
    payments,
    bankMovements,
    auditLogs,
    revisionsByTenant,
    updatedAt: latestUpdatedAt
  };
}

async function readLegacyState(db, allowedIdsSet = null) {
  const docSnap = await db.collection(LEGACY_COLLECTION).doc(LEGACY_DOC_ID).get();
  if (!docSnap.exists) return null;
  const raw = docSnap.data() || {};
  if (!allowedIdsSet) {
    return {
      tenants: Array.isArray(raw.tenants) ? raw.tenants : [],
      invoices: Array.isArray(raw.invoices) ? raw.invoices : [],
      employees: Array.isArray(raw.employees) ? raw.employees : [],
      payments: Array.isArray(raw.payments) ? raw.payments : [],
      updatedAt: raw.updatedAt || null
    };
  }
  const tenants = Array.isArray(raw.tenants) ? raw.tenants.filter(t => allowedIdsSet.has(t.id)) : [];
  const effectiveIds = new Set(tenants.map(t => t.id));
  return {
    tenants,
    invoices: Array.isArray(raw.invoices) ? raw.invoices.filter(i => effectiveIds.has(i.tenantId)) : [],
    employees: Array.isArray(raw.employees) ? raw.employees.filter(e => effectiveIds.has(e.tenantId)) : [],
    payments: Array.isArray(raw.payments) ? raw.payments.filter(p => effectiveIds.has(p.tenantId)) : [],
    updatedAt: raw.updatedAt || null
  };
}

async function readWorkspaceState(db, user, options = {}) {
  const isSuper = user?.role === 'superadmin';
  if (isSuper) {
    const snap = await db.collection(PARTITIONED_COLLECTION).get();
    if (snap && !snap.empty && Array.isArray(snap.docs) && snap.docs.length > 0) {
      const hydratedDocs = await Promise.all(
        snap.docs.map(d => hydrateTenantDocShards(db, d.data(), options))
      );
      return {
        empty: false,
        partitioned: true,
        state: aggregatePartitionDocs(hydratedDocs)
      };
    }
    const legacy = await readLegacyState(db, null);
    if (!legacy) return { empty: true, partitioned: true, state: null };
    return { empty: false, partitioned: false, state: legacy };
  }

  const allowedList = Array.isArray(user?.tenantIds) ? user.tenantIds.filter(Boolean) : [];
  if (allowedList.length === 0) {
    return {
      empty: false,
      partitioned: true,
      state: { tenants: [], invoices: [], employees: [], payments: [], bankMovements: [], auditLogs: [], updatedAt: null }
    };
  }

  const snaps = await Promise.all(
    allowedList.map(tid => db.collection(PARTITIONED_COLLECTION).doc(tid).get())
  );
  const rawDocs = snaps.filter(s => s && s.exists).map(s => s.data());
  if (rawDocs.length > 0) {
    const hydratedDocs = await Promise.all(
      rawDocs.map(d => hydrateTenantDocShards(db, d, options))
    );
    return {
      empty: false,
      partitioned: true,
      state: aggregatePartitionDocs(hydratedDocs)
    };
  }

  const legacy = await readLegacyState(db, new Set(allowedList));
  if (!legacy) return { empty: true, partitioned: true, state: null };
  return { empty: false, partitioned: false, state: legacy };
}

/**
 * Fusiona lista entrante de facturas con lista previa garantizando:
 * 1. Inmutabilidad COT (10 años): las facturas APROBADAS jamás pueden borrarse ni alterar sus montos/RIF.
 * 2. Anti-Lost-Update: preserva facturas recibidas recientemente vía Bot de Telegram o Portal Móvil.
 */
function mergeInvoicesWithCotProtection(incomingList = [], existingInvoices = [], { canApprove = true } = {}) {
  const incomingById = new Map();
  for (const inv of incomingList) {
    if (inv && inv.id) incomingById.set(inv.id, inv);
  }

  const existingById = new Map();
  for (const prev of existingInvoices) {
    if (prev && prev.id) existingById.set(prev.id, prev);
  }

  const mergedInvoices = incomingList.map(inv => {
    if (!inv || canApprove) return inv;
    const prev = existingById.get(inv.id);
    // Un Asistente Junior no puede sellar facturas como APROBADA si antes no lo estaban
    if (inv.status === 'APROBADA' && (!prev || prev.status !== 'APROBADA')) {
      return { ...inv, status: 'BORRADOR_IA' };
    }
    return inv;
  });
  const nowMs = Date.now();

  for (const prevInv of existingInvoices) {
    if (!prevInv || !prevInv.id) continue;
    const isLocked = LOCKED_FISCAL_STATUSES.has(prevInv.status);
    const createdMs = prevInv.createdAt ? Date.parse(prevInv.createdAt) : 0;
    const isRecentExternal =
      (prevInv.sourceChannel === 'TELEGRAM_BOT' || prevInv.createdByClient) &&
      !Number.isNaN(createdMs) &&
      nowMs - createdMs < 5 * 60 * 1000;

    if (!incomingById.has(prevInv.id)) {
      if (isLocked || isRecentExternal) {
        mergedInvoices.unshift(prevInv);
      }
    } else if (isLocked) {
      const candidate = incomingById.get(prevInv.id);
      const idx = mergedInvoices.findIndex(x => x && x.id === prevInv.id);
      if (idx !== -1) {
        mergedInvoices[idx] = {
          ...prevInv,
          linkedAdjustmentId: candidate.linkedAdjustmentId || prevInv.linkedAdjustmentId,
          adjustmentType: candidate.adjustmentType || prevInv.adjustmentType,
          status: LOCKED_FISCAL_STATUSES.has(candidate.status) ? candidate.status : prevInv.status
        };
      }
    }
  }

  return mergedInvoices;
}

/**
 * Persiste los shards mensuales `vt_workspace_periods/{tid}__{YYYY-MM}` cuando el volumen supera el umbral
 * o cuando la empresa ya opera en modo `shardedByPeriod`.
 */
async function persistMonthlyShardsForTenant(db, tid, invoices, bankMovements, existingPeriodKeys = [], actorEmail = 'system') {
  const nowIso = new Date().toISOString();
  const invByPeriod = groupByPeriodKey(invoices, 'emissionDate');
  const movesByPeriod = groupByPeriodKey(bankMovements || [], 'date');

  const allPeriodKeysSet = new Set([
    ...existingPeriodKeys,
    ...invByPeriod.keys(),
    ...movesByPeriod.keys()
  ]);
  const allPeriodKeys = Array.from(allPeriodKeysSet).sort((a, b) => b.localeCompare(a));

  await Promise.all(
    allPeriodKeys.map(pk => {
      const shardPayload = {
        tenantId: tid,
        period: pk,
        invoices: invByPeriod.get(pk) || [],
        updatedAt: nowIso,
        updatedBy: actorEmail
      };
      if (Array.isArray(bankMovements)) {
        shardPayload.bankMovements = movesByPeriod.get(pk) || [];
      }
      return db
        .collection(PERIOD_SHARDS_COLLECTION)
        .doc(buildPeriodDocId(tid, pk))
        .set(shardPayload, { merge: true });
    })
  );

  return allPeriodKeys;
}

async function writeWorkspaceState(
  db,
  user,
  { tenants, invoices, employees, payments, bankMovements, auditLogs },
  options = {}
) {
  const isSuper = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  if (!isSuper && !isAdmin) {
    const err = new Error('Acceso denegado: solo contadores o Super-Admin pueden sincronizar el espacio de trabajo.');
    err.status = 403;
    throw err;
  }
  if (!isSuper && user?.firmSubRole === 'AUDITOR_EXTERNO') {
    const err = new Error('Acceso denegado: el sub-rol AUDITOR_EXTERNO es estrictamente de solo lectura.');
    err.status = 403;
    throw err;
  }
  const canApprove = isSuper || user?.firmSubRole !== 'ASISTENTE_JUNIOR';

  const shardThreshold =
    typeof options.shardThreshold === 'number' ? options.shardThreshold : DEFAULT_INLINE_SHARD_THRESHOLD;
  const nowIso = new Date().toISOString();
  const actorEmail = user.email || user.uid || 'system';
  const incomingTenants = Array.isArray(tenants) ? tenants.filter(t => t && t.id) : [];
  const allowedIds = isSuper ? null : new Set(Array.isArray(user?.tenantIds) ? user.tenantIds : []);

  const targetTenants = isSuper
    ? incomingTenants
    : incomingTenants.filter(t => allowedIds.has(t.id));

  const invoicesByTenant = groupByTenantId(invoices);
  const employeesByTenant = groupByTenantId(employees);
  const paymentsByTenant = groupByTenantId(payments);
  const bankMovesByTenant = groupByTenantId(bankMovements);
  const auditLogsByTenant = groupByTenantId(auditLogs);

  let shardedTenantsCount = 0;

  await Promise.all(
    targetTenants.map(async tenant => {
      const tid = String(tenant.id);
      const docRef = db.collection(PARTITIONED_COLLECTION).doc(tid);
      const existingSnap = await docRef.get();
      const rawExisting = existingSnap && existingSnap.exists ? (existingSnap.data() || {}) : {};
      const hydratedExisting = await hydrateTenantDocShards(db, rawExisting);
      const existingInvoices = Array.isArray(hydratedExisting.invoices) ? hydratedExisting.invoices : [];

      const incomingList = invoicesByTenant.get(tid) || [];
      const mergedInvoices = mergeInvoicesWithCotProtection(incomingList, existingInvoices, { canApprove });
      const tenantBankMoves = Array.isArray(bankMovements) ? (bankMovesByTenant.get(tid) || []) : undefined;

      const shouldShardByPeriod =
        Boolean(rawExisting.shardedByPeriod) ||
        mergedInvoices.length > shardThreshold ||
        (Array.isArray(tenantBankMoves) && tenantBankMoves.length > shardThreshold);

      let periodKeys = Array.isArray(rawExisting.periodKeys) ? rawExisting.periodKeys : [];
      if (shouldShardByPeriod) {
        shardedTenantsCount += 1;
        periodKeys = await persistMonthlyShardsForTenant(
          db,
          tid,
          mergedInvoices,
          tenantBankMoves,
          periodKeys,
          actorEmail
        );
      }

      const nextRevision = Number(rawExisting.revision || 0) + 1;
      const payload = {
        tenantId: tid,
        tenant,
        shardedByPeriod: shouldShardByPeriod,
        periodKeys,
        revision: nextRevision,
        invoices: shouldShardByPeriod ? [] : mergedInvoices,
        employees: employeesByTenant.get(tid) || [],
        payments: paymentsByTenant.get(tid) || [],
        updatedAt: nowIso,
        updatedBy: actorEmail
      };
      if (Array.isArray(tenantBankMoves)) {
        payload.bankMovements = shouldShardByPeriod ? [] : tenantBankMoves;
      }
      if (Array.isArray(auditLogs)) {
        payload.auditLogs = (auditLogsByTenant.get(tid) || []).slice(-150);
      }
      return docRef.set(payload, { merge: true });
    })
  );

  return {
    ok: true,
    updatedAt: nowIso,
    tenantsWritten: targetTenants.length,
    shardedTenantsCount
  };
}

/**
 * Sincronización Incremental (Delta) por Empresa — Evita retransmitir toda la base de datos en cada cambio puntual.
 */
async function applyWorkspaceDelta(db, user, delta = {}, options = {}) {
  const isSuper = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  if (!isSuper && !isAdmin) {
    const err = new Error('Acceso denegado: solo contadores o Super-Admin pueden aplicar cambios delta.');
    err.status = 403;
    throw err;
  }
  if (!isSuper && user?.firmSubRole === 'AUDITOR_EXTERNO') {
    const err = new Error('Acceso denegado: el sub-rol AUDITOR_EXTERNO es estrictamente de solo lectura.');
    err.status = 403;
    throw err;
  }
  const canApprove = isSuper || user?.firmSubRole !== 'ASISTENTE_JUNIOR';

  const tid = String(delta.tenantId || '').trim();
  if (!tid) {
    const err = new Error('tenantId es obligatorio para aplicar sincronización delta.');
    err.status = 400;
    throw err;
  }
  if (!isSuper) {
    const allowed = Array.isArray(user?.tenantIds) ? user.tenantIds : [];
    if (!allowed.includes(tid)) {
      const err = new Error('Acceso denegado a este tenantId (Protección Anti-IDOR).');
      err.status = 403;
      throw err;
    }
  }

  const shardThreshold =
    typeof options.shardThreshold === 'number' ? options.shardThreshold : DEFAULT_INLINE_SHARD_THRESHOLD;
  const nowIso = new Date().toISOString();
  const actorEmail = user.email || user.uid || 'system';
  const docRef = db.collection(PARTITIONED_COLLECTION).doc(tid);
  const snap = await docRef.get();
  const rawExisting = snap && snap.exists ? (snap.data() || {}) : {};
  const hydrated = await hydrateTenantDocShards(db, rawExisting);

  let currentInvoices = Array.isArray(hydrated.invoices) ? [...hydrated.invoices] : [];
  const deleteIds = new Set(Array.isArray(delta.deleteDraftInvoiceIds) ? delta.deleteDraftInvoiceIds : []);
  if (deleteIds.size > 0) {
    currentInvoices = currentInvoices.filter(
      inv => !inv || !deleteIds.has(inv.id) || LOCKED_FISCAL_STATUSES.has(inv.status)
    );
  }

  if (Array.isArray(delta.upsertInvoices) && delta.upsertInvoices.length > 0) {
    const byId = new Map(currentInvoices.map(i => [i.id, i]));
    for (const incoming of delta.upsertInvoices) {
      if (!incoming || !incoming.id) continue;
      const existing = byId.get(incoming.id);
      if (existing && LOCKED_FISCAL_STATUSES.has(existing.status)) {
        byId.set(incoming.id, {
          ...existing,
          linkedAdjustmentId: incoming.linkedAdjustmentId || existing.linkedAdjustmentId,
          adjustmentType: incoming.adjustmentType || existing.adjustmentType,
          status: LOCKED_FISCAL_STATUSES.has(incoming.status) ? incoming.status : existing.status
        });
      } else {
        const sanitizedStatus = !canApprove && incoming.status === 'APROBADA' ? 'BORRADOR_IA' : incoming.status;
        byId.set(incoming.id, { ...incoming, status: sanitizedStatus, tenantId: tid });
      }
    }
    currentInvoices = Array.from(byId.values());
  }

  const shouldShardByPeriod = Boolean(rawExisting.shardedByPeriod) || currentInvoices.length > shardThreshold;
  let periodKeys = Array.isArray(rawExisting.periodKeys) ? rawExisting.periodKeys : [];
  if (shouldShardByPeriod) {
    periodKeys = await persistMonthlyShardsForTenant(
      db,
      tid,
      currentInvoices,
      hydrated.bankMovements,
      periodKeys,
      actorEmail
    );
  }

  const nextRevision = Number(rawExisting.revision || 0) + 1;
  const updatedMaster = {
    tenantId: tid,
    tenant: delta.tenant || rawExisting.tenant || { id: tid },
    shardedByPeriod: shouldShardByPeriod,
    periodKeys,
    revision: nextRevision,
    invoices: shouldShardByPeriod ? [] : currentInvoices,
    updatedAt: nowIso,
    updatedBy: actorEmail
  };

  if (Array.isArray(delta.appendAuditLogs) && delta.appendAuditLogs.length > 0) {
    const prevLogs = Array.isArray(rawExisting.auditLogs) ? rawExisting.auditLogs : [];
    updatedMaster.auditLogs = [...prevLogs, ...delta.appendAuditLogs].slice(-150);
  }

  await docRef.set(updatedMaster, { merge: true });
  return {
    ok: true,
    tenantId: tid,
    revision: nextRevision,
    shardedByPeriod: shouldShardByPeriod,
    totalInvoices: currentInvoices.length,
    updatedAt: nowIso
  };
}

async function deleteTenantWorkspace(db, tenantId, actorEmail = 'system') {
  const tid = String(tenantId || '').trim();
  if (!tid) {
    const err = new Error('tenantId requerido para eliminar empresa.');
    err.status = 400;
    throw err;
  }
  const nowIso = new Date().toISOString();
  const wsRef = db.collection(PARTITIONED_COLLECTION).doc(tid);
  const wsSnap = await wsRef.get();
  if (wsSnap && wsSnap.exists) {
    const hydrated = await hydrateTenantDocShards(db, wsSnap.data() || {});
    // Resguardo forense inmutable de 10 años (COT) antes de retirar de la cartera activa
    await db.collection(ARCHIVED_COLLECTION).doc(tid).set(
      {
        ...hydrated,
        archivedAt: nowIso,
        archivedBy: actorEmail,
        cotRetentionYears: 10
      },
      { merge: true }
    );
  }
  await wsRef.delete();
  await db.collection('tenants').doc(tid).delete();
  return { ok: true, deletedTenantId: tid, archivedInVault: Boolean(wsSnap && wsSnap.exists) };
}

async function appendTenantInvoice(db, tenantId, invoice, actorEmail = 'client', options = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid || !invoice || typeof invoice !== 'object') {
    const err = new Error('tenantId y datos de factura son requeridos.');
    err.status = 400;
    throw err;
  }

  const shardThreshold =
    typeof options.shardThreshold === 'number' ? options.shardThreshold : DEFAULT_INLINE_SHARD_THRESHOLD;
  const docRef = db.collection(PARTITIONED_COLLECTION).doc(tid);
  const snap = await docRef.get();
  const rawExisting = snap && snap.exists ? (snap.data() || {}) : {};
  const hydrated = await hydrateTenantDocShards(db, rawExisting);
  const currentInvoices = Array.isArray(hydrated.invoices) ? hydrated.invoices : [];

  const invNumNorm = String(invoice.invoiceNumber || '').trim().toUpperCase();
  const rifNorm = String(invoice.supplierRif || '').trim().toUpperCase();
  const isDuplicate = currentInvoices.some(
    inv =>
      String(inv?.supplierRif || '').trim().toUpperCase() === rifNorm &&
      String(inv?.invoiceNumber || '').trim().toUpperCase() === invNumNorm
  );
  if (isDuplicate) {
    const err = new Error(`La factura #${invoice.invoiceNumber} del RIF ${invoice.supplierRif} ya fue registrada previamente.`);
    err.status = 409;
    throw err;
  }

  const nowIso = new Date().toISOString();
  const enrichedInvoice = {
    ...invoice,
    tenantId: tid,
    createdAt: invoice.createdAt || nowIso,
    createdByClient: actorEmail !== 'system'
  };
  const updatedInvoices = [enrichedInvoice, ...currentInvoices];
  const shouldShardByPeriod = Boolean(rawExisting.shardedByPeriod) || updatedInvoices.length > shardThreshold;

  let periodKeys = Array.isArray(rawExisting.periodKeys) ? rawExisting.periodKeys : [];
  if (shouldShardByPeriod) {
    const pk = resolvePeriodKey(enrichedInvoice.emissionDate || nowIso);
    const shardRef = db.collection(PERIOD_SHARDS_COLLECTION).doc(buildPeriodDocId(tid, pk));
    const shardSnap = await shardRef.get();
    const shardData = shardSnap && shardSnap.exists ? (shardSnap.data() || {}) : {};
    const shardInvoices = Array.isArray(shardData.invoices) ? shardData.invoices : [];

    // Si acaba de cruzar el umbral por primera vez, volcar todos los períodos históricos
    if (!rawExisting.shardedByPeriod) {
      periodKeys = await persistMonthlyShardsForTenant(
        db,
        tid,
        updatedInvoices,
        hydrated.bankMovements,
        periodKeys,
        actorEmail
      );
    } else {
      await shardRef.set(
        {
          tenantId: tid,
          period: pk,
          invoices: [enrichedInvoice, ...shardInvoices],
          updatedAt: nowIso,
          updatedBy: actorEmail
        },
        { merge: true }
      );
      periodKeys = Array.from(new Set([pk, ...periodKeys])).sort((a, b) => b.localeCompare(a));
    }
  }

  const nextRevision = Number(rawExisting.revision || 0) + 1;
  await docRef.set(
    {
      tenantId: tid,
      shardedByPeriod: shouldShardByPeriod,
      periodKeys,
      revision: nextRevision,
      invoices: shouldShardByPeriod ? [] : updatedInvoices,
      updatedAt: nowIso,
      updatedBy: actorEmail
    },
    { merge: true }
  );

  return {
    ok: true,
    invoice: enrichedInvoice,
    totalInvoices: updatedInvoices.length,
    shardedByPeriod: shouldShardByPeriod,
    revision: nextRevision,
    updatedAt: nowIso
  };
}

module.exports = {
  PARTITIONED_COLLECTION,
  PERIOD_SHARDS_COLLECTION,
  ARCHIVED_COLLECTION,
  resolvePeriodKey,
  buildPeriodDocId,
  hydrateTenantDocShards,
  readWorkspaceState,
  writeWorkspaceState,
  applyWorkspaceDelta,
  appendTenantInvoice,
  deleteTenantWorkspace
};
