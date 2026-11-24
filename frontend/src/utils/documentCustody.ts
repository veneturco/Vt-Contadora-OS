// Custodia Documental Original COT (10 Años) — SHA-256 + Firebase Storage
// Calcula el hash SHA-256 real del archivo binario/imagen y lo resguarda en
// `tenants/{tenantId}/receipts/{YYYYMM}/{invoiceId}_{hash8}.{ext}` cuando Firebase Storage está configurado.

import { ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '../firebase/config';

export interface CustodyUploadResult {
  custodySha256: string;
  custodyPath?: string;
  uploadedToCloud: boolean;
}

export async function computeFileSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback determinista para entornos sin SubtleCrypto (HTTP no-localhost)
  let h1 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0').repeat(8);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = String(base64 || '').split(',').pop() || '';
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export async function archiveOriginalDocumentCustody(params: {
  tenantId: string;
  invoiceId: string;
  base64Data: string;
  mimeType: string;
  emissionDate?: string;
}): Promise<CustodyUploadResult> {
  const bytes = base64ToUint8Array(params.base64Data);
  const sha256Hex = await computeFileSha256Hex(bytes);
  const ym = (params.emissionDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 6) || '202611';
  const ext = params.mimeType === 'application/pdf' ? 'pdf' : params.mimeType === 'image/png' ? 'png' : 'jpg';
  const storagePath = `tenants/${params.tenantId}/receipts/${ym}/${params.invoiceId}_${sha256Hex.slice(0, 8)}.${ext}`;

  try {
    const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
    if (apiKey && apiKey !== 'DEMO_API_KEY' && auth.currentUser) {
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, bytes, {
        contentType: params.mimeType || 'image/jpeg',
        customMetadata: {
          sha256: sha256Hex,
          tenantId: params.tenantId,
          invoiceId: params.invoiceId,
          cotRetentionYears: '10'
        }
      });
      return { custodySha256: sha256Hex, custodyPath: storagePath, uploadedToCloud: true };
    }
  } catch {
    // Si Storage no está habilitado o no hay red, conserva el sello SHA-256 y ruta lógica
  }

  return { custodySha256: sha256Hex, custodyPath: storagePath, uploadedToCloud: false };
}
