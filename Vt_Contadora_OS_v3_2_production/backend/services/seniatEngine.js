function validateVenezuelanRIF(rif) {
  const clean = String(rif || '').trim().toUpperCase().replace(/[^JVEGP0-9]/g, '');
  if (!/^[JVEGP][0-9]{9}$/.test(clean)) return { valid: false, formatted: rif, reason: 'Formato RIF invalido' };

  const prefixWeights = { V: 1, E: 2, J: 3, P: 4, G: 5 };
  const multipliers = [3, 2, 7, 6, 5, 4, 3, 2];
  let sum = prefixWeights[clean[0]] * 4;

  for (let i = 0; i < 8; i++) {
    sum += parseInt(clean[i + 1], 10) * multipliers[i];
  }

  const remainder = sum % 11;
  const expectedDigit = remainder > 1 ? 11 - remainder : 0;
  const actualDigit = parseInt(clean[9], 10);

  return {
    valid: expectedDigit === actualDigit,
    formatted: `${clean[0]}-${clean.slice(1, 9)}-${clean[9]}`,
    expectedDigit,
    actualDigit
  };
}

function buildRetentionVoucherNumber(yearMonth, correlativeSeq) {
  // Providencia SNAT/2026/00093 Art. 18: 14 digitos AAAAMMSSSSSSSS
  const ym = String(yearMonth).replace(/[^0-9]/g, '').slice(0, 6);
  const seq = String(correlativeSeq).padStart(8, '0').slice(-8);
  return `${ym}${seq}`;
}

function generateSeniatIvaTxt16Columns(agentRif, periodYYYYMM, rows) {
  const cleanAgentRif = agentRif.replace(/-/g, '').toUpperCase();
  if (!rows || rows.length === 0) {
    return `${cleanAgentRif}\t${periodYYYYMM}\t0\tC\t0\t0\t1\t0\t0.00\t0.00\t0.00\t0\t0\t0.00\t0.00\t0`;
  }

  return rows.map((r, idx) => {
    const voucher14 = r.voucherNumber || buildRetentionVoucherNumber(periodYYYYMM, idx + 1);
    const cols = [
      cleanAgentRif,
      periodYYYYMM,
      r.emissionDate,
      r.operationType || 'C',
      r.docType || '01',
      r.supplierRif.replace(/-/g, '').toUpperCase(),
      r.invoiceNumber,
      r.controlNumber,
      Number(r.totalBs).toFixed(2),
      Number(r.taxableBaseBs).toFixed(2),
      Number(r.ivaWithheldBs).toFixed(2),
      r.affectedDocument || '0',
      voucher14,
      Number(r.exemptBs || 0).toFixed(2),
      Number(r.vatRate || 16).toFixed(2),
      r.expediente || '0'
    ];
    return cols.join('\t');
  }).join('\n');
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateIslrDecreto1808Xml(agentRif, periodYYYYMM, retentions) {
  const cleanAgent = escapeXml(String(agentRif || '').replace(/-/g, '').toUpperCase());
  const cleanPeriod = escapeXml(String(periodYYYYMM || '').replace(/[^0-9]/g, '').slice(0, 6));
  const itemsXml = retentions.map(r => `  <DetalleRetencion>
    <RifRetenido>${escapeXml(String(r.supplierRif || '').replace(/-/g, '').toUpperCase())}</RifRetenido>
    <NumeroFactura>${escapeXml(r.invoiceNumber)}</NumeroFactura>
    <NumeroControl>${escapeXml(r.controlNumber)}</NumeroControl>
    <FechaOperacion>${escapeXml(r.emissionDate)}</FechaOperacion>
    <CodigoConcepto>${escapeXml(r.conceptCode || '001')}</CodigoConcepto>
    <MontoOperacion>${Number(r.taxableBaseBs).toFixed(2)}</MontoOperacion>
    <PorcentajeRetencion>${Number(r.islrRate || 2).toFixed(2)}</PorcentajeRetencion>
  </DetalleRetencion>`).join('\n');

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<RelacionRetencionesISLR RifAgente="${cleanAgent}" Periodo="${cleanPeriod}">
${itemsXml}
</RelacionRetencionesISLR>`;
}

function calculateLotttPayroll({ baseSalaryBs, cestaticketBs = 0, riskLevel = 'MINIMO' }) {
  const ivssEmployee = Number((baseSalaryBs * 0.04).toFixed(2));
  const faovEmployee = Number((baseSalaryBs * 0.01).toFixed(2));
  const rpeEmployee = Number((baseSalaryBs * 0.005).toFixed(2));

  const employerIvssRate = riskLevel === 'ALTO' ? 0.11 : riskLevel === 'MEDIO' ? 0.10 : 0.09;
  const ivssEmployer = Number((baseSalaryBs * employerIvssRate).toFixed(2));
  const faovEmployer = Number((baseSalaryBs * 0.02).toFixed(2));
  const rpeEmployer = Number((baseSalaryBs * 0.02).toFixed(2));
  const incesQuarterlyProvision = Number((baseSalaryBs * 0.02).toFixed(2));

  const dailyIntegral = (baseSalaryBs / 30) * (1 + (30 / 360) + (15 / 360));
  const prestacionesMonthlyProvision = Number((dailyIntegral * 5).toFixed(2));

  const totalDeductions = Number((ivssEmployee + faovEmployee + rpeEmployee).toFixed(2));
  const netPayBs = Number((baseSalaryBs + cestaticketBs - totalDeductions).toFixed(2));

  return {
    baseSalaryBs,
    cestaticketBs,
    deductions: { ivssEmployee, faovEmployee, rpeEmployee, totalDeductions },
    employerContributions: { ivssEmployer, faovEmployer, rpeEmployer, incesQuarterlyProvision, prestacionesMonthlyProvision },
    netPayBs
  };
}

module.exports = {
  validateVenezuelanRIF,
  buildRetentionVoucherNumber,
  generateSeniatIvaTxt16Columns,
  generateIslrDecreto1808Xml,
  calculateLotttPayroll
};
