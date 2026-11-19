// Optimizador Documental estilo CamScanner v2 + Motor OCR Local 0-Tokens (Lossless + Binarización Adaptativa + ROI)
// 1. Buffer visual JPEG 85% (1600px) para subida rápida 4G y respaldo Vision Cloud
// 2. Buffer OCR sin compresión (PNG Lossless) con binarización adaptativa integral (Bradley/Sauvola) -> 0 artefactos JPEG
// 3. Recorte automático ROI (encabezado 38% + pie 38%) en tickets térmicos largos para saltar líneas de productos
// 4. Tesseract WASM en español (4.0.0_fast vía jsDelivr) con diagnóstico explícito de errores

export interface EnhancedDocumentResult {
  base64Data: string;
  mimeType: string;
  dataUrl: string;
  ocrDataUrl: string;
  ocrRoiHeaderUrl?: string;
  ocrRoiFooterUrl?: string;
  docKind: 'THERMAL_80MM' | 'LETTER_A4' | 'UNKNOWN';
  originalBytes: number;
  optimizedBytes: number;
  enhanced: boolean;
}

export interface LocalOcrDetailedResult {
  text: string;
  usedRoi: boolean;
  error: string | null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Error leyendo archivo ${file.name}`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

/**
 * Filtro visual suave por percentiles (p5-p95) para la imagen JPEG enviada a Vision Cloud / vista previa.
 * Solo aplica sharpen cuando la varianza de contraste local es baja (evita amplificar ruido en papel rugoso).
 */
function applyVisualClarityFilter(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const hist = new Uint32Array(256);
  let sampled = 0;
  let sumLum = 0;
  let sumLumSq = 0;
  const step = Math.max(4, Math.floor((data.length / 4) / 12000) * 4);
  for (let i = 0; i < data.length; i += step) {
    const lum = Math.min(255, Math.max(0, Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])));
    hist[lum]++;
    sumLum += lum;
    sumLumSq += lum * lum;
    sampled++;
  }

  const mean = sampled > 0 ? sumLum / sampled : 128;
  const variance = sampled > 0 ? sumLumSq / sampled - mean * mean : 2500;
  const lowContrast = variance < 2400;

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
  const contrastFactor = lowContrast ? 1.22 : 1.12;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = ((data[i + c] - low) * 255) / range;
      v = (v - 128) * contrastFactor + 128;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  // Sharpen selectivo solo cuando la imagen tiene bajo contraste (tinta térmica tenue)
  if (lowContrast) {
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
          const blended = copy[idx + c] * 0.72 + (center - neighbors) * 0.28;
          data[idx + c] = blended < 0 ? 0 : blended > 255 ? 255 : blended;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Binarización adaptativa local rápida mediante imagen integral (algoritmo de Bradley-Roth).
 * Convierte tinta térmica tenue bajo sombras en texto negro nítido sobre blanco puro sin artefactos JPEG.
 */
function buildAdaptiveBinarizedCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const outCtx = out.getContext('2d');
  const srcCtx = sourceCanvas.getContext('2d');
  if (!outCtx || !srcCtx) return sourceCanvas;

  const srcData = srcCtx.getImageData(0, 0, w, h);
  const px = srcData.data;
  const gray = new Uint8Array(w * h);
  const integral = new Float64Array(w * h);

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const i4 = (rowOffset + x) * 4;
      const g = Math.round(0.299 * px[i4] + 0.587 * px[i4 + 1] + 0.114 * px[i4 + 2]);
      gray[rowOffset + x] = g;
      rowSum += g;
      integral[rowOffset + x] = y === 0 ? rowSum : integral[rowOffset - w + x] + rowSum;
    }
  }

  // Ventana adaptativa proporcional al ancho (~1/18 del documento)
  const radius = Math.max(8, Math.min(28, Math.round(w / 36)));
  const thresholdRatio = 0.87; // píxel más oscuro que el 87% del promedio local -> tinta negra
  const outImg = outCtx.createImageData(w, h);
  const outPx = outImg.data;

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(h - 1, y + radius);
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(w - 1, x + radius);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      const a = y1 > 0 && x1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0;
      const b = y1 > 0 ? integral[(y1 - 1) * w + x2] : 0;
      const c = x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0;
      const d = integral[y2 * w + x2];
      const localMean = (d - b - c + a) / count;

      const val = gray[rowOffset + x] < localMean * thresholdRatio ? 0 : 255;
      const i4 = (rowOffset + x) * 4;
      outPx[i4] = val;
      outPx[i4 + 1] = val;
      outPx[i4 + 2] = val;
      outPx[i4 + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return out;
}

function cropVerticalRoiPng(canvas: HTMLCanvasElement, startRatio: number, endRatio: number): string {
  const sy = Math.max(0, Math.floor(canvas.height * startRatio));
  const ey = Math.min(canvas.height, Math.ceil(canvas.height * endRatio));
  const sh = Math.max(1, ey - sy);
  const roi = document.createElement('canvas');
  roi.width = canvas.width;
  roi.height = sh;
  const ctx = roi.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');
  ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
  return roi.toDataURL('image/png');
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
      ocrDataUrl: '',
      docKind: 'LETTER_A4',
      originalBytes: file.size,
      optimizedBytes: file.size,
      enhanced: false
    };
  }

  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const aspect = (img.height || 1) / Math.max(1, img.width || 1);
        const isTallThermal = aspect >= 1.45;
        const docKind: 'THERMAL_80MM' | 'LETTER_A4' | 'UNKNOWN' = isTallThermal ? 'THERMAL_80MM' : 'LETTER_A4';

        // Tickets térmicos altos necesitan un poco más de altura útil (1800px); hojas normales 1600px
        const maxDim = isTallThermal ? 1800 : 1600;
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
            ocrDataUrl: rawDataUrl,
            docKind,
            originalBytes: file.size,
            optimizedBytes: file.size,
            enhanced: false
          });
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // 1. Buffer OCR Lossless (PNG) con binarización adaptativa ANTES de comprimir a JPEG
        const binCanvas = buildAdaptiveBinarizedCanvas(canvas);
        const ocrDataUrl = binCanvas.toDataURL('image/png');
        const ocrRoiHeaderUrl = isTallThermal ? cropVerticalRoiPng(binCanvas, 0, 0.38) : undefined;
        const ocrRoiFooterUrl = isTallThermal ? cropVerticalRoiPng(binCanvas, 0.60, 1.0) : undefined;

        // 2. Buffer Visual JPEG 85% para vista previa y respaldo Cloud Vision (ligero para 4G)
        applyVisualClarityFilter(ctx, width, height);
        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const optimizedBase64 = optimizedDataUrl.split(',')[1] || rawBase64;
        const optimizedBytes = Math.round((optimizedBase64.length * 3) / 4);

        resolve({
          base64Data: optimizedBase64,
          mimeType: 'image/jpeg',
          dataUrl: optimizedDataUrl,
          ocrDataUrl,
          ocrRoiHeaderUrl,
          ocrRoiFooterUrl,
          docKind,
          originalBytes: file.size,
          optimizedBytes,
          enhanced: true
        });
      } catch {
        resolve({
          base64Data: rawBase64,
          mimeType: file.type || 'image/jpeg',
          dataUrl: rawDataUrl,
          ocrDataUrl: rawDataUrl,
          docKind: 'UNKNOWN',
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
        ocrDataUrl: rawDataUrl,
        docKind: 'UNKNOWN',
        originalBytes: file.size,
        optimizedBytes: file.size,
        enhanced: false
      });
    };
    img.src = rawDataUrl;
  });
}

// Singleton de Worker Tesseract WASM en español (4.0.0_fast vía jsDelivr · 0 Tokens · 0 RAM en servidor)
type TesseractWorkerLike = {
  recognize: (img: string) => Promise<{ data?: { text?: string } }>;
};

let tesseractWorkerPromise: Promise<TesseractWorkerLike> | null = null;

async function getSpanishOcrWorker(): Promise<TesseractWorkerLike> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const mod = (await import('tesseract.js')) as unknown as {
        createWorker?: (
          lang: string,
          oem?: number,
          options?: Record<string, unknown>
        ) => Promise<TesseractWorkerLike>;
        default?: {
          createWorker?: (
            lang: string,
            oem?: number,
            options?: Record<string, unknown>
          ) => Promise<TesseractWorkerLike>;
        };
      };
      const createWorker = mod.createWorker || mod.default?.createWorker;
      if (typeof createWorker !== 'function') {
        throw new Error('createWorker no disponible en tesseract.js');
      }
      // Usar CDN jsDelivr con modelo 4.0.0_fast (más liviano y con CORS estable en móviles)
      const worker = await createWorker('spa', 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
        langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/spa/4.0.0_fast'
      });
      return worker;
    })().catch(err => {
      tesseractWorkerPromise = null;
      throw err;
    });
  }
  return tesseractWorkerPromise;
}

/**
 * Ejecuta OCR Local 0-Tokens sobre buffer sin pérdida (y recorte ROI encabezado+pie en tickets largos).
 * Devuelve texto + diagnóstico explícito de error si el dispositivo/CSP bloqueó el worker.
 */
export async function runLocalBrowserOcrDetailed(
  enhanced: EnhancedDocumentResult | string,
  timeoutMs = 16000
): Promise<LocalOcrDetailedResult> {
  const isObj = typeof enhanced === 'object' && enhanced !== null;
  const fullImg = isObj ? enhanced.ocrDataUrl || enhanced.dataUrl : enhanced;
  const headerRoi = isObj ? enhanced.ocrRoiHeaderUrl : undefined;
  const footerRoi = isObj ? enhanced.ocrRoiFooterUrl : undefined;

  if (!fullImg || !fullImg.startsWith('data:image/')) {
    return { text: '', usedRoi: false, error: null };
  }

  try {
    const ocrPromise = (async (): Promise<LocalOcrDetailedResult> => {
      const worker = await getSpanishOcrWorker();
      if (headerRoi && footerRoi) {
        const [hRes, fRes] = await Promise.all([worker.recognize(headerRoi), worker.recognize(footerRoi)]);
        const combined = `${String(hRes?.data?.text || '').trim()}\n${String(fRes?.data?.text || '').trim()}`.trim();
        if (combined.length >= 20) {
          return { text: combined.slice(0, 12000), usedRoi: true, error: null };
        }
      }
      const result = await worker.recognize(fullImg);
      const text = String(result?.data?.text || '').trim();
      return { text: text.length >= 15 ? text.slice(0, 12000) : '', usedRoi: false, error: null };
    })();

    const timeoutPromise = new Promise<LocalOcrDetailedResult>(resolve => {
      setTimeout(() => resolve({ text: '', usedRoi: false, error: `Timeout OCR local (${timeoutMs}ms)` }), timeoutMs);
    });

    return await Promise.race([ocrPromise, timeoutPromise]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: '', usedRoi: false, error: msg.slice(0, 180) };
  }
}

export async function runLocalBrowserOcr(
  enhanced: EnhancedDocumentResult | string,
  timeoutMs = 16000
): Promise<string> {
  const res = await runLocalBrowserOcrDetailed(enhanced, timeoutMs);
  return res.text;
}
