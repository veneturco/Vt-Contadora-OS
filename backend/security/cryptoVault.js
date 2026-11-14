const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function resolveMasterKey() {
  const envKey = process.env.AES_MASTER_KEY;
  if (envKey) {
    if (!/^[0-9a-fA-F]{64}$/.test(envKey)) {
      throw new Error('AES_MASTER_KEY invalida: debe ser una cadena hexadecimal exacta de 64 caracteres (32 bytes).');
    }
    return Buffer.from(envKey, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICO: AES_MASTER_KEY es obligatoria en entorno de produccion.');
  }
  // Deterministic development fallback key so local restarts can still decrypt dev records
  return crypto.createHash('sha256').update('VENETURCO_FISCAL_OS_DEV_KEY_2026').digest();
}

const MASTER_KEY = resolveMasterKey();

function encryptSensitiveField(plainText) {
  if (plainText === undefined || plainText === null) return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, MASTER_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (err) {
    console.error('Error en cifrado AES-256-GCM:', err.message);
    return null;
  }
}

function decryptSensitiveField(cipherPayload) {
  if (!cipherPayload) return null;
  try {
    const parts = String(cipherPayload).split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    if (!/^[0-9a-fA-F]{24}$/.test(ivHex) || !/^[0-9a-fA-F]{32}$/.test(tagHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
      return null;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, MASTER_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (_err) {
    // Retorna null de forma segura ante manipulacion o clave invalida, sin quebrar el proceso
    return null;
  }
}

function computeAuditHash(previousHash, eventPayload) {
  const canonical = JSON.stringify({
    previousHash: previousHash || 'GENESIS_SENIAT_2026',
    ...eventPayload
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

module.exports = {
  encryptSensitiveField,
  decryptSensitiveField,
  computeAuditHash
};
