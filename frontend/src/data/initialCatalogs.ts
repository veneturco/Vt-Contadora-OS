import {
  FiscalInvoice,
  AuditLogEntry,
  SaasPaymentRecord,
  PayrollEmployee,
  BankMovement,
  computeDeterministicHash,
  simulateAes256GcmEncrypt
} from '../utils/seniatEngine';
import { SkinId, Tenant, AccountantPartner } from '../types/fiscal';

export const SKINS: { id: SkinId; label: string }[] = [
  { id: 'obsidian-champagne', label: 'Obsidian Champagne (Private Wealth)' },
  { id: 'swiss-ivory', label: 'Swiss Ivory (Banca Privada · Claro)' },
  { id: 'apple-craft-pro', label: 'Apple Craft Pro (Oscuro)' },
  { id: 'obsidian-linear', label: 'Linear Obsidian (Grafito)' },
  { id: 'mercury-sovereign', label: 'Mercury Fintech Pro' },
  { id: 'editorial-swiss', label: 'Editorial Swiss Ledger (Claro)' },
  { id: 'eink-auditor', label: 'E-Ink Auditor (Monocromo)' },
  { id: 'spatial-titanium', label: 'Titanium Dark' },
  { id: 'tactile-bento', label: 'Tactile Industrial' },
  { id: 'hyperframe-tactical', label: 'Contabilidad Técnica' },
  { id: 'kinetic-studio', label: 'Estudio Financiero' },
  { id: 'neo-brutal', label: 'Alto Contraste' }
];

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: 'tenant_bodega_jh',
    name: 'Bodega JH C.A.',
    rif: 'J-40918273-8',
    regime: 'SPE',
    planId: 'EMPRESA_MAX',
    subscriptionStatus: 'ACTIVA',
    nextBillingDate: '2026-12-14',
    telegramCode: 'VT-BODE-9A41F2',
    telegramChatLinked: '@bodega_jh_admin (ID: 59182041)',
    subAccountEnabled: true,
    subAccountContactName: 'Don José Hernández (Gerencia)',
    subAccountPhone: '+58 414-9918273',
    subAccountEmail: 'gerencia@bodegajh.com',
    subAccountRole: 'ADMIN_EMPRESA',
    subAccountStatus: 'TRIAL_15_DIAS',
    trialDaysLeft: 12,
    monthlyFeeUsd: 29.99,
    accountantCommissionPercent: 20
  },
  {
    id: 'tenant_ccmi',
    name: 'Centro Clínico CCMI C.A.',
    rif: 'J-50192837-1',
    regime: 'ORDINARIO',
    planId: 'EMPRESA_MAX',
    subscriptionStatus: 'ACTIVA',
    nextBillingDate: '2026-12-05',
    telegramCode: 'VT-CCMI-7C18E0',
    telegramChatLinked: '@ccmi_facturacion (ID: 88210492)',
    subAccountEnabled: true,
    subAccountContactName: 'Dra. Carmen Mendoza (Administradora)',
    subAccountPhone: '+58 412-3849102',
    subAccountEmail: 'carmen@ccmi.com',
    subAccountRole: 'ADMIN_EMPRESA',
    subAccountStatus: 'ACTIVA',
    trialDaysLeft: 0,
    monthlyFeeUsd: 49.99,
    accountantCommissionPercent: 20
  },
  {
    id: 'tenant_veneturco',
    name: 'Inversiones VeneTurco C.A.',
    rif: 'J-41203948-2',
    regime: 'SPE',
    planId: 'FIRMA_CONTABLE',
    subscriptionStatus: 'ACTIVA',
    nextBillingDate: '2026-12-28',
    telegramCode: 'VT-VENE-3D88B5',
    telegramChatLinked: '@veneturco_hq (ID: 10948271)',
    subAccountEnabled: false,
    monthlyFeeUsd: 79.99,
    accountantCommissionPercent: 20
  }
];

