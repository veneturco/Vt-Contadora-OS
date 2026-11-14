const axios = require('axios');
const https = require('https');
const { computeAuditHash } = require('../security/cryptoVault');

// Agente HTTPS tolerante a certificados intermedios del portal BCV
const bcvHttpsAgent = new https.Agent({ rejectUnauthorized: false });

// Cache en memoria para evitar saturar el portal del BCV y prevenir baneos por IP
let cachedBcvResult = null;
let lastBcvFetchTime = 0;
const CACHE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos de enfriamiento mínimo

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchBcvHtmlWithBackoff(maxAttempts = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get('https://www.bcv.org.ve/', {
        httpsAgent: bcvHttpsAgent,
        timeout: 10000,
        headers
      });
      return response.data;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      // Backoff exponencial con jitter aleatorio para no sincronizar ráfagas y evitar detección anti-bot
      const jitterMs = Math.floor(Math.random() * 600);
      const delayMs = (attempt * 1200) + jitterMs;
      await sleep(delayMs);
    }
  }
}

async function syncOfficialBcvRate(db) {
  const now = Date.now();
  if (cachedBcvResult && (now - lastBcvFetchTime) < CACHE_COOLDOWN_MS) {
    return { ...cachedBcvResult, source: 'BCV_CACHE_COOLDOWN' };
  }

  const nowVET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Caracas' }));
  const yyyy = nowVET.getFullYear();
  const mm = String(nowVET.getMonth() + 1).padStart(2, '0');
  const dd = String(nowVET.getDate()).padStart(2, '0');
  const dateKey = `${yyyy}-${mm}-${dd}`;

  try {
    const html = String(await fetchBcvHtmlWithBackoff(3) || '');
    const usdMatch = html.match(/id="dolar"[\s\S]*?<strong>\s*([0-9.,]+)\s*<\/strong>/i);
    const eurMatch = html.match(/id="euro"[\s\S]*?<strong>\s*([0-9.,]+)\s*<\/strong>/i);

    if (!usdMatch) throw new Error('No se pudo extraer el nodo #dolar del HTML oficial del BCV');

    const usdRate = parseFloat(usdMatch[1].replace(/\./g, '').replace(',', '.'));
    const eurRate = eurMatch ? parseFloat(eurMatch[1].replace(/\./g, '').replace(',', '.')) : Number((usdRate * 1.08).toFixed(4));

    const payload = {
      date: dateKey,
      usdVes: usdRate,
      eurVes: eurRate,
      source: 'BCV_OFICIAL_SCRAPER',
      syncedAt: new Date().toISOString(),
      integrityHash: computeAuditHash('BCV_ORACLE', { dateKey, usdRate, eurRate })
    };

    await db.collection('bcv_rates').doc(dateKey).set(payload, { merge: true });
    cachedBcvResult = payload;
    lastBcvFetchTime = now;
    return { status: 'synced', ...payload };
  } catch (err) {
    // Fallback al ultimo cierre habil registrado en Firestore
    try {
      const lastSnap = await db.collection('bcv_rates').orderBy('date', 'desc').limit(1).get();
      const fallback = !lastSnap.empty ? lastSnap.docs[0].data() : { usdVes: 47.05, eurVes: 50.80 };
      const fallbackResult = { status: 'fallback_used', date: dateKey, usdVes: fallback.usdVes, eurVes: fallback.eurVes, error: err.message };
      cachedBcvResult = fallbackResult;
      lastBcvFetchTime = now;
      return fallbackResult;
    } catch (_dbErr) {
      return { status: 'fallback_default', date: dateKey, usdVes: 47.05, eurVes: 50.80, error: err.message };
    }
  }
}

module.exports = { syncOfficialBcvRate };
