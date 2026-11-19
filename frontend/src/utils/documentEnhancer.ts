// Optimizador Documental estilo CamScanner (100% en navegador · Canvas · Costo $0)
// Redimensiona fotos 4K del celular a 1800px, elimina sombras/iluminación desigual,
// refuerza contraste y aplica enfoque suave para tickets térmicos y facturas arrugadas.

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

  // 1. Calcular rango de luminancia (percentiles aproximados por muestreo rápido)
  let minLum = 255;
  let maxLum = 0;
  const step = Math.max(4, Math.floor((data.length / 4) / 6000) * 4);
  for (let i = 0; i < data.length; i += step) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  // Estiramiento suave de contraste (blanquea papel con sombra y oscurece tinta tenue)
  const low = Math.min(minLum + 8, 90);
  const high = Math.max(maxLum - 6, 175);
  const range = Math.max(40, high - low);
  const contrastFactor = 1.14;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = ((data[i + c] - low) * 255) / range;
      v = (v - 128) * contrastFactor + 128;
      data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }

  // 2. Enfoque suave (Sharpen 3x3) para letras pequeñas en tickets térmicos
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
        // Mezcla 35% sharpen + 65% original para evitar ruido en papel arrugado
        const blended = copy[idx + c] * 0.65 + sharp * 0.35;
        data[idx + c] = blended < 0 ? 0 : blended > 255 ? 255 : blended;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export async function enhanceDocumentForOcr(file: File): Promise<EnhancedDocumentResult> {
  const rawDataUrl = await fileToDataUrl(file);
  const rawBase64 = rawDataUrl.split(',')[1] || '';

  // PDFs pasan directo sin rasterizar
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
        const maxDim = 1800;
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

        const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.88);
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