export const INITIAL_INVOICES: FiscalInvoice[] = [
  {
    id: 'inv_001',
    tenantId: 'tenant_bodega_jh',
    bookType: 'COMPRA',
    docType: '01',
    channel: 'DIGITAL',
    supplierRif: 'J-30123456-1',
    supplierName: 'Distribuidora Alimentos Oriente C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00045812',
    controlNumber: '00-00192834',
    emissionDate: '2026-11-12',
    emissionTime: '10:24:18',
    currency: 'USD',
    bcvRateOnDate: 911.62,
    taxableBaseOriginal: 1200,
    exemptOriginal: 150,
    vatRate: 16,
    vatOriginal: 192,
    igtfOriginal: 36,
    totalOriginal: 1578,
    vatRetentionRate: 75,
    islrRetentionRate: 2,
    status: 'APROBADA',
    sourceChannel: 'TELEGRAM_BOT',
    auditHash: '8f94e2c1a7b3d059e4128f7c3b9012a4f5e6d7c8b9a0123456789abcdef01234'
  },
  {
    id: 'inv_002',
    tenantId: 'tenant_bodega_jh',
    bookType: 'COMPRA',
    docType: '01',
    channel: 'MAQUINA_FISCAL',
    supplierRif: 'J-29876543-7',
    supplierName: 'Ferretería Express Sucre C.A.',
    hasBuyerRifOnTicket: false,
    invoiceNumber: 'Z1A-00921',
    controlNumber: 'MF-883712',
    emissionDate: '2026-11-13',
    emissionTime: '15:42:05',
    currency: 'VES',
    bcvRateOnDate: 914.02,
    taxableBaseOriginal: 8500,
    exemptOriginal: 0,
    vatRate: 16,
    vatOriginal: 1360,
    igtfOriginal: 0,
    totalOriginal: 9860,
    vatRetentionRate: 0,
    islrRetentionRate: 0,
    status: 'BORRADOR_IA',
    sourceChannel: 'WEB_OCR',
    auditHash: '3a11c9e8f027d441b6902c8a71e5f3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f6'
  },
  {
    id: 'inv_003',
    tenantId: 'tenant_bodega_jh',
    bookType: 'VENTA',
    docType: '01',
    channel: 'DIGITAL',
    supplierRif: 'J-40918273-8',
    supplierName: 'Ventas Consolidadas Portal Digital',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00001490',
    controlNumber: '00-00881204',
    emissionDate: '2026-11-14',
    emissionTime: '07:45:12',
    currency: 'USD',
    bcvRateOnDate: 914.02,
    taxableBaseOriginal: 3400,
    exemptOriginal: 420,
    vatRate: 16,
    vatOriginal: 544,
    igtfOriginal: 0,
    totalOriginal: 4364,
    vatRetentionRate: 0,
    islrRetentionRate: 0,
    status: 'APROBADA',
    sourceChannel: 'WEB_OCR',
    auditHash: '9d02f4e1c8b7a6543210fedcba9876543210abcdef1234567890abcdef123456'
  },
  {
    id: 'inv_004',
    tenantId: 'tenant_ccmi',
    bookType: 'COMPRA',
    docType: '01',
    channel: 'DIGITAL',
    supplierRif: 'J-00091827-9',
    supplierName: 'Insumos Médicos Nacionales C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00192831',
    controlNumber: '00-00918271',
    emissionDate: '2026-11-13',
    emissionTime: '11:10:00',
    currency: 'USD',
    bcvRateOnDate: 914.02,
    taxableBaseOriginal: 950,
    exemptOriginal: 1200,
    vatRate: 16,
    vatOriginal: 152,
    igtfOriginal: 0,
    totalOriginal: 2302,
    vatRetentionRate: 75,
    islrRetentionRate: 2,
    status: 'APROBADA',
    sourceChannel: 'TELEGRAM_BOT',
    auditHash: '4c82a1f09e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b'
  }
];

