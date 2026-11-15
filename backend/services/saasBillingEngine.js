const crypto = require('crypto');
const { computeAuditHash } = require('../security/cryptoVault');

const SAAS_PLANS = {
  COMERCIO_PRO: { id: 'COMERCIO_PRO', name: 'Comercio & PyME Pro', priceUsdMonthly: 29.99, maxInvoicesMonthly: 500, includesPayroll: false },
  EMPRESA_MAX: { id: 'EMPRESA_MAX', name: 'Empresa & SPE Max', priceUsdMonthly: 79.99, maxInvoicesMonthly: 3000, includesPayroll: true },
  FIRMA_CONTABLE: { id: 'FIRMA_CONTABLE', name: 'Firma Contable Multiempresa', priceUsdMonthly: 139.99, maxInvoicesMonthly: 15000, includesPayroll: true }
};

function generateTelegramLinkCode(tenantId) {
  const cleanPrefix = String(tenantId || 'VENE').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'VENE';
  const suffix = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `VT-${cleanPrefix}-${suffix}`;
}

async function registerSubscriptionPayment(db, { tenantId, planId, paymentMethod, referenceNumber, bcvRate, actorUid, actorRole }) {
  const plan = SAAS_PLANS[planId];
  if (!plan) {
    const err = new Error('Plan SaaS inválido o no existente en el catálogo oficial.');
    err.status = 400;
    throw err;
  }
  const cleanRef = String(referenceNumber || '').trim();
  if (cleanRef.length < 6) {
    const err = new Error('El número de referencia bancaria debe tener al menos 6 caracteres verificables.');
    err.status = 400;
    throw err;
  }

  // Tomar el precio en USD exclusivamente del catálogo oficial del servidor (previene manipulación de montos en cliente)
  const officialAmountUsd = plan.priceUsdMonthly;
  const safeBcvRate = Number(bcvRate) > 0 ? Number(bcvRate) : 47.05;
  const amountBs = Number((officialAmountUsd * safeBcvRate).toFixed(2));
  const isAutoVerified = actorRole === 'admin';
  const paymentStatus = isAutoVerified ? 'VERIFICADO' : 'PENDIENTE_VERIFICACION';

  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 30);

  const paymentRef = db.collection(`tenants/${tenantId}/subscriptions`).doc();
  const auditHash = computeAuditHash('SAAS_BILLING', {
    tenantId,
    planId: plan.id,
    referenceNumber: cleanRef,
    amountUsd: officialAmountUsd,
    status: paymentStatus
  });

  await paymentRef.set({
    paymentId: paymentRef.id,
    tenantId,
    planId: plan.id,
    planName: plan.name,
    paymentMethod, // PAGO_MOVIL | ZELLE | BINANCE_PAY | TRANSFERENCIA_VES
    referenceNumber: cleanRef,
    amountUsd: officialAmountUsd,
    bcvRate: safeBcvRate,
    amountBs,
    status: paymentStatus,
    auditHash,
    createdAt: new Date().toISOString()
  });

  if (isAutoVerified) {
    await db.collection('tenants').doc(tenantId).update({
      planId: plan.id,
      subscriptionStatus: 'ACTIVA',
      nextBillingDate: nextDueDate.toISOString().slice(0, 10),
      updatedAt: new Date().toISOString()
    });
  }

  await db.collection(`tenants/${tenantId}/audit_logs`).add({
    action: isAutoVerified ? 'RENOVACION_LICENCIA_SAAS' : 'REPORTE_PAGO_PENDIENTE_SAAS',
    actorUid: actorUid || 'ADMIN_SAAS',
    sha256Hash: auditHash,
    details: isAutoVerified
      ? `Plan ${plan.name} activado hasta ${nextDueDate.toISOString().slice(0, 10)} (Ref: ${cleanRef})`
      : `Pago reportado en revisión para plan ${plan.name} (Ref: ${cleanRef}) por USD ${officialAmountUsd}`,
    timestamp: new Date().toISOString()
  });

  return {
    status: isAutoVerified ? 'ACTIVA' : 'PENDIENTE_VERIFICACION',
    paymentStatus,
    nextBillingDate: nextDueDate.toISOString().slice(0, 10),
    amountUsd: officialAmountUsd,
    amountBs,
    auditHash
  };
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

