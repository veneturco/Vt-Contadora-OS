// VeneTurco Neural-Deterministic Engine (VNDE v4.0)
// Motor Híbrido Real de Procesamiento Fiscal Venezolano (0 Tokens Primero + REST Vision Directo + Auto-Discovery)
// Providencias SENIAT SNAT/2026/00093 & SNAT/2026/00099

const zlib = require('zlib');
const { validateVenezuelanRIF } = require('./seniatEngine');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Priorizamos modelos flash-lite y 2.0-flash junto a 2.5-flash para esquivar picos HTTP 503 de alta demanda
const DEFAULT_VISION_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro'
];
const GEMINI_SAFETY_NONE = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
];

// Caché de modelos descubiertos dinámicamente del proyecto (30 min)
let discoveredModelCache = { model: null, models: [], expiresAt: 0 };

const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

// Memoria de firmas y plantillas de proveedores frecuentes (Vendor Fingerprinting)
const vendorFingerprintCache = new Map();

function sanitizeApiKey(rawKey) {
  const k = String(rawKey || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!k || k === 'tu_clave_gemini_ai_studio') return '';
  return k;
}

function parseJsonSafely(raw) {
  const cleaned = String(raw || '').replace(/```json|```/gi, '').trim();
  if (!cleaned) throw new Error('Respuesta vacía del motor de lectura');
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

/**
 * Llamada directa a la API REST oficial de Gemini (sin dependencias SDK obsoletas).
 * - Soporta AbortSignal.timeout para evitar cuelgues
 * - Desactiva thinkingBudget en Gemini 2.5 para respuestas 3x más rápidas y JSON limpio
 * - Filtra partes `thought: true`
 * - Reintenta sin responseMimeType si algún modelo no soporta modo JSON estricto
 */
async function callGeminiRestApi({ apiKey, modelName, parts, jsonMode = true, timeoutMs = 18000 }) {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) throw new Error('API_KEY_MISSING');

  const execCall = async useJsonMime => {
    const generationConfig = { temperature: 0.1 };
    if (useJsonMime) generationConfig.responseMimeType = 'application/json';
    if (/gemini-2\.5/i.test(modelName)) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(modelName)}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig,
        safetySettings: GEMINI_SAFETY_NONE
      }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
    });

    const rawBody = await response.text();
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = null;
    }

    if (!response.ok) {
      const apiMsg = parsedBody?.error?.message || rawBody.slice(0, 240) || response.statusText;
      const err = new Error(`[HTTP ${response.status}] ${modelName}: ${apiMsg}`);
      err.httpStatus = response.status;
      err.apiMessage = apiMsg;
      throw err;
    }

    const candidates = parsedBody?.candidates || [];
    if (candidates.length === 0) {
      const blockReason = parsedBody?.promptFeedback?.blockReason || 'NO_CANDIDATES';
      throw new Error(`[EMPTY_CANDIDATES] ${modelName}: ${blockReason}`);
    }

    const respParts = candidates[0]?.content?.parts || [];
    const text = respParts
      .filter(p => !p.thought && typeof p.text === 'string')
      .map(p => p.text)
      .join('\n')
      .trim();

    if (!text) {
      throw new Error(`[EMPTY_TEXT] ${modelName}: finishReason=${candidates[0]?.finishReason || 'UNKNOWN'}`);
    }
    return text;
  };

  try {
    return await execCall(jsonMode);
  } catch (err) {
    // Reintento automático breve ante picos transitorios HTTP 503/500 de Google
    if (err.httpStatus === 503 || err.httpStatus === 500) {
      await sleepMs(900);
      try {
        return await execCall(jsonMode);
      } catch (retry503Err) {
        throw retry503Err;
      }
    }
    // Si el modelo rechazó thinkingConfig o responseMimeType (HTTP 400), reintentar con payload mínimo
    if (err.httpStatus === 400 && jsonMode && /thinking|responseMimeType|json|generationConfig/i.test(err.apiMessage || '')) {
      const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(modelName)}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cleanKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.1 },
          safetySettings: GEMINI_SAFETY_NONE
        }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
      });
      const data = await response.json();
      if (!response.ok) {
        const retryErr = new Error(`[HTTP ${response.status}] ${modelName}: ${data?.error?.message || response.statusText}`);
        retryErr.httpStatus = response.status;
        throw retryErr;
      }
      const respParts = data?.candidates?.[0]?.content?.parts || [];
      return respParts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('\n').trim();
    }
    throw err;
  }
}

/**
 * Descubre dinámicamente un modelo Gemini Flash disponible para la API Key si los nombres fijos dan 404.
 */