export const INITIAL_PAYMENTS: SaasPaymentRecord[] = [
  {
    id: 'pay_001',
    tenantId: 'tenant_bodega_jh',
    planId: 'EMPRESA_MAX',
    planName: 'Empresa & SPE Max',
    paymentMethod: 'PAGO_MOVIL',
    referenceNumber: '0134-99281742',
    amountUsd: 79.99,
    bcvRate: 914.02,
    amountBs: 73112.46,
    status: 'VERIFICADO',
    auditHash: '7a88b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
    createdAt: '2026-11-14 08:15:22'
  },
  {
    id: 'pay_002',
    tenantId: 'tenant_veneturco',
    planId: 'FIRMA_CONTABLE',
    planName: 'Firma Contable Multiempresa',
    paymentMethod: 'BINANCE_PAY',
    referenceNumber: 'BN-88291044912',
    amountUsd: 139.99,
    bcvRate: 914.02,
    amountBs: 127953.66,
    status: 'VERIFICADO',
    auditHash: '1f2e3d4c5b6a79801f2e3d4c5b6a79801f2e3d4c5b6a79801f2e3d4c5b6a7980',
    createdAt: '2026-11-01 09:30:00'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'log_001',
    tenantId: 'tenant_bodega_jh',
    sequence: 1,
    action: 'BCV_ORACLE_SYNC',
    actorUid: 'system:cron_caracas',
    targetId: 'bcv_2026-11-12',
    details: 'Sincronización automática Tasa Oficial BCV USD: Bs. 914.02',
    previousHash: 'GENESIS_SENIAT_2026',
    sha256Hash: computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 914.02 }),
    timestamp: '2026-11-12 09:05:01'
  },
  {
    id: 'log_002',
    tenantId: 'tenant_bodega_jh',
    sequence: 2,
    action: 'INGESTA_TELEGRAM_OCR',
    actorUid: 'telegram:59182041',
    targetId: 'inv_001',
    details: 'Factura #00045812 (Distribuidora Alimentos Oriente C.A.) procesada por el Núcleo de Validación Documental (Confianza 99.1%)',
    previousHash: computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 914.02 }),
    sha256Hash: computeDeterministicHash(
      computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 914.02 }),
      { seq: 2, action: 'INGESTA_TELEGRAM_OCR', invoiceNumber: '00045812' }
    ),
    encryptedPayload: simulateAes256GcmEncrypt('RIF:J-30123456-1|CTRL:00-00192834|USD:1578.00'),
    timestamp: '2026-11-12 10:25:04'
  },
  {
    id: 'log_003',
    tenantId: 'tenant_bodega_jh',
    sequence: 3,
    action: 'SELLO_INMUTABLE_COT',
    actorUid: 'contador:lic_maria_perez',
    targetId: 'inv_001',
    details: 'Aprobación fiscal y bloqueo de borrado por 10 años (Art. 18 SNAT/2026/00093)',
    previousHash: computeDeterministicHash(
      computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 914.02 }),
      { seq: 2, action: 'INGESTA_TELEGRAM_OCR', invoiceNumber: '00045812' }
    ),
    sha256Hash: computeDeterministicHash(
      computeDeterministicHash(
        computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 914.02 }),
        { seq: 2, action: 'INGESTA_TELEGRAM_OCR', invoiceNumber: '00045812' }
      ),
      { seq: 3, action: 'SELLO_INMUTABLE_COT', targetId: 'inv_001' }
    ),
    timestamp: '2026-11-12 14:12:39'
  }
];

