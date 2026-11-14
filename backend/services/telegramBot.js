const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { computeAuditHash } = require('../security/cryptoVault');
const { validateVenezuelanRIF } = require('./seniatEngine');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function processTelegramReceiptUpdate(update, db) {
  const message = update.message;
  if (!message) return { status: 'ignored' };

  const chatId = String(message.chat.id);
  const text = (message.text || '').trim();

  if (text.startsWith('/vincular ')) {
    const linkCode = text.replace('/vincular ', '').trim().toUpperCase();
    const linkSnap = await db.collection('telegram_links').doc(linkCode).get();
    if (!linkSnap.exists) {
      await sendTelegramMessage(chatId, 'Codigo de vinculacion invalido o expirado. Solicita un nuevo codigo a tu contador.');
      return { status: 'invalid_code' };
    }
    const { tenantId, companyName, rif } = linkSnap.data();
    await db.collection('telegram_links').doc(`chat_${chatId}`).set({
      chatId,
      tenantId,
      companyName,
      rif,
      linkedAt: new Date().toISOString()
    });
    await sendTelegramMessage(chatId, `Vinculacion exitosa con *${companyName}* (${rif}).\nEnvia una foto o PDF de cualquier factura y la procesare automaticamente para el SENIAT.`);
    return { status: 'linked', tenantId };
  }

  const chatBinding = await db.collection('telegram_links').doc(`chat_${chatId}`).get();
  if (!chatBinding.exists) {
    await sendTelegramMessage(chatId, 'Este chat no esta vinculado a ningun RIF. Envia `/vincular CODIGO` con el codigo entregado por tu firma contable.');
    return { status: 'unlinked' };
  }

  const { tenantId, companyName } = chatBinding.data();
  const tenantDoc = await db.collection('tenants').doc(tenantId).get();
  if (tenantDoc.exists && tenantDoc.data().subscriptionStatus === 'SUSPENDIDA') {
    await sendTelegramMessage(chatId, `AVISO DE LICENCIA: La suscripcion de *${companyName}* presenta saldo vencido. Contacta a tu firma contable para reactivar la recepcion automatica.`);
    return { status: 'license_suspended' };
  }

  const photos = message.photo;
  const doc = message.document;
  if (!photos && !doc) {
    await sendTelegramMessage(chatId, 'Envia una fotografia clara o archivo PDF de la factura fiscal.');
    return { status: 'no_media' };
  }

  if (!process.env.GEMINI_API_KEY) {
    await sendTelegramMessage(chatId, 'Motor OCR Gemini no configurado en el servidor (falta GEMINI_API_KEY). Contacta al administrador.');
    return { status: 'ocr_unconfigured' };
  }

  const fileId = photos ? photos[photos.length - 1].file_id : doc.file_id;
  let fileResp, mimeType;
  try {
    const fileInfo = await axios.get(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
      { timeout: 10000 }
    );
    const filePath = fileInfo.data?.result?.file_path;
    if (!filePath) {
      await sendTelegramMessage(chatId, 'No se pudo obtener el archivo desde los servidores de Telegram.');
      return { status: 'telegram_download_failed' };
    }
    fileResp = await axios.get(
      `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`,
      { responseType: 'arraybuffer', timeout: 15000 }
    );
    mimeType = doc?.mime_type || 'image/jpeg';
  } catch (netErr) {
    console.error('Error descargando archivo de Telegram:', netErr.message);
    await sendTelegramMessage(chatId, 'Fallo de red al descargar el comprobante. Por favor intenta enviarlo nuevamente.');
    return { status: 'telegram_network_error' };
  }

  const base64Data = Buffer.from(fileResp.data).toString('base64');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const prompt = `Extrae los datos fiscales venezolanos (SENIAT Providencia SNAT/2026/00093) de esta factura en JSON puro:
  { "supplierRif": "J-00000000-0", "supplierName": "", "invoiceNumber": "", "controlNumber": "00-00000000", "emissionDate": "YYYY-MM-DD", "emissionTime": "HH:MM:SS", "channel": "DIGITAL|MAQUINA_FISCAL|CONTINGENCIA", "currency": "VES|USD", "taxableBase": 0, "exemptAmount": 0, "vatRate": 16, "vatAmount": 0, "igtfAmount": 0, "totalAmount": 0, "confidence": 0.98 }`;

  let aiResult;
  try {
    aiResult = await model.generateContent([
      prompt,
      { inlineData: { data: base64Data, mimeType } }
    ]);
  } catch (aiErr) {
    console.error('Error en Gemini Vision OCR:', aiErr.message);
    await sendTelegramMessage(chatId, 'El motor de IA está experimentando alta demanda. Intenta nuevamente en unos instantes.');
    return { status: 'ocr_service_unavailable' };
  }

  let extracted;
  try {
    extracted = JSON.parse(aiResult.response.text().replace(/```json|```/g, '').trim());
  } catch (parseErr) {
    await sendTelegramMessage(chatId, 'No pude interpretar los datos fiscales de la imagen. Envía una foto más nítida o PDF legible.');
    return { status: 'ocr_parse_error' };
  }
  const rifCheck = validateVenezuelanRIF(extracted.supplierRif);

  const dupKey = `${rifCheck.formatted}_${extracted.invoiceNumber}_${extracted.controlNumber}`;
  const existing = await db.collection(`tenants/${tenantId}/invoices`).where('duplicateKey', '==', dupKey).limit(1).get();
  if (!existing.empty) {
    await sendTelegramMessage(chatId, `ALERTA DUPLICADO: La factura #${extracted.invoiceNumber} (Control ${extracted.controlNumber}) ya fue registrada previamente.`);
    return { status: 'duplicate' };
  }

  const invRef = db.collection(`tenants/${tenantId}/invoices`).doc();
  const auditHash = computeAuditHash('TELEGRAM_INGEST', { invoiceId: invRef.id, dupKey, total: extracted.totalAmount });

  await invRef.set({
    ...extracted,
    supplierRif: rifCheck.formatted,
    rifValid: rifCheck.valid,
    duplicateKey: dupKey,
    tenantId,
    sourceChannel: 'TELEGRAM_BOT',
    status: 'BORRADOR_IA',
    auditHash,
    createdAt: new Date().toISOString()
  });

  await db.collection(`tenants/${tenantId}/audit_logs`).add({
    action: 'INGESTA_TELEGRAM_OCR',
    invoiceId: invRef.id,
    actorUid: `telegram:${chatId}`,
    sha256Hash: auditHash,
    timestamp: new Date().toISOString()
  });

  await sendTelegramMessage(
    chatId,
    `Factura recibida para *${companyName}*:\n` +
    `- Proveedor: ${extracted.supplierName} (${rifCheck.formatted})\n` +
    `- Factura: ${extracted.invoiceNumber} | Control: ${extracted.controlNumber}\n` +
    `- Total: ${extracted.currency} ${extracted.totalAmount}\n` +
    `- Estado: Enviada a bandeja de auditoria del contador.`
  );

  return { status: 'processed', invoiceId: invRef.id };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Anti-Ban & Rate-Limiting para API de Telegram con manejo de HTTP 429 retry_after y jitter
async function sendTelegramMessage(chatId, text, maxRetries = 3) {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(
        url,
        {
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        },
        { timeout: 8000 }
      );
      return;
    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        // Respetar explicitamente el retry_after dictado por Telegram
        const retryAfterSec = err.response.data?.parameters?.retry_after || (attempt * 2);
        const jitterMs = Math.floor(Math.random() * 500);
        await sleep((retryAfterSec * 1000) + jitterMs);
        continue;
      }
      if (attempt === maxRetries) {
        console.error('Error enviando mensaje Telegram tras reintentos:', err.message);
        return;
      }
      // Backoff exponencial para errores transitorios
      const backoffMs = (attempt * 1000) + Math.floor(Math.random() * 400);
      await sleep(backoffMs);
    }
  }
}

module.exports = { processTelegramReceiptUpdate, sendTelegramMessage };
