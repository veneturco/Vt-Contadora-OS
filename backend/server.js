require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const admin = require('firebase-admin');
const { processTelegramReceiptUpdate } = require('./services/telegramBot');
const { processFiscalInvoiceVNDE } = require('./services/vndeFiscalProcessor');
const { syncOfficialBcvRate } = require('./services/bcvSyncCron');
const { SAAS_PLANS, generateTelegramLinkCode, registerSubscriptionPayment, suspendExpiredSubscriptions } = require('./services/saasBillingEngine');
const {
  validateVenezuelanRIF,
  buildRetentionVoucherNumber,
  generateSeniatIvaTxt16Columns,
  generateIslrDecreto1808Xml,
  calculateLotttPayroll
} = require('./services/seniatEngine');
const {
  encryptSensitiveField,
  decryptSensitiveField,
  computeAuditHash
} = require('./security/cryptoVault');

// Lightweight In-Memory Firestore Fallback when GOOGLE_APPLICATION_CREDENTIALS is not configured
function createInMemoryFirestore() {
  const store = new Map();

  function getDocRef(path) {
    return {
      id: path.split('/').pop(),
      path,
      async get() {
        const data = store.get(path);
        return {
          exists: data !== undefined,
          id: path.split('/').pop(),
          data: () => data
        };
      },
      async set(payload, options = {}) {
        const existing = store.get(path) || {};
        store.set(path, options.merge ? { ...existing, ...payload } : { ...payload });
        return true;
      },
      async update(payload) {
        const existing = store.get(path) || {};
        store.set(path, { ...existing, ...payload });
        return true;
      },
      async delete() {
        store.delete(path);
        return true;
      }
    };
  }

  function getCollectionRef(colPath) {
    return {
      doc(docId) {
        const id = docId || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        return getDocRef(`${colPath}/${id}`);
      },
      async add(payload) {
        const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const ref = getDocRef(`${colPath}/${id}`);
        await ref.set(payload);
        return ref;
      },
      where(field, op, val) {
        return {
          limit() {
            return {
              async get() {
                const docs = [];
                for (const [k, v] of store.entries()) {
                  if (k.startsWith(`${colPath}/`) && op === '==' && v[field] === val) {
                    docs.push({ id: k.split('/').pop(), data: () => v });
                  }
                }
                return { empty: docs.length === 0, docs };
              }
            };
          }
        };
      },
      orderBy() {
        return {
          limit() {
            return {
              async get() {
                const docs = [];
                for (const [k, v] of store.entries()) {
                  if (k.startsWith(`${colPath}/`)) {
                    docs.push({ id: k.split('/').pop(), data: () => v });
                  }
                }
                return { empty: docs.length === 0, docs };
              }
            };
          }
        };
      }
    };
  }

  return {
    isFallback: true,
    collection: getCollectionRef
  };
}

let db;
try {
  const serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (serviceAccountStr) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountStr);
    } catch {
      serviceAccount = JSON.parse(Buffer.from(serviceAccountStr, 'base64').toString('utf8'));
    }
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    db = admin.firestore();
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    db = admin.firestore();
  } else {
    db = createInMemoryFirestore();
  }
} catch (_err) {
  db = createInMemoryFirestore();
}

// Cron Job diario BCV (09:05 AM y 01:15 PM hora Caracas)
cron.schedule('5 9,13 * * 1-5', async () => {
  await syncOfficialBcvRate(db);
}, { timezone: 'America/Caracas' });

// Cron Job diario de Morosidad SaaS (12:05 AM hora Caracas)
cron.schedule('5 0 * * *', async () => {
  await suspendExpiredSubscriptions(db);
}, { timezone: 'America/Caracas' });

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "connect-src": ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : null;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || !allowedOrigins) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Origen no autorizado por política CORS de VeneTurco Fiscal OS'));
  }
}));
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de peticiones API excedido. Intenta más tarde.' }
});
app.use('/api/', apiLimiter);

// Rate limiter específico para Webhook de Telegram (previene ataques de denegación de servicio DoS)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de solicitudes de webhook superado.' }
});

// Rate limiter específico para oráculo BCV (previene sobrecargar bcv.org.ve y evita baneos por IP)
const bcvSyncLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de sincronización BCV excedido. Por favor espera unos minutos antes de reintentar.' }
});

// Rate limiter específico para escaneo OCR (protege cuota de IA y CPU)
const ocrLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de escaneos OCR alcanzado temporalmente. Espera unos minutos.' }
});

