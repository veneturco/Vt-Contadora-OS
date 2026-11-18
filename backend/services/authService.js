const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutos

const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || 'moucharrafiepc@gmail.com').trim().toLowerCase();
const SUPER_ADMIN_BOOTSTRAP_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || '*036Yasir';

function getSigningSecret() {
  return (
    process.env.AUTH_TOKEN_SECRET ||
    process.env.AES_MASTER_KEY ||
    process.env.TELEGRAM_WEBHOOK_SECRET ||
    'vt-fiscal-os-default-hmac-signing-key-2026'
  );
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(plainPassword) {
  const password = String(plainPassword || '').trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, originalHex] = parts;
  const derivedHex = crypto.scryptSync(String(plainPassword).trim(), salt, 64).toString('hex');
  const a = Buffer.from(originalHex, 'hex');
  const b = Buffer.from(derivedHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function generateReadableTempPassword(prefix = 'VT') {
  // Evita caracteres ambiguos (0/O, 1/l/I) para que sea fácil de escribir desde WhatsApp
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return `${prefix}-${code}#`;
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let padded = str.replace(/-/g, '+').replace(/_/g, '/');
  while (padded.length % 4 !== 0) padded += '=';
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signSessionToken(payload) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = {
    uid: payload.uid,
    email: payload.email,
    role: payload.role,
    name: payload.name,
    cpcNumber: payload.cpcNumber || null,
    accountantId: payload.accountantId || null,
    tenantIds: Array.isArray(payload.tenantIds) ? payload.tenantIds : [],
    mustChangePassword: Boolean(payload.mustChangePassword),
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_SECONDS
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const data = `${encodedHeader}.${encodedBody}`;
  const sig = base64UrlEncode(crypto.createHmac('sha256', getSigningSecret()).update(data).digest());
  return `${data}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedBody, sig] = parts;
  const data = `${encodedHeader}.${encodedBody}`;
  const expectedSig = base64UrlEncode(crypto.createHmac('sha256', getSigningSecret()).update(data).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(encodedBody));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

function toPublicUser(userDoc) {
  return {
    uid: userDoc.uid,
    email: userDoc.email,
    name: userDoc.name,
    role: userDoc.role,
    cpcNumber: userDoc.cpcNumber || null,
    accountantId: userDoc.accountantId || null,
    tenantIds: Array.isArray(userDoc.tenantIds) ? userDoc.tenantIds : [],
    status: userDoc.status || 'ACTIVA',
    mustChangePassword: Boolean(userDoc.mustChangePassword)
  };
}

async function syncFirebaseAuthUser(adminSdk, { email, password, displayName, role, tenantIds = [], disabled = false }) {
  if (!adminSdk || !adminSdk.apps || !adminSdk.apps.length) return { synced: false, reason: 'NO_ADMIN_APP' };
  try {
    const auth = adminSdk.auth();
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      const updatePayload = { displayName, disabled };
      if (password) updatePayload.password = password;
      userRecord = await auth.updateUser(userRecord.uid, updatePayload);
    } catch (err) {
      if (err && err.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({
          email,
          password: password || generateReadableTempPassword('FB'),
          displayName,
          disabled
        });
      } else {
        throw err;
      }
    }
    const firebaseRole = role === 'superadmin' || role === 'admin' ? 'admin' : 'client';
    await auth.setCustomUserClaims(userRecord.uid, {
      role: firebaseRole,
      vtRole: role,
      tenantIds: Array.isArray(tenantIds) ? tenantIds : []
    });
    return { synced: true, firebaseUid: userRecord.uid };
  } catch (err) {
    // Non-fatal: Firestore + HMAC JWT continues working even if Firebase Auth Email/Password provider isn't enabled yet
    return { synced: false, reason: err?.code || err?.message || 'AUTH_SYNC_SKIPPED' };
  }
}

async function ensureSuperAdminSeeded(db, adminSdk) {
  const docRef = db.collection('vt_users').doc(SUPER_ADMIN_EMAIL);
  const snap = await docRef.get();
  if (snap.exists) {
    const existing = snap.data();
    if (existing && /samir|moucharrafie|veneturco/i.test(String(existing.name || ''))) {
      const cleaned = { ...existing, name: 'Super-Admin / Administración VT Fiscal OS', updatedAt: new Date().toISOString() };
      await docRef.set(cleaned, { merge: true });
      return cleaned;
    }
    return existing;
  }
  const nowIso = new Date().toISOString();
  const superAdminDoc = {
    uid: 'superadmin_vt_os',
    email: SUPER_ADMIN_EMAIL,
    name: 'Super-Admin / Administración VT Fiscal OS',
    role: 'superadmin',
    cpcNumber: 'SUPER-ADMIN',
    accountantId: null,
    tenantIds: [],
    status: 'ACTIVA',
    passwordHash: hashPassword(SUPER_ADMIN_BOOTSTRAP_PASSWORD),
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  await docRef.set(superAdminDoc, { merge: true });
  await syncFirebaseAuthUser(adminSdk, {
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_BOOTSTRAP_PASSWORD,
    displayName: superAdminDoc.name,
    role: 'superadmin'
  });
  return superAdminDoc;
}

async function authenticateUser(db, adminSdk, { email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '').trim();

  if (!cleanEmail || !cleanPassword) {
    return { ok: false, status: 400, error: 'Correo electrónico y contraseña requeridos.' };
  }

  if (cleanEmail === SUPER_ADMIN_EMAIL) {
    await ensureSuperAdminSeeded(db, adminSdk);
  }

  const userRef = db.collection('vt_users').doc(cleanEmail);
  const snap = await userRef.get();
  if (!snap.exists) {
    return {
      ok: false,
      status: 401,
      code: 'USER_NOT_FOUND',
      error: 'Cuenta no registrada en el sistema. Solicite a su administrador que active su invitación.'
    };
  }

  const userDoc = snap.data();
  const nowMs = Date.now();

  if (userDoc.status === 'SUSPENDIDA' || userDoc.status === 'ELIMINADO') {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      error: 'Esta cuenta se encuentra suspendida. Contacte al administrador de VeneTurco Fiscal OS.'
    };
  }

  if (userDoc.lockedUntil) {
    const lockUntilMs = new Date(userDoc.lockedUntil).getTime();
    if (lockUntilMs > nowMs) {
      const remainingSec = Math.ceil((lockUntilMs - nowMs) / 1000);
      return {
        ok: false,
        status: 423,
        code: 'ACCOUNT_LOCKED',
        lockRemainingSeconds: remainingSec,
        error: `Cuenta bloqueada temporalmente por seguridad. Intente de nuevo en ${Math.ceil(remainingSec / 60)} minuto(s).`
      };
    }
  }

  const passwordValid = verifyPassword(cleanPassword, userDoc.passwordHash);
  if (!passwordValid) {
    const nextAttempts = (userDoc.failedAttempts || 0) + 1;
    const lockedUntil = nextAttempts >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCKOUT_MS).toISOString() : null;
    await userRef.set(
      {
        failedAttempts: nextAttempts,
        lockedUntil,
        updatedAt: new Date(nowMs).toISOString()
      },
      { merge: true }
    );
    const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - nextAttempts);
    if (lockedUntil) {
      return {
        ok: false,
        status: 423,
        code: 'ACCOUNT_LOCKED',
        failedAttempts: nextAttempts,
        lockRemainingSeconds: Math.floor(LOCKOUT_MS / 1000),
        error: 'Cuenta bloqueada por 30 minutos tras 5 intentos fallidos consecutivos.'
      };
    }
    return {
      ok: false,
      status: 401,
      code: 'INVALID_PASSWORD',
      failedAttempts: nextAttempts,
      remainingAttempts: remaining,
      error: `Contraseña incorrecta. Intento fallido ${nextAttempts}/${MAX_FAILED_ATTEMPTS}. Le quedan ${remaining} intento(s).`
    };
  }

  const nowIso = new Date(nowMs).toISOString();
  await userRef.set(
    {
      failedAttempts: 0,
      lockedUntil: null,
      lastLoginAt: nowIso,
      updatedAt: nowIso
    },
    { merge: true }
  );

  const publicUser = toPublicUser(userDoc);
  const token = signSessionToken(publicUser);
  return { ok: true, status: 200, token, user: publicUser };
}

async function changeUserPassword(db, adminSdk, { email, currentPassword, newPassword }) {
  const cleanEmail = normalizeEmail(email);
  const cleanNew = String(newPassword || '').trim();
  if (cleanNew.length < 8) {
    return { ok: false, status: 400, error: 'La nueva contraseña debe tener al menos 8 caracteres.' };
  }

  const userRef = db.collection('vt_users').doc(cleanEmail);
  const snap = await userRef.get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: 'Usuario no encontrado.' };
  }

  const userDoc = snap.data();
  // Si NO está en cambio obligatorio de clave temporal, exige validar la contraseña actual
  if (!userDoc.mustChangePassword) {
    if (!verifyPassword(currentPassword, userDoc.passwordHash)) {
      return { ok: false, status: 401, error: 'La contraseña actual es incorrecta.' };
    }
  }

  const nowIso = new Date().toISOString();
  const updated = {
    ...userDoc,
    passwordHash: hashPassword(cleanNew),
    mustChangePassword: false,
    failedAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: nowIso,
    updatedAt: nowIso
  };
  await userRef.set(updated, { merge: true });
  await syncFirebaseAuthUser(adminSdk, {
    email: cleanEmail,
    password: cleanNew,
    displayName: updated.name,
    role: updated.role,
    tenantIds: updated.tenantIds || [],
    disabled: updated.status === 'SUSPENDIDA'
  });

  const publicUser = toPublicUser(updated);
  const token = signSessionToken(publicUser);
  return { ok: true, status: 200, token, user: publicUser };
}

async function upsertAccountantAccount(db, adminSdk, payload) {
  const cleanEmail = normalizeEmail(payload.email);
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, status: 400, error: 'Correo corporativo válido requerido para crear la cuenta del contador.' };
  }
  if (!payload.name || !String(payload.name).trim()) {
    return { ok: false, status: 400, error: 'Nombre del contador o firma requerido.' };
  }

  const nowIso = new Date().toISOString();
  const accountantId = payload.id || `acc_${Date.now()}`;
  const accRef = db.collection('vt_accountants').doc(accountantId);
  const existingAccSnap = await accRef.get();
  const existingAcc = existingAccSnap.exists ? existingAccSnap.data() : null;

  const accountantRecord = {
    id: accountantId,
    name: String(payload.name).trim(),
    cpcNumber: String(payload.cpcNumber || 'CPC-PENDIENTE').trim(),
    rif: String(payload.rif || '').trim(),
    email: cleanEmail,
    phone: String(payload.phone || '').trim(),
    city: String(payload.city || 'Caracas, Distrito Capital').trim(),
    planId: payload.planId || 'FIRMA_PRO',
    monthlyFeeUsd: Number(payload.monthlyFeeUsd ?? 59.99),
    maxCompaniesLimit: Number(payload.maxCompaniesLimit ?? 15),
    assignedTenantIds: Array.isArray(payload.assignedTenantIds)
      ? payload.assignedTenantIds
      : (existingAcc?.assignedTenantIds || []),
    subscriptionStatus: payload.subscriptionStatus || existingAcc?.subscriptionStatus || 'ACTIVA',
    nextBillingDate: payload.nextBillingDate || existingAcc?.nextBillingDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    payoutMethod: payload.payoutMethod || existingAcc?.payoutMethod || 'PAGO_MOVIL',
    payoutDetails: String(payload.payoutDetails || existingAcc?.payoutDetails || '').trim(),
    pendingCommissionUsd: Number(payload.pendingCommissionUsd ?? existingAcc?.pendingCommissionUsd ?? 0),
    paidCommissionsTotalUsd: Number(payload.paidCommissionsTotalUsd ?? existingAcc?.paidCommissionsTotalUsd ?? 0),
    firmLogoText: String(payload.firmLogoText || existingAcc?.firmLogoText || `${String(payload.name).trim()} · Firma Contable`),
    createdAt: existingAcc?.createdAt || nowIso.slice(0, 10),
    updatedAt: nowIso
  };

  await accRef.set(accountantRecord, { merge: true });

  // Si cambió el correo de un contador existente, deshabilitamos el acceso con el correo anterior
  const prevEmail = existingAcc?.email ? normalizeEmail(existingAcc.email) : null;
  if (prevEmail && prevEmail !== cleanEmail) {
    await db.collection('vt_users').doc(prevEmail).set(
      { status: 'SUSPENDIDA', updatedAt: nowIso },
      { merge: true }
    );
  }

  const userRef = db.collection('vt_users').doc(cleanEmail);
  const existingUserSnap = await userRef.get();
  const isNewUser = !existingUserSnap.exists;
  const requestedTempPass = payload.tempPassword ? String(payload.tempPassword).trim() : '';
  const shouldSetPassword = isNewUser || Boolean(payload.resetPassword) || requestedTempPass.length >= 6;
  const tempPassword = shouldSetPassword
    ? (requestedTempPass.length >= 6 ? requestedTempPass : generateReadableTempPassword('VT'))
    : null;

  const userUpdate = {
    uid: existingUserSnap.exists ? existingUserSnap.data().uid : `uid_${accountantId}`,
    email: cleanEmail,
    name: `${accountantRecord.name} (${accountantRecord.cpcNumber})`,
    role: 'admin',
    cpcNumber: accountantRecord.cpcNumber,
    accountantId,
    tenantIds: accountantRecord.assignedTenantIds,
    status: accountantRecord.subscriptionStatus === 'SUSPENDIDA' ? 'SUSPENDIDA' : 'ACTIVA',
    updatedAt: nowIso
  };

  if (isNewUser) {
    userUpdate.createdAt = nowIso;
    userUpdate.failedAttempts = 0;
    userUpdate.lockedUntil = null;
  }

  if (tempPassword) {
    userUpdate.passwordHash = hashPassword(tempPassword);
    userUpdate.mustChangePassword = true;
    userUpdate.failedAttempts = 0;
    userUpdate.lockedUntil = null;
  }

  await userRef.set(userUpdate, { merge: true });

  const firebaseSync = await syncFirebaseAuthUser(adminSdk, {
    email: cleanEmail,
    password: tempPassword || undefined,
    displayName: userUpdate.name,
    role: 'admin',
    tenantIds: accountantRecord.assignedTenantIds,
    disabled: userUpdate.status === 'SUSPENDIDA'
  });

  return {
    ok: true,
    status: isNewUser ? 201 : 200,
    accountant: accountantRecord,
    tempPassword,
    isNewUser,
    firebaseAuthSynced: firebaseSync.synced
  };
}

async function resetAccountantPassword(db, adminSdk, accountantId, customTempPassword) {
  const accRef = db.collection('vt_accountants').doc(accountantId);
  const snap = await accRef.get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: 'Contador no encontrado en la base de datos.' };
  }
  const acc = snap.data();
  const cleanEmail = normalizeEmail(acc.email);
  const tempPassword = customTempPassword && String(customTempPassword).trim().length >= 6
    ? String(customTempPassword).trim()
    : generateReadableTempPassword('VT');
  const nowIso = new Date().toISOString();

  await db.collection('vt_users').doc(cleanEmail).set(
    {
      uid: `uid_${accountantId}`,
      email: cleanEmail,
      name: `${acc.name} (${acc.cpcNumber})`,
      role: 'admin',
      cpcNumber: acc.cpcNumber,
      accountantId,
      tenantIds: acc.assignedTenantIds || [],
      status: acc.subscriptionStatus === 'SUSPENDIDA' ? 'SUSPENDIDA' : 'ACTIVA',
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: nowIso
    },
    { merge: true }
  );

  const firebaseSync = await syncFirebaseAuthUser(adminSdk, {
    email: cleanEmail,
    password: tempPassword,
    displayName: `${acc.name} (${acc.cpcNumber})`,
    role: 'admin',
    tenantIds: acc.assignedTenantIds || [],
    disabled: acc.subscriptionStatus === 'SUSPENDIDA'
  });

  return {
    ok: true,
    status: 200,
    accountant: acc,
    tempPassword,
    firebaseAuthSynced: firebaseSync.synced
  };
}

async function listAccountants(db) {
  const snap = await db.collection('vt_accountants').get();
  const items = [];
  if (snap && Array.isArray(snap.docs)) {
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data && data.subscriptionStatus !== 'ELIMINADO') {
        items.push({ id: doc.id, ...data });
      }
    }
  }
  items.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return items;
}

async function disableAccountant(db, adminSdk, accountantId) {
  const accRef = db.collection('vt_accountants').doc(accountantId);
  const snap = await accRef.get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: 'Contador no encontrado.' };
  }
  const acc = snap.data();
  const nowIso = new Date().toISOString();
  // COT: no borrado físico destructivo; se marca como ELIMINADO y se revoca acceso
  await accRef.set({ subscriptionStatus: 'ELIMINADO', updatedAt: nowIso }, { merge: true });
  if (acc.email) {
    const cleanEmail = normalizeEmail(acc.email);
    await db.collection('vt_users').doc(cleanEmail).set(
      { status: 'ELIMINADO', updatedAt: nowIso },
      { merge: true }
    );
    await syncFirebaseAuthUser(adminSdk, {
      email: cleanEmail,
      displayName: acc.name,
      role: 'admin',
      disabled: true
    });
  }
  return { ok: true, status: 200, id: accountantId };
}

async function upsertClientSubAccount(db, adminSdk, { email, name, tenantId, tenantName, rif, tempPassword }) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !cleanEmail.includes('@') || !tenantId) {
    return { ok: false, status: 400, error: 'Correo válido y tenantId son obligatorios para activar la sub-cuenta.' };
  }
  const finalPass = tempPassword && String(tempPassword).trim().length >= 6
    ? String(tempPassword).trim()
    : generateReadableTempPassword('CL');
  const nowIso = new Date().toISOString();

  const userRef = db.collection('vt_users').doc(cleanEmail);
  const existing = await userRef.get();
  const existingTenants = existing.exists && Array.isArray(existing.data().tenantIds) ? existing.data().tenantIds : [];
  const mergedTenants = Array.from(new Set([...existingTenants, tenantId]));

  const displayName = `${name || tenantName || 'Comercio'}${rif ? ` (${rif})` : ''}`;
  await userRef.set(
    {
      uid: existing.exists ? existing.data().uid : `client_${tenantId}_${Date.now()}`,
      email: cleanEmail,
      name: displayName,
      role: 'client',
      tenantIds: mergedTenants,
      status: 'ACTIVA',
      passwordHash: hashPassword(finalPass),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      createdAt: existing.exists ? existing.data().createdAt : nowIso,
      updatedAt: nowIso
    },
    { merge: true }
  );

  await syncFirebaseAuthUser(adminSdk, {
    email: cleanEmail,
    password: finalPass,
    displayName,
    role: 'client',
    tenantIds: mergedTenants,
    disabled: false
  });

  return { ok: true, status: 200, email: cleanEmail, tempPassword: finalPass, tenantIds: mergedTenants };
}

module.exports = {
  SUPER_ADMIN_EMAIL,
  normalizeEmail,
  hashPassword,
  verifyPassword,
  generateReadableTempPassword,
  signSessionToken,
  verifySessionToken,
  ensureSuperAdminSeeded,
  authenticateUser,
  changeUserPassword,
  upsertAccountantAccount,
  resetAccountantPassword,
  listAccountants,
  disableAccountant,
  upsertClientSubAccount
};
