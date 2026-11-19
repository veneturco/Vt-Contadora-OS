// Optimizador Documental estilo CamScanner + Motor OCR Local 0-Tokens (100% en navegador · Canvas + Tesseract WASM)
// 1. Redimensiona fotos 4K del celular a 1600px (ligero para 4G y nítido para texto térmico)
// 2. Normalización por percentiles (p5-p95) que ignora mesas oscuras y destellos de luz
// 3. Enfoque suave (Sharpen 3x3) para letras pequeñas en tickets térmicos y facturas arrugadas
// 4. OCR Local en español (0 Tokens, 0 RAM en servidor) con timeout de seguridad

export interface EnhancedDocumentResult {
  base64Data: string;
  mimeType: string;
  dataUrl: string;
  originalBytes: number;
  optimizedBytes: number;
  enhanced: boolean;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Error leyendo archivo ${file.name}`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function applyDocumentClarityFilter(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // 1. Histograma de luminancia para percentiles p5 y p95 (evita que fondos oscuros o brillos arruinen el contraste)
  const hist = new Uint32Array(256);
  let sampled = 0;
  const step = Math.max(4, Math.floor((data.length / 4) / 12000) * 4);
  for (let i = 0; i < data.length; i += step) {
    const lum = Math.min(255, Math.max(0, Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])));
    hist[lum]++;
    sampled++;
  }

  let acc = 0;
  let p5 = 20;
  let p95 = 235;
  const targetLow = sampled * 0.05;
  const targetHigh = sampled * 0.95;
  for (let b = 0; b < 256; b++) {
    acc += hist[b];
    if (acc >= targetLow) {
      p5 = b;
      break;
    }
  }
  acc = 0;
  for (let b = 0; b < 256; b++) {
    acc += hist[b];
    if (acc >= targetHigh) {
      p95 = b;
      break;
    }
  }

  const low = Math.min(p5, 95);
  const high = Math.max(p95, 170);
  const range = Math.max(45, high - low);
  const contrastFactor = 1.16;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = ((data[i + c] - low) * 255) / range;
      v = (v - 128) * contrastFactor + 128;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  // 2. Enfoque suave (Sharpen 3x3) mezclado al 30% para letras finas sin amplificar ruido
  const copy = new Uint8ClampedArray(data);
  const w4 = width * 4;
  for (let y = 1; y < height - 1; y++) {
    const row = y * w4;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[idx + c] * 5;
        const neighbors =
          copy[idx - 4 + c] +
          copy[idx + 4 + c] +
          copy[idx - w4 + c] +
          copy[idx + w4 + c];
        const sharp = center - neighbors;
        const blended = copy[idx + c] * 0.70 + sharp * 0.30;
        data[idx + c] = blended < 0 ? 0 : blended > 255 ? 255 : blended;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export async function enhanceDocumentForOcr(file: File): Promise<EnhancedDocumentResult> {
  const rawDataUrl = await fileToDataUrl(file);
  const rawBase64 = rawDataUrl.split(',')[1] || '';

  // PDFs pasan directo sin rasterizar (el backend extrae texto nativo con 0 tokens)
  if (!file.type.startsWith('image/')) {
    return {
      base64Data: rawBase64,
      mimeType: file.type || 'application/pdf',
      dataUrl: rawDataUrl,
      originalBytes: file.size,
      optimizedBytes: file.size,
      enhanced: false
    };
  }

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1600;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({
            base64Data: rawBase64,
            mimeType: file.type || 'image/jpeg',
            dataUrl: rawDataUrl,
            originalBytes: file.size,
            optimizedBytes: file.size,
            enhanced: false
          });
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        applyDocumentClarityFilter(ctx, width, height);

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const optimizedBase64 = optimizedDataUrl.split(',')[1] || rawBase64;
        const optimizedBytes = Math.round((optimizedBase64.length * 3) / 4);

        resolve({
          base64Data: optimizedBase64,
          mimeType: 'image/jpeg',
          dataUrl: optimizedDataUrl,
          originalBytes: file.size,
          optimizedBytes,
          enhanced: true
        });
      } catch {
        resolve({
          base64Data: rawBase64,
          mimeType: file.type || 'image/jpeg',
          dataUrl: rawDataUrl,
          originalBytes: file.size,
          optimizedBytes: file.size,
          enhanced: false
        });
      }
    };
    img.onerror = () => {
      resolve({
        base64Data: rawBase64,
        mimeType: file.type || 'image/jpeg',
        dataUrl: rawDataUrl,
        originalBytes: file.size,
        optimizedBytes: file.size,
        enhanced: false
      });
    };
    img.src = rawDataUrl;
  });
}

// Singleton de Worker Tesseract WASM en español para reutilizar entre fotos (Modo Ráfaga veloz · 0 Tokens)
let tesseractWorkerPromise: Promise<{ recognize: (img: string) => Promise<{ data?: { text?: string } }> }> | null = null;

async function getSpanishOcrWorker() {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const mod = (await import('tesseract.js')) as unknown as {
        createWorker?: (lang: string) => Promise<{ recognize: (img: string) => Promise<{ data?: { text?: string } }> }>;
        default?: {
          createWorker?: (lang: string) => Promise<{ recognize: (img: string) => Promise<{ data?: { text?: string } }> }>;
        };
      };
      const createWorker = mod.createWorker || mod.default?.createWorker;
      if (typeof createWorker !== 'function') {
        throw new Error('createWorker no disponible');
      }
      const worker = await createWorker('spa');
      return worker;
    })().catch(err => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

/**
 * Motor OCR Local 0-Tokens en el navegador (Tesseract WASM español).
 * Extrae texto impreso del recibo antes de enviarlo al servidor para que el Motor Determinista
 * SENIAT pueda resolver la factura con 0 Tokens incluso si el proveedor cloud está caído.
 * Nunca lanza excepciones ni bloquea el envío (timeout de seguridad).
 */
export async function runLocalBrowserOcr(dataUrl: string, timeoutMs = 12000): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return '';
  try {
    const ocrPromise = (async () => {
      const worker = await getSpanishOcrWorker();
      const result = await worker.recognize(dataUrl);
      const text = String(result?.data?.text || '').trim();
      return text.length >= 15 ? text.slice(0, 12000) : '';
    })();

    const timeoutPromise = new Promise<string>(resolve => {
      setTimeout(() => resolve(''), timeoutMs);
    });

    return await Promise.race([ocrPromise, timeoutPromise]);
  } catch {
    return '';
  }
}
