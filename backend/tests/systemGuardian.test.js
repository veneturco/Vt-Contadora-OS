const test = require('node:test');
const assert = require('node:assert/strict');
const {
  auditInvoiceSeniatCompliance,
  recordOcrLearningPattern,
  getOcrLearnedHints,
  recordGuardianAlert,
  resolveGuardianAlert,
  runSystemGuardianAudit
} = require('../services/systemGuardian');
const { PARTITIONED_COLLECTION } = require('../services/workspaceStore');

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

test('Guardián SENIAT: detecta RIF inválido, falta de control, Art. 10.4, omisión SPE y descuadre matemático', () => {
  const tenantSpe = { id: 't_spe', name: 'Comercial SPE', regime: 'SPE' };
  const badInvoice = {
    id: 'inv_bad_1',
    tenantId: 't_spe',
    bookType: 'COMPRA',
    channel: 'MAQUINA_FISCAL',
    hasBuyerRifOnTicket: false,
    supplierRif: 'J-00000000-9',
    invoiceNumber: '00001234',
    controlNumber: '',
    emissionDate: '',
    taxableBaseOriginal: 100,
    exemptOriginal: 0,
    vatRate: 16,
    vatOriginal: 10,
    igtfOriginal: 0,
    totalOriginal: 150,
    vatRetentionRate: 0,
    status: 'BORRADOR_IA'
  };

  const issues = auditInvoiceSeniatCompliance(badInvoice, tenantSpe);
  const codes = issues.map(i => i.ruleCode);
  assert.ok(codes.includes('COT_ART_101_RIF_MOD11'));
  assert.ok(codes.includes('SNAT_2026_00093_ART_8'));
  assert.ok(codes.includes('SNAT_2026_00093_ART_10_4'));
  assert.ok(codes.includes('COT_ART_177_MATH_INTEGRITY'));
  assert.ok(codes.includes('SNAT_2015_0049_SPE_RET'));
});

test('Guardián Auto-Reparación: corrige borradores descuadrados sin alterar facturas APROBADAS inmutables', async () => {
  const db = createMockDb();
  await db.collection(PARTITIONED_COLLECTION).doc('t_spe').set({
    tenantId: 't_spe',
    tenant: { id: 't_spe', name: 'Comercial SPE', regime: 'SPE' },
    invoices: [
      {
        id: 'inv_draft',
        tenantId: 't_spe',
        bookType: 'COMPRA',
        channel: 'DIGITAL',
        supplierRif: 'J-40918273-8',
        invoiceNumber: '00000011',
        controlNumber: '00-001122',
        emissionDate: '2026-11-19',
        taxableBaseOriginal: 100,
        exemptOriginal: 0,
        vatRate: 16,
        vatOriginal: 5,
        igtfOriginal: 0,
        totalOriginal: 105,
        vatRetentionRate: 0,
        status: 'BORRADOR_IA'
      },
      {
        id: 'inv_locked',
        tenantId: 't_spe',
        bookType: 'COMPRA',
        channel: 'DIGITAL',
        supplierRif: 'J-40918273-8',
        invoiceNumber: '00000012',
        controlNumber: '00-001123',
        emissionDate: '2026-11-19',
        taxableBaseOriginal: 100,
        exemptOriginal: 0,
        vatRate: 16,
        vatOriginal: 5,
        igtfOriginal: 0,
        totalOriginal: 105,
        vatRetentionRate: 0,
        status: 'APROBADA'
      }
    ]
  });

  const report = await runSystemGuardianAudit(db, {
    autoRepair: true,
    env: { GEMINI_API_KEY: 'test_key', AES_MASTER_KEY: '0123456789abcdef0123456789abcdef' }
  });
  assert.equal(report.metrics.draftsAutoRepaired, 1);

  const saved = (await db.collection(PARTITIONED_COLLECTION).doc('t_spe').get()).data();
  const draft = saved.invoices.find(i => i.id === 'inv_draft');
  const locked = saved.invoices.find(i => i.id === 'inv_locked');
  assert.equal(draft.vatOriginal, 16);
  assert.equal(draft.totalOriginal, 116);
  assert.equal(draft.vatRetentionRate, 75);
  assert.equal(locked.totalOriginal, 105);
});

test('Guardián Memoria OCR y Telemetría: aprende patrones y deduplica/resuelve alertas', async () => {
  const db = createMockDb();
  await recordOcrLearningPattern(db, {
    supplierRif: 'J-40918273-8',
    supplierName: 'Distribuidora Oriente C.A.',
    channel: 'DIGITAL',
    currency: 'USD',
    vatRate: 16,
    qualityIssue: 'ticket ligeramente doblado',
    mode: 'VNDE_TIER_3_GEMINI_VISION',
    success: true
  });
  const hints = await getOcrLearnedHints(db);
  assert.equal(hints.length, 1);
  assert.equal(hints[0].supplierRif, 'J-40918273-8');

  const a1 = await recordGuardianAlert(db, {
    severity: 'WARNING',
    category: 'FRONTEND_RUNTIME',
    message: 'TypeError: Cannot read properties of undefined'
  });
  const a2 = await recordGuardianAlert(db, {
    severity: 'WARNING',
    category: 'FRONTEND_RUNTIME',
    message: 'TypeError: Cannot read properties of undefined'
  });
  assert.equal(a1.id, a2.id);
  assert.equal(a2.occurrences, 2);

  const resolved = await resolveGuardianAlert(db, a1.id, 'super@vt.com');
  assert.equal(resolved.status, 'RESOLVED');
});
