const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PARTITIONED_COLLECTION,
  readWorkspaceState,
  writeWorkspaceState,
  appendTenantInvoice,
  deleteTenantWorkspace
} = require('../services/workspaceStore');

function createMockDb() {
  const store = new Map();
  return {
    store,
    collection(col) {
      return {
        doc(id) {
          const path = `${col}/${id}`;
          return {
            id,
            async get() {
              const data = store.get(path);
              return { exists: data !== undefined, id, data: () => data };
            },
            async set(payload, opts = {}) {
              const prev = store.get(path) || {};
              store.set(path, opts.merge ? { ...prev, ...payload } : { ...payload });
              return true;
            },
            async delete() {
              store.delete(path);
              return true;
            }
          };
        },
        async get() {
          const docs = [];
          for (const [k, v] of store.entries()) {
            if (k.startsWith(`${col}/`) && k.slice(col.length + 1).indexOf('/') === -1) {
              docs.push({ id: k.slice(col.length + 1), data: () => v });
            }
          }
          return { empty: docs.length === 0, docs };
        }
      };
    }
  };
}

test('WorkspaceStore: particionado por tenant evita sobrescrituras entre contadores y bloquea IDOR', async () => {
  const db = createMockDb();
  const superAdmin = { role: 'superadmin', email: 'super@vt.com' };
  const accA = { role: 'admin', email: 'a@firma.com', tenantIds: ['tenant_a'] };
  const accB = { role: 'admin', email: 'b@firma.com', tenantIds: ['tenant_b'] };
  const clientA = { role: 'client', email: 'cliente@a.com', tenantIds: ['tenant_a'] };

  // SuperAdmin escribe dos empresas -> deben quedar en documentos separados
  const writeRes = await writeWorkspaceState(db, superAdmin, {
    tenants: [
      { id: 'tenant_a', name: 'Empresa A' },
      { id: 'tenant_b', name: 'Empresa B' }
    ],
    invoices: [
      { id: 'inv_1', tenantId: 'tenant_a', totalOriginal: 100 },
      { id: 'inv_2', tenantId: 'tenant_b', totalOriginal: 200 }
    ],
    employees: [],
    payments: []
  });

  assert.equal(writeRes.ok, true);
  assert.equal(writeRes.tenantsWritten, 2);
  assert.ok(db.store.has(`${PARTITIONED_COLLECTION}/tenant_a`));
  assert.ok(db.store.has(`${PARTITIONED_COLLECTION}/tenant_b`));

  // Contador A intenta sobrescribir Empresa B -> debe ser ignorado, solo actualiza Empresa A
  await writeWorkspaceState(db, accA, {
    tenants: [
      { id: 'tenant_a', name: 'Empresa A Actualizada' },
      { id: 'tenant_b', name: 'HACKED' }
    ],
    invoices: [
      { id: 'inv_1', tenantId: 'tenant_a', totalOriginal: 150 },
      { id: 'inv_hack', tenantId: 'tenant_b', totalOriginal: 9999 }
    ],
    employees: [],
    payments: []
  });

  const readB = await readWorkspaceState(db, accB);
  assert.equal(readB.empty, false);
  assert.equal(readB.partitioned, true);
  assert.equal(readB.state.tenants.length, 1);
  assert.equal(readB.state.tenants[0].name, 'Empresa B');
  assert.equal(readB.state.invoices.length, 1);
  assert.equal(readB.state.invoices[0].id, 'inv_2');

  // Cliente puede leer su propia empresa pero NO escribir
  const readClient = await readWorkspaceState(db, clientA);
  assert.equal(readClient.state.tenants.length, 1);
  assert.equal(readClient.state.tenants[0].name, 'Empresa A Actualizada');

  await assert.rejects(
    () => writeWorkspaceState(db, clientA, { tenants: [], invoices: [], employees: [], payments: [] }),
    err => err.status === 403
  );
});

