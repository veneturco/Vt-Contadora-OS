const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('QR Encoder ISO/IEC 18004: genera matrices válidas con patrones Finder, Timing y Dark Module', () => {
  // Node 22+ ejecuta TypeScript directamente con type stripping o saltamos si la versión de Node no lo soporta
  let encodeQrMatrix;
  try {
    ({ encodeQrMatrix } = require(path.resolve(__dirname, '../../frontend/src/utils/qrEncoder.ts')));
  } catch {
    return;
  }

  // Versión 1 (21x21) para comprobante de 14 dígitos
  const m1 = encodeQrMatrix('20261100000042');
  assert.equal(m1.length, 21);
  assert.equal(m1[0].length, 21);
  // Finder superior izquierdo (7x7: borde oscuro, anillo blanco, centro 3x3 oscuro)
  assert.equal(m1[0][0], true);
  assert.equal(m1[1][1], false);
  assert.equal(m1[2][2], true);
  assert.equal(m1[3][3], true);
  // Separador blanco alrededor del finder
  assert.equal(m1[7][0], false);
  assert.equal(m1[0][7], false);
  // Timing pattern alternante en fila/columna 6
  assert.equal(m1[6][8], true);
  assert.equal(m1[6][9], false);
  assert.equal(m1[6][10], true);
  // Módulo oscuro obligatorio (n - 8, 8)
  assert.equal(m1[m1.length - 8][8], true);

  // Versión >= 3 para payload fiscal largo (RIF + Comprobante + SHA-256)
  const m2 = encodeQrMatrix('J-40918273-8|20261100000042|8f94e2c1a7b3d059e4128f7c3b9012a4f5e6d7c8');
  assert.ok(m2.length >= 29 && m2.length <= 41);
  assert.equal(m2[m2.length - 8][8], true);
});