export const OCR_PRESETS = [
  {
    label: 'Plantilla: Maxi Embutidos (Forma Libre)',
    bookType: 'COMPRA' as const,
    channel: 'DIGITAL' as const,
    supplierRif: 'J-40549697-5',
    supplierName: 'DISTRIBUIDORA MAXI EMBUTIDOS, C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00038205',
    controlNumber: '00-041538',
    currency: 'USD' as const,
    taxableBaseOriginal: 0,
    exemptOriginal: 488.68,
    vatRate: 16,
    igtfOriginal: 0,
    vatRetentionRate: 0 as const,
    islrRetentionRate: 0
  },
  {
    label: 'Plantilla: Traki (Máquina Fiscal Z7C)',
    bookType: 'COMPRA' as const,
    channel: 'MAQUINA_FISCAL' as const,
    supplierRif: 'J-09512460-6',
    supplierName: 'TRAKI DISTRIBUIDORA, C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00020540',
    controlNumber: 'Z7C7023363',
    currency: 'VES' as const,
    taxableBaseOriginal: 2663.93,
    exemptOriginal: 3090.16,
    vatRate: 16,
    igtfOriginal: 0,
    vatRetentionRate: 75 as const,
    islrRetentionRate: 2
  },
  {
    label: 'Imprenta Digital (Con Retención IVA 75%)',
    bookType: 'COMPRA' as const,
    channel: 'DIGITAL' as const,
    supplierRif: 'J-40192831-5',
    supplierName: 'Importadora Repuestos Turco-Ven C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00089410',
    controlNumber: '00-00491822',
    currency: 'USD' as const,
    taxableBaseOriginal: 1850,
    exemptOriginal: 0,
    vatRate: 16,
    igtfOriginal: 55.5,
    vatRetentionRate: 75 as const,
    islrRetentionRate: 2
  },
  {
    label: 'Máquina Fiscal Sin RIF Comprador (Alerta Art. 10.4)',
    bookType: 'COMPRA' as const,
    channel: 'MAQUINA_FISCAL' as const,
    supplierRif: 'J-31092817-7',
    supplierName: 'Papelería & Oficina Centro C.A.',
    hasBuyerRifOnTicket: false,
    invoiceNumber: 'Z2B-04412',
    controlNumber: 'MF-901283',
    currency: 'VES' as const,
    taxableBaseOriginal: 4200,
    exemptOriginal: 0,
    vatRate: 16,
    igtfOriginal: 0,
    vatRetentionRate: 0 as const,
    islrRetentionRate: 0
  },
  {
    label: 'Talonario Contingencia (Alerta Reporte < 24h)',
    bookType: 'VENTA' as const,
    channel: 'CONTINGENCIA' as const,
    supplierRif: 'J-40918273-8',
    supplierName: 'Cliente Corporativo Mayorista C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: 'C-000192',
    controlNumber: '00-00019200',
    currency: 'USD' as const,
    taxableBaseOriginal: 2600,
    exemptOriginal: 300,
    vatRate: 16,
    igtfOriginal: 78,
    vatRetentionRate: 0 as const,
    islrRetentionRate: 0
  }
];

export const INITIAL_EMPLOYEES: PayrollEmployee[] = [
  {
    id: 'emp_001',
    tenantId: 'tenant_bodega_jh',
    fullName: 'Carlos Eduardo Mendoza',
    cedula: 'V-19.482.710',
    role: 'Administrador de Tienda',
    hireDate: '2024-03-15',
    baseSalaryBs: 18500,
    cestaticketBs: 1882,
    riskLevel: 'MINIMO'
  },
  {
    id: 'emp_002',
    tenantId: 'tenant_bodega_jh',
    fullName: 'Yuliana Patricia Rojas',
    cedula: 'V-24.109.382',
    role: 'Cajera Principal',
    hireDate: '2025-01-10',
    baseSalaryBs: 12400,
    cestaticketBs: 1882,
    riskLevel: 'MINIMO'
  }
];

