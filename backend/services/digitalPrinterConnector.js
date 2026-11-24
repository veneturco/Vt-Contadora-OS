// Conector de Imprentas Digitales Homologadas SENIAT (Providencia SNAT/2026/00093)
// Soporta modo Producción (API HTTP externa de Imprenta Digital autorizada) y modo Sandbox Homologado ($0)
// con asignación correlativa de Nº de Control (00-XXXXXXXX) y sello criptográfico SHA-256.

const { computeAuditHash } = require('../security/cryptoVault');
const { validateVenezuelanRIF } = require('./seniatEngine');

const DIGITAL_PRINTER_PROVIDERS = {
  THE_FACTORY_HKA: 'THE_FACTORY_HKA',
  UNIDIGITAL_VE: 'UNIDIGITAL_VE',
  SENIAT_SANDBOX_MOCK: 'SENIAT_SANDBOX_MOCK'
};

function buildSeniatDigitalInvoicePayload({
  issuerName,
  issuerRif,
  buyerName,
  buyerRif,
  docType = '01',
  currency = 'VES',
  bcvRate = 914.02,
  taxableBaseOriginal = 0,
  exemptOriginal = 0,
  vatRate = 16,
  igtfOriginal = 0,
  items = []
}) {
  const base = Number(Number(taxableBaseOriginal || 0).toFixed(2));
  const exempt = Number(Number(exemptOriginal || 0).toFixed(2));
  const rate = Number(vatRate ?? (base > 0 ? 16 : 0));
  const vat = Number(((base * rate) / 100).toFixed(2));
  const igtf = Number(Number(igtfOriginal || 0).toFixed(2));
  const total = Number((base + exempt + vat + igtf).toFixed(2));

  const now = new Date();
  const emissionDate = now.toISOString().slice(0, 10);
  const emissionTime = now.toTimeString().slice(0, 8);

  return {
    norm: 'SNAT/2026/00093',
    docType,
    channel: 'DIGITAL',
    issuer: { name: issuerName, rif: issuerRif },
    buyer: { name: buyerName, rif: buyerRif },
    emissionDate,
    emissionTime,
    currency,
    bcvRateOnDate: Number(bcvRate || 914.02),
    amounts: {
      taxableBaseOriginal: base,
      exemptOriginal: exempt,
      vatRate: rate,
      vatOriginal: vat,
      igtfOriginal: igtf,
      totalOriginal: total
    },
    items: Array.isArray(items) ? items : []
  };
}

async function allocateNextCorrelativeNumbers(db, tenantId) {
  const seqRef = db.collection(`tenants/${tenantId}/digital_sequences`).doc('seniat_control');
  const snap = await seqRef.get();
  const prev = snap && snap.exists ? (snap.data() || {}) : {};
  const nextInvoiceSeq = Number(prev.lastInvoiceSeq || 0) + 1;
  const nextControlSeq = Number(prev.lastControlSeq || 0) + 1;

  await seqRef.set(
    {
      lastInvoiceSeq: nextInvoiceSeq,
      lastControlSeq: nextControlSeq,
      updatedAt: new Date().toISOString()
    },
    { merge: true }
  );

  return {
    invoiceNumber: String(nextInvoiceSeq).padStart(8, '0'),
    controlNumber: `00-${String(nextControlSeq).padStart(8, '0')}`
  };
}

async function emitDigitalInvoiceThroughPrinter(db, params, env = process.env) {
  const issuerRifCheck = validateVenezuelanRIF(params.issuerRif);
  if (!issuerRifCheck.valid) {
    const err = new Error(`RIF del emisor inválido (Módulo 11): ${params.issuerRif || 'vacío'}`);
    err.status = 400;
    throw err;
  }
  const buyerRifCheck = validateVenezuelanRIF(params.buyerRif);
  if (!buyerRifCheck.valid) {
    const err = new Error(`RIF del comprador inválido (Módulo 11): ${params.buyerRif || 'vacío'}`);
    err.status = 400;
    throw err;
  }

  const canonical = buildSeniatDigitalInvoicePayload({
    ...params,
    issuerRif: issuerRifCheck.formatted,
    buyerRif: buyerRifCheck.formatted
  });

  if (canonical.amounts.totalOriginal <= 0) {
    const err = new Error('El monto total de la factura digital debe ser mayor a 0.');
    err.status = 400;
    throw err;
  }

  const apiUrl = String(env.DIGITAL_PRINTER_API_URL || '').trim();
  const apiKey = String(env.DIGITAL_PRINTER_API_KEY || '').trim();
  const provider = String(env.DIGITAL_PRINTER_PROVIDER || DIGITAL_PRINTER_PROVIDERS.SENIAT_SANDBOX_MOCK).trim();

  let invoiceNumber;
  let controlNumber;
  let providerMode = 'SANDBOX_LOCAL';

  if (apiUrl && apiKey && provider !== DIGITAL_PRINTER_PROVIDERS.SENIAT_SANDBOX_MOCK) {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(canonical),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.controlNumber) {
      const err = new Error(`Imprenta Digital (${provider}) rechazó la emisión: ${data.error || resp.statusText}`);
      err.status = 502;
      throw err;
    }
    invoiceNumber = String(data.invoiceNumber || '').padStart(8, '0');
    controlNumber = String(data.controlNumber);
    providerMode = `LIVE_${provider}`;
  } else {
    const seq = await allocateNextCorrelativeNumbers(db, params.tenantId);
    invoiceNumber = seq.invoiceNumber;
    controlNumber = seq.controlNumber;
  }

  const invoiceId = `dig_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const auditHash = computeAuditHash('DIGITAL_PRINTER_EMIT', {
    tenantId: params.tenantId,
    invoiceId,
    invoiceNumber,
    controlNumber,
    buyerRif: buyerRifCheck.formatted,
    total: canonical.amounts.totalOriginal
  });

  const emittedInvoice = {
    id: invoiceId,
    tenantId: params.tenantId,
    bookType: 'VENTA',
    docType: canonical.docType,
    channel: 'DIGITAL',
    supplierRif: buyerRifCheck.formatted,
    supplierName: String(params.buyerName || `Cliente (${buyerRifCheck.formatted})`).slice(0, 150),
    buyerRif: buyerRifCheck.formatted,
    buyerName: String(params.buyerName || '').slice(0, 150),
    hasBuyerRifOnTicket: true,
    invoiceNumber,
    controlNumber,
    emissionDate: canonical.emissionDate,
    emissionTime: canonical.emissionTime,
    currency: canonical.currency,
    bcvRateOnDate: canonical.bcvRateOnDate,
    taxableBaseOriginal: canonical.amounts.taxableBaseOriginal,
    exemptOriginal: canonical.amounts.exemptOriginal,
    vatRate: canonical.amounts.vatRate,
    vatOriginal: canonical.amounts.vatOriginal,
    igtfOriginal: canonical.amounts.igtfOriginal,
    totalOriginal: canonical.amounts.totalOriginal,
    vatRetentionRate: 0,
    islrRetentionRate: 0,
    status: 'BORRADOR_IA',
    sourceChannel: 'MANUAL',
    digitalPrinterProvider: providerMode,
    auditHash,
    createdAt: new Date().toISOString()
  };

  return {
    ok: true,
    providerMode,
    emittedInvoice,
    auditHash
  };
}

module.exports = {
  DIGITAL_PRINTER_PROVIDERS,
  buildSeniatDigitalInvoicePayload,
  emitDigitalInvoiceThroughPrinter
};
