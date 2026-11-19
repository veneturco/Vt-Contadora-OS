// Guardián del Sistema — Agente Autónomo de Monitoreo, Cumplimiento SENIAT 2026 y Aprendizaje OCR
// VeneTurco Fiscal OS v3.4
const crypto = require('crypto');
const { validateVenezuelanRIF } = require('./seniatEngine');
const { PARTITIONED_COLLECTION } = require('./workspaceStore');

const GUARDIAN_ALERTS_COL = 'vt_guardian_alerts';
const GUARDIAN_OCR_MEMORY_COL = 'vt_guardian_ocr_memory';
// Período de transición de 180 días desde publicación en Gaceta Oficial (vigente hasta abril 2027)
const CONTINGENCY_GRACE_DEADLINE = '2027-04-30';

// Base normativa SENIAT Venezuela 2026 (reglas verificables)
const SENIAT_LEGAL_RULES = [
  {
    code: 'SNAT_2026_00093_ART_8',
    norm: 'Providencia SNAT/2026/00093 Art. 8',
    title: 'Requisitos formales obligatorios (Nº Control y Fecha)',
    penalty: 'Multa 100-150x TCMMV BCV y posible cierre temporal (COT Art. 101).'
  },
  {
    code: 'SNAT_2026_00093_ART_10_4',
    norm: 'Providencia SNAT/2026/00093 Art. 10.4',
    title: 'Ticket de Máquina Fiscal sin RIF del comprador',
    penalty: 'Descalificación total del Crédito Fiscal IVA en auditoría SENIAT.'
  },
  {
    code: 'SNAT_2026_00093_ART_6_7',
    norm: 'Providencia SNAT/2026/00093 Arts. 6 y 7 (Prórroga 180 días)',
    title: 'Talonario de Contingencia (Aceptado hasta 30/04/2027)',
    penalty: 'Vigente sin penalización durante los 180 días de transición (hasta abril 2027); luego exige reporte PDF <24h.'
  },
  {
    code: 'COT_ART_101_RIF_MOD11',
    norm: 'COT Art. 101 / Validación RIF Módulo 11',
    title: 'RIF de proveedor inválido o mal estructurado',
    penalty: 'Rechazo del Libro de Compras / Archivo TXT IVA en portal SENIAT.'
  },
  {
    code: 'SNAT_2015_0049_SPE_RET',
    norm: 'Providencia SNAT/2015/0049 (Agentes de Retención SPE)',
    title: 'Omisión de Retención de IVA (75%/100%) en Sujeto Pasivo Especial',
    penalty: 'Multa del 100% al 300% del tributo no retenido (COT Art. 115).'
  },
  {
    code: 'COT_ART_177_MATH_INTEGRITY',
    norm: 'COT Art. 177 / Integridad Matemática Tributaria',
    title: 'Descuadre matemático entre Base, Exento, IVA, IGTF y Total',
    penalty: 'Reparo fiscal por diferencia en débito/crédito fiscal declarado.'
  }
];

/**
 * Audita una factura individual contra la normativa SENIAT 2026
 */