export const INITIAL_BANK_MOVEMENTS: BankMovement[] = [
  {
    id: 'mov_banesco_01',
    tenantId: 'tenant_bodega_jh',
    bankName: 'BANESCO',
    date: '2026-11-15',
    referenceNumber: '0098412',
    description: 'PAGO MOVIL C2P REF 0098412 CIUDADANO COMPRADOR',
    amountBs: 91402.00,
    movementType: 'PAGO_MOVIL',
    reconciliationStatus: 'DIFERENCIAL_CAMBIARIO',
    matchedInvoiceId: 'inv_001',
    matchedInvoiceNumber: '00491',
    exchangeDiffBs: 3402.00,
    auditHash: 'sha256_mov_banesco_98412'
  },
  {
    id: 'mov_banesco_02',
    tenantId: 'tenant_bodega_jh',
    bankName: 'BANESCO',
    date: '2026-11-15',
    referenceNumber: '482910',
    description: 'ABONO LIQUIDACION LOTE POS TERMINAL #4829',
    amountBs: 96700.00,
    movementType: 'CIERRE_LOTE_POS',
    reconciliationStatus: 'CONCILIADO',
    posBreakdown: {
      grossSalesBs: 100000.00,
      bankFeeBs: 1800.00,
      seniatRetBs: 1500.00,
      netDepositBs: 96700.00
    },
    auditHash: 'sha256_mov_banesco_pos_4829'
  },
  {
    id: 'mov_bdv_01',
    tenantId: 'tenant_bodega_jh',
    bankName: 'BDV',
    date: '2026-11-14',
    referenceNumber: '884712',
    description: 'TRANSF. INTERBANCARIA BNC REF: 884712',
    amountBs: 342150.00,
    movementType: 'TRANSFERENCIA',
    reconciliationStatus: 'CONCILIADO',
    matchedInvoiceId: 'inv_002',
    matchedInvoiceNumber: '00488',
    exchangeDiffBs: 0,
    auditHash: 'sha256_mov_bdv_884712'
  },
  {
    id: 'mov_bdv_02',
    tenantId: 'tenant_bodega_jh',
    bankName: 'BDV',
    date: '2026-11-14',
    referenceNumber: '001842',
    description: 'COMISION MANTENIMIENTO MENSUAL CUENTA CORRIENTE',
    amountBs: -450.00,
    movementType: 'COMISION_BANCARIA',
    reconciliationStatus: 'CONCILIADO',
    auditHash: 'sha256_mov_bdv_fee_1842'
  },
  {
    id: 'mov_mercantil_01',
    tenantId: 'tenant_bodega_jh',
    bankName: 'MERCANTIL',
    date: '2026-11-13',
    referenceNumber: '110482',
    description: 'PAGO MOVIL INTERBANCARIO REF: 110482',
    amountBs: 145000.00,
    movementType: 'PAGO_MOVIL',
    reconciliationStatus: 'PENDIENTE',
    auditHash: 'sha256_mov_mercantil_110482'
  },
  {
    id: 'mov_bancamiga_01',
    tenantId: 'tenant_bodega_jh',
    bankName: 'BANCAMIGA',
    date: '2026-11-12',
    referenceNumber: '771294',
    description: 'DEBITO IGTF 3% OPERACION DIVISAS CASH CONVENIO 20',
    amountBs: -2742.00,
    movementType: 'DEBITO_IGTF',
    reconciliationStatus: 'CONCILIADO',
    auditHash: 'sha256_mov_bancamiga_igtf_771'
  }
];

