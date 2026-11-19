const axios = require('axios');
const https = require('https');
const { computeAuditHash } = require('../security/cryptoVault');
const { DEFAULT_CURRENT_BCV_USD, DEFAULT_CURRENT_BCV_EUR } = require('./bcvConstants');

// Agente HTTPS para requests directos a BCV
const bcvHttpsAgent = new https.Agent({
  rejectUnauthorized: process.env.BCV_STRICT_TLS === 'true'
});

// Cache en memoria para evitar saturar fuentes externas y prevenir rate-limits
let cachedBcvResult = null;
let lastBcvFetchTime = 0;
const CACHE_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos de enfriamiento mínimo

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Oráculo Fuente 1: API de datos oficiales BCV (DolarAPI Venezuela)
 * Extrae la tasa oficial del Banco Central de Venezuela de forma ultra rápida
 * y sin restricciones geográficas ni bloqueos de firewall de datacenters.
 */
async function fetchFromOfficialApiMirror() {
  try {
    const [usdRes, eurRes] = await Promise.all([
      axios.get('https://ve.dolarapi.com/v1/dolares/oficial', { timeout: 6000 }),
      axios.get('https://ve.dolarapi.com/v1/euros/oficial', { timeout: 6000 }).catch(() => null)
    ]);

    if (usdRes.data && typeof usdRes.data.promedio === 'number' && usdRes.data.promedio > 100) {
      const usdRate = Number(usdRes.data.promedio.toFixed(4));
      const eurRate = eurRes?.data && typeof eurRes.data.promedio === 'number' && eurRes.data.promedio > 100
        ? Number(eurRes.data.promedio.toFixed(4))
        : Number((usdRate * 1.107).toFixed(4));

      return {
        usdRate,
        eurRate,
        source: 'BCV_OFICIAL_API_MIRROR',
        date: usdRes.data.fechaActualizacion || new Date().toISOString()
      };
    }
  } catch (_err) {
    // Si falla el mirror, continúa con el scraper directo
  }
  return null;
}

/**
 * Oráculo Fuente 2: Scraper directo al portal www.bcv.org.ve
 */
async function fetchFromBcvPortalDirect(maxAttempts = 2) {
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
        timeout: 6000,
        headers
      });
      const html = String(response.data || '');
      const usdMatch = html.match(/id="dolar"[\s\S]*?<strong>\s*([0-9.,]+)\s*<\/strong>/i);
      const eurMatch = html.match(/id="euro"[\s\S]*?<strong>\s*([0-9.,]+)\s*<\/strong>/i);

      if (usdMatch) {
        const usdRate = parseFloat(usdMatch[1].replace(/\./g, '').replace(',', '.'));
        const eurRate = eurMatch ? parseFloat(eurMatch[1].replace(/\./g, '').replace(',', '.')) : Number((usdRate * 1.08).toFixed(4));
        if (usdRate > 100) {
          return {
            usdRate,
            eurRate,
            source: 'BCV_PORTAL_DIRECTO'
          };
        }
      }
    } catch (_err) {
      if (attempt < maxAttempts) {
        await sleep(1000 * attempt);
      }
    }
  }
  return null;
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

  // 1. Intentar API oficial mirror (más rápida y sin bloqueos de firewall)
  let oracleData = await fetchFromOfficialApiMirror();

  // 2. Si el mirror no responde, intentar scraper directo
  if (!oracleData) {
    oracleData = await fetchFromBcvPortalDirect(2);
  }

  if (oracleData && oracleData.usdRate) {
    const payload = {
      date: dateKey,
      usdVes: oracleData.usdRate,
      eurVes: oracleData.eurRate,
      officialRate: oracleData.usdRate,
      source: oracleData.source,
      syncedAt: new Date().toISOString(),
      integrityHash: computeAuditHash('BCV_ORACLE', { dateKey, usdRate: oracleData.usdRate, eurRate: oracleData.eurRate })
    };

    if (db && typeof db.collection === 'function') {
      try {
        await db.collection('bcv_rates').doc(dateKey).set(payload, { merge: true });
        await db.collection('bcv_rates').doc('latest').set(payload, { merge: true });
      } catch (_saveErr) {
        // En memoria o fallo leve de Firestore no detiene la respuesta
      }
    }

    cachedBcvResult = payload;
    lastBcvFetchTime = now;
    return { status: 'synced', ...payload };
  }

  // Fallback: consultar último registro guardado en base de datos
  if (db && typeof db.collection === 'function') {
    try {
      const latestDoc = await db.collection('bcv_rates').doc('latest').get();
      if (latestDoc.exists) {
        const fb = latestDoc.data();
        if (fb && fb.usdVes && fb.usdVes > 100) {
          const fallbackResult = { status: 'fallback_used', date: dateKey, usdVes: fb.usdVes, eurVes: fb.eurVes, source: 'FIRESTORE_LATEST' };
          cachedBcvResult = fallbackResult;
          lastBcvFetchTime = now;
          return fallbackResult;
        }
      }
    } catch (_dbErr) {
      // Ignorar error de base de datos
    }
  }

  // Fallback estático con la tasa oficial vigente
  const fallbackResult = {
    status: 'fallback_default',
    date: dateKey,
    usdVes: DEFAULT_CURRENT_BCV_USD,
    eurVes: DEFAULT_CURRENT_BCV_EUR,
    officialRate: DEFAULT_CURRENT_BCV_USD,
    source: 'BCV_BASELINE_OFICIAL',
    syncedAt: new Date().toISOString()
  };
  cachedBcvResult = fallbackResult;
  lastBcvFetchTime = now;
  return fallbackResult;
}

module.exports = {
  syncOfficialBcvRate,
  DEFAULT_CURRENT_BCV_USD,
  DEFAULT_CURRENT_BCV_EUR
};
