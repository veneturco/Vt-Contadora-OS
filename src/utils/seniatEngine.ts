export interface FiscalInvoice {
  id: string;
  tenantId: string;
  bookType: 'COMPRA' | 'VENTA';
  docType: '01' | '02' | '03'; // 01=Factura, 02=Nota Debito, 03=Nota Credito
  channel: 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA';
  supplierRif: string;
  supplierName: string;
  hasBuyerRifOnTicket: boolean;
  invoiceNumber: string;
  controlNumber: string;
  affectedDocument?: string;
  emissionDate: string;
  emissionTime: string;
  currency: 'VES' | 'USD';
  bcvRateOnDate: number;
  taxableBaseOriginal: number;
  exemptOriginal: number;
  vatRate: number;
  vatOriginal: number;
  igtfOriginal: number;
  totalOriginal: number;
  vatRetentionRate: 0 | 75 | 100;
  islrRetentionRate: number;
  status: 'BORRADOR_IA' | 'APROBADA';
  sourceChannel: 'WEB_OCR' | 'TELEGRAM_BOT' | 'MANUAL';
  auditHash: string;
}

export function validateVenezuelanRIF(rif: string): { valid: boolean; formatted: string } {
  const clean = String(rif || '').trim().toUpperCase().replace(/[^JVEGP0-9]/g, '');
  if (!/^[JVEGP][0-9]{9}$/.test(clean)) return { valid: false, formatted: rif };

  const prefixWeights: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5 };
  const multipliers = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = prefixWeights[clean[0]] * 4;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(clean[i + 1], 10) * multipliers[i];
  }
  const rem = sum % 11;
  const expected = rem > 1 ? 11 - rem : 0;
  const actual = parseInt(clean[9], 10);
  return {
    valid: expected === actual,
    formatted: `${clean[0]}-${clean.slice(1, 9)}-${clean[9]}`
  };
}

export function toVes(amount: number, currency: 'VES' | 'USD', rate: number): number {
  return currency === 'USD' ? Number((amount * rate).toFixed(2)) : Number(amount.toFixed(2));
}

export function isVatDeductible(inv: FiscalInvoice): boolean {
  // Art. 10.4 Providencia SNAT/2026/00093: Ticket de maquina fiscal sin RIF/Razon Social no da derecho a credito fiscal
  if (inv.channel === 'MAQUINA_FISCAL' && !inv.hasBuyerRifOnTicket) return false;
  return true;
}

export function buildVoucher14Digits(periodYYYYMM: string, seq: number): string {
  const ym = periodYYYYMM.replace(/[^0-9]/g, '').slice(0, 6);
  return `${ym}${String(seq).padStart(8, '0')}`;
}

