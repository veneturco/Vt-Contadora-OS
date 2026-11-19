const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseVenezuelanAmount,
  parseSeniatFiscalQr,
  parseSeniatRawText,
  processFiscalInvoiceVNDE
} = require('../services/vndeFiscalProcessor');

test('VNDE: Normalización de montos monetarios venezolanos', () => {
  assert.equal(parseVenezuelanAmount('435.475,58 Bs.'), 435475.58);
  assert.equal(parseVenezuelanAmount('6,180.32'), 6180.32);
  assert.equal(parseVenezuelanAmount('488,68 $'), 488.68);
  assert.equal(parseVenezuelanAmount('426,23'), 426.23);
  assert.equal(parseVenezuelanAmount('0,00'), 0);
});

test('VNDE: Decodificación de QR Fiscal SENIAT (Costo $0 / 0 Tokens)', () => {
  const qrPayload = 'J-40549697-5|V-17216546-6|00038205|00-041538|2026-11-03|0.00|0.00|435475.58';
  const result = parseSeniatFiscalQr(qrPayload);

  assert.ok(result);
  assert.equal(result.tokensUsed, 0);
  assert.equal(result.extracted.supplierRif, 'J-40549697-5');
  assert.equal(result.extracted.buyerRif, 'V-17216546-6');
  assert.equal(result.extracted.invoiceNumber, '00038205');
  assert.equal(result.extracted.controlNumber, '00-041538');
  assert.equal(result.extracted.mathValid, true);
});

test('VNDE: Procesamiento Determinista Muestra 1 - Maxi Embutidos (Forma Libre, Exento)', () => {
  const sample1Text = `
    DISTRIBUIDORA MAXI EMBUTIDOS, C.A.
    Ventas al mayor y detal de charcuteria
    Dirección Fiscal: Av. Universitaria local Galpones Milano Carúpano
    RIF: J-40549697-5
    Razon Social: LENNYS DEL VALLE ALCANTARA TOVAR
    R.I.F.: V172165466
    FORMA LIBRE / N° DE CONTROL 00-041538
    Factura 00038205
    Fecha - Hora 03/11/2026 04:50PM
    Monto Bruto: 488,68 $ 435.475,58 Bs.
    Exento: 488,68 $ 435.475,58 Bs.
    Base imp. al 16%: 0,00 $ 0,00 Bs.
    I.V.A. al 16%: 0,00 $ 0,00 Bs.
    TOT. FACTURA: 488,68 $ 435.475,58 Bs.
    TOT A PAGAR: 488,68 $ 435.475,58 Bs.
  `;

  const parsed = parseSeniatRawText(sample1Text);
  assert.ok(parsed);
  assert.equal(parsed.tokensUsed, 0);
  assert.equal(parsed.extracted.supplierRif, 'J-40549697-5');
  assert.equal(parsed.extracted.supplierName, 'DISTRIBUIDORA MAXI EMBUTIDOS, C.A.');
  assert.equal(parsed.extracted.buyerRif, 'V-17216546-6');
  assert.equal(parsed.extracted.invoiceNumber, '00038205');
  assert.equal(parsed.extracted.controlNumber, '00-041538');
  assert.equal(parsed.extracted.totalOriginal, 435475.58);
  assert.equal(parsed.extracted.exemptOriginal, 435475.58);
  assert.equal(parsed.extracted.vatOriginal, 0);
  assert.equal(parsed.extracted.channel, 'DIGITAL');
  assert.equal(parsed.extracted.mathValid, true);
});

test('VNDE: Procesamiento Determinista Muestra 2 - Traki (Máquina Fiscal, Mixto 16% + Exento)', () => {
  const sample2Text = `
    SENIAT
    RIF J-095124606
    TRAKI DISTRIBUIDORA, C.A
    CIUDAD GUAYANA BOLIVAR
    SUCURSAL: CARUPANO
    Cliente: LENNYS ALCANTARA
    Rif: V-17216546
    FACTURA
    FACTURA: 00020540
    FECHA: 15-08-2026 HORA: 18:24
    Mono escolar de niño juvenil (E) Bs 3.090,16
    Portacosméticos transparente (G) Bs 2.663,93
    SUBTTL Bs 5.754,09
    EXENTO Bs 3.090,16
    BI G16,00% Bs 2.663,93 IVA G16,00% Bs 426,23
    SUBTTL Bs 5.754,09 IVA Bs 426,23
    TOTAL Bs 6.180,32
    Z7C7023363
  `;

  const parsed = parseSeniatRawText(sample2Text);
  assert.ok(parsed);
  assert.equal(parsed.tokensUsed, 0);
  assert.equal(parsed.extracted.supplierRif, 'J-09512460-6');
  assert.equal(parsed.extracted.supplierName, 'TRAKI DISTRIBUIDORA, C.A.');
  assert.equal(parsed.extracted.buyerRif, 'V-17216546-6');
  assert.equal(parsed.extracted.hasBuyerRifOnTicket, true);
  assert.equal(parsed.extracted.channel, 'MAQUINA_FISCAL');
  assert.equal(parsed.extracted.invoiceNumber, '00020540');
  assert.equal(parsed.extracted.machineSerial, 'Z7C7023363');
  assert.equal(parsed.extracted.controlNumber, 'Z7C7023363');
  assert.equal(parsed.extracted.taxableBaseOriginal, 2663.93);
  assert.equal(parsed.extracted.exemptOriginal, 3090.16);
  assert.equal(parsed.extracted.vatOriginal, 426.23);
  assert.equal(parsed.extracted.totalOriginal, 6180.32);
  assert.equal(parsed.extracted.mathValid, true);
});