async function approveSubscriptionPayment(db, { tenantId, paymentId, actorUid }) {
  const paymentRef = db.collection(`tenants/${tenantId}/subscriptions`).doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    const err = new Error('Registro de pago no encontrado para esta empresa.');
    err.status = 404;
    throw err;
  }
  const paymentData = paymentSnap.data();
  const plan = SAAS_PLANS[paymentData.planId] || SAAS_PLANS.COMERCIO_PRO;
  const nextDueDate = new Date();
  nextDueDate.setDate(nextDueDate.getDate() + 30);
  const nextBillingDate = nextDueDate.toISOString().slice(0, 10);

  const auditHash = computeAuditHash('SAAS_PAYMENT_APPROVED', {
    tenantId,
    paymentId,
    planId: plan.id,
    actorUid: actorUid || 'ADMIN_SAAS'
  });

  await paymentRef.update({
    status: 'VERIFICADO',
    verifiedBy: actorUid || 'ADMIN_SAAS',
    verifiedAt: new Date().toISOString(),
    auditHash
  });

  await db.collection('tenants').doc(tenantId).set({
    planId: plan.id,
    subscriptionStatus: 'ACTIVA',
    nextBillingDate,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  await db.collection(`tenants/${tenantId}/audit_logs`).add({
    action: 'CONCILIACION_APROBADA_SAAS',
    actorUid: actorUid || 'ADMIN_SAAS',
    sha256Hash: auditHash,
    details: `Pago #${paymentData.referenceNumber} verificado y plan ${plan.name} activado hasta ${nextBillingDate}`,
    timestamp: new Date().toISOString()
  });

  return { status: 'ACTIVA', paymentStatus: 'VERIFICADO', nextBillingDate, planId: plan.id, auditHash };
}

async function checkTenantPlanQuota(db, tenantId, { requirePayroll = false } = {}) {
  if (!tenantId) return { allowed: true };
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (!tenantDoc.exists) {
    return { allowed: true, plan: SAAS_PLANS.EMPRESA_MAX };
  }
  const tData = tenantDoc.data();
  if (tData.subscriptionStatus === 'SUSPENDIDA') {
    return {
      allowed: false,
      status: 402,
      error: 'Licencia SaaS SUSPENDIDA por vencimiento. Renueve su suscripción para continuar operando.'
    };
  }
  const plan = SAAS_PLANS[tData.planId] || SAAS_PLANS.EMPRESA_MAX;
  if (requirePayroll && !plan.includesPayroll) {
    return {
      allowed: false,
      status: 403,
      error: `El plan actual (${plan.name}) no incluye el motor de Nómina LOTTT. Actualice a EMPRESA_MAX o FIRMA_CONTABLE.`
    };
  }
  const periodKey = new Date().toISOString().slice(0, 7);
  const usageRef = db.collection(`tenants/${tenantId}/usage`).doc(periodKey);
  const usageSnap = await usageRef.get();
  const usedInvoices = usageSnap.exists ? Number(usageSnap.data().invoicesCount || 0) : 0;

  if (usedInvoices >= plan.maxInvoicesMonthly) {
    return {
      allowed: false,
      status: 429,
      error: `Límite mensual del plan ${plan.name} alcanzado (${usedInvoices}/${plan.maxInvoicesMonthly} facturas en ${periodKey}).`
    };
  }
  return { allowed: true, plan, usedInvoices, maxInvoicesMonthly: plan.maxInvoicesMonthly, periodKey };
}

async function incrementTenantInvoiceUsage(db, tenantId) {
  if (!tenantId) return;
  const periodKey = new Date().toISOString().slice(0, 7);
  const usageRef = db.collection(`tenants/${tenantId}/usage`).doc(periodKey);
  const usageSnap = await usageRef.get();
  const current = usageSnap.exists ? Number(usageSnap.data().invoicesCount || 0) : 0;
  await usageRef.set({
    periodKey,
    invoicesCount: current + 1,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

module.exports = {
  SAAS_PLANS,
  generateTelegramLinkCode,
  registerSubscriptionPayment,
  approveSubscriptionPayment,
  checkTenantPlanQuota,
  incrementTenantInvoiceUsage,
  suspendExpiredSubscriptions
};