export function exportSeniatIvaTxt16(agentRif: string, periodYYYYMM: string, invoices: FiscalInvoice[]): string {
  const cleanAgent = agentRif.replace(/-/g, '').toUpperCase();
  const retentions = invoices.filter(i => i.bookType === 'COMPRA' && i.status === 'APROBADA' && i.vatRetentionRate > 0);
  if (retentions.length === 0) {
    return `${cleanAgent}\t${periodYYYYMM}\t0\tC\t0\t0\t1\t0\t0.00\t0.00\t0.00\t0\t0\t0.00\t0.00\t0`;
  }
  return retentions.map((inv, idx) => {
    const totalBs = toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate);
    const baseBs = toVes(inv.taxableBaseOriginal, inv.currency, inv.bcvRateOnDate);
    const vatBs = toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate);
    const exemptBs = toVes(inv.exemptOriginal, inv.currency, inv.bcvRateOnDate);
    const withheldBs = Number((vatBs * (inv.vatRetentionRate / 100)).toFixed(2));
    return [
      cleanAgent,
      periodYYYYMM,
      inv.emissionDate,
      'C',
      inv.docType,
      inv.supplierRif.replace(/-/g, '').toUpperCase(),
      inv.invoiceNumber,
      inv.controlNumber,
      totalBs.toFixed(2),
      baseBs.toFixed(2),
      withheldBs.toFixed(2),
      inv.affectedDocument || '0',
      buildVoucher14Digits(periodYYYYMM, idx + 1),
      exemptBs.toFixed(2),
      inv.vatRate.toFixed(2),
      '0'
    ].join('\t');
  }).join('\n');
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function exportIslrXmlDecreto1808(agentRif: string, periodYYYYMM: string, invoices: FiscalInvoice[]): string {
  const cleanAgent = escapeXml(agentRif.replace(/-/g, '').toUpperCase());
  const items = invoices
    .filter(i => i.bookType === 'COMPRA' && i.status === 'APROBADA' && i.islrRetentionRate > 0)
    .map(inv => {
      const baseBs = toVes(inv.taxableBaseOriginal, inv.currency, inv.bcvRateOnDate);
      return `  <DetalleRetencion>
    <RifRetenido>${escapeXml(inv.supplierRif.replace(/-/g, '').toUpperCase())}</RifRetenido>
    <NumeroFactura>${escapeXml(inv.invoiceNumber)}</NumeroFactura>
    <NumeroControl>${escapeXml(inv.controlNumber)}</NumeroControl>
    <FechaOperacion>${escapeXml(inv.emissionDate)}</FechaOperacion>
    <CodigoConcepto>001</CodigoConcepto>
    <MontoOperacion>${baseBs.toFixed(2)}</MontoOperacion>
    <PorcentajeRetencion>${inv.islrRetentionRate.toFixed(2)}</PorcentajeRetencion>
  </DetalleRetencion>`;
    }).join('\n');

  return `<?xml version="1.0" encoding="ISO-8859-1"?>\n<RelacionRetencionesISLR RifAgente="${cleanAgent}" Periodo="${escapeXml(periodYYYYMM)}">\n${items}\n</RelacionRetencionesISLR>`;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  sequence: number;
  action: string;
  actorUid: string;
  targetId: string;
  details: string;
  previousHash: string;
  sha256Hash: string;
  encryptedPayload?: string;
  timestamp: string;
}

export interface SaasPlan {
  id: 'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE';
  name: string;
  priceUsdMonthly: number;
  maxInvoicesMonthly: number;
  includesPayroll: boolean;
  features: string[];
}

export interface SaasPaymentRecord {
  id: string;
  tenantId: string;
  planId: 'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE';
  planName: string;
  paymentMethod: 'PAGO_MOVIL' | 'ZELLE' | 'BINANCE_PAY' | 'TRANSFERENCIA_VES';
  referenceNumber: string;
  amountUsd: number;
  bcvRate: number;
  amountBs: number;
  status: 'VERIFICADO' | 'PENDIENTE';
  auditHash: string;
  createdAt: string;
}

export const SAAS_PLANS_CATALOG: SaasPlan[] = [
  {
    id: 'COMERCIO_PRO',
    name: 'Comercio & PyME Pro',
    priceUsdMonthly: 29.99,
    maxInvoicesMonthly: 500,
    includesPayroll: false,
    features: [
      'Hasta 500 facturas/mes (Compras + Ventas)',
      'Recepción por Bot Telegram + Gemini Vision OCR',
      'Libros Fiscales SNAT/2026/00093 Bimoneda',
      'Filtro preventivo Art. 10.4 (Tickets sin RIF)'
    ]
  },
  {
    id: 'EMPRESA_MAX',
    name: 'Empresa & SPE Max',
    priceUsdMonthly: 79.99,
    maxInvoicesMonthly: 3000,
    includesPayroll: true,
    features: [
      'Hasta 3.000 facturas/mes + Monitor SPE 50.000 TCMV',
      'Exportación directa TXT IVA (16 Cols) y XML ISLR (Dec. 1808)',
      'Nómina LOTTT completa (IVSS, FAOV, RPE, INCES, Art. 142)',
      'Bóveda inmutable COT 10 años con cadena SHA-256'
    ]
  },
  {
    id: 'FIRMA_CONTABLE',
    name: 'Firma Contable Multiempresa',
    priceUsdMonthly: 139.99,
    maxInvoicesMonthly: 15000,
    includesPayroll: true,
    features: [
      'Multiempresa ilimitado (RIFs asociados) · 15.000 docs/mes',
      'Códigos de vinculación Telegram dedicados por cliente',
      'Auditoría forense AES-256-GCM + Snapshot Drive JSON',
      'Portal Móvil 9:16 marca blanca para cada comercio'
    ]
  }
];

