const crypto = require('crypto');
const { computeAuditHash } = require('../security/cryptoVault');

const SAAS_PLANS = {
  COMERCIO_PRO: { id: 'COMERCIO_PRO', name: 'Comercio & PyME Pro', priceUsdMonthly: 29.99, maxInvoicesMonthly: 500, includesPayroll: false },
  EMPRESA_MAX: { id: 'EMPRESA_MAX', name: 'Empresa & SPE Max', priceUsdMonthly: 79.99, maxInvoicesMonthly: 3000, includesPayroll: true },
  FIRMA_CONTABLE: { id: 'FIRMA_CONTABLE', name: 'Firma Contable Multiempresa', priceUsdMonthly: 139.99, maxInvoicesMonthly: 15000, includesPayroll: true }
};

function generateTelegramLinkCode(tenantId) {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `VT-${tenantId.slice(0, 4).toUpperCase()}-${suffix}`;
}

async function registerSubscriptionPayment(db, { tenantId, planId, paymentMethod, referenceNumber, amountUsd, bcvRate, actorUid }) {
  const plan = SAAS_PLANS[planId] || SAAS_PLANS.COMERCIO_PRO;
  const amountBs = Number((amountUsd * bcvRate).toFixed(2));
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 30);

  const paymentRef = db.collection(`tenants/${tenantId}/subscriptions`).doc();
  const auditHash = computeAuditHash('SAAS_BILLING', { tenantId, planId, referenceNumber, amountUsd });

  await paymentRef.set({
    paymentId: paymentRef.id,
    tenantId,
    planId: plan.id,
    planName: plan.name,
    paymentMethod, // PAGO_MOVIL | ZELLE | BINANCE_PAY | TRANSFERENCIA_VES
    referenceNumber,
    amountUsd,
    bcvRate,
    amountBs,
    status: 'VERIFICADO',
    auditHash,
    createdAt: new Date().toISOString()
  });

  await db.collection('tenants').doc(tenantId).update({
    planId: plan.id,
    subscriptionStatus: 'ACTIVA',
    nextBillingDate: nextDueDate.toISOString().slice(0, 10),
    updatedAt: new Date().toISOString()
  });

  await db.collection(`tenants/${tenantId}/audit_logs`).add({
    action: 'RENOVACION_LICENCIA_SAAS',
    actorUid: actorUid || 'ADMIN_SAAS',
    sha256Hash: auditHash,
    details: `Plan ${plan.name} activado hasta ${nextDueDate.toISOString().slice(0, 10)} (Ref: ${referenceNumber})`,
    timestamp: new Date().toISOString()
  });

  return { status: 'ACTIVA', nextBillingDate: nextDueDate.toISOString().slice(0, 10), amountBs, auditHash };
}

async function suspendExpiredSubscriptions(db) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const activeSnap = await db.collection('tenants').where('subscriptionStatus', '==', 'ACTIVA').limit(500).get();
  if (!activeSnap || activeSnap.empty) return { checked: 0, suspended: [] };

  const suspended = [];
  for (const doc of activeSnap.docs) {
    const data = doc.data();
    if (data.nextBillingDate && data.nextBillingDate < todayStr) {
      await db.collection('tenants').doc(doc.id).update({
        subscriptionStatus: 'SUSPENDIDA',
        suspendedAt: new Date().toISOString()
      });
      const auditHash = computeAuditHash('SAAS_MOROSIDAD', { tenantId: doc.id, due: data.nextBillingDate });
      await db.collection(`tenants/${doc.id}/audit_logs`).add({
        action: 'SUSPENSION_AUTOMATICA_MORA',
        actorUid: 'system:saas_billing_cron',
        sha256Hash: auditHash,
        details: `Licencia suspendida automaticamente por vencimiento (${data.nextBillingDate} < ${todayStr}).`,
        timestamp: new Date().toISOString()
      });
      suspended.push(doc.id);
    }
  }
  return { checked: activeSnap.docs.length, suspended };
}

module.exports = { SAAS_PLANS, generateTelegramLinkCode, registerSubscriptionPayment, suspendExpiredSubscriptions };
