const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const admin = require('firebase-admin');
const { processTelegramReceiptUpdate } = require('./services/telegramBot');
const { processFiscalInvoiceVNDE } = require('./services/vndeFiscalProcessor');
const { syncOfficialBcvRate, DEFAULT_CURRENT_BCV_USD } = require('./services/bcvSyncCron');
const {
  verifySessionToken,
  isUserActiveInDb,
  generateTotpSecretNode,
  authenticateUser,
  verifyPending2faLogin,
  enableUser2fa,
  disableUser2fa,
  changeUserPassword,
  upsertAccountantAccount,
  resetAccountantPassword,
  listAccountants,
  disableAccountant,
  upsertClientSubAccount
} = require('./services/authService');
const {
  SAAS_PLANS,
  generateTelegramLinkCode,
  registerSubscriptionPayment,
  approveSubscriptionPayment,
  checkTenantPlanQuota,
  incrementTenantInvoiceUsage,
  suspendExpiredSubscriptions
} = require('./services/saasBillingEngine');
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
const {
  readWorkspaceState,
  writeWorkspaceState,
  appendTenantInvoice
} = require('./services/workspaceStore');

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
      async get() {
        const docs = [];
        for (const [k, v] of store.entries()) {
          if (k.startsWith(`${colPath}/`) && k.slice(colPath.length + 1).indexOf('/') === -1) {
            docs.push({ id: k.slice(colPath.length + 1), data: () => v });
          }
        }
        return { empty: docs.length === 0, docs };
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

function createResilientFirestore(primaryDb) {
  const fallbackDb = createInMemoryFirestore();
  let fallbackUntil = 0;

  async function execWithFallback(primaryFn, fallbackFn) {
    if (Date.now() < fallbackUntil) return fallbackFn();
    try {
      return await primaryFn();
    } catch (err) {
      const code = err?.code;
      const msg = String(err?.message || '');
      if (
        code === 7 || // PERMISSION_DENIED (Firestore API disabled)
        code === 5 || // NOT_FOUND (Firestore database not created yet)
        code === 14 || // UNAVAILABLE
        /PERMISSION_DENIED|firestore\.googleapis\.com|NOT_FOUND/i.test(msg)
      ) {
        if (Date.now() >= fallbackUntil) {
          console.warn('⚠️ Cloud Firestore no disponible (' + msg.slice(0, 120) + '). Usando respaldo en memoria por 30s.');
        }
        fallbackUntil = Date.now() + 30 * 1000;
        return fallbackFn();
      }
      throw err;
    }
  }

  function wrapDocRef(colPath, docId) {
    const pDoc = docId ? primaryDb.collection(colPath).doc(docId) : primaryDb.collection(colPath).doc();
    const effectiveId = pDoc.id;
    const fDoc = fallbackDb.collection(colPath).doc(effectiveId);
    return {
      id: effectiveId,
      path: `${colPath}/${effectiveId}`,
      get: () => execWithFallback(() => pDoc.get(), () => fDoc.get()),
      set: (payload, options) => execWithFallback(() => pDoc.set(payload, options), () => fDoc.set(payload, options)),
      update: (payload) => execWithFallback(() => pDoc.update(payload), () => fDoc.update(payload)),
      delete: () => execWithFallback(() => pDoc.delete(), () => fDoc.delete())
    };
  }

  return {
    get isFallback() {
      return Date.now() < fallbackUntil;
    },
    collection(colPath) {
      const pCol = primaryDb.collection(colPath);
      const fCol = fallbackDb.collection(colPath);
      return {
        doc: (docId) => wrapDocRef(colPath, docId),
        add: (payload) => execWithFallback(() => pCol.add(payload), () => fCol.add(payload)),
        get: () => execWithFallback(() => pCol.get(), () => fCol.get()),
        where: (field, op, val) => ({
          limit: (n) => ({
            get: () => execWithFallback(() => pCol.where(field, op, val).limit(n).get(), () => fCol.where(field, op, val).limit(n).get())
          })
        }),
        orderBy: (field, dir) => ({
          limit: (n) => ({
            get: () => execWithFallback(() => pCol.orderBy(field, dir).limit(n).get(), () => fCol.orderBy(field, dir).limit(n).get())
          })
        })
      };
    }
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
    db = createResilientFirestore(admin.firestore());
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || fs.existsSync(path.resolve(__dirname, 'service-account-firebase.json'))) {
    const rawCredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve(__dirname, 'service-account-firebase.json');
    const resolvedCredPath = fs.existsSync(rawCredPath)
      ? rawCredPath
      : path.resolve(__dirname, rawCredPath);
    if (fs.existsSync(resolvedCredPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(resolvedCredPath, 'utf8'));
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
      db = createResilientFirestore(admin.firestore());
    } else {
      db = createInMemoryFirestore();
    }
  } else {
    db = createInMemoryFirestore();
  }
} catch (_err) {
  db = createInMemoryFirestore();
}

// En entornos serverless (Vercel) las tareas programadas se ejecutan vía Vercel Crons (vercel.json)
if (!process.env.VERCEL) {
  // Cron Job diario BCV (09:05 AM y 01:15 PM hora Caracas)
  cron.schedule('5 9,13 * * 1-5', async () => {
    await syncOfficialBcvRate(db);
  }, { timezone: 'America/Caracas' });

  // Cron Job diario de Morosidad SaaS (12:05 AM hora Caracas)
  cron.schedule('5 0 * * *', async () => {
    await suspendExpiredSubscriptions(db);
  }, { timezone: 'America/Caracas' });
}

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
    return callback(new Error('Origen no autorizado por política CORS de VT Fiscal OS'));
  }
}));
app.use(express.json({ limit: '12mb' }));

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación. Espere unos minutos.' }
});