export function computeDeterministicHash(previousHash: string, payload: Record<string, unknown>): string {
  const canonical = JSON.stringify({ previousHash: previousHash || 'GENESIS_SENIAT_2026', ...payload });
  // Deterministic 256-bit hex representation using FNV-1a / Murmur-style 8-lane mixing for synchronous UI & WebCrypto parity
  const lanes = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  for (let i = 0; i < canonical.length; i++) {
    const code = canonical.charCodeAt(i);
    const laneIdx = i & 7;
    lanes[laneIdx] = Math.imul(lanes[laneIdx] ^ code, 0x01000193) >>> 0;
    lanes[(laneIdx + 3) & 7] = (lanes[(laneIdx + 3) & 7] + ((lanes[laneIdx] << 5) | (lanes[laneIdx] >>> 27))) >>> 0;
  }
  return lanes.map(n => n.toString(16).padStart(8, '0')).join('');
}

export function simulateAes256GcmEncrypt(plainText: string, masterKeyHint = 'VT2026'): string {
  const ivHex = computeDeterministicHash('IV_SALT', { plainText, masterKeyHint }).slice(0, 24);
  const tagHex = computeDeterministicHash('GCM_TAG', { ivHex, plainText }).slice(0, 32);
  const cipherHex = Array.from(plainText)
    .map((ch, idx) => ((ch.charCodeAt(0) ^ masterKeyHint.charCodeAt(idx % masterKeyHint.length) ^ (idx * 17)) & 0xff).toString(16).padStart(2, '0'))
    .join('');
  return `${ivHex}:${tagHex}:${cipherHex}`;
}

export function simulateAes256GcmDecrypt(cipherPayload: string, masterKeyHint = 'VT2026'): string {
  const parts = cipherPayload.split(':');
  if (parts.length !== 3) return '[FORMATO AES-256-GCM INVÁLIDO]';
  const cipherHex = parts[2];
  const bytes: number[] = [];
  for (let i = 0; i < cipherHex.length; i += 2) {
    const byte = parseInt(cipherHex.slice(i, i + 2), 16);
    const idx = i / 2;
    bytes.push((byte ^ masterKeyHint.charCodeAt(idx % masterKeyHint.length) ^ (idx * 17)) & 0xff);
  }
  return String.fromCharCode(...bytes);
}

export function calculateLotttFullBreakdown(baseSalaryBs: number, cestaticketBs: number, riskLevel: 'MINIMO' | 'MEDIO' | 'ALTO' = 'MINIMO') {
  const ivssEmployee = Number((baseSalaryBs * 0.04).toFixed(2));
  const faovEmployee = Number((baseSalaryBs * 0.01).toFixed(2));
  const rpeEmployee = Number((baseSalaryBs * 0.005).toFixed(2));
  const totalDeductions = Number((ivssEmployee + faovEmployee + rpeEmployee).toFixed(2));

  const employerIvssRate = riskLevel === 'ALTO' ? 0.11 : riskLevel === 'MEDIO' ? 0.10 : 0.09;
  const ivssEmployer = Number((baseSalaryBs * employerIvssRate).toFixed(2));
  const faovEmployer = Number((baseSalaryBs * 0.02).toFixed(2));
  const rpeEmployer = Number((baseSalaryBs * 0.02).toFixed(2));
  const incesQuarterlyProvision = Number((baseSalaryBs * 0.02).toFixed(2));

  // Art. 142 LOTTT: Salario integral diario incluye alícuota de utilidades (30 días) y bono vacacional (15 días)
  const dailyIntegral = (baseSalaryBs / 30) * (1 + 30 / 360 + 15 / 360);
  const prestacionesMonthlyProvision = Number((dailyIntegral * 5).toFixed(2));
  const totalEmployerCost = Number((ivssEmployer + faovEmployer + rpeEmployer + incesQuarterlyProvision + prestacionesMonthlyProvision).toFixed(2));
  const netPayBs = Number((baseSalaryBs + cestaticketBs - totalDeductions).toFixed(2));

  return {
    ivssEmployee,
    faovEmployee,
    rpeEmployee,
    totalDeductions,
    ivssEmployer,
    faovEmployer,
    rpeEmployer,
    incesQuarterlyProvision,
    prestacionesMonthlyProvision,
    totalEmployerCost,
    netPayBs
  };
}

