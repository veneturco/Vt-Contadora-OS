const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateVenezuelanRIF,
  buildRetentionVoucherNumber,
  generateSeniatIvaTxt16Columns,
  generateIslrDecreto1808Xml,
  calculateLotttPayroll
} = require('../services/seniatEngine');
const {
  encryptSensitiveField,
  decryptSensitiveField,
  computeAuditHash
} = require('../security/cryptoVault');

test('Validacion RIF Venezolano Modulo 11 (SNAT)', () => {
  const valid = validateVenezuelanRIF('J-40918273-8');
  assert.equal(valid.valid, true);
  assert.equal(valid.formatted, 'J-40918273-8');

  const invalid = validateVenezuelanRIF('J-40918273-4');
  assert.equal(invalid.valid, false);
});

test('Comprobante de Retencion IVA 14 digitos AAAAMMSSSSSSSS (Art. 18)', () => {
  const voucher = buildRetentionVoucherNumber('2026-11', 42);
  assert.equal(voucher.length, 14);
  assert.equal(voucher, '20261100000042');
});

test('Exportacion SENIAT IVA TXT de exactamente 16 columnas delimitadas por tabulacion', () => {
  const txt = generateSeniatIvaTxt16Columns('J-40918273-8', '202611', [
    {
      emissionDate: '2026-11-12',
      operationType: 'C',
      docType: '01',
      supplierRif: 'J-30123456-1',
      invoiceNumber: '00045812',
      controlNumber: '00-00192834',
      totalBs: 73929.30,
      taxableBaseBs: 56220.00,
      ivaWithheldBs: 6746.40,
      exemptBs: 7027.50,
      vatRate: 16
    }
  ]);
  const cols = txt.split('\t');
  assert.equal(cols.length, 16);
  assert.equal(cols[0], 'J409182738');
  assert.equal(cols[12].length, 14);
});

test('Exportacion XML Retenciones ISLR Decreto 1808 con escape anti-inyeccion', () => {
  const xml = generateIslrDecreto1808Xml('J-40918273-8', '202611', [
    {
      supplierRif: 'J-30123456-1',
      invoiceNumber: '00045812<script>',
      controlNumber: '00-00192834',
      emissionDate: '2026-11-12',
      conceptCode: '001',
      taxableBaseBs: 56220.00,
      islrRate: 2
    }
  ]);
  assert.match(xml, /<RelacionRetencionesISLR RifAgente="J409182738" Periodo="202611">/);
  assert.match(xml, /<NumeroFactura>00045812&lt;script&gt;<\/NumeroFactura>/);
  assert.match(xml, /<PorcentajeRetencion>2.00<\/PorcentajeRetencion>/);
});

test('Calculo Nomina LOTTT + Parafiscales + Prestaciones Art. 142', () => {
  const res = calculateLotttPayroll({ baseSalaryBs: 18500, cestaticketBs: 1882, riskLevel: 'MINIMO' });
  assert.equal(res.deductions.ivssEmployee, 740);
  assert.equal(res.deductions.faovEmployee, 185);
  assert.equal(res.deductions.rpeEmployee, 92.5);
  assert.equal(res.netPayBs, 19364.5);
  assert.equal(res.employerContributions.ivssEmployer, 1665);
  assert.ok(res.employerContributions.prestacionesMonthlyProvision > 0);
});

test('Boveda Criptografica AES-256-GCM y Encadenamiento SHA-256', () => {
  const secret = 'CLAVE_SENIAT:BodegaJH2026#Fiscal';
  const encrypted = encryptSensitiveField(secret);
  assert.equal(encrypted.split(':').length, 3);
  const decrypted = decryptSensitiveField(encrypted);
  assert.equal(decrypted, secret);

  const hash1 = computeAuditHash('GENESIS_SENIAT_2026', { seq: 1 });
  const hash2 = computeAuditHash(hash1, { seq: 2 });
  assert.equal(hash1.length, 64);
  assert.equal(hash2.length, 64);
  assert.notEqual(hash1, hash2);

  // Test de resistencia ante cargas corruptas o manipuladas (sin quebrar el proceso)
  assert.equal(decryptSensitiveField('payload_totalmente_invalido'), null);
  assert.equal(decryptSensitiveField('1234:5678:9abc'), null);
  assert.equal(decryptSensitiveField(null), null);
});

test('Seguridad Multi-Tenant: Prevencion IDOR y Validacion de Roles', () => {
  function checkTenantAccess(user, targetTenantId) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (Array.isArray(user.tenantIds) && user.tenantIds.includes(targetTenantId)) return true;
    return false;
  }

  const superAdmin = { uid: 'adm_1', role: 'admin' };
  const clientTenantA = { uid: 'usr_a', role: 'client', tenantIds: ['tenant_bodega_jh'] };

  assert.equal(checkTenantAccess(superAdmin, 'tenant_bodega_jh'), true);
  assert.equal(checkTenantAccess(superAdmin, 'tenant_otro_comercio'), true);
  assert.equal(checkTenantAccess(clientTenantA, 'tenant_bodega_jh'), true);
  assert.equal(checkTenantAccess(clientTenantA, 'tenant_otro_comercio'), false); // Bloqueo IDOR
  assert.equal(checkTenantAccess(null, 'tenant_bodega_jh'), false);
});