function auditInvoiceSeniatCompliance(inv, tenant = {}) {
  const issues = [];
  if (!inv || typeof inv !== 'object') return issues;

  const rifCheck = validateVenezuelanRIF(inv.supplierRif);
  if (!rifCheck.valid) {
    issues.push({
      severity: 'CRITICAL',
      ruleCode: 'COT_ART_101_RIF_MOD11',
      norm: 'COT Art. 101 / Módulo 11',
      tenantId: inv.tenantId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || 'SIN_NUMERO',
      message: `RIF inválido (${inv.supplierRif || 'vacío'}) en factura #${inv.invoiceNumber || 'N/A'}.`,
      autoFixable: false
    });
  }

  if (!inv.controlNumber || String(inv.controlNumber).trim().length < 4 || !inv.emissionDate) {
    issues.push({
      severity: 'CRITICAL',
      ruleCode: 'SNAT_2026_00093_ART_8',
      norm: 'SNAT/2026/00093 Art. 8',
      tenantId: inv.tenantId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || 'SIN_NUMERO',
      message: `Falta Nº de Control o Fecha de Emisión en factura #${inv.invoiceNumber || 'N/A'}.`,
      autoFixable: false
    });
  }

  if (inv.channel === 'MAQUINA_FISCAL' && inv.hasBuyerRifOnTicket === false && inv.bookType === 'COMPRA') {
    issues.push({
      severity: 'WARNING',
      ruleCode: 'SNAT_2026_00093_ART_10_4',
      norm: 'SNAT/2026/00093 Art. 10.4',
      tenantId: inv.tenantId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || 'SIN_NUMERO',
      message: `Ticket #${inv.invoiceNumber} sin RIF del comprador: su IVA no es deducible como Crédito Fiscal.`,
      autoFixable: false
    });
  }

  if (inv.channel === 'CONTINGENCIA' && inv.emissionDate) {
    const emissionStr = String(inv.emissionDate).slice(0, 10);
    // Durante el período de adecuación de 180 días (hasta abril 2027) los talonarios de contingencia son plenamente aceptados
    if (emissionStr > CONTINGENCY_GRACE_DEADLINE) {
      const issuedMs = Date.parse(inv.emissionDate);
      if (!Number.isNaN(issuedMs) && Date.now() - issuedMs > 24 * 60 * 60 * 1000 && inv.status !== 'APROBADA') {
        issues.push({
          severity: 'CRITICAL',
          ruleCode: 'SNAT_2026_00093_ART_6_7',
          norm: 'SNAT/2026/00093 Arts. 6-7',
          tenantId: inv.tenantId,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || 'SIN_NUMERO',
          message: `Factura de Contingencia #${inv.invoiceNumber} posterior al 30/04/2027 supera 24h sin reporte/aprobación SENIAT.`,
          autoFixable: false
        });
      }
    }
  }

  const base = Number(inv.taxableBaseOriginal || 0);
  const exempt = Number(inv.exemptOriginal || 0);
  const vatRate = Number(inv.vatRate ?? (base > 0 ? 16 : 0));
  const vat = Number(inv.vatOriginal || 0);
  const igtf = Number(inv.igtfOriginal || 0);
  const total = Number(inv.totalOriginal || 0);
  const expectedVat = Number(((base * vatRate) / 100).toFixed(2));
  const expectedTotal = Number((base + exempt + expectedVat + igtf).toFixed(2));

  if (Math.abs(vat - expectedVat) > 0.1 || Math.abs(total - expectedTotal) > 0.15) {
    issues.push({
      severity: 'WARNING',
      ruleCode: 'COT_ART_177_MATH_INTEGRITY',
      norm: 'COT Art. 177',
      tenantId: inv.tenantId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || 'SIN_NUMERO',
      message: `Descuadre matemático en #${inv.invoiceNumber}: Total=${total.toFixed(2)} vs Esperado=${expectedTotal.toFixed(2)}.`,
      autoFixable: inv.status !== 'APROBADA'
    });
  }

  if (
    tenant &&
    tenant.regime === 'SPE' &&
    inv.bookType === 'COMPRA' &&
    vat > 0 &&
    Number(inv.vatRetentionRate || 0) === 0
  ) {
    issues.push({
      severity: 'WARNING',
      ruleCode: 'SNAT_2015_0049_SPE_RET',
      norm: 'SNAT/2015/0049 (SPE)',
      tenantId: inv.tenantId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber || 'SIN_NUMERO',
      message: `Empresa SPE (${tenant.name || inv.tenantId}) tiene compra #${inv.invoiceNumber} con IVA > 0 y retención en 0%.`,
      autoFixable: inv.status !== 'APROBADA'
    });
  }

  return issues;
}

/**
 * Registra un patrón de aprendizaje OCR (proveedores, correcciones, imágenes difíciles)
 */