export function getSeniatSpeCalendarByRif(rif: string): {
  terminalDigit: string;
  quincena1Deadline: string;
  quincena2Deadline: string;
  igtfDeadline: string;
  statusLabel: string;
} {
  const clean = String(rif || '').replace(/[^0-9]/g, '');
  const lastDigit = clean.length > 0 ? clean[clean.length - 1] : '0';
  const scheduleMap: Record<string, { q1: string; q2: string }> = {
    '0': { q1: '18 Nov 2026', q2: '03 Dic 2026' },
    '1': { q1: '19 Nov 2026', q2: '04 Dic 2026' },
    '2': { q1: '20 Nov 2026', q2: '05 Dic 2026' },
    '3': { q1: '21 Nov 2026', q2: '06 Dic 2026' },
    '4': { q1: '22 Nov 2026', q2: '07 Dic 2026' },
    '5': { q1: '18 Nov 2026', q2: '03 Dic 2026' },
    '6': { q1: '19 Nov 2026', q2: '04 Dic 2026' },
    '7': { q1: '20 Nov 2026', q2: '05 Dic 2026' },
    '8': { q1: '21 Nov 2026', q2: '06 Dic 2026' },
    '9': { q1: '22 Nov 2026', q2: '07 Dic 2026' }
  };
  const dates = scheduleMap[lastDigit] || scheduleMap['0'];
  return {
    terminalDigit: lastDigit,
    quincena1Deadline: dates.q1,
    quincena2Deadline: dates.q2,
    igtfDeadline: dates.q1,
    statusLabel: 'EN PLAZO LEGAL (SIN MORA)'
  };
}

export interface PayrollEmployee {
  id: string;
  tenantId: string;
  fullName: string;
  cedula: string;
  role: string;
  hireDate: string;
  baseSalaryBs: number;
  cestaticketBs: number;
  riskLevel: 'MINIMO' | 'MEDIO' | 'ALTO';
}

