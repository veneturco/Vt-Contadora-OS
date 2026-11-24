const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { emitDigitalInvoiceThroughPrinter } = require('../services/digitalPrinterConnector');
const {
  registerSubscriptionPayment,
  verifySaasWebhookSignature,
  reconcileSaasPaymentWebhook
} = require('../services/saasBillingEngine');
const { upsertAccountantAccount, authenticateUser } = require('../services/authService');
const { writeWorkspaceState, applyWorkspaceDelta, readWorkspaceState } = require('../services/workspaceStore');

function createMockDb() {
  const store = new Map();
  return {
    store,
    collection(col) {
      return {
        doc(id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`) {
          const path = `${col}/${id}`;
          return {
            id,
            async get() {
              const d = store.get(path);
              return { exists: d !== undefined, id, data: () => d };
            },
            async set(payload, opts = {}) {
              const prev = store.get(path) || {};
              store.set(path, opts.merge ? { ...prev, ...payload } : { ...payload });
              return true;
            },
            async update(payload) {
              const prev = store.get(path) || {};
              store.set(path, { ...prev, ...payload });
              return true;
            },
            async delete() {
              store.delete(path);
              return true;
            }
          };
        },
        async add(payload) {
          const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          store.set(`${col}/${id}`, payload);
          return { id };
        },
        where(field, op, val) {
          return {
            limit() {
              return {
                async get() {
                  const docs = [];
                  for (const [k, v] of store.entries()) {
                    if (k.startsWith(`${col}/`) && op === '==' && v && v[field] === val) {
                      docs.push({ id: k.split('/').pop(), data: () => v });
                    }
                  }
                  return { empty: docs.length === 0, docs };
                }
              };
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

test('Fase 4 · Imprenta Digital SENIAT (SNAT/2026/00093): asigna Nº Control correlativo y valida RIF Módulo 11', async () => {
  const db = createMockDb();
  const res1 = await emitDigitalInvoiceThroughPrinter(db, {
    tenantId: 't_dig_1',
    issuerName: 'Bodega JH C.A.',
    issuerRif: 'J-40918273-8',
    buyerName: 'Cliente Corporativo S.A.',
    buyerRif: 'J-30123456-1',
    currency: 'VES',
    taxableBaseOriginal: 1000,
    vatRate: 16
  });

  assert.equal(res1.ok, true);
  assert.equal(res1.providerMode, 'SANDBOX_LOCAL');
  assert.equal(res1.emittedInvoice.invoiceNumber, '00000001');
  assert.equal(res1.emittedInvoice.controlNumber, '00-00000001');
  assert.equal(res1.emittedInvoice.totalOriginal, 1160);
  assert.equal(res1.emittedInvoice.bookType, 'VENTA');

  const res2 = await emitDigitalInvoiceThroughPrinter(db, {
    tenantId: 't_dig_1',
    issuerName: 'Bodega JH C.A.',
    issuerRif: 'J-40918273-8',
    buyerName: 'Cliente 2',
    buyerRif: 'V-17216546-6',
    currency: 'USD',
    taxableBaseOriginal: 100,
    vatRate: 16
  });
  assert.equal(res2.emittedInvoice.invoiceNumber, '00000002');
  assert.equal(res2.emittedInvoice.controlNumber, '00-00000002');

  await assert.rejects(
    () =>
      emitDigitalInvoiceThroughPrinter(db, {
        tenantId: 't_dig_1',
        issuerName: 'Bodega JH C.A.',
        issuerRif: 'J-40918273-8',
        buyerName: 'Malo',
        buyerRif: 'J-00000000-9',
        taxableBaseOriginal: 100
      }),
    err => err.status === 400
  );
});

test('Fase 4 · Conciliación Automática SaaS Webhook: verifica firma HMAC y activa suscripción por referencia', async () => {
  const db = createMockDb();
  const secret = 'saas_webhook_test_secret_2026';
  const payload = JSON.stringify({
    provider: 'BINANCE_PAY',
    tenantId: 't_saas_auto',
    referenceNumber: 'BP-99887766',
    amountUsd: 29.99,
    status: 'PAID'
  });
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  assert.equal(verifySaasWebhookSignature(payload, sig, secret), true);
  assert.equal(verifySaasWebhookSignature(payload, 'bad_sig', secret), false);

  await registerSubscriptionPayment(db, {
    tenantId: 't_saas_auto',
    planId: 'COMERCIO_PRO',
    paymentMethod: 'BINANCE_PAY',
    referenceNumber: 'BP-99887766',
    bcvRate: 914.02,
    actorUid: 'client_1',
    actorRole: 'client'
  });

  const rec = await reconcileSaasPaymentWebhook(db, JSON.parse(payload));
  assert.equal(rec.ok, true);
  assert.equal(rec.reconciled, true);
  assert.equal(rec.status, 'ACTIVA');
  assert.equal(rec.paymentStatus, 'VERIFICADO');

  const tenantSnap = await db.collection('tenants').doc('t_saas_auto').get();
  assert.equal(tenantSnap.data().subscriptionStatus, 'ACTIVA');
});

test('Fase 4 · Sub-Roles Granulares de Firma Contable: AUDITOR_EXTERNO (solo lectura) y ASISTENTE_JUNIOR (sin sellado APROBADA)', async () => {
  const db = createMockDb();

  const auditorAcc = await upsertAccountantAccount(db, null, {
    name: 'Lic. Auditor Externo',
    cpcNumber: 'CPC-33333',
    email: 'auditor@firma.com',
    firmSubRole: 'AUDITOR_EXTERNO',
    assignedTenantIds: ['t_firm_1']
  });
  assert.equal(auditorAcc.accountant.firmSubRole, 'AUDITOR_EXTERNO');

  const auditorLogin = await authenticateUser(db, null, {
    email: 'auditor@firma.com',
    password: auditorAcc.tempPassword
  });
  assert.equal(auditorLogin.user.firmSubRole, 'AUDITOR_EXTERNO');

  // AUDITOR_EXTERNO es bloqueado en escritura (HTTP 403)
  await assert.rejects(
    () =>
      writeWorkspaceState(db, auditorLogin.user, {
        tenants: [{ id: 't_firm_1', name: 'Comercio Firma' }],
        invoices: [],
        employees: [],
        payments: []
      }),
    err => err.status === 403
  );

  // ASISTENTE_JUNIOR puede guardar borradores pero NO puede sellar APROBADA
  const juniorUser = {
    role: 'admin',
    firmSubRole: 'ASISTENTE_JUNIOR',
    email: 'junior@firma.com',
    tenantIds: ['t_firm_1']
  };
  await applyWorkspaceDelta(db, juniorUser, {
    tenantId: 't_firm_1',
    tenant: { id: 't_firm_1', name: 'Comercio Firma' },
    upsertInvoices: [
      { id: 'inv_j1', tenantId: 't_firm_1', supplierRif: 'J-40918273-8', invoiceNumber: '001', totalOriginal: 100, status: 'APROBADA' }
    ]
  });

  const afterJunior = await readWorkspaceState(db, auditorLogin.user);
  assert.equal(afterJunior.state.invoices.length, 1);
  assert.equal(afterJunior.state.invoices[0].status, 'BORRADOR_IA');

  // SOCIO_CPC sí puede sellar APROBADA
  const socioUser = {
    role: 'admin',
    firmSubRole: 'SOCIO_CPC',
    email: 'socio@firma.com',
    tenantIds: ['t_firm_1']
  };
  await applyWorkspaceDelta(db, socioUser, {
    tenantId: 't_firm_1',
    upsertInvoices: [
      { id: 'inv_j1', tenantId: 't_firm_1', supplierRif: 'J-40918273-8', invoiceNumber: '001', totalOriginal: 100, status: 'APROBADA' }
    ]
  });
  const afterSocio = await readWorkspaceState(db, socioUser);
  assert.equal(afterSocio.state.invoices[0].status, 'APROBADA');
});