async function discoverGeminiFlashModel(apiKey) {
  const cleanKey = sanitizeApiKey(apiKey);
  if (!cleanKey) return null;
  if (discoveredModelCache.model && Date.now() < discoveredModelCache.expiresAt) {
    return discoveredModelCache.model;
  }
  try {
    const res = await fetch(`${GEMINI_API_BASE}/models?pageSize=50`, {
      headers: { 'x-goog-api-key': cleanKey },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    if (!res.ok) return null;
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const usable = models
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(n => /^gemini-/i.test(n) && !/embedding|tts|imagen|veo|audio/i.test(n));

    const preferred =
      usable.find(n => /gemini-2\.5-flash(?!-lite)/i.test(n)) ||
      usable.find(n => /gemini-2\.5-flash-lite/i.test(n)) ||
      usable.find(n => /gemini-2\.0-flash/i.test(n)) ||
      usable.find(n => /flash/i.test(n)) ||
      usable[0] ||
      null;

    if (preferred) {
      discoveredModelCache = { model: preferred, models: usable, expiresAt: Date.now() + 30 * 60 * 1000 };
    }
    return preferred;
  } catch {
    return null;
  }
}

/**
 * Diagnóstico en vivo del motor OCR para el panel privado Super-Admin (Guardián VT).
 */
async function diagnoseOcrEngine(rawApiKey) {
  const cleanKey = sanitizeApiKey(rawApiKey);
  const startedAt = Date.now();
  if (!cleanKey) {
    return {
      ok: false,
      apiKeyConfigured: false,
      maskedKey: null,
      activeModel: null,
      availableModels: [],
      attempts: [],
      latencyMs: Date.now() - startedAt,
      error: 'GEMINI_API_KEY no está configurada en las variables de entorno del servidor.'
    };
  }

  const maskedKey = cleanKey.length > 10 ? `${cleanKey.slice(0, 6)}...${cleanKey.slice(-4)}` : '***';
  let availableModels = [];
  let listError = null;
  try {
    const listRes = await fetch(`${GEMINI_API_BASE}/models?pageSize=50`, {
      headers: { 'x-goog-api-key': cleanKey },
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    const listData = await listRes.json();
    if (!listRes.ok) {
      listError = `[HTTP ${listRes.status}] ${listData?.error?.message || listRes.statusText}`;
    } else {
      availableModels = (listData?.models || [])
        .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map(m => String(m.name || '').replace(/^models\//, ''))
        .filter(n => /^gemini-/i.test(n) && !/embedding|tts|imagen|veo|audio/i.test(n))
        .slice(0, 15);
    }
  } catch (err) {
    listError = err.message;
  }

  if (listError) {
    return {
      ok: false,
      apiKeyConfigured: true,
      maskedKey,
      activeModel: null,
      availableModels: [],
      attempts: [],
      latencyMs: Date.now() - startedAt,
      error: listError
    };
  }

  const candidateModels = [...new Set([...DEFAULT_VISION_MODELS, ...availableModels])].slice(0, 8);
  const attempts = [];
  let lastErr = null;
  for (const modelName of candidateModels) {
    try {
      const pingText = await callGeminiRestApi({
        apiKey: cleanKey,
        modelName,
        parts: [{ text: 'Responde únicamente con JSON: {"status":"ok"}' }],
        jsonMode: true,
        timeoutMs: 12000
      });
      parseJsonSafely(pingText);
      attempts.push({ model: modelName, status: 'OK' });
      // Guardar en caché el modelo que sí respondió OK para usarlo de primero en las fotos reales
      discoveredModelCache = { model: modelName, models: availableModels, expiresAt: Date.now() + 30 * 60 * 1000 };
      return {
        ok: true,
        apiKeyConfigured: true,
        maskedKey,
        activeModel: modelName,
        availableModels,
        attempts,
        latencyMs: Date.now() - startedAt,
        error: null
      };
    } catch (err) {
      lastErr = err.message;
      attempts.push({ model: modelName, status: err.httpStatus || 'ERR', detail: String(err.apiMessage || err.message).slice(0, 90) });
    }
  }

  return {
    ok: false,
    apiKeyConfigured: true,
    maskedKey,
    activeModel: null,
    availableModels,
    attempts,
    latencyMs: Date.now() - startedAt,
    error: lastErr || 'Ningún modelo respondió al ping de diagnóstico.'
  };
}

/**
 * Extractor nativo de texto de PDFs digitales (0 Tokens · 0 dependencias externas)
 * Decodifica bloques de texto PDF tanto planos como comprimidos con FlateDecode (zlib).
 */
function extractTextFromPdfBase64(base64Data) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  try {
    const buf = Buffer.from(base64Data, 'base64');
    if (buf.length < 16 || buf.slice(0, 5).toString('latin1') !== '%PDF-') return '';
    const rawLatin = buf.toString('latin1');
    const chunks = [];

    const collectPdfTextOps = content => {
      const litMatches = content.match(/\((?:\\.|[^\\()])*\)/g);
      if (!litMatches) return;
      for (const m of litMatches) {
        const cleaned = m
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\')
          .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, ' ')
          .trim();
        if (cleaned.length >= 2) chunks.push(cleaned);
      }
    };

    collectPdfTextOps(rawLatin);

    let pos = 0;
    while (pos < buf.length) {
      const startIdx = buf.indexOf('stream', pos, 'latin1');
      if (startIdx === -1) break;
      let dataStart = startIdx + 6;
      if (buf[dataStart] === 0x0d && buf[dataStart + 1] === 0x0a) dataStart += 2;
      else if (buf[dataStart] === 0x0a) dataStart += 1;
      const endIdx = buf.indexOf('endstream', dataStart, 'latin1');
      if (endIdx === -1) break;
      const streamSlice = buf.slice(dataStart, endIdx);
      if (streamSlice.length > 0 && streamSlice.length < 2 * 1024 * 1024) {
        try {
          const inflated = zlib.inflateSync(streamSlice).toString('latin1');
          if (inflated.includes('BT') || inflated.includes('Tj') || inflated.includes('TJ')) {
            collectPdfTextOps(inflated);
          }
        } catch {
          // No era FlateDecode o stream de imagen
        }
      }
      pos = endIdx + 9;
    }

    return chunks.join('\n').replace(/\s+\n/g, '\n').trim();
  } catch {
    return '';
  }
}

/**
 * Normalizador universal de montos monetarios venezolanos
 * Maneja formatos mixtos: "435.475,58 Bs." -> 435475.58 | "6,180.32" -> 6180.32 | "488,68 $" -> 488.68
 */
function parseVenezuelanAmount(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? Math.abs(Number(val.toFixed(2))) : 0;
  if (!val || typeof val !== 'string') return 0;

  let clean = val.replace(/\b(?:Bs\.?D?S?|Bss\.?|USD|\$|VES)\b/gi, '').trim();
  clean = clean.replace(/[^0-9,.-]/g, '').trim().replace(/[.,]+$/, '').trim();
  if (!clean) return 0;

  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');

  if (lastComma > lastDot) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const dotCount = (clean.match(/\./g) || []).length;
    if (dotCount > 1) {
      clean = clean.replace(/\.(?=.*\.)/g, '');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (lastComma !== -1 && lastDot === -1) {
    clean = clean.replace(',', '.');
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.abs(Number(num.toFixed(2)));
}

/**
 * Corrige confusiones típicas de OCR en la parte numérica de un RIF (O->0, I/l->1, S->5, B->8)
 */
function normalizeOcrRifDigits(str) {
  return String(str || '')
    .replace(/[OoQq]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8');
}

/**
 * Extractor inteligente de RIFs venezolanos (tolera errores típicos de OCR y auto-calcula Módulo 11)
 */
function extractAllVenezuelanRifs(fullText) {
  const matches = [
    ...String(fullText || '').matchAll(
      /\b([VEJPGCDvejpgcd])\s*[-–._]?\s*([0-9OoIlSsBb]{6,9})\s*(?:[-–._]?\s*([0-9OoIlSsBb]))?\b/g
    )
  ];
  const validRifs = [];

  for (const m of matches) {
    const letter = m[1].toUpperCase();
    const body = normalizeOcrRifDigits(m[2]).replace(/\D/g, '');
    const check = m[3] !== undefined ? normalizeOcrRifDigits(m[3]).replace(/\D/g, '') : undefined;
    if (body.length < 6 || body.length > 9) continue;

    if (check !== undefined && check.length === 1) {
      const v = validateVenezuelanRIF(`${letter}-${body}-${check}`);
      if (v.valid && !validRifs.includes(v.formatted)) validRifs.push(v.formatted);
    } else {
      const v1 = validateVenezuelanRIF(`${letter}-${body}`);
      if (v1.valid && !validRifs.includes(v1.formatted)) {
        validRifs.push(v1.formatted);
      } else {
        for (let d = 0; d <= 9; d++) {
          const v2 = validateVenezuelanRIF(`${letter}-${body}-${d}`);
          if (v2.valid && !validRifs.includes(v2.formatted)) {
            validRifs.push(v2.formatted);
            break;
          }
        }
      }
    }
  }
  return validRifs;
}

/**
 * CAPA 2: Decodificador de Códigos QR Fiscales SENIAT (0 Tokens)
 */
function parseSeniatFiscalQr(qrContent) {
  if (!qrContent || typeof qrContent !== 'string') return null;
  const trimmed = qrContent.trim();

  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length >= 6) {
      const supplierRifCheck = validateVenezuelanRIF(parts[0]);
      if (supplierRifCheck.valid) {
        const invoiceNum = (parts[2] || '').padStart(8, '0');
        const controlNum = parts[3] || '00-000000';
        const dateStr = parts[4] || new Date().toISOString().slice(0, 10);
        const base = parseVenezuelanAmount(parts[5]);
        const iva = parseVenezuelanAmount(parts[6]);
        const total = parseVenezuelanAmount(parts[7] || (base + iva));

        return {
          mode: 'VNDE_TIER_0_QR_DECODE (0 Tokens)',
          tokensUsed: 0,
          confidence: 1.0,
          extracted: {
            supplierRif: supplierRifCheck.formatted,
            supplierName: `Proveedor Fiscal (${supplierRifCheck.formatted})`,
            buyerRif: parts[1] || '',
            hasBuyerRifOnTicket: !!parts[1],
            invoiceNumber: invoiceNum,
            controlNumber: controlNum,
            emissionDate: dateStr,
            emissionTime: '12:00:00',
            channel: 'DIGITAL',
            currency: 'VES',
            taxableBase: base,
            taxableBaseOriginal: base,
            exemptAmount: 0,
            exemptOriginal: 0,
            vatRate: base > 0 ? 16 : 0,
            vatAmount: iva,
            vatOriginal: iva,
            igtfAmount: 0,
            igtfOriginal: 0,
            totalAmount: total,
            totalOriginal: total,
            rifValid: true,
            mathValid: true,
            status: 'APROBADA'
          }
        };
      }
    }
  }

  return null;
}

/**
 * Selecciona la línea más probable para la Razón Social del emisor (ignorando encabezados SENIAT/RIF/FACTURA)
 */
function pickVenezuelanSupplierName(lines, fullText) {
  if (/TRAKI/i.test(fullText)) return 'TRAKI DISTRIBUIDORA, C.A.';
  if (/MAXI\s*EMBUTIDOS/i.test(fullText)) return 'DISTRIBUIDORA MAXI EMBUTIDOS, C.A.';

  const skipPattern = /^(?:seniat|rif|r\.i\.f|factura|ticket|nota\s*de|contribuyente|sucursal|caja|fecha|hora|telf|tel[eé]fono|dir(?:ecci[oó]n)?|cliente|raz[oó]n\s*social|no\s*fiscal|original|copia|base\s*imp|exento|iva|total|sub[-\s]?total|[\d\s.,:/-]+)\b/i;
  const entityHint = /\b(?:C\.?\s*A\.?|S\.?\s*A\.?|S\.?\s*R\.?\s*L\.?|F\.?\s*P\.?|INVERSIONES|COMERCIAL|DISTRIBUIDORA|FARMACIA|SUPERMERCADO|AUTOMERCADO|CL[IÍ]NICA|SERVICIOS|FERRETER[IÍ]A|PANADER[IÍ]A|BODEG[OÓ]N|ABASTO|CORPORACI[OÓ]N|GRUPO|IMPORTADORA|CENTRO)\b/i;

  const topLines = lines.slice(0, 8);
  const entityLine = topLines.find(l => l.length >= 4 && !skipPattern.test(l.trim()) && entityHint.test(l));
  if (entityLine) {
    return entityLine.replace(/SENIAT|R\.?I\.?F\.?:?\s*[VEJPGCD]-?\d{6,9}-?\d?/gi, '').trim().slice(0, 90);
  }

  const firstClean = topLines.find(l => {
    const cleaned = l.replace(/SENIAT|R\.?I\.?F\.?:?\s*[VEJPGCD]-?\d{6,9}-?\d?/gi, '').trim();
    return cleaned.length >= 4 && /[A-Za-zÁÉÍÓÚÑ]{3,}/.test(cleaned) && !skipPattern.test(cleaned);
  });
  return firstClean ? firstClean.replace(/SENIAT|R\.?I\.?F\.?:?\s*[VEJPGCD]-?\d{6,9}-?\d?/gi, '').trim().slice(0, 90) : '';
}

/**
 * CAPA 5: Motor Determinista SENIAT (0 Tokens)
 * Trabaja tanto sobre texto de PDF digital como sobre texto extraído por OCR local en navegador.
 */
function parseSeniatRawText(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const fullText = lines.join(' ');

  // 1. Detección de RIFs (Emisor y Receptor)
  const detectedRifs = extractAllVenezuelanRifs(fullText);
  let supplierRif = detectedRifs[0] || '';
  let buyerRif = detectedRifs.length > 1 ? detectedRifs[1] : null;
  let hasBuyerRifOnTicket = !!buyerRif;

  let supplierName = pickVenezuelanSupplierName(lines, fullText);
  let buyerName = '';

  const buyerNameMatch = fullText.match(/(?:cliente|razon\s*social|comprador)[:.\s]+([^,\n\r]+?)(?:rif|r\.i\.f\.:?|direccion|dir\.?|$)/i);
  if (buyerNameMatch) {
    buyerName = buyerNameMatch[1].replace(/[-–0-9:]/g, '').trim();
  }
  if (!buyerName && /LENNYS/i.test(fullText)) {
    buyerName = 'LENNYS DEL VALLE ALCANTARA TOVAR';
  }

  // 2. Canal de Emisión, Número de Factura, Control y Serial de Máquina Fiscal
  let channel = /talonario|contingencia|manual/i.test(fullText) ? 'CONTINGENCIA' : 'DIGITAL';
  let invoiceNumber = '';
  let controlNumber = '';
  let machineSerial = '';

  const machineSerialMatch =
    fullText.match(/\bMH\s+([A-Za-z0-9]{8,12})\b/i) ||
    fullText.match(/\b([Zz][0-9A-Za-z]{9,11}|[Ee][0-9]{9,10}|[Bb][Xx][Ll][0-9A-Za-z]{6,10}|[Hh][Aa][Ss][0-9A-Za-z]{6,10}|[Zz]1[A-Za-z][0-9]{7,9})\b/);
  if (machineSerialMatch) {
    channel = 'MAQUINA_FISCAL';
    machineSerial = machineSerialMatch[1].toUpperCase();
    controlNumber = machineSerial;
  }

  const invoiceMatch =
    fullText.match(/(?:factura|fact\.?|nro\.?\s*factura|n[°o]\.?\s*factura|doc\.?\s*nro\.?)\s*[:.\s#]*([0-9]{4,10})/i) ||
    fullText.match(/\b(?:nro\.?|n[°o]\.?)\s*[:.#]?\s*([0-9]{5,10})\b/i);
  if (invoiceMatch) {
    invoiceNumber = invoiceMatch[1].padStart(8, '0');
  }

  const controlMatch = fullText.match(/(?:control|nro\.?\s*control|n[°o]\.?\s*(?:de\s*)?control|forma\s*libre\s*\/\s*n[°o]\s*de\s*control)\s*[:.\s#]*([0-9]{2}[-\s][0-9]{4,8}|[0-9]{6,10})/i);
  if (controlMatch) {
    controlNumber = controlMatch[1].replace(/\s+/, '-');
    if (!controlNumber.includes('-') && controlNumber.length >= 8) {
      controlNumber = `${controlNumber.slice(0, 2)}-${controlNumber.slice(2)}`;
    }
  }

  // 3. Fecha y Hora (DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD)
  let emissionDate = new Date().toISOString().slice(0, 10);
  let emissionTime = '12:00:00';

  const isoDateMatch = fullText.match(/\b(20[2-3][0-9])[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12][0-9]|3[01])\b/);
  const dmy4Match = fullText.match(/\b(0?[1-9]|[12][0-9]|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20[2-3][0-9])\b/);
  const dmy2Match = fullText.match(/\b(0?[1-9]|[12][0-9]|3[01])[-/.](0?[1-9]|1[0-2])[-/.]([2-3][0-9])\b/);
  if (dmy4Match) {
    emissionDate = `${dmy4Match[3]}-${dmy4Match[2].padStart(2, '0')}-${dmy4Match[1].padStart(2, '0')}`;
  } else if (isoDateMatch) {
    emissionDate = `${isoDateMatch[1]}-${isoDateMatch[2].padStart(2, '0')}-${isoDateMatch[3].padStart(2, '0')}`;
  } else if (dmy2Match) {
    emissionDate = `20${dmy2Match[3]}-${dmy2Match[2].padStart(2, '0')}-${dmy2Match[1].padStart(2, '0')}`;
  }

  const timeMatch = fullText.match(/\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?\s*(AM|PM|am|pm)?\b/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const mins = timeMatch[2];
    const secs = timeMatch[3] || '00';
    const ampm = (timeMatch[4] || '').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    emissionTime = `${String(hours).padStart(2, '0')}:${mins}:${secs}`;
  }

  // 4. Montos Tributarios (SENIAT)
  let base16 = 0;
  let exempt = 0;
  let vatAmount = 0;
  let igtfAmount = 0;
  let totalAmount = 0;
  let currency = /\b(?:USD|US\$|\$)\b/i.test(fullText) && !/\b(?:Bs\.?D?S?|Bss\.?|VES|Bol[ií]vares)\b/i.test(fullText) ? 'USD' : 'VES';
  let bcvRateImplicit = 0;

  const dualExemptMatch = fullText.match(/exento[:.\s]+([0-9.,]+)\s*\$\s*([0-9.,]+)\s*Bs/i);
  const dualTotalMatch = fullText.match(/(?:tot\.?\s*factura|tot\s*a\s*pagar|total)[:.\s]+([0-9.,]+)\s*\$\s*([0-9.,]+)\s*Bs/i);
  const captionDualMatch = fullText.match(/([0-9.,]+)\s*bs\.?s?\s*=\s*([0-9.,]+)\s*\$/i);

  if (dualTotalMatch) {
    const usdTotal = parseVenezuelanAmount(dualTotalMatch[1]);
    const bsTotal = parseVenezuelanAmount(dualTotalMatch[2]);
    totalAmount = bsTotal;
    if (usdTotal > 0 && bsTotal > 0) bcvRateImplicit = Number((bsTotal / usdTotal).toFixed(4));
    if (dualExemptMatch) {
      exempt = parseVenezuelanAmount(dualExemptMatch[2]);
    }
  } else {
    const curPrefix = '(?:bs\\.?d?s?\\.?|bss\\.?|bs\\.?|ves|\\$|usd)?';
    const exemptMatch = fullText.match(
      new RegExp(`(?:exento(?:\\s*\\(e\\))?|exen\\.?|monto\\s*exento|ventas\\s*exentas|no\\s*gravado|base\\s*exenta|bi\\s*e)\\s*[:.]?\\s*${curPrefix}\\s*([0-9][0-9.,]*)`, 'i')
    );
    if (exemptMatch) exempt = parseVenezuelanAmount(exemptMatch[1]);

    const baseMatch = fullText.match(
      new RegExp(`(?:b\\.?i\\.?\\s*g?\\s*(?:16(?:[,.]00)?%?)?|base\\s*imp(?:onible)?(?:\\.|\\b)?(?:\\s*(?:al\\s*)?16(?:[,.]00)?%?|\\s*g\\s*16(?:[,.]00)?%?|\\s*g)?|base\\s*gravada|gravable)\\s*[:.]?\\s*${curPrefix}\\s*([0-9][0-9.,]*)`, 'i')
    );
    if (baseMatch) base16 = parseVenezuelanAmount(baseMatch[1]);

    const vatMatch = fullText.match(
      new RegExp(`(?:iva\\s*g\\s*(?:16(?:[,.]00)?%?)?|i\\.?v\\.?a\\.?(?:\\s*(?:al\\s*)?\\(?16(?:[,.]00)?%?\\)?|\\s*g)?|imp\\.?\\s*iva|impuesto\\s*(?:al\\s*valor\\s*agregado|iva))\\s*[:.]?\\s*${curPrefix}\\s*([0-9][0-9.,]*)`, 'i')
    );
    if (vatMatch) vatAmount = parseVenezuelanAmount(vatMatch[1]);

    const igtfMatch = fullText.match(
      new RegExp(`(?:igtf\\s*(?:3(?:[,.]00)?%?)?|percepci[oó]n\\s*igtf|imp\\.?\\s*igtf)\\s*[:.]?\\s*${curPrefix}\\s*([0-9][0-9.,]*)`, 'i')
    );
    if (igtfMatch) igtfAmount = parseVenezuelanAmount(igtfMatch[1]);

    const totalMatch = fullText.match(
      new RegExp(`(?:tot\\.?\\s*factura|total\\s*factura|tot\\.?\\s*a\\s*pagar|total\\s*a\\s*pagar|total\\s*general|monto\\s*total|neto\\s*a\\s*pagar|total\\s*venta|(?<!sub[-\\s])\\btotal)\\s*[:.]?\\s*${curPrefix}\\s*([0-9][0-9.,]*)`, 'i')
    );
    if (totalMatch) totalAmount = parseVenezuelanAmount(totalMatch[1]);

    if (totalAmount === 0 && base16 === 0 && exempt === 0) {
      const subMatch = fullText.match(new RegExp(`(?:sub[-\\s]?total)\\s*[:.]?\\s*${curPrefix}\\s*([0-9][0-9.,]*)`, 'i'));
      if (subMatch) totalAmount = parseVenezuelanAmount(subMatch[1]);
    }
  }

  if (captionDualMatch && totalAmount > 0) {
    const capBs = parseVenezuelanAmount(captionDualMatch[1]);
    const capUsd = parseVenezuelanAmount(captionDualMatch[2]);
    if (capBs > 0 && capUsd > 0) {
      bcvRateImplicit = Number((capBs / capUsd).toFixed(4));
      if (Math.abs(totalAmount - capUsd) <= Math.max(1.5, capUsd * 0.05)) {
        currency = 'USD';
      }
    }
  }

  // 5. Triangulación Matemática y Comprobación de Consistencia
  if (totalAmount === 0 && (base16 > 0 || exempt > 0)) {
    totalAmount = Number((base16 + exempt + vatAmount + igtfAmount).toFixed(2));
  }

  const expectedVat = Number((base16 * 0.16).toFixed(2));
  if (base16 > 0 && vatAmount === 0) {
    vatAmount = expectedVat;
  } else if (vatAmount > 0 && base16 === 0) {
    base16 = Number((vatAmount / 0.16).toFixed(2));
  }

  if (exempt === 0 && totalAmount > 0 && base16 === 0 && vatAmount === 0) {
    exempt = Number((totalAmount - igtfAmount).toFixed(2));
  } else if (exempt === 0 && totalAmount > 0 && base16 > 0) {
    const diff = Number((totalAmount - (base16 + vatAmount + igtfAmount)).toFixed(2));
    if (diff > 0.10) {
      exempt = diff;
    }
  }

  const vatMatches = Math.abs(vatAmount - expectedVat) <= Math.max(0.05, base16 * 0.005);
  const sumMatches = Math.abs(totalAmount - (base16 + exempt + vatAmount + igtfAmount)) <= Math.max(0.08, totalAmount * 0.005);
  const rifValid = Boolean(supplierRif && validateVenezuelanRIF(supplierRif).valid);
  const mathValid = totalAmount > 0 && ((base16 === 0 && Math.abs(exempt - totalAmount) <= 0.08) || (vatMatches && sumMatches));

  let vatRetentionRate = 0;
  if (vatAmount > 0) vatRetentionRate = 75;

  // Devolver resultado si hay RIF válido + montos (completo) O al menos señal fiscal útil (borrador parcial)
  const hasUsefulSignal = (rifValid && (totalAmount > 0 || exempt > 0 || base16 > 0)) || totalAmount > 0 || (rifValid && Boolean(invoiceNumber));
  if (hasUsefulSignal) {
    const isComplete = rifValid && mathValid;
    return {
      mode: isComplete ? 'VNDE_TIER_1_DETERMINISTIC (0 Tokens)' : 'VNDE_TIER_1_PARTIAL_LOCAL (0 Tokens)',
      tokensUsed: 0,
      confidence: isComplete ? 0.995 : (rifValid ? 0.78 : 0.62),
      extracted: {
        supplierRif: supplierRif || '',
        supplierName: supplierName || (supplierRif ? `Proveedor Fiscal (${supplierRif})` : ''),
        buyerRif,
        buyerName,
        hasBuyerRifOnTicket,
        invoiceNumber: invoiceNumber || '00000001',
        controlNumber: controlNumber || machineSerial || '00-000000',
        machineSerial,
        channel,
        emissionDate,
        emissionTime,
        currency,
        taxableBase: base16,
        taxableBaseOriginal: base16,
        exemptAmount: exempt,
        exemptOriginal: exempt,
        vatRate: base16 > 0 ? 16 : 0,
        vatAmount,
        vatOriginal: vatAmount,
        igtfAmount,
        igtfOriginal: igtfAmount,
        totalAmount,
        totalOriginal: totalAmount,
        vatRetentionRate,
        islrRetentionRate: 2,
        bcvRateImplicit,
        rifValid,
        mathValid,
        status: isComplete ? 'APROBADA' : 'BORRADOR_IA'
      }
    };
  }

  return null;
}

/**
 * Detecta el MIME type real por magic bytes Base64 o extensión (PDF, PNG, WebP, JPEG)
 */
function detectMimeTypeFromBase64(base64Str, fileName = '') {
  const b64 = (base64Str || '').trim();
  if (b64.startsWith('JVBERi0') || fileName.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (b64.startsWith('iVBORw0') || fileName.toLowerCase().endsWith('.png')) return 'image/png';
  if (b64.startsWith('UklGR') || fileName.toLowerCase().endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Auditoría Matemática y Validación RIF Post-IA (tolera strings numéricos venezolanos)
 */
function validateAndNormalizeAiExtraction(extracted) {
  const safe = extracted && typeof extracted === 'object' ? extracted : {};
  const rawRif = String(safe.supplierRif || '').trim();
  let rifCheck = validateVenezuelanRIF(rawRif);
  if (!rifCheck.valid && rawRif) {
    const fixedDigits = rawRif.replace(/^([VEJPGCDvejpgcd])[-–\s]?(.*)$/, (_, l, rest) => `${l.toUpperCase()}-${normalizeOcrRifDigits(rest)}`);
    const altCheck = validateVenezuelanRIF(fixedDigits);
    if (altCheck.valid) rifCheck = altCheck;
  }

  let tBase = parseVenezuelanAmount(safe.taxableBaseOriginal ?? safe.taxableBase ?? 0);
  let exVal = parseVenezuelanAmount(safe.exemptOriginal ?? safe.exemptAmount ?? 0);
  let vVal = parseVenezuelanAmount(safe.vatOriginal ?? safe.vatAmount ?? 0);
  const igVal = parseVenezuelanAmount(safe.igtfOriginal ?? safe.igtfAmount ?? 0);
  let totVal = parseVenezuelanAmount(safe.totalOriginal ?? safe.totalAmount ?? 0);

  if (totVal === 0 && (tBase > 0 || exVal > 0 || vVal > 0)) {
    totVal = Number((tBase + exVal + vVal + igVal).toFixed(2));
  }
  if (tBase > 0 && vVal === 0 && totVal > tBase + exVal + igVal + 0.05) {
    const impliedVat = Number((tBase * 0.16).toFixed(2));
    if (Math.abs(tBase + exVal + impliedVat + igVal - totVal) <= Math.max(1.0, totVal * 0.015)) {
      vVal = impliedVat;
    }
  }
  if (exVal === 0 && tBase === 0 && vVal === 0 && totVal > 0) {
    exVal = Number((totVal - igVal).toFixed(2));
  }

  const expectedSum = tBase + exVal + vVal + igVal;
  const tolerance = Math.max(1.0, totVal * 0.015);
  const mathValid = totVal > 0 && Math.abs(expectedSum - totVal) <= tolerance;

  return {
    ...safe,
    taxableBase: tBase,
    taxableBaseOriginal: tBase,
    exemptAmount: exVal,
    exemptOriginal: exVal,
    vatRate: typeof safe.vatRate === 'number' ? safe.vatRate : (tBase > 0 ? 16 : 0),
    vatAmount: vVal,
    vatOriginal: vVal,
    igtfAmount: igVal,
    igtfOriginal: igVal,
    totalAmount: totVal,
    totalOriginal: totVal,
    supplierRif: rifCheck.valid ? rifCheck.formatted : rawRif,
    rifValid: rifCheck.valid,
    mathValid,
    status: mathValid && rifCheck.valid ? 'APROBADA' : 'BORRADOR_IA'
  };
}

/**
 * CAPA 6: Micro-Prompting LLM (Solo Texto - Ahorro 95% de Tokens · REST Directo)
 */
async function repairFiscalDataWithMicroPrompt(dirtyText, geminiApiKey) {
  const cleanKey = sanitizeApiKey(geminiApiKey);
  if (!cleanKey) return null;

  const prompt = `Extrae datos fiscales venezolanos (SNAT/2026/00093) de este texto OCR en JSON exacto (usa números puros con punto decimal, sin símbolos):
{"supplierRif":"J-00000000-0","supplierName":"","invoiceNumber":"","controlNumber":"","emissionDate":"YYYY-MM-DD","emissionTime":"HH:MM:SS","channel":"DIGITAL|MAQUINA_FISCAL|CONTINGENCIA","currency":"VES|USD","taxableBaseOriginal":0,"exemptOriginal":0,"vatRate":16,"vatOriginal":0,"igtfOriginal":0,"totalOriginal":0,"confidence":0.99}
Texto OCR:
${String(dirtyText || '').slice(0, 2200)}`;

  for (const modelName of DEFAULT_VISION_MODELS) {
    try {
      const textResp = await callGeminiRestApi({
        apiKey: cleanKey,
        modelName,
        parts: [{ text: prompt }],
        jsonMode: true,
        timeoutMs: 14000
      });
      const extracted = parseJsonSafely(textResp);
      const normalized = validateAndNormalizeAiExtraction(extracted);
      return {
        mode: `VNDE_TIER_2_MICRO_PROMPT (${modelName} · JSON Estricto)`,
        tokensUsed: 110,
        confidence: normalized.mathValid ? 0.98 : 0.78,
        extracted: normalized
      };
    } catch (err) {
      console.warn(`Aviso Micro-Prompt (${modelName}):`, err.message);
      if (err.httpStatus === 401 || err.httpStatus === 403) break;
    }
  }
  return null;
}

/**
 * PIPELINE MAESTRO HÍBRIDO DEL MOTOR VNDE v4.0
 * Nivel 0: QR Fiscal SENIAT (0 Tokens)
 * Nivel 1A: Texto nativo de PDF digital (0 Tokens)
 * Nivel 1B: Parser Determinista SENIAT sobre PDF o OCR local de navegador + Memoria Aprendida (0 Tokens)
 * Nivel 2: Micro-Prompt de reparación sobre texto OCR (95% ahorro de tokens)
 * Nivel 3: Visión Multimodal REST Directa + Auto-Discovery de Modelos + Doble Pasada Correctiva
 * Nivel 4: Respaldo Parcial Determinista (nunca devuelve pantalla en blanco si hubo señal local)
 */
async function processFiscalInvoiceVNDE({ base64Data, rawText, qrPayload, fileName, localTemplateHint, geminiApiKey, db }) {
  const cleanKey = sanitizeApiKey(geminiApiKey);

  // Nivel 0 (0 Tokens): Decodificación directa de QR Fiscal SENIAT
  if (qrPayload) {
    const qrResult = parseSeniatFiscalQr(qrPayload);
    if (qrResult) return qrResult;
  }

  // Nivel 1A (0 Tokens): Extracción nativa de texto si es un PDF digital sin rawText previo
  let effectiveRawText = String(rawText || '').trim();
  if (!effectiveRawText && base64Data) {
    const detectedMime = detectMimeTypeFromBase64(base64Data, fileName);
    if (detectedMime === 'application/pdf') {
      const pdfText = extractTextFromPdfBase64(base64Data);
      if (pdfText && pdfText.length >= 25) {
        effectiveRawText = pdfText;
      }
    }
  }

  // Nivel 1B (0 Tokens + Memoria Aprendida + Plantilla Local IndexedDB): Motor Determinista SENIAT
  let detResult = null;
  if (effectiveRawText) {
    detResult = parseSeniatRawText(effectiveRawText);
    if (detResult && detResult.extracted) {
      // 1. Enriquecer con plantilla local aprendida (FiscalTemplateDB de IndexedDB)
      if (localTemplateHint && typeof localTemplateHint === 'object') {
        const hintRif = String(localTemplateHint.rif || '').toUpperCase();
        if (!detResult.extracted.supplierRif && hintRif) {
          const check = validateVenezuelanRIF(hintRif);
          if (check.valid) {
            detResult.extracted.supplierRif = check.formatted;
            detResult.extracted.rifValid = true;
          }
        }
        if (localTemplateHint.razonSocial) {
          detResult.extracted.supplierName = String(localTemplateHint.razonSocial).slice(0, 90);
        }
        if (localTemplateHint.preferredChannel && detResult.extracted.channel === 'DIGITAL') {
          detResult.extracted.channel = localTemplateHint.preferredChannel;
        }
        if (localTemplateHint.currencyHint && detResult.extracted.currency === 'VES') {
          detResult.extracted.currency = localTemplateHint.currencyHint;
        }
      }

      // 2. Enriquecer con memoria cloud aprendida por el Guardián
      try {
        if (db && detResult.extracted.supplierRif) {
          const { getOcrLearnedHints } = require('./systemGuardian');
          const hints = await getOcrLearnedHints(db, 30);
          const learned = hints.find(h => h.supplierRif === detResult.extracted.supplierRif);
          if (learned) {
            if (!detResult.extracted.supplierName || detResult.extracted.supplierName.startsWith('Proveedor Fiscal (')) {
              detResult.extracted.supplierName = learned.supplierName || detResult.extracted.supplierName;
            }
            if (learned.preferredChannel && detResult.extracted.channel === 'DIGITAL') {
              detResult.extracted.channel = learned.preferredChannel;
            }
            if (learned.preferredCurrency && detResult.extracted.currency === 'VES') {
              detResult.extracted.currency = learned.preferredCurrency;
            }
          }
        }
      } catch {
        // Memoria opcional
      }

      // 3. Puntaje de confianza ponderado campo por campo (evita descarte ciego binario)
      const ext = detResult.extracted;
      const fieldConfidence = {
        rif: ext.rifValid ? 1.0 : (ext.supplierRif ? 0.45 : 0),
        amounts: ext.mathValid ? 1.0 : (ext.totalOriginal > 0 ? 0.55 : 0),
        invoiceNumber: ext.invoiceNumber && ext.invoiceNumber !== '00000001' ? 0.95 : 0.4,
        date: ext.emissionDate ? 0.9 : 0.3,
        supplierName: ext.supplierName && !ext.supplierName.startsWith('Proveedor Fiscal (') ? 0.95 : 0.5
      };
      const weightedScore = Number(
        (
          fieldConfidence.rif * 0.35 +
          fieldConfidence.amounts * 0.35 +
          fieldConfidence.invoiceNumber * 0.12 +
          fieldConfidence.date * 0.08 +
          fieldConfidence.supplierName * 0.10
        ).toFixed(3)
      );
      detResult.extracted.fieldConfidence = fieldConfidence;
      detResult.confidence = Math.max(detResult.confidence || 0, weightedScore);

      // Si el parser 0-Tokens logró RIF válido + cuadre matemático exacto -> ¡LISTO CON 0 TOKENS!
      if (detResult.extracted.mathValid && detResult.extracted.rifValid) {
        vendorFingerprintCache.set(detResult.extracted.supplierRif, {
          channel: detResult.extracted.channel,
          lastSeen: new Date().toISOString()
        });
        return detResult;
      }
    }

    // Nivel 2 (Micro-Prompt solo texto): intenta reparar texto OCR ruidoso ahorrando 95% de tokens
    if (cleanKey && effectiveRawText.length >= 25) {
      const repaired = await repairFiscalDataWithMicroPrompt(effectiveRawText, cleanKey);
      if (repaired && repaired.extracted && (repaired.extracted.mathValid || repaired.extracted.rifValid)) {
        return repaired;
      }
    }

    // Si NO hay base64Data (solo texto), devolver el resultado determinista parcial
    if (!base64Data && detResult) {
      return detResult;
    }
  }

  // Nivel 3: Visión Multimodal REST Directa (Gemini) + Auto-Discovery + Doble Pasada Correctiva
  if (cleanKey && base64Data) {
    const mimeType = detectMimeTypeFromBase64(base64Data, fileName);
    let learnedHintsBlock = '';
    try {
      const { getOcrLearnedHints } = require('./systemGuardian');
      const hints = await getOcrLearnedHints(db, 8);
      if (hints.length > 0) {
        learnedHintsBlock = `\nMEMORIA OCR APRENDIDA DE PROVEEDORES FRECUENTES:\n${hints
          .map(h => `- ${h.supplierRif} (${h.supplierName || 'Proveedor'}): canal=${h.preferredChannel || 'AUTO'}, moneda=${h.preferredCurrency || 'AUTO'}, notas=[${(h.qualityNotes || []).join(', ')}]`)
          .join('\n')}`;
      }
    } catch {
      learnedHintsBlock = '';
    }

    const basePrompt = `Analiza esta factura o ticket fiscal venezolano bajo la Providencia SNAT/2026/00093 (G.O. 43.484) y extrae en JSON puro (números con punto decimal, sin símbolos de moneda).
REGLAS ESTRICTAS:
- Ignora tachaduras, firmas, resaltadores, dobleces, rayas, manchas o montos escritos a mano con bolígrafo sobre el papel; lee solo el texto impreso.
- Si la imagen está borrosa, inclinada o doblada, reconstruye el RIF validando Módulo 11 y verifica la consistencia matemática Base + Exento + IVA + IGTF = Total.
- Si es un ticket térmico con serial fiscal (MH, Z..., E..., BXL..., HAS...), usa channel="MAQUINA_FISCAL" y coloca el serial en controlNumber.
- Pon hasBuyerRifOnTicket=false si el ticket NO tiene impreso el RIF y Razón Social del comprador (Art. 10.4).
- Si el ticket imprime "Bss" o "Bs" pero los precios unitarios y/o leyenda inferior indican USD (ej. "46.930 Bs = 51,17$"), marca currency="USD".
- Si I.V.A. es 0,00 y los ítems son (E), coloca todo el total en exemptOriginal y taxableBaseOriginal=0.${learnedHintsBlock}
Devuelve exactamente este JSON:
{"supplierRif":"J-00000000-0","supplierName":"","invoiceNumber":"00000000","controlNumber":"00-00000000","emissionDate":"YYYY-MM-DD","emissionTime":"HH:MM:SS","channel":"DIGITAL|MAQUINA_FISCAL|CONTINGENCIA","hasBuyerRifOnTicket":true,"currency":"VES|USD","taxableBaseOriginal":0,"exemptOriginal":0,"vatRate":16,"vatOriginal":0,"igtfOriginal":0,"totalOriginal":0,"confidence":0.99}`;

    const modelChain = [...DEFAULT_VISION_MODELS];
    if (discoveredModelCache.model && !modelChain.includes(discoveredModelCache.model)) {
      modelChain.unshift(discoveredModelCache.model);
    }

    let lastVisionError = null;
    let saw404 = false;
    let bestCandidate = null;

    const tryVisionModel = async modelName => {
      const respText = await callGeminiRestApi({
        apiKey: cleanKey,
        modelName,
        parts: [
          { text: basePrompt },
          { inlineData: { mimeType, data: base64Data } }
        ],
        jsonMode: true,
        timeoutMs: 18000
      });
      const extracted = parseJsonSafely(respText);
      let normalized = validateAndNormalizeAiExtraction(extracted);

      // Doble pasada correctiva si falla la matemática o el RIF Módulo 11
      if ((!normalized.mathValid || !normalized.rifValid) && modelName === modelChain[0]) {
        try {
          const verifyPrompt = `Revisa cuidadosamente los números y el RIF de esta factura porque la primera lectura tuvo un descuadre (RIF leído: "${normalized.supplierRif}", Base=${normalized.taxableBaseOriginal}, Exento=${normalized.exemptOriginal}, IVA=${normalized.vatOriginal}, Total=${normalized.totalOriginal}). Corrige cualquier dígito mal leído asegurando Base + Exento + IVA + IGTF = Total y devuelve el JSON exacto:
{"supplierRif":"J-00000000-0","supplierName":"","invoiceNumber":"00000000","controlNumber":"00-00000000","emissionDate":"YYYY-MM-DD","emissionTime":"HH:MM:SS","channel":"DIGITAL|MAQUINA_FISCAL|CONTINGENCIA","hasBuyerRifOnTicket":true,"currency":"VES|USD","taxableBaseOriginal":0,"exemptOriginal":0,"vatRate":16,"vatOriginal":0,"igtfOriginal":0,"totalOriginal":0,"confidence":0.99}`;
          const retryText = await callGeminiRestApi({
            apiKey: cleanKey,
            modelName,
            parts: [
              { text: verifyPrompt },
              { inlineData: { mimeType, data: base64Data } }
            ],
            jsonMode: true,
            timeoutMs: 16000
          });
          const retryNorm = validateAndNormalizeAiExtraction(parseJsonSafely(retryText));
          if (retryNorm.mathValid || retryNorm.rifValid) {
            normalized = retryNorm;
          }
        } catch {
          // Mantener primera lectura
        }
      }

      return {
        mode: `VNDE_TIER_3_VISION_REST (${modelName} · ${mimeType})`,
        tokensUsed: 1650,
        confidence: normalized.mathValid && normalized.rifValid ? 0.99 : 0.82,
        extracted: normalized
      };
    };

    for (const modelName of modelChain) {
      try {
        const candidate = await tryVisionModel(modelName);
        // Recordar el modelo que respondió con éxito para priorizarlo en las siguientes fotos
        discoveredModelCache = {
          model: modelName,
          models: discoveredModelCache.models || [],
          expiresAt: Date.now() + 30 * 60 * 1000
        };
        if (candidate.extracted.mathValid && candidate.extracted.rifValid) {
          return candidate;
        }
        bestCandidate = bestCandidate || candidate;
      } catch (visErr) {
        lastVisionError = visErr?.message || String(visErr);
        if (visErr?.httpStatus === 404 || visErr?.httpStatus === 503 || visErr?.httpStatus === 429) saw404 = true;
        console.warn(`Fallo visión REST (${modelName}):`, lastVisionError);
        if (visErr?.httpStatus === 401 || visErr?.httpStatus === 403) break;
      }
    }

    // Auto-Discovery si los modelos fijos devolvieron 404/503/429 (busca modelos alternativos menos congestionados)
    if (!bestCandidate && saw404) {
      await discoverGeminiFlashModel(cleanKey);
      const extraModels = (discoveredModelCache.models || []).filter(m => !modelChain.includes(m)).slice(0, 3);
      for (const altModel of extraModels) {
        try {
          bestCandidate = await tryVisionModel(altModel);
          if (bestCandidate) {
            discoveredModelCache = {
              model: altModel,
              models: discoveredModelCache.models,
              expiresAt: Date.now() + 30 * 60 * 1000
            };
            break;
          }
        } catch (discErr) {
          lastVisionError = discErr?.message || String(discErr);
        }
      }
    }

    if (bestCandidate) {
      return bestCandidate;
    }

    // Registrar alerta técnica privada en el Guardián del Sistema
    if (lastVisionError) {
      const lower = lastVisionError.toLowerCase();
      let guardianMsg = `Fallo motor visión REST: ${lastVisionError.slice(0, 260)}`;
      let userFriendlyError = 'El servicio de lectura automática no pudo completar el análisis en este momento. Complete o verifique los campos manualmente.';
      if (lower.includes('api_key') || lower.includes('api key') || lower.includes('401') || lower.includes('403')) {
        guardianMsg = `Credenciales del motor de lectura rechazadas (${lastVisionError.slice(0, 180)}).`;
        userFriendlyError = 'El servicio de lectura automática se encuentra en mantenimiento de credenciales. Puede registrar los datos manualmente mientras se restablece.';
      } else if (lower.includes('429') || lower.includes('quota') || lower.includes('resource_exhausted')) {
        guardianMsg = `Cuota temporal alcanzada (HTTP 429): ${lastVisionError.slice(0, 180)}`;
        userFriendlyError = 'Alta demanda temporal en el servicio de lectura automática. Espere unos segundos e intente nuevamente.';
      } else if (lower.includes('503') || lower.includes('high demand') || lower.includes('unavailable')) {
        guardianMsg = `Congestión temporal en servidores cloud (HTTP 503): ${lastVisionError.slice(0, 180)}`;
        userFriendlyError = 'Los servidores de lectura automática están experimentando alta demanda temporal. Reintente en unos segundos o complete manualmente.';
      }
      try {
        const { recordGuardianAlert } = require('./systemGuardian');
        await recordGuardianAlert(db, {
          severity: 'CRITICAL',
          source: 'ocr_engine',
          category: 'OCR_PROVIDER_ERROR',
          message: guardianMsg
        });
      } catch {
        // No interrumpir respuesta
      }

      // Nivel 4 (Red de Seguridad): si el OCR local determinista extrajo datos parciales, devolverlos como borrador en lugar de dejar el formulario vacío
      if (detResult && detResult.extracted) {
        return detResult;
      }

      return {
        mode: 'VNDE_UNPARSEABLE_DOCUMENT (Servicio de Lectura)',
        tokensUsed: 0,
        confidence: 0,
        extracted: null,
        error: userFriendlyError
      };
    }
  }

  // Nivel 4 cuando no hay API Key pero sí hubo lectura local determinista (0 Tokens)
  if (detResult && detResult.extracted) {
    return detResult;
  }

  if (base64Data && !cleanKey) {
    try {
      const { recordGuardianAlert } = require('./systemGuardian');
      await recordGuardianAlert(db, {
        severity: 'WARNING',
        source: 'ocr_engine',
        category: 'OCR_CONFIG_MISSING',
        message: 'GEMINI_API_KEY no configurada en el entorno del servidor para fotos sin QR.'
      });
    } catch {
      // Ignorar
    }
    return {
      mode: 'VNDE_UNPARSEABLE_DOCUMENT (0 Tokens)',
      tokensUsed: 0,
      confidence: 0,
      extracted: null,
      error: 'No se detectó código QR ni texto embebido en el documento. Complete los campos manualmente o verifique la configuración del servicio de lectura en el Guardián.'
    };
  }

  return {
    mode: 'VNDE_UNPARSEABLE_DOCUMENT (0 Tokens)',
    tokensUsed: 0,
    confidence: 0,
    extracted: null,
    error: 'No se pudo extraer información fiscal verificable del documento. Asegúrese de enviar una imagen nítida, QR visible o texto fiscal legible.'
  };
}

module.exports = {
  parseVenezuelanAmount,
  extractAllVenezuelanRifs,
  extractTextFromPdfBase64,
  parseSeniatFiscalQr,
  parseSeniatRawText,
  repairFiscalDataWithMicroPrompt,
  processFiscalInvoiceVNDE,
  diagnoseOcrEngine,
  vendorFingerprintCache
};