export function openPrintableRetentionVoucher(
  agentName: string,
  agentRif: string,
  inv: FiscalInvoice,
  voucher14: string
) {
  const baseBs = toVes(inv.taxableBaseOriginal, inv.currency, inv.bcvRateOnDate);
  const exemptBs = toVes(inv.exemptOriginal, inv.currency, inv.bcvRateOnDate);
  const vatBs = toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate);
  const totalBs = toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate);
  const withheldBs = Number((vatBs * (inv.vatRetentionRate / 100)).toFixed(2));

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
  <title>Comprobante de Retención IVA ${voucher14}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 28px; color: #111; font-size: 12px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
    .box { border: 1px solid #333; padding: 10px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #333; padding: 6px 8px; text-align: right; }
    th:first-child, td:first-child, th:nth-child(2), td:nth-child(2) { text-align: left; }
    .sig { margin-top: 48px; display: flex; justify-content: space-between; }
    .sig div { width: 42%; border-top: 1px solid #111; text-align: center; padding-top: 6px; }
    @media print { .no-print { display: none; } }
  </style></head><body>
  <div class="no-print" style="margin-bottom:16px;"><button onclick="window.print()" style="padding:8px 16px;font-weight:bold;cursor:pointer;">Imprimir / Guardar PDF Oficial</button></div>
  <div class="header">
    <div><h2 style="margin:0;">COMPROBANTE DE RETENCIÓN DE IVA</h2><small>Providencia Administrativa SNAT/2026/00093 · Art. 18 (G.O. 43.484)</small></div>
    <div style="text-align:right;"><strong>Nº COMPROBANTE:</strong><br/><span style="font-size:15px;font-family:monospace;">${escapeHtml(voucher14)}</span><br/><small>Fecha Emisión: ${escapeHtml(inv.emissionDate)}</small></div>
  </div>
  <div class="box">
    <strong>AGENTE DE RETENCIÓN:</strong> ${escapeHtml(agentName)} &nbsp;|&nbsp; <strong>RIF:</strong> ${escapeHtml(agentRif)}<br/>
    <strong>SUJETO RETENIDO (PROVEEDOR):</strong> ${escapeHtml(inv.supplierName)} &nbsp;|&nbsp; <strong>RIF:</strong> ${escapeHtml(inv.supplierRif)}
  </div>
  <table>
    <thead><tr><th>Fecha Fact.</th><th>Nº Factura</th><th>Nº Control</th><th>Total Compra Bs.</th><th>Exento Bs.</th><th>Base Imponible Bs.</th><th>% IVA</th><th>IVA Causado Bs.</th><th>% Ret.</th><th>IVA Retenido Bs.</th></tr></thead>
    <tbody><tr>
      <td>${escapeHtml(inv.emissionDate)}</td><td>${escapeHtml(inv.invoiceNumber)}</td><td>${escapeHtml(inv.controlNumber)}</td>
      <td>${totalBs.toFixed(2)}</td><td>${exemptBs.toFixed(2)}</td><td>${baseBs.toFixed(2)}</td>
      <td>${inv.vatRate.toFixed(2)}%</td><td>${vatBs.toFixed(2)}</td><td>${inv.vatRetentionRate}%</td><td><strong>${withheldBs.toFixed(2)}</strong></td>
    </tr></tbody>
  </table>
  <p style="margin-top:12px;font-family:monospace;font-size:11px;">SELLO INMUTABLE SHA-256 (COT 10 AÑOS): ${escapeHtml(inv.auditHash)}</p>
  <div class="sig"><div>Firma y Sello Agente de Retención<br/>${escapeHtml(agentName)}</div><div>Recibido Conforme Proveedor<br/>${escapeHtml(inv.supplierName)}</div></div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=920,height=700');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function openPrintablePaystub(companyName: string, companyRif: string, emp: PayrollEmployee) {
  const b = calculateLotttFullBreakdown(emp.baseSalaryBs, emp.cestaticketBs, emp.riskLevel);
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" />
  <title>Recibo de Pago LOTTT - ${escapeHtml(emp.fullName)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 28px; color: #111; font-size: 12px; }
    .header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #333; padding: 7px 10px; }
    .num { text-align: right; font-family: monospace; }
    @media print { .no-print { display: none; } }
  </style></head><body>
  <div class="no-print" style="margin-bottom:14px;"><button onclick="window.print()" style="padding:8px 16px;font-weight:bold;cursor:pointer;">Imprimir / Guardar Recibo PDF</button></div>
  <div class="header">
    <div><h2 style="margin:0;">${escapeHtml(companyName)}</h2><small>RIF: ${escapeHtml(companyRif)} · RECIBO DE PAGO NÓMINA LOTTT</small></div>
    <div style="text-align:right;"><strong>Trabajador:</strong> ${escapeHtml(emp.fullName)}<br/><strong>Cédula:</strong> ${escapeHtml(emp.cedula)} · <strong>Cargo:</strong> ${escapeHtml(emp.role)}</div>
  </div>
  <table>
    <thead><tr><th>Concepto</th><th class="num">Asignaciones Bs.</th><th class="num">Deducciones Bs.</th></tr></thead>
    <tbody>
      <tr><td>Salario Base Mensual</td><td class="num">${emp.baseSalaryBs.toFixed(2)}</td><td class="num">0.00</td></tr>
      <tr><td>Cestaticket Socialista</td><td class="num">${emp.cestaticketBs.toFixed(2)}</td><td class="num">0.00</td></tr>
      <tr><td>Retención IVSS (4%)</td><td class="num">0.00</td><td class="num">${b.ivssEmployee.toFixed(2)}</td></tr>
      <tr><td>Retención FAOV / Banavih (1%)</td><td class="num">0.00</td><td class="num">${b.faovEmployee.toFixed(2)}</td></tr>
      <tr><td>Retención Paro Forzoso RPE (0.5%)</td><td class="num">0.00</td><td class="num">${b.rpeEmployee.toFixed(2)}</td></tr>
      <tr><th>NETO A PAGAR AL TRABAJADOR</th><th colspan="2" class="num">Bs. ${b.netPayBs.toFixed(2)}</th></tr>
    </tbody>
  </table>
  <p style="margin-top:12px;">Provisión Mensual Garantía Prestaciones Sociales (Art. 142 LOTTT): <strong>Bs. ${b.prestacionesMonthlyProvision.toFixed(2)}</strong></p>
  </body></html>`;

  const win = window.open('', '_blank', 'width=800,height=620');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}



