const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  isUserActiveInDb,
  generateTotpSecretNode,
  enableUser2fa,
  authenticateUser,
  verifyPending2faLogin,
  changeUserPassword,
  upsertAccountantAccount,
  resetAccountantPassword,
  listAccountants,
  disableAccountant
} = require('../services/authService');

function makeMockDb() {
  const store = new Map();
  function docRef(path) {
    return {
      id: path.split('/').pop(),
      async get() {
        const data = store.get(path);
        return { exists: data !== undefined, id: path.split('/').pop(), data: () => data };
      },
      async set(payload, options = {}) {
        const prev = store.get(path) || {};
        store.set(path, options.merge ? { ...prev, ...payload } : { ...payload });
        return true;
      }
    };
  }
  return {
    isFallback: true,
    collection(col) {
      return {
        doc(id) {
          return docRef(`${col}/${id}`);
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

test('Auth: hashing scrypt y firma JWT HS256 válidos', () => {
  const hash = hashPassword('ClaveSegura2026#');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(verifyPassword('ClaveSegura2026#', hash), true);
  assert.equal(verifyPassword('ClaveErronea', hash), false);

  const token = signSessionToken({
    uid: 'uid_test_1',
    email: 'contador@firma.com',
    role: 'admin',
    name: 'Lic. Prueba',
    mustChangePassword: true
  });
  const decoded = verifySessionToken(token);
  assert.ok(decoded);
  assert.equal(decoded.email, 'contador@firma.com');
  assert.equal(decoded.role, 'admin');
  assert.equal(decoded.mustChangePassword, true);
  assert.equal(verifySessionToken(token + 'tampered'), null);
});

test('Flujo completo: Super-Admin crea contador -> contador ingresa con clave temporal -> cambia a clave personal', async () => {
  const db = makeMockDb();

  // 1. Login Super-Admin
  const adminLogin = await authenticateUser(db, null, {
    email: 'moucharrafiepc@gmail.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'DEV_SUPERADMIN_LOCAL_2026#'
  });
  assert.equal(adminLogin.ok, true);
  assert.equal(adminLogin.user.role, 'superadmin');
  assert.ok(verifySessionToken(adminLogin.token));

  // 2. Super-Admin registra primer contador aliado
  const created = await upsertAccountantAccount(db, null, {
    name: 'Lic. Carlos Mendoza',
    cpcNumber: 'CPC-88412',
    rif: 'V-14555666-2',
    email: 'Carlos.Mendoza@Firma.com ',
    phone: '+58 414-5551234',
    planId: 'FIRMA_PRO'
  });
  assert.equal(created.ok, true);
  assert.equal(created.isNewUser, true);
  assert.ok(created.tempPassword && created.tempPassword.startsWith('VT-'));
  assert.equal(created.accountant.email, 'carlos.mendoza@firma.com');

  const directory = await listAccountants(db);
  assert.equal(directory.length, 1);
  assert.equal(directory[0].email, 'carlos.mendoza@firma.com');

  // 3. Contador ingresa con correo (con mayúsculas/espacios) y clave temporal
  const firstLogin = await authenticateUser(db, null, {
    email: '  CARLOS.MENDOZA@firma.com',
    password: ` ${created.tempPassword} `
  });
  assert.equal(firstLogin.ok, true);
  assert.equal(firstLogin.user.role, 'admin');
  assert.equal(firstLogin.user.mustChangePassword, true);

  // 4. Contador cambia su clave temporal por una personal
  const changed = await changeUserPassword(db, null, {
    email: firstLogin.user.email,
    newPassword: 'MiPasswordPersonal2026#'
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.user.mustChangePassword, false);

  // 5. La clave temporal vieja ya no funciona; la personal sí
  const oldPassTry = await authenticateUser(db, null, {
    email: 'carlos.mendoza@firma.com',
    password: created.tempPassword
  });
  assert.equal(oldPassTry.ok, false);

  const personalLogin = await authenticateUser(db, null, {
    email: 'carlos.mendoza@firma.com',
    password: 'MiPasswordPersonal2026#'
  });
  assert.equal(personalLogin.ok, true);
  assert.equal(personalLogin.user.mustChangePassword, false);

  // 6. Super-Admin resetea clave temporal
  const reset = await resetAccountantPassword(db, null, created.accountant.id);
  assert.equal(reset.ok, true);
  const afterResetLogin = await authenticateUser(db, null, {
    email: 'carlos.mendoza@firma.com',
    password: reset.tempPassword
  });
  assert.equal(afterResetLogin.ok, true);
  assert.equal(afterResetLogin.user.mustChangePassword, true);

  // 7. Suspensión / revocación bloquea acceso inmediatamente
  await disableAccountant(db, null, created.accountant.id);
  const blockedLogin = await authenticateUser(db, null, {
    email: 'carlos.mendoza@firma.com',
    password: reset.tempPassword
  });
  assert.equal(blockedLogin.ok, false);
  assert.equal(blockedLogin.code, 'ACCOUNT_SUSPENDED');
});

test('Seguridad Anti-Fuerza Bruta: 5 intentos fallidos bloquean la cuenta', async () => {
  const db = makeMockDb();
  await upsertAccountantAccount(db, null, {
    name: 'Lic. Prueba Lock',
    cpcNumber: 'CPC-11111',
    email: 'lock@firma.com'
  });

  for (let i = 1; i <= 4; i++) {
    const attempt = await authenticateUser(db, null, {
      email: 'lock@firma.com',
      password: 'WrongPassword!'
    });
    assert.equal(attempt.ok, false);
    assert.equal(attempt.code, 'INVALID_PASSWORD');
    assert.equal(attempt.failedAttempts, i);
  }

  const fifth = await authenticateUser(db, null, {
    email: 'lock@firma.com',
    password: 'WrongPassword!'
  });
  assert.equal(fifth.ok, false);
  assert.equal(fifth.status, 423);
  assert.equal(fifth.code, 'ACCOUNT_LOCKED');
});

test('Seguridad 2FA en Servidor: login con TOTP activo NO emite token hasta verificar código', async () => {
  const db = makeMockDb();
  const crypto = require('crypto');

  await authenticateUser(db, null, {
    email: 'moucharrafiepc@gmail.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'DEV_SUPERADMIN_LOCAL_2026#'
  });

  const secret = generateTotpSecretNode(20);
  // Calcular código TOTP RFC 6238 actual
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0; const bytes = [];
  for (const ch of secret) { val = (val << 5) | alphabet.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  const counter = Math.floor(Math.floor(Date.now() / 1000) / 30);
  const buf = Buffer.alloc(8); buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0); buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = String((((hmac[off] & 0x7f) << 24) | ((hmac[off+1] & 0xff) << 16) | ((hmac[off+2] & 0xff) << 8) | (hmac[off+3] & 0xff)) % 1000000).padStart(6, '0');

  const enabled = await enableUser2fa(db, 'moucharrafiepc@gmail.com', secret, code);
  assert.equal(enabled.ok, true);

  // Verificar que totpSecret se almacena cifrado con AES-256-GCM (iv:tag:cipher) y NO en texto plano
  const storedUser = (await db.collection('vt_users').doc('moucharrafiepc@gmail.com').get()).data();
  assert.notEqual(storedUser.totpSecret, secret);
  assert.equal(storedUser.totpSecret.split(':').length, 3);

  const step1 = await authenticateUser(db, null, {
    email: 'moucharrafiepc@gmail.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'DEV_SUPERADMIN_LOCAL_2026#'
  });
  assert.equal(step1.ok, true);
  assert.equal(step1.requires2fa, true);
  assert.equal(step1.token, undefined);
  assert.ok(step1.pending2faToken);
  // El token pendiente NO sirve como token de sesión
  assert.equal(verifySessionToken(step1.pending2faToken), null);

  const bad2fa = await verifyPending2faLogin(db, step1.pending2faToken, '000000');
  assert.equal(bad2fa.ok, false);

  const good2fa = await verifyPending2faLogin(db, step1.pending2faToken, code);
  assert.equal(good2fa.ok, true);
  assert.ok(verifySessionToken(good2fa.token));

  // Bloqueo anti-fuerza bruta en 2FA tras 5 intentos fallidos
  const step2 = await authenticateUser(db, null, {
    email: 'moucharrafiepc@gmail.com',
    password: process.env.SUPER_ADMIN_PASSWORD || 'DEV_SUPERADMIN_LOCAL_2026#'
  });
  let lastRes;
  for (let i = 0; i < 5; i++) {
    lastRes = await verifyPending2faLogin(db, step2.pending2faToken, '000000');
  }
  assert.equal(lastRes.ok, false);
  assert.equal(lastRes.status, 429);
});

test('Seguridad Estado Vivo: usuario suspendido/eliminado pierde acceso inmediatamente (caché invalidado)', async () => {
  const db = makeMockDb();
  const created = await upsertAccountantAccount(db, null, {
    name: 'Lic. Revocable',
    cpcNumber: 'CPC-77777',
    email: 'revocable@firma.com'
  });
  assert.equal(await isUserActiveInDb(db, 'revocable@firma.com'), true);
  await disableAccountant(db, null, created.accountant.id);
  // Debe devolver false de inmediato sin esperar TTL de caché
  assert.equal(await isUserActiveInDb(db, 'revocable@firma.com'), false);
  const userSnap = await db.collection('vt_users').doc('revocable@firma.com').get();
  assert.equal(userSnap.data().status, 'ELIMINADO');
});

test('Seguridad Sesiones & Sub-Cuentas: cambio de clave revoca tokens previos, 2FA exige código para desactivar y bloquea degradar admin', async () => {
  const { disableUser2fa, upsertClientSubAccount } = require('../services/authService');
  const db = makeMockDb();

  const created = await upsertAccountantAccount(db, null, {
    name: 'Lic. Ana Seguridad',
    cpcNumber: 'CPC-99999',
    email: 'ana@firma.com'
  });

  // Token emitido ANTES del cambio de clave (simulando 10s antes)
  const staleIat = Math.floor(Date.now() / 1000) - 10;
  await changeUserPassword(db, null, {
    email: 'ana@firma.com',
    newPassword: 'NuevaClaveSegura2026#'
  });
  assert.equal(await isUserActiveInDb(db, 'ana@firma.com', staleIat), false);
  assert.equal(await isUserActiveInDb(db, 'ana@firma.com', Math.floor(Date.now() / 1000) + 1), true);

  // Impedir que upsertClientSubAccount sobrescriba una cuenta de Contador Aliado
  const hijackAttempt = await upsertClientSubAccount(db, null, {
    email: 'ana@firma.com',
    name: 'Intruso',
    tenantId: 'tenant_ajeno'
  });
  assert.equal(hijackAttempt.ok, false);
  assert.equal(hijackAttempt.status, 403);

  // Impedir desactivar 2FA sin código ni contraseña válida
  const secret = generateTotpSecretNode(20);
  const crypto = require('crypto');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0; const bytes = [];
  for (const ch of secret) { val = (val << 5) | alphabet.indexOf(ch); bits += 5; if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 0xff); bits -= 8; } }
  const counter = Math.floor(Math.floor(Date.now() / 1000) / 30);
  const buf = Buffer.alloc(8); buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0); buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = String((((hmac[off] & 0x7f) << 24) | ((hmac[off+1] & 0xff) << 16) | ((hmac[off+2] & 0xff) << 8) | (hmac[off+3] & 0xff)) % 1000000).padStart(6, '0');

  await enableUser2fa(db, 'ana@firma.com', secret, code);
  const unauthorizedDisable = await disableUser2fa(db, 'ana@firma.com', {});
  assert.equal(unauthorizedDisable.ok, false);
  assert.equal(unauthorizedDisable.status, 401);

  const authorizedDisable = await disableUser2fa(db, 'ana@firma.com', { code });
  assert.equal(authorizedDisable.ok, true);
  assert.equal(authorizedDisable.user.totpEnabled, false);
  assert.ok(created.ok);
});