export const ACCOUNTANT_PLANS_CATALOG = [
  {
    id: 'CONTADOR_INDIVIDUAL',
    name: 'Contador Independiente',
    priceUsdMonthly: 29.99,
    maxCompanies: 3,
    features: [
      'Hasta 3 Empresas (Multi-RIF)',
      'Libros SENIAT y TXT IVA / XML ISLR',
      'Núcleo de Validación Documental (Procesamiento Fiscal)',
      'Soporte estándar vía WhatsApp'
    ]
  },
  {
    id: 'FIRMA_PRO',
    name: 'Firma Contable Pro',
    priceUsdMonthly: 69.99,
    maxCompanies: 10,
    features: [
      'Hasta 10 Empresas (Multi-RIF)',
      'Conciliador Bancario Multi-Banco 1-Clic',
      'Sub-cuentas para clientes (20% Rev-Share)',
      'Desglose de Lotes POS y Diferencial Cambiario'
    ]
  },
  {
    id: 'CONSORCIO_MAX',
    name: 'Consorcio Contable Max',
    priceUsdMonthly: 149.99,
    maxCompanies: 999,
    features: [
      'Empresas Ilimitadas (Multi-RIF)',
      'Co-Branding / Marca Blanca en reportes PDF',
      'Gestión de Nómina LOTTT Ilimitada',
      'Directorio Público Nacional de Contadores'
    ]
  }
];

export const INITIAL_ACCOUNTANTS: AccountantPartner[] = [
  {
    id: 'acc_001',
    name: 'Lic. Mariana Delgado',
    cpcNumber: 'CPC-74.192',
    rif: 'V-19.482.710-3',
    email: 'mariana.delgado@cpcvalencia.com',
    phone: '+58 414-5551234',
    city: 'Valencia, Edo. Carabobo',
    planId: 'FIRMA_PRO',
    monthlyFeeUsd: 69.99,
    maxCompaniesLimit: 10,
    assignedTenantIds: ['tenant_bodega_jh', 'tenant_ccmi'],
    subscriptionStatus: 'ACTIVA',
    nextBillingDate: '2026-12-15',
    payoutMethod: 'PAGO_MOVIL',
    payoutDetails: 'Banesco (0134) · 0414-5551234 · V-19482710',
    pendingCommissionUsd: 60.00,
    paidCommissionsTotalUsd: 240.00,
    firmLogoText: 'Delgado & Asociados Contadores Públicos',
    createdAt: '2026-01-10'
  },
  {
    id: 'acc_002',
    name: 'Lic. Pedro José Uzcátegui',
    cpcNumber: 'CPC-61.804',
    rif: 'V-14.819.201-9',
    email: 'pedro.uzcategui@asesoresfiscales.ve',
    phone: '+58 412-8889900',
    city: 'Caracas, Distrito Capital',
    planId: 'CONSORCIO_MAX',
    monthlyFeeUsd: 149.99,
    maxCompaniesLimit: 999,
    assignedTenantIds: ['tenant_veneturco'],
    subscriptionStatus: 'ACTIVA',
    nextBillingDate: '2026-12-05',
    payoutMethod: 'PAGO_MOVIL',
    payoutDetails: 'Mercantil (0105) · 0412-8889900 · V-14819201',
    pendingCommissionUsd: 90.00,
    paidCommissionsTotalUsd: 480.00,
    firmLogoText: 'Uzcátegui Consultoría Tributaria',
    createdAt: '2025-11-20'
  },
  {
    id: 'acc_003',
    name: 'Lic. Carmen Elena Rivas',
    cpcNumber: 'CPC-88.315',
    rif: 'V-22.104.938-1',
    email: 'carmen.rivas@contadoreszulia.com',
    phone: '+58 416-3334455',
    city: 'Maracaibo, Edo. Zulia',
    planId: 'CONTADOR_INDIVIDUAL',
    monthlyFeeUsd: 29.99,
    maxCompaniesLimit: 3,
    assignedTenantIds: [],
    subscriptionStatus: 'EN_PRUEBA',
    nextBillingDate: '2026-11-28',
    payoutMethod: 'BINANCE_PAY',
    payoutDetails: 'Binance Pay ID: 784910291 (USDT)',
    pendingCommissionUsd: 15.00,
    paidCommissionsTotalUsd: 0.00,
    firmLogoText: 'Rivas Contabilidad Digital',
    createdAt: '2026-11-12'
  }
];
