const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  authenticateUser,
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
    password: process.env.SUPER_ADMIN_PASSWORD || '*036Yasir'
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