test('WorkspaceStore: retrocompatibilidad automática leyendo legacy vt_workspace/shared_state', async () => {
  const db = createMockDb();
  await db.collection('vt_workspace').doc('shared_state').set({
    tenants: [{ id: 't_legacy', name: 'Comercio Legacy' }],
    invoices: [{ id: 'inv_l1', tenantId: 't_legacy', totalOriginal: 500 }],
    employees: [],
    payments: [],
    updatedAt: '2026-10-01T00:00:00.000Z'
  });

  const res = await readWorkspaceState(db, { role: 'superadmin', email: 'super@vt.com' });
  assert.equal(res.empty, false);
  assert.equal(res.partitioned, false);
  assert.equal(res.state.tenants.length, 1);
  assert.equal(res.state.tenants[0].id, 't_legacy');
});

test('WorkspaceStore: appendTenantInvoice persiste facturas de clientes y bloquea duplicados (409)', async () => {
  const db = createMockDb();
  const inv = {
    id: 'inv_m1',
    tenantId: 'tenant_a',
    supplierRif: 'J-30918274-9',
    invoiceNumber: '00045123',
    totalOriginal: 116
  };

  const first = await appendTenantInvoice(db, 'tenant_a', inv, 'cliente@a.com');
  assert.equal(first.ok, true);
  assert.equal(first.totalInvoices, 1);

  await assert.rejects(
    () => appendTenantInvoice(db, 'tenant_a', inv, 'cliente@a.com'),
    err => err.status === 409
  );
});

test('WorkspaceStore: persiste bankMovements y auditLogs y elimina empresas permanentemente', async () => {
  const db = createMockDb();
  const superAdmin = { role: 'superadmin', email: 'super@vt.com' };

  await writeWorkspaceState(db, superAdmin, {
    tenants: [{ id: 'tenant_del', name: 'Empresa Temporal' }],
    invoices: [],
    employees: [],
    payments: [],
    bankMovements: [{ id: 'bm_1', tenantId: 'tenant_del', amountBs: 500 }],
    auditLogs: [{ id: 'log_1', tenantId: 'tenant_del', action: 'TEST' }]
  });

  const before = await readWorkspaceState(db, superAdmin);
  assert.equal(before.state.bankMovements.length, 1);
  assert.equal(before.state.auditLogs.length, 1);

  const delRes = await deleteTenantWorkspace(db, 'tenant_del', 'super@vt.com');
  assert.equal(delRes.ok, true);
  assert.equal(delRes.archivedInVault, true);

  const after = await readWorkspaceState(db, superAdmin);
  assert.equal(after.empty, true);

  // Verificar custodia forense COT 10 años en vt_archived_tenants
  const archived = await db.collection('vt_archived_tenants').doc('tenant_del').get();
  assert.equal(archived.exists, true);
  assert.equal(archived.data().cotRetentionYears, 10);
});

test('WorkspaceStore COT: protege facturas APROBADAS contra borrado o alteración accidental en writeWorkspaceState', async () => {
  const db = createMockDb();
  const superAdmin = { role: 'superadmin', email: 'super@vt.com' };

  await writeWorkspaceState(db, superAdmin, {
    tenants: [{ id: 'tenant_cot', name: 'Empresa Protegida COT' }],
    invoices: [
      {
        id: 'inv_aprobada_1',
        tenantId: 'tenant_cot',
        supplierRif: 'J-40918273-8',
        invoiceNumber: '00001001',
        totalOriginal: 580,
        status: 'APROBADA'
      }
    ],
    employees: [],
    payments: []
  });

  // Intento de sobrescribir dejando invoices vacío o alterando el monto de la factura APROBADA
  await writeWorkspaceState(db, superAdmin, {
    tenants: [{ id: 'tenant_cot', name: 'Empresa Protegida COT' }],
    invoices: [],
    employees: [],
    payments: []
  });

  const check1 = await readWorkspaceState(db, superAdmin);
  assert.equal(check1.state.invoices.length, 1);
  assert.equal(check1.state.invoices[0].id, 'inv_aprobada_1');
  assert.equal(check1.state.invoices[0].totalOriginal, 580);
});
