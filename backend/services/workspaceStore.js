// Almacenamiento particionado por empresa (tenant) para el estado del workspace.
// Elimina el cuello de botella de 1 MiB y las condiciones de carrera del documento monolítico legacy `vt_workspace/shared_state`,
// manteniendo compatibilidad de lectura automática con datos legacy existentes.

const PARTITIONED_COLLECTION = 'vt_workspace_tenants';
const LEGACY_COLLECTION = 'vt_workspace';
const LEGACY_DOC_ID = 'shared_state';

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
  let latestUpdatedAt = null;

  for (const docData of docs) {
    if (!docData || !docData.tenant) continue;
    tenants.push(docData.tenant);
    if (Array.isArray(docData.invoices)) invoices.push(...docData.invoices);
    if (Array.isArray(docData.employees)) employees.push(...docData.employees);
    if (Array.isArray(docData.payments)) payments.push(...docData.payments);
    if (docData.updatedAt && (!latestUpdatedAt || String(docData.updatedAt) > String(latestUpdatedAt))) {
      latestUpdatedAt = docData.updatedAt;
    }
  }

  return {
    tenants,
    invoices,
    employees,
    payments,
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

async function writeWorkspaceState(db, user, { tenants, invoices, employees, payments }) {
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

  await Promise.all(
    targetTenants.map(tenant => {
      const tid = String(tenant.id);
      return db.collection(PARTITIONED_COLLECTION).doc(tid).set({
        tenantId: tid,
        tenant,
        invoices: invoicesByTenant.get(tid) || [],
        employees: employeesByTenant.get(tid) || [],
        payments: paymentsByTenant.get(tid) || [],
        updatedAt: nowIso,
        updatedBy: user.email || user.uid || 'system'
      }, { merge: true });
    })
  );

  return {
    ok: true,
    updatedAt: nowIso,
    tenantsWritten: targetTenants.length
  };
}

module.exports = {
  PARTITIONED_COLLECTION,
  readWorkspaceState,
  writeWorkspaceState
};