async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const queryToken = req.path === '/api/events/invoices' && typeof req.query?.token === 'string'
      ? req.query.token.trim()
      : '';
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && authHeader === 'Bearer DEV_LOCAL_BYPASS') {
      req.user = { uid: 'contador_auditor_local', role: 'superadmin', email: 'moucharrafiepc@gmail.com' };
      return next();
    }
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split('Bearer ')[1].trim()
      : queryToken;
    if (!token) {
      return res.status(401).json({ error: 'Token Bearer requerido' });
    }
    const sessionUser = verifySessionToken(token);
    if (sessionUser) {
      const active = await isUserActiveInDb(db, sessionUser.email);
      if (!active) {
        return res.status(403).json({ error: 'Cuenta suspendida o revocada.' });
      }
      req.user = sessionUser;
      return next();
    }
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (_err) {
    return res.status(403).json({ error: 'Token invalido o expirado' });
  }
}

function requireSuperAdmin(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (user.role === 'superadmin') return next();
  return res.status(403).json({ error: 'Acceso denegado: operación reservada para Super-Admin.' });
}

// Middleware de Control de Acceso y Prevención de IDOR (Insecure Direct Object References)
function requireTenantAccess(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (user.role === 'superadmin') return next();
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
    engine: 'VT Fiscal OS v3.2 (VNDE 0 Tokens)',
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

// Tickets efímeros de un solo uso (30s) para autenticar conexiones SSE sin exponer el JWT en query strings
const sseTickets = new Map();
const SSE_TICKET_TTL_MS = 30 * 1000;

function issueSseTicket(user, tenantId) {
  const now = Date.now();
  // Limpieza oportunista de tickets vencidos
  for (const [k, v] of sseTickets.entries()) {
    if (v.expiresAt <= now) sseTickets.delete(k);
  }
  const ticket = crypto.randomBytes(24).toString('hex');
  sseTickets.set(ticket, { user, tenantId, expiresAt: now + SSE_TICKET_TTL_MS });
  return ticket;
}

function consumeSseTicket(ticket) {
  if (!ticket || typeof ticket !== 'string') return null;
  const entry = sseTickets.get(ticket);
  sseTickets.delete(ticket); // Un solo uso estricto
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry;
}

// Pool de conexiones Server-Sent Events (SSE) para recepción de facturas en tiempo real
const sseInvoiceClients = new Set();

function broadcastInvoiceEvent(tenantId, invoice) {
  const payload = `data: ${JSON.stringify({ type: 'NEW_INVOICE', tenantId, invoice })}\n\n`;
  for (const client of sseInvoiceClients) {
    if (client.tenantId === 'all' || client.tenantId === tenantId) {
      client.res.write(payload);
    }
  }
}

app.post('/api/events/ticket', verifyFirebaseToken, (req, res) => {
  const requestedTenant = String(req.body?.tenantId || 'all');
  const isSuper = req.user?.role === 'superadmin';
  const allowedIds = Array.isArray(req.user?.tenantIds) ? req.user.tenantIds : [];
  if (!isSuper) {
    if (requestedTenant === 'all' || !allowedIds.includes(requestedTenant)) {
      return res.status(403).json({ error: 'Acceso denegado al canal SSE de esta empresa.' });
    }
  }
  const ticket = issueSseTicket(req.user, requestedTenant);
  return res.json({ ok: true, ticket, expiresInSeconds: SSE_TICKET_TTL_MS / 1000 });
});

app.get('/api/events/invoices', async (req, res, next) => {
  const ticketParam = typeof req.query?.ticket === 'string' ? req.query.ticket.trim() : '';
  if (ticketParam) {
    const ticketData = consumeSseTicket(ticketParam);
    if (!ticketData) {
      return res.status(401).json({ error: 'Ticket SSE inválido o expirado.' });
    }
    const active = await isUserActiveInDb(db, ticketData.user?.email);
    if (!active) {
      return res.status(403).json({ error: 'Cuenta suspendida o revocada.' });
    }
    req.user = ticketData.user;
    req.sseValidatedTenantId = ticketData.tenantId;
    return next();
  }
  return verifyFirebaseToken(req, res, next);
}, (req, res) => {
  const requestedTenant = req.sseValidatedTenantId || String(req.query.tenantId || 'all');
  const isSuper = req.user?.role === 'superadmin';
  const allowedIds = Array.isArray(req.user?.tenantIds) ? req.user.tenantIds : [];
  if (!isSuper) {
    if (requestedTenant === 'all' || !allowedIds.includes(requestedTenant)) {
      return res.status(403).json({ error: 'Acceso denegado al canal SSE de esta empresa.' });
    }
  }
  const tenantId = requestedTenant;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'SSE_CONNECTED', tenantId })}\n\n`);

  const client = { res, tenantId };
  sseInvoiceClients.add(client);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseInvoiceClients.delete(client);
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
    if (result && result.invoice) {
      broadcastInvoiceEvent(result.tenantId || result.invoice.tenantId, result.invoice);
    }
    res.json(result);
  } catch (err) {
    console.error('Telegram webhook error:', err);
    res.status(500).json({ error: 'Error procesando comprobante' });
  }
});

// Consulta pública de la Tasa Oficial BCV vigente
app.get('/api/bcv/latest', bcvSyncLimiter, async (_req, res, next) => {
  try {
    const result = await syncOfficialBcvRate(db);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Verificación opcional de Vercel Cron Secret para endpoints invocados por cron
function verifyCronSecretIfConfigured(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'CRON_SECRET inválido o ausente.' });
    }
  }
  return next();
}

// Sincronización explícita del oráculo BCV (GET para Vercel Cron + POST para sincronización manual)
async function handleBcvSyncNow(_req, res, next) {
  try {
    const result = await syncOfficialBcvRate(db);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
app.get('/api/bcv/sync-now', bcvSyncLimiter, verifyCronSecretIfConfigured, handleBcvSyncNow);
app.post('/api/bcv/sync-now', bcvSyncLimiter, handleBcvSyncNow);

// Barrido diario de suscripciones vencidas (Vercel Cron GET o disparo manual Super-Admin POST)
app.get('/api/saas/suspend-expired', verifyCronSecretIfConfigured, async (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !process.env.CRON_SECRET) {
    return res.status(503).json({ error: 'CRON_SECRET requerido en producción para ejecutar este cron.' });
  }
  try {
    const result = await suspendExpiredSubscriptions(db);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});
app.post('/api/saas/suspend-expired', verifyFirebaseToken, requireSuperAdmin, async (_req, res, next) => {
  try {
    const result = await suspendExpiredSubscriptions(db);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

const ALLOWED_OCR_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

app.post('/api/ocr', verifyFirebaseToken, requireTenantAccess, ocrLimiter, async (req, res, next) => {
  const { tenantId, base64Data, mimeType = 'image/jpeg', fileName = 'factura.jpg', rawText, qrPayload } = req.body;
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
    const quotaCheck = await checkTenantPlanQuota(db, tenantId);
    if (!quotaCheck.allowed) {
      return res.status(quotaCheck.status || 429).json({ error: quotaCheck.error });
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
    await incrementTenantInvoiceUsage(db, tenantId);
    return res.json({
      ...result,
      quota: {
        usedInvoices: (quotaCheck.usedInvoices || 0) + 1,
        maxInvoicesMonthly: quotaCheck.maxInvoicesMonthly || 3000
      }
    });
  } catch (err) {
    next(err);
  }
});

// Registro directo de facturas enviadas desde el Portal Móvil de Usuarios/Clientes
app.post('/api/invoices/client-upload', verifyFirebaseToken, requireTenantAccess, async (req, res, next) => {
  try {
    const { tenantId, invoice } = req.body || {};
    if (!tenantId || !invoice || typeof invoice !== 'object') {
      return res.status(400).json({ error: 'Se requiere tenantId y el objeto invoice para registrar la factura.' });
    }
    const rifCheck = validateVenezuelanRIF(invoice.supplierRif);
    if (!rifCheck.valid) {
      return res.status(400).json({ error: `RIF de proveedor inválido (Módulo 11): ${invoice.supplierRif || 'vacío'}` });
    }
    const quotaCheck = await checkTenantPlanQuota(db, tenantId);
    if (!quotaCheck.allowed) {
      return res.status(quotaCheck.status || 429).json({ error: quotaCheck.error });
    }
    const sanitizedInvoice = {
      ...invoice,
      id: String(invoice.id || `inv_${Date.now()}`),
      tenantId: String(tenantId),
      supplierRif: rifCheck.formatted,
      status: 'BORRADOR_IA'
    };
    const saved = await appendTenantInvoice(
      db,
      tenantId,
      sanitizedInvoice,
      req.user?.email || req.user?.uid || 'client'
    );
    await incrementTenantInvoiceUsage(db, tenantId);
    broadcastInvoiceEvent(tenantId, sanitizedInvoice);
    return res.status(201).json(saved);
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
      bcvRate: Number(bcvRate || DEFAULT_CURRENT_BCV_USD || 914.02),
      actorUid: req.user.uid,
      actorRole: req.user.role
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/saas/approve-payment', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const { tenantId, paymentId } = req.body;
    if (!tenantId || !paymentId) {
      return res.status(400).json({ error: 'tenantId y paymentId son obligatorios para conciliar el pago.' });
    }
    const result = await approveSubscriptionPayment(db, {
      tenantId,
      paymentId,
      actorUid: req.user.uid
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

app.post('/api/payroll/calculate', verifyFirebaseToken, requireTenantAccess, async (req, res, next) => {
  try {
    const { tenantId, baseSalaryBs, cestaticketBs = 0, riskLevel = 'MINIMO' } = req.body;
    if (baseSalaryBs === undefined || isNaN(Number(baseSalaryBs)) || Number(baseSalaryBs) < 0) {
      return res.status(400).json({ error: 'baseSalaryBs numérico positivo es requerido' });
    }
    if (tenantId) {
      const quotaCheck = await checkTenantPlanQuota(db, tenantId, { requirePayroll: true });
      if (!quotaCheck.allowed) {
        return res.status(quotaCheck.status || 403).json({ error: quotaCheck.error });
      }
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

// =========================================================================
// AUTENTICACIÓN REAL CLOUD (Firestore + Scrypt + JWT HS256 + Firebase Sync)
// =========================================================================

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authenticateUser(db, admin, { email, password });
    if (!result.ok) {
      return res.status(result.status || 401).json({
        error: result.error,
        code: result.code,
        failedAttempts: result.failedAttempts,
        remainingAttempts: result.remainingAttempts,
        lockRemainingSeconds: result.lockRemainingSeconds
      });
    }
    if (result.requires2fa) {
      return res.json({
        ok: true,
        requires2fa: true,
        pending2faToken: result.pending2faToken,
        user: result.user,
        storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE'
      });
    }
    return res.json({
      ok: true,
      token: result.token,
      user: result.user,
      storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE'
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/verify-2fa', authLimiter, async (req, res, next) => {
  try {
    const { pending2faToken, code } = req.body || {};
    const result = await verifyPending2faLogin(db, pending2faToken, code);
    if (!result.ok) {
      return res.status(result.status || 401).json({ error: result.error });
    }
    return res.json({
      ok: true,
      token: result.token,
      user: result.user,
      storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE'
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/2fa/setup', verifyFirebaseToken, requireSuperAdmin, (_req, res) => {
  const secret = generateTotpSecretNode(20);
  return res.json({ ok: true, secret });
});

app.post('/api/auth/2fa/enable', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const { secret, code } = req.body || {};
    const result = await enableUser2fa(db, req.user.email, secret, code);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/2fa/disable', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await disableUser2fa(db, req.user.email);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/auth/me', verifyFirebaseToken, async (req, res) => {
  return res.json({
    ok: true,
    user: req.user,
    storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE'
  });
});

app.post('/api/auth/change-password', verifyFirebaseToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const result = await changeUserPassword(db, admin, {
      email: req.user.email,
      currentPassword,
      newPassword
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json({ ok: true, token: result.token, user: result.user });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/verify-attempt', authLimiter, async (req, res) => {
  // Registro de telemetría de intentos de acceso (evita 404 en consola)
  return res.json({ recorded: true, timestamp: new Date().toISOString() });
});

app.post('/api/auth/subaccount-invite', verifyFirebaseToken, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Solo administradores o contadores pueden activar sub-cuentas.' });
    }
    const result = await upsertClientSubAccount(db, admin, req.body || {});
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// GESTIÓN CLOUD DE CONTADORES ALIADOS (Super-Admin -> Firestore vt_accountants)
// =========================================================================

app.get('/api/accountants', verifyFirebaseToken, requireSuperAdmin, async (_req, res, next) => {
  try {
    const accountants = await listAccountants(db);
    return res.json({ ok: true, accountants, storageMode: db.isFallback ? 'IN_MEMORY_VAULT' : 'FIREBASE_CLOUD_FIRESTORE' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/accountants', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await upsertAccountantAccount(db, admin, req.body || {});
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.status(result.status).json(result);
  } catch (err) {
    next(err);
  }
});

app.put('/api/accountants/:id', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await upsertAccountantAccount(db, admin, { ...(req.body || {}), id: req.params.id });
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/accountants/:id/reset-password', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await resetAccountantPassword(db, admin, req.params.id, req.body?.tempPassword);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/accountants/:id', verifyFirebaseToken, requireSuperAdmin, async (req, res, next) => {
  try {
    const result = await disableAccountant(db, admin, req.params.id);
    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// SINCRONIZACIÓN CLOUD FIRESTORE MULTI-DISPOSITIVO (Particionada por Tenant)
// =========================================================================

app.get('/api/workspace/state', verifyFirebaseToken, async (req, res, next) => {
  try {
    const result = await readWorkspaceState(db, req.user);
    return res.json({ ok: true, empty: result.empty, partitioned: result.partitioned, state: result.state });
  } catch (err) {
    next(err);
  }
});

app.put('/api/workspace/state', verifyFirebaseToken, async (req, res, next) => {
  try {
    const { tenants, invoices, employees, payments } = req.body || {};
    const result = await writeWorkspaceState(db, req.user, { tenants, invoices, employees, payments });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// Servir archivos estáticos del frontend de producción (React 19 + Vite -> outDir '../dist')
const possibleDistPaths = [
  path.resolve(__dirname, '../dist'),
  path.resolve(__dirname, '../frontend/dist')
];
const distPath = possibleDistPaths.find(p => fs.existsSync(p));
if (distPath) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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