async function recordOcrLearningPattern(db, { supplierRif, supplierName, channel, currency, vatRate, qualityIssue, mode, success }) {
  if (!db) return null;
  const nowIso = new Date().toISOString();
  const rifCheck = supplierRif ? validateVenezuelanRIF(supplierRif) : { valid: false };
  const docId = rifCheck.valid
    ? `vendor_${rifCheck.formatted.replace(/[^A-Za-z0-9]/g, '_')}`
    : `pattern_${crypto.createHash('sha1').update(`${supplierName || 'unknown'}_${qualityIssue || 'general'}`).digest('hex').slice(0, 12)}`;

  const ref = db.collection(GUARDIAN_OCR_MEMORY_COL).doc(docId);
  const snap = await ref.get();
  const prev = snap && snap.exists ? (snap.data() || {}) : {};
  const samplesCount = Number(prev.samplesCount || 0) + 1;
  const successCount = Number(prev.successCount || 0) + (success ? 1 : 0);
  const qualityNotes = Array.isArray(prev.qualityNotes) ? prev.qualityNotes.slice(-9) : [];
  if (qualityIssue && !qualityNotes.includes(qualityIssue)) {
    qualityNotes.push(qualityIssue);
  }

  const record = {
    id: docId,
    supplierRif: rifCheck.valid ? rifCheck.formatted : (prev.supplierRif || null),
    supplierName: supplierName || prev.supplierName || null,
    preferredChannel: channel || prev.preferredChannel || null,
    preferredCurrency: currency || prev.preferredCurrency || null,
    typicalVatRate: typeof vatRate === 'number' ? vatRate : (prev.typicalVatRate ?? null),
    lastMode: mode || prev.lastMode || null,
    samplesCount,
    successCount,
    qualityNotes,
    updatedAt: nowIso
  };

  await ref.set(record, { merge: true });
  return record;
}

/**
 * Obtiene pistas aprendidas por el Guardián para mejorar prompts de Gemini Vision y normalización OCR
 */