async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && authHeader === 'Bearer DEV_LOCAL_BYPASS') {
      req.user = { uid: 'contador_auditor_local', role: 'admin' };
      return next();
    }
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token Bearer requerido' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    req.user = await admin.auth().verifyIdToken(idToken);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token invalido o expirado' });
  }
}

// Middleware de Control de Acceso y Prevención de IDOR (Insecure Direct Object References)
function requireTenantAccess(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (user.role === 'admin') return next();
  const tenantId = req.body?.tenantId || req.params?.tenantId || req.query?.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Identificador tenantId requerido para esta operación' });
  }
  if (Array.isArray(user.tenantIds) && user.tenantIds.includes(tenantId)) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso denegado: no posee privilegios sobre este tenant/empresa (Protección Anti-IDOR)' });
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    engine: 'VeneTurco Fiscal OS v3.2 (VNDE 0 Tokens)',
    norm: 'SNAT/2026/00093 & SNAT/2026/00099',
    storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    engine: 'VeneTurco Fiscal OS v3.2 (VNDE 0 Tokens)',
    norm: 'SNAT/2026/00093 & SNAT/2026/00099',
    storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE',
    timestamp: new Date().toISOString()
  });
});

app.post('/webhooks/telegram', webhookLimiter, async (req, res) => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Webhook Telegram deshabilitado: falta configurar TELEGRAM_WEBHOOK_SECRET en producción.' });
  }
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Secret Token invalido' });
  }
  try {
    const result = await processTelegramReceiptUpdate(req.body, db);
    res.json(result);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.status(500).json({ error: 'Error procesando comprobante' });
  }
});

