// Codificador QR estándar ISO/IEC 18004 (Modo Byte, Nivel de Corrección M - 15%, Versiones 1 a 6)
// Cero dependencias externas: genera una matriz booleana escaneable por cualquier cámara/lector QR.

interface QrVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  ecPerBlock: number;
  blocks: number;
  alignCenters: number[];
}

// Tabla oficial ISO/IEC 18004 para Error Correction Level M (15% recuperación)
const VERSION_SPECS_M: QrVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 16, ecPerBlock: 10, blocks: 1, alignCenters: [] },
  { version: 2, size: 25, dataCodewords: 28, ecPerBlock: 16, blocks: 1, alignCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 44, ecPerBlock: 26, blocks: 1, alignCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 64, ecPerBlock: 18, blocks: 2, alignCenters: [6, 26] },
  { version: 5, size: 37, dataCodewords: 86, ecPerBlock: 24, blocks: 2, alignCenters: [6, 30] },
  { version: 6, size: 41, dataCodewords: 108, ecPerBlock: 16, blocks: 4, alignCenters: [6, 34] }
];

// Aritmética GF(256) con polinomio primitivo 0x11D
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly: number[] = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return Uint8Array.from(poly);
}

function rsComputeEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecCount - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    rem[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return rem;
}

function encodeUtf8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(bytes);
}

function buildDataCodewords(bytes: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  // Modo Byte (0100) + longitud en 8 bits (Versiones 1..9)
  pushBits(0b0100, 4);
  pushBits(bytes.length, 8);
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i], 8);
  }

  const maxBits = spec.dataCodewords * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  pushBits(0, terminatorLen);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = new Uint8Array(spec.dataCodewords);
  let idx = 0;
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    codewords[idx++] = byte;
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (idx < spec.dataCodewords) {
    codewords[idx++] = padBytes[padIdx++ & 1];
  }
  return codewords;
}

function interleaveBlocks(data: Uint8Array, spec: QrVersionSpec): Uint8Array {
  const dataPerBlock = Math.floor(spec.dataCodewords / spec.blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (let b = 0; b < spec.blocks; b++) {
    const slice = data.slice(b * dataPerBlock, (b + 1) * dataPerBlock);
    dataBlocks.push(slice);
    ecBlocks.push(rsComputeEc(slice, spec.ecPerBlock));
  }

  const totalLen = spec.dataCodewords + spec.blocks * spec.ecPerBlock;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (let i = 0; i < dataPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) out[pos++] = dataBlocks[b][i];
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) out[pos++] = ecBlocks[b][i];
  }
  return out;
}

function computeFormatBits(maskPattern: number): number {
  // ECC Level M = 00
  const data = (0b00 << 3) | (maskPattern & 0b111);
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) {
    if (rem & (1 << (i + 10))) rem ^= 0x537 << i;
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function maskCondition(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function computePenalty(modules: boolean[][]): number {
  const n = modules.length;
  let penalty = 0;

  // Regla 1: corridas de 5+ módulos iguales en filas/columnas
  for (let r = 0; r < n; r++) {
    let runLen = 1;
    for (let c = 1; c < n; c++) {
      if (modules[r][c] === modules[r][c - 1]) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < n; c++) {
    let runLen = 1;
    for (let r = 1; r < n; r++) {
      if (modules[r][c] === modules[r - 1][c]) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // Regla 2: bloques 2x2 del mismo color
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = modules[r][c];
      if (v === modules[r][c + 1] && v === modules[r + 1][c] && v === modules[r + 1][c + 1]) {
        penalty += 3;
      }
    }
  }

  return penalty;
}

/**
 * Genera una matriz booleana (true = módulo oscuro) de Código QR estándar ISO/IEC 18004 (Nivel M).
 */
export function encodeQrMatrix(text: string): boolean[][] {
  const rawBytes = encodeUtf8(String(text || 'SENIAT_2026'));
  // Capacidad máxima de Versión 6 Nivel M en modo Byte: 106 bytes (108 - 2 de cabecera)
  const payload = rawBytes.length > 106 ? rawBytes.slice(0, 106) : rawBytes;
  const spec =
    VERSION_SPECS_M.find(s => payload.length <= s.dataCodewords - 2) ||
    VERSION_SPECS_M[VERSION_SPECS_M.length - 1];

  const dataCodewords = buildDataCodewords(payload, spec);
  const fullCodewords = interleaveBlocks(dataCodewords, spec);
  const n = spec.size;

  const isFunction = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const baseModules = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));

  const setFn = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < n && c >= 0 && c < n) {
      baseModules[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // Patrones de búsqueda (Finder + Separators)
  const drawFinder = (top: number, left: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= n || c < 0 || c >= n) continue;
        const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
        const dark = dist !== 2 && dist !== 4;
        setFn(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, n - 7);
  drawFinder(n - 7, 0);

  // Patrones de alineación
  for (const rCenter of spec.alignCenters) {
    for (const cCenter of spec.alignCenters) {
      if (isFunction[rCenter][cCenter]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dist = Math.max(Math.abs(dr), Math.abs(dc));
          setFn(rCenter + dr, cCenter + dc, dist !== 1);
        }
      }
    }
  }

  // Patrones de sincronización (Timing)
  for (let i = 8; i < n - 8; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }

  // Reservar áreas de información de formato y módulo oscuro fijo
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFn(8, i, false);
      setFn(i, 8, false);
    }
  }
  for (let i = n - 8; i < n; i++) {
    setFn(8, i, false);
    setFn(i, 8, false);
  }
  setFn(n - 8, 8, true); // Módulo oscuro obligatorio

  // Colocación de bits en zigzag (derecha a izquierda, saltando columna 6)
  let bitIdx = 0;
  const totalBits = fullCodewords.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < n; vert++) {
      const r = upward ? n - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunction[r][c]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          dark = ((fullCodewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        baseModules[r][c] = dark;
      }
    }
  }

  // Evaluar las 8 máscaras estándar y elegir la de menor penalización
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((val, c) => (isFunction[r][c] ? val : maskCondition(mask, r, c) ? !val : val))
    );

    const fmt = computeFormatBits(mask);
    const fmtBit = (k: number) => ((fmt >>> (14 - k)) & 1) === 1;
    // Colocar los 15 bits de formato (ISO/IEC 18004 Fig. 25, MSB=k:0 .. LSB=k:14)
    for (let k = 0; k <= 5; k++) candidate[8][k] = fmtBit(k);
    candidate[8][7] = fmtBit(6);
    candidate[8][8] = fmtBit(7);
    candidate[7][8] = fmtBit(8);
    for (let k = 9; k < 15; k++) candidate[14 - k][8] = fmtBit(k);

    for (let k = 0; k < 7; k++) candidate[n - 1 - k][8] = fmtBit(k);
    for (let k = 7; k < 15; k++) candidate[8][n - 15 + k] = fmtBit(k);
    candidate[n - 8][8] = true;

    const penalty = computePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = candidate;
    }
  }

  void bestMask;
  return bestModules;
}