async function getOcrLearnedHints(db, limit = 12) {
  if (!db) return [];
  try {
    const snap = await db.collection(GUARDIAN_OCR_MEMORY_COL).get();
    if (!snap || snap.empty || !Array.isArray(snap.docs)) return [];
    return snap.docs
      .map(d => d.data())
      .filter(p => p && p.supplierRif && p.samplesCount >= 1)
      .sort((a, b) => Number(b.samplesCount || 0) - Number(a.samplesCount || 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Registra una alerta/error de telemetría en tiempo real
 */
async function recordGuardianAlert(db, { severity = 'WARNING', source = 'frontend', category = 'RUNTIME_ERROR', message, stack, route, userEmail, tenantId }) {
  if (!db || !message) return null;
  const nowIso = new Date().toISOString();
  const fingerprint = crypto
    .createHash('sha1')
    .update(`${source}|${category}|${String(message).slice(0, 140)}`)
    .digest('hex')
    .slice(0, 16);

  const ref = db.collection(GUARDIAN_ALERTS_COL).doc(`alert_${fingerprint}`);
  const snap = await ref.get();
  const prev = snap && snap.exists ? (snap.data() || {}) : {};

  const alertDoc = {
    id: `alert_${fingerprint}`,
    severity,
    source,
    category,
    message: String(message).slice(0, 400),
    stack: stack ? String(stack).slice(0, 800) : (prev.stack || null),
    route: route ? String(route).slice(0, 120) : (prev.route || null),
    userEmail: userEmail || prev.userEmail || null,
    tenantId: tenantId || prev.tenantId || null,
    occurrences: Number(prev.occurrences || 0) + 1,
    status: 'OPEN',
    firstSeenAt: prev.firstSeenAt || nowIso,
    lastSeenAt: nowIso
  };

  await ref.set(alertDoc, { merge: true });
  return alertDoc;
}

async function resolveGuardianAlert(db, alertId, actorEmail = 'superadmin') {
  const ref = db.collection(GUARDIAN_ALERTS_COL).doc(String(alertId));
  const snap = await ref.get();
  if (!snap || !snap.exists) {
    const err = new Error('Alerta no encontrada.');
    err.status = 404;
    throw err;
  }
  await ref.set(
    {
      status: 'RESOLVED',
      resolvedBy: actorEmail,
      resolvedAt: new Date().toISOString()
    },
    { merge: true }
  );
  return { ok: true, id: alertId, status: 'RESOLVED' };
}

/**
 * Auditoría integral del Guardián: infraestructura + cumplimiento SENIAT + auto-reparación segura de borradores
 */
async function runSystemGuardianAudit(db, { autoRepair = false, env = process.env } = {}) {
  const nowIso = new Date().toISOString();
  const infraFindings = [];
  const seniatFindings = [];
  let tenantsAudited = 0;
  let invoicesAudited = 0;
  let draftsAutoRepaired = 0;

  // 1. Auditoría de infraestructura y configuración crítica
  if (db && db.isFallback) {
    infraFindings.push({
      severity: 'CRITICAL',
      category: 'STORAGE',
      message: 'Cloud Firestore no está respondiendo; operando temporalmente en memoria volátil.'
    });
  }
  if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY === 'tu_clave_gemini_ai_studio') {
    infraFindings.push({
      severity: 'WARNING',
      category: 'OCR_AI',
      message: 'GEMINI_API_KEY no configurada: el OCR funciona con QR/texto, pero fotos/PDF sin QR requieren esta clave.'
    });
  }
  if (!env.AES_MASTER_KEY || String(env.AES_MASTER_KEY).length < 16) {
    infraFindings.push({
      severity: 'CRITICAL',
      category: 'SECURITY',
      message: 'AES_MASTER_KEY ausente o débil en el entorno del servidor.'
    });
  }

  // 2. Auditoría de workspaces particionados (SENIAT + Duplicados + Auto-reparación segura)
  try {
    const snap = await db.collection(PARTITIONED_COLLECTION).get();
    const docs = snap && !snap.empty && Array.isArray(snap.docs) ? snap.docs : [];
    for (const d of docs) {
      const data = d.data() || {};
      const tenant = data.tenant || { id: d.id };
      const invoices = Array.isArray(data.invoices) ? data.invoices : [];
      tenantsAudited += 1;
      invoicesAudited += invoices.length;

      const seenKeys = new Set();
      let tenantDirty = false;
      const repairedInvoices = invoices.map(inv => {
        if (!inv) return inv;
        const dupKey = `${String(inv.supplierRif || '').toUpperCase()}|${String(inv.invoiceNumber || '').toUpperCase()}`;
        if (inv.supplierRif && inv.invoiceNumber) {
          if (seenKeys.has(dupKey)) {
            seniatFindings.push({
              severity: 'CRITICAL',
              ruleCode: 'DUPLICATE_INVOICE',
              norm: 'Control Anti-Fraude SENIAT',
              tenantId: tenant.id,
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              message: `Factura duplicada detectada (#${inv.invoiceNumber} / ${inv.supplierRif}) en ${tenant.name || tenant.id}.`,
              autoFixable: false
            });
          } else {
            seenKeys.add(dupKey);
          }
        }

        let current = inv;
        if (autoRepair && current.status !== 'APROBADA') {
          const base = Number(current.taxableBaseOriginal || 0);
          const exempt = Number(current.exemptOriginal || 0);
          const vatRate = Number(current.vatRate ?? (base > 0 ? 16 : 0));
          const expectedVat = Number(((base * vatRate) / 100).toFixed(2));
          const igtf = Number(current.igtfOriginal || 0);
          const expectedTotal = Number((base + exempt + expectedVat + igtf).toFixed(2));
          let changed = false;

          const patched = { ...current };
          if (Math.abs(Number(current.vatOriginal || 0) - expectedVat) > 0.1 || Math.abs(Number(current.totalOriginal || 0) - expectedTotal) > 0.15) {
            patched.vatRate = vatRate;
            patched.vatOriginal = expectedVat;
            patched.totalOriginal = expectedTotal;
            changed = true;
          }
          if (tenant.regime === 'SPE' && current.bookType === 'COMPRA' && expectedVat > 0 && Number(current.vatRetentionRate || 0) === 0) {
            patched.vatRetentionRate = 75;
            changed = true;
          }
          if (changed) {
            current = patched;
            tenantDirty = true;
            draftsAutoRepaired += 1;
          }
        }

        const invIssues = auditInvoiceSeniatCompliance(current, tenant);
        seniatFindings.push(...invIssues);
        return current;
      });

      if (autoRepair && tenantDirty) {
        await db.collection(PARTITIONED_COLLECTION).doc(d.id).set(
          {
            invoices: repairedInvoices,
            updatedAt: nowIso,
            updatedBy: 'guardian:auto_repair'
          },
          { merge: true }
        );
      }
    }
  } catch (err) {
    infraFindings.push({
      severity: 'CRITICAL',
      category: 'AUDIT_ENGINE',
      message: `Error recorriendo workspaces: ${err.message}`
    });
  }

  // 3. Cargar alertas abiertas y memoria OCR aprendida
  let openAlerts = [];
  let ocrPatternsCount = 0;
  let ocrTotalSamples = 0;
  try {
    const alertsSnap = await db.collection(GUARDIAN_ALERTS_COL).get();
    if (alertsSnap && !alertsSnap.empty && Array.isArray(alertsSnap.docs)) {
      openAlerts = alertsSnap.docs
        .map(d => d.data())
        .filter(a => a && a.status !== 'RESOLVED')
        .sort((a, b) => String(b.lastSeenAt || '').localeCompare(String(a.lastSeenAt || '')))
        .slice(0, 30);
    }
  } catch {
    openAlerts = [];
  }

  try {
    const ocrSnap = await db.collection(GUARDIAN_OCR_MEMORY_COL).get();
    if (ocrSnap && !ocrSnap.empty && Array.isArray(ocrSnap.docs)) {
      const patterns = ocrSnap.docs.map(d => d.data()).filter(Boolean);
      ocrPatternsCount = patterns.length;
      ocrTotalSamples = patterns.reduce((acc, p) => acc + Number(p.samplesCount || 0), 0);
    }
  } catch {
    ocrPatternsCount = 0;
  }

  // 4. Calcular Salud Global (0 - 100)
  const criticalCount =
    infraFindings.filter(f => f.severity === 'CRITICAL').length +
    seniatFindings.filter(f => f.severity === 'CRITICAL').length +
    openAlerts.filter(a => a.severity === 'CRITICAL').length;
  const warningCount =
    infraFindings.filter(f => f.severity === 'WARNING').length +
    seniatFindings.filter(f => f.severity === 'WARNING').length +
    openAlerts.filter(a => a.severity === 'WARNING').length;

  const healthScore = Math.max(15, 100 - criticalCount * 12 - warningCount * 4);

  return {
    ok: true,
    guardianName: 'Guardián del Sistema VT',
    checkedAt: nowIso,
    healthScore,
    status: healthScore >= 85 ? 'OPTIMO' : healthScore >= 60 ? 'ATENCION' : 'CRITICO',
    metrics: {
      tenantsAudited,
      invoicesAudited,
      draftsAutoRepaired,
      criticalCount,
      warningCount,
      openAlertsCount: openAlerts.length,
      ocrPatternsCount,
      ocrTotalSamples
    },
    infraFindings,
    seniatFindings: seniatFindings.slice(0, 50),
    openAlerts,
    legalRulesCatalog: SENIAT_LEGAL_RULES
  };
}

module.exports = {
  GUARDIAN_ALERTS_COL,
  GUARDIAN_OCR_MEMORY_COL,
  SENIAT_LEGAL_RULES,
  auditInvoiceSeniatCompliance,
  recordOcrLearningPattern,
  getOcrLearnedHints,
  recordGuardianAlert,
  resolveGuardianAlert,
  runSystemGuardianAudit
};