app.post('/api/bcv/sync-now', verifyFirebaseToken, bcvSyncLimiter, async (_req, res, next) => {
  try {
    const result = await syncOfficialBcvRate(db);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const ALLOWED_OCR_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

app.post('/api/ocr', verifyFirebaseToken, requireTenantAccess, ocrLimiter, async (req, res, next) => {
  const { base64Data, mimeType = 'image/jpeg', fileName = 'factura.jpg', rawText, qrPayload } = req.body;
  try {
    if (!base64Data && !rawText && !qrPayload) {
      return res.status(400).json({ error: 'Se requiere imagen/PDF (base64Data), texto fiscal (rawText) o código QR (qrPayload).' });
    }
    if (mimeType && !ALLOWED_OCR_MIMES.includes(mimeType)) {
      return res.status(415).json({ error: `Formato de archivo no permitido (${mimeType}). Solo se admiten JPEG, PNG, WEBP o PDF.` });
    }
    if (base64Data && String(base64Data).length > 11 * 1024 * 1024) {
      return res.status(413).json({ error: 'El archivo excede el tamaño máximo permitido (8 MB).' });
    }
    const result = await processFiscalInvoiceVNDE({
      base64Data,
      mimeType,
      fileName: String(fileName || 'factura.jpg').slice(0, 120),
      rawText: rawText ? String(rawText).slice(0, 15000) : undefined,
      qrPayload: qrPayload ? String(qrPayload).slice(0, 1024) : undefined,
      geminiApiKey: process.env.GEMINI_API_KEY,
      db
    });
    if (!result || !result.extracted) {
      return res.status(422).json({
        error: result?.error || 'No se pudieron extraer datos fiscales legibles del comprobante.',
        mode: result?.mode || 'VNDE_UNPARSEABLE_DOCUMENT'
      });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/saas/plans', (_req, res) => {
  res.json(Object.values(SAAS_PLANS));
});

app.post('/api/saas/generate-telegram-code', verifyFirebaseToken, requireTenantAccess, async (req, res, next) => {
  try {
    const { tenantId, companyName, rif } = req.body;
    if (!tenantId || !rif) {
      return res.status(400).json({ error: 'tenantId y rif son requeridos' });
    }
    const rifCheck = validateVenezuelanRIF(rif);
    if (!rifCheck.valid) {
      return res.status(400).json({ error: 'El RIF proporcionado no supera la validación Módulo 11 del SENIAT' });
    }
    const code = generateTelegramLinkCode(tenantId);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.collection('telegram_links').doc(code).set({
      tenantId,
      companyName: String(companyName || 'Empresa Vinculada').slice(0, 120),
      rif: rifCheck.formatted,
      used: false,
      expiresAt,
      createdAt: new Date().toISOString()
    });
    res.json({ code, expiresAt });
  } catch (err) {
    next(err);
  }
});

app.post('/api/saas/register-payment', verifyFirebaseToken, requireTenantAccess, async (req, res, next) => {
  try {
    const { tenantId, planId, paymentMethod, referenceNumber, bcvRate } = req.body;
    if (!tenantId || !planId || !referenceNumber) {
      return res.status(400).json({ error: 'tenantId, planId y referenceNumber son obligatorios' });
    }
    const result = await registerSubscriptionPayment(db, {
      tenantId,
      planId,
      paymentMethod: paymentMethod || 'TRANSFERENCIA_VES',
      referenceNumber,
      bcvRate: Number(bcvRate || 47.05),
      actorUid: req.user.uid,
      actorRole: req.user.role
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/validate-rif/:rif', verifyFirebaseToken, (req, res) => {
  const result = validateVenezuelanRIF(req.params.rif);
  res.json(result);
});

app.post('/api/export/seniat-iva-txt', verifyFirebaseToken, requireTenantAccess, (req, res, next) => {
  try {
    const { agentRif, periodYYYYMM, rows } = req.body;
    if (!agentRif || !periodYYYYMM) {
      return res.status(400).json({ error: 'agentRif y periodYYYYMM son obligatorios' });
    }
    const txt = generateSeniatIvaTxt16Columns(agentRif, periodYYYYMM, Array.isArray(rows) ? rows : []);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(txt);
  } catch (err) {
    next(err);
  }
});

app.post('/api/export/seniat-islr-xml', verifyFirebaseToken, requireTenantAccess, (req, res, next) => {
  try {
    const { agentRif, periodYYYYMM, retentions } = req.body;
    if (!agentRif || !periodYYYYMM) {
      return res.status(400).json({ error: 'agentRif y periodYYYYMM son obligatorios' });
    }
    const xml = generateIslrDecreto1808Xml(agentRif, periodYYYYMM, Array.isArray(retentions) ? retentions : []);
    res.setHeader('Content-Type', 'application/xml; charset=ISO-8859-1');
    res.send(xml);
  } catch (err) {
    next(err);
  }
});

app.post('/api/payroll/calculate', verifyFirebaseToken, requireTenantAccess, (req, res, next) => {
  try {
    const { baseSalaryBs, cestaticketBs = 0, riskLevel = 'MINIMO' } = req.body;
    if (baseSalaryBs === undefined || isNaN(Number(baseSalaryBs)) || Number(baseSalaryBs) < 0) {
      return res.status(400).json({ error: 'baseSalaryBs numérico positivo es requerido' });
    }
    const result = calculateLotttPayroll({
      baseSalaryBs: Number(baseSalaryBs),
      cestaticketBs: Number(cestaticketBs),
      riskLevel
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Endpoint de diagnóstico criptográfico restringido exclusivamente a entorno local de desarrollo (deshabilitado en producción)
app.post('/api/crypto/vault-test', verifyFirebaseToken, (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Diagnóstico de bóveda deshabilitado en producción por seguridad.' });
  }
  try {
    const { plainText, previousHash = 'GENESIS_SENIAT_2026' } = req.body;
    const encrypted = encryptSensitiveField(plainText || 'SENIAT_2026');
    const decrypted = decryptSensitiveField(encrypted);
    const sha256Hash = computeAuditHash(previousHash, { encrypted, timestamp: new Date().toISOString() });
    res.json({ encrypted, decrypted, sha256Hash, algorithm: 'AES-256-GCM + SHA-256' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/Voucher14', verifyFirebaseToken, requireTenantAccess, (req, res, next) => {
  try {
    const { yearMonth, seq } = req.body;
    if (!yearMonth || seq === undefined) {
      return res.status(400).json({ error: 'yearMonth y seq son obligatorios' });
    }
    res.json({ voucher: buildRetentionVoucherNumber(yearMonth, seq) });
  } catch (err) {
    next(err);
  }
});

// Servir archivos estáticos del frontend de producción (React 19 + Vite)
const distPath = path.resolve(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Manejo 404 para rutas API no definidas
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Ruta API no encontrada' });
});

// Middleware Global de Manejo de Errores (sin filtrar stack traces ni rutas internas en producción)
app.use((err, _req, res, _next) => {
  console.error('Error interno capturado en Express:', err.stack || err.message);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProd ? 'Error interno del servidor. Por favor reporte el incidente.' : err.message
  });
});

const PORT = process.env.PORT || 8080;
if (require.main === module) {
  app.listen(PORT, () => console.log(`VeneTurco Fiscal OS v3.2 (VNDE) Backend activo en puerto ${PORT}`));
}

module.exports = app;