test('VNDE: Pipeline Maestro processFiscalInvoiceVNDE con 0 Tokens', async () => {
  const result = await processFiscalInvoiceVNDE({
    qrPayload: 'J-40549697-5|V-17216546-6|00038205|00-041538|2026-11-03|0.00|0.00|435475.58',
    fileName: 'factura_sample.jpg'
  });

  assert.ok(result);
  assert.equal(result.tokensUsed, 0);
  assert.match(result.mode, /0 Tokens/);
  assert.equal(result.extracted.supplierRif, 'J-40549697-5');
});

test('VNDE Seguridad: No inyecta facturas falsas cuando el documento es ilegible y no hay API Key', async () => {
  const result = await processFiscalInvoiceVNDE({
    base64Data: 'AAECAwQF',
    fileName: 'imagen_borrosa.jpg'
  });

  assert.ok(result);
  assert.equal(result.extracted, null);
  assert.match(result.mode, /VNDE_UNPARSEABLE_DOCUMENT/);
});

test('SaaS Billing & Seguridad: Códigos Telegram 12-hex, Conciliación de Pagos y Cuotas por Plan', async () => {
  const {
    generateTelegramLinkCode,
    registerSubscriptionPayment,
    approveSubscriptionPayment,
    checkTenantPlanQuota
  } = require('../services/saasBillingEngine');

  const code = generateTelegramLinkCode('tenant_bodega_jh');
  assert.match(code, /^VT-TENA-[0-9A-F]{12}$/);

  // Mock de Firestore en memoria para probar flujo de pago pendiente -> aprobado y cuotas
  const mem = new Map();
  const mockDb = {
    collection(col) {
      return {
        doc(id = 'doc_1') {
          const path = `${col}/${id}`;
          return {
            id,
            async get() {
              const d = mem.get(path);
              return { exists: d !== undefined, data: () => d };
            },
            async set(val, opts = {}) {
              mem.set(path, opts.merge ? { ...(mem.get(path) || {}), ...val } : { ...val });
            },
            async update(val) {
              mem.set(path, { ...(mem.get(path) || {}), ...val });
            }
          };
        },
        async add(val) {
          mem.set(`${col}/log_1`, val);
        }
      };
    }
  };

  // 1. Cliente reporta pago -> queda PENDIENTE_VERIFICACION con el monto oficial del catálogo ($29.99)
  const pendingRes = await registerSubscriptionPayment(mockDb, {
    tenantId: 'tenant_test',
    planId: 'COMERCIO_PRO',
    paymentMethod: 'PAGO_MOVIL',
    referenceNumber: '0134-99887766',
    bcvRate: 50,
    actorUid: 'user_cliente',
    actorRole: 'client'
  });
  assert.equal(pendingRes.paymentStatus, 'PENDIENTE_VERIFICACION');
  assert.equal(pendingRes.amountUsd, 29.99);

  // 1b. Contador aliado (role: 'admin') tampoco puede auto-aprobarse pagos SaaS
  const accountantPayRes = await registerSubscriptionPayment(mockDb, {
    tenantId: 'tenant_test',
    planId: 'COMERCIO_PRO',
    paymentMethod: 'PAGO_MOVIL',
    referenceNumber: '0134-11223344',
    bcvRate: 914.02,
    actorUid: 'user_contador',
    actorRole: 'admin'
  });
  assert.equal(accountantPayRes.paymentStatus, 'PENDIENTE_VERIFICACION');

  // 2. Super-Admin aprueba el pago -> activa el tenant y marca VERIFICADO
  const approvedRes = await approveSubscriptionPayment(mockDb, {
    tenantId: 'tenant_test',
    paymentId: 'doc_1',
    actorUid: 'admin_principal'
  });
  assert.equal(approvedRes.status, 'ACTIVA');
  assert.equal(approvedRes.paymentStatus, 'VERIFICADO');

  // 3. Plan COMERCIO_PRO no incluye nómina -> bloquea cálculo de nómina con HTTP 403
  const payrollCheck = await checkTenantPlanQuota(mockDb, 'tenant_test', { requirePayroll: true });
  assert.equal(payrollCheck.allowed, false);
  assert.equal(payrollCheck.status, 403);
});


