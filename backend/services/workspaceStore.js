// Almacenamiento particionado por empresa (tenant) para el estado del workspace.
// Elimina el cuello de botella de 1 MiB y las condiciones de carrera del documento monolítico legacy `vt_workspace/shared_state`,
// manteniendo compatibilidad de lectura automática con datos legacy existentes.

const PARTITIONED_COLLECTION = 'vt_workspace_tenants';
const ARCHIVED_COLLECTION = 'vt_archived_tenants';
const LEGACY_COLLECTION = 'vt_workspace';
const LEGACY_DOC_ID = 'shared_state';
const LOCKED_FISCAL_STATUSES = new Set(['APROBADA', 'AJUSTADA', 'ANULADA_CON_NC']);

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

function aggregatePartitionDocs(docs) {
  const tenants = [];
  const invoices = [];
  const employees = [];
  const payments = [];
  const bankMovements = [];
  const auditLogs = [];
  let latestUpdatedAt = null;

  for (const docData of docs) {
    if (!docData || !docData.tenant) continue;
    tenants.push(docData.tenant);
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

async function readWorkspaceState(db, user) {
  const isSuper = user?.role === 'superadmin';
  if (isSuper) {
    const snap = await db.collection(PARTITIONED_COLLECTION).get();
    if (snap && !snap.empty && Array.isArray(snap.docs) && snap.docs.length > 0) {
      return {
        empty: false,
        partitioned: true,
        state: aggregatePartitionDocs(snap.docs.map(d => d.data()))
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
      state: { tenants: [], invoices: [], employees: [], payments: [], updatedAt: null }
    };
  }

  const snaps = await Promise.all(
    allowedList.map(tid => db.collection(PARTITIONED_COLLECTION).doc(tid).get())
  );
  const foundDocs = snaps.filter(s => s && s.exists).map(s => s.data());
  if (foundDocs.length > 0) {
    return {
      empty: false,
      partitioned: true,
      state: aggregatePartitionDocs(foundDocs)
    };
  }

  const legacy = await readLegacyState(db, new Set(allowedList));
  if (!legacy) return { empty: true, partitioned: true, state: null };
  return { empty: false, partitioned: false, state: legacy };
}

async function writeWorkspaceState(db, user, { tenants, invoices, employees, payments, bankMovements, auditLogs }) {
  const isSuper = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  if (!isSuper && !isAdmin) {
    const err = new Error('Acceso denegado: solo contadores o Super-Admin pueden sincronizar el espacio de trabajo.');
    err.status = 403;
    throw err;
  }

  const nowIso = new Date().toISOString();
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

  await Promise.all(
    targetTenants.map(async tenant => {
      const tid = String(tenant.id);
      const docRef = db.collection(PARTITIONED_COLLECTION).doc(tid);
      const existingSnap = await docRef.get();
      const existingData = existingSnap && existingSnap.exists ? (existingSnap.data() || {}) : {};
      const existingInvoices = Array.isArray(existingData.invoices) ? existingData.invoices : [];

      const incomingList = invoicesByTenant.get(tid) || [];
      const incomingById = new Map();
      for (const inv of incomingList) {
        if (inv && inv.id) incomingById.set(inv.id, inv);
      }

      // Protección COT (10 años) + Prevención de Lost Update para facturas entrantes por Telegram/Móvil
      const mergedInvoices = [...incomingList];
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
          // Impedir alteración destructiva de montos/RIF en facturas ya selladas bajo COT
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

      const payload = {
        tenantId: tid,
        tenant,
        invoices: mergedInvoices,
        employees: employeesByTenant.get(tid) || [],
        payments: paymentsByTenant.get(tid) || [],
        updatedAt: nowIso,
        updatedBy: user.email || user.uid || 'system'
      };
      if (Array.isArray(bankMovements)) {
        payload.bankMovements = bankMovesByTenant.get(tid) || [];
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
    tenantsWritten: targetTenants.length
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
    // Resguardo forense inmutable de 10 años (COT) antes de retirar de la cartera activa
    await db.collection(ARCHIVED_COLLECTION).doc(tid).set(
      {
        ...(wsSnap.data() || {}),
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

async function appendTenantInvoice(db, tenantId, invoice, actorEmail = 'client') {
  const tid = String(tenantId || '').trim();
  if (!tid || !invoice || typeof invoice !== 'object') {
    const err = new Error('tenantId y datos de factura son requeridos.');
    err.status = 400;
    throw err;
  }

  const docRef = db.collection(PARTITIONED_COLLECTION).doc(tid);
  const snap = await docRef.get();
  const existing = snap && snap.exists ? (snap.data() || {}) : {};
  const currentInvoices = Array.isArray(existing.invoices) ? existing.invoices : [];

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
  const updatedInvoices = [invoice, ...currentInvoices];
  await docRef.set(
    {
      tenantId: tid,
      invoices: updatedInvoices,
      updatedAt: nowIso,
      updatedBy: actorEmail
    },
    { merge: true }
  );

  return { ok: true, invoice, totalInvoices: updatedInvoices.length, updatedAt: nowIso };
}

module.exports = {
  PARTITIONED_COLLECTION,
  ARCHIVED_COLLECTION,
  readWorkspaceState,
  writeWorkspaceState,
  appendTenantInvoice,
  deleteTenantWorkspace
};
