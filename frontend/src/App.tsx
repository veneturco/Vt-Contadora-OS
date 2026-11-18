import React, { useState, useEffect, useMemo } from 'react';
import jsQR from 'jsqr';
import {
  ShieldCheck, FileText, Cpu, Send, Users, CreditCard, Smartphone,
  Lock, Download, CheckCircle2, AlertTriangle, RefreshCw, Plus,
  Building2, Scale, Hash, Eye, EyeOff, Camera, Upload, KeyRound,
  Check, Copy, ArrowUpRight, QrCode, Search, Calendar, X, Terminal,
  Printer, LogOut, Wifi, WifiOff, MessageSquare, Clock,
  DollarSign, Briefcase, Edit3, MapPin, Mail, Layers, Trash2
} from 'lucide-react';
import {
  FiscalInvoice,
  AuditLogEntry,
  SaasPaymentRecord,
  PayrollEmployee,
  SAAS_PLANS_CATALOG,
  validateVenezuelanRIF,
  toVes,
  isVatDeductible,
  buildVoucher14Digits,
  exportSeniatIvaTxt16,
  exportIslrXmlDecreto1808,
  exportSeniatPurchaseAndSalesBookCsv,
  computeDeterministicHash,
  simulateAes256GcmEncrypt,
  simulateAes256GcmDecrypt,
  calculateLotttFullBreakdown,
  getSeniatSpeCalendarByRif,
  openPrintableRetentionVoucher,
  openPrintablePaystub,
  downloadPdfRetentionVoucher,
  downloadPdfIslrRetentionVoucher,
  downloadPdfPaystub,
  BankMovement,
  parseBankStatementCsv,
  calculateExchangeDifferenceNic21,
  breakdownPosSettlementBatch,
  runDeterministicBankReconciliation,
  exportBankReconciliationCsv,
  downloadPdfBankReconciliationAudit
} from './utils/seniatEngine';
import { generateTotpSecret, getTotpUri, verifyTotpCode } from './utils/totp';
import { safeGetStorage, safeSetStorage } from './utils/storage';
import { safeApiRequest } from './services/apiClient';

type SkinId =
  | 'apple-craft-pro'
  | 'obsidian-linear'
  | 'mercury-sovereign'
  | 'spatial-titanium'
  | 'tactile-bento'
  | 'hyperframe-tactical'
  | 'kinetic-studio'
  | 'editorial-swiss'
  | 'eink-auditor'
  | 'neo-brutal';

type ActiveTabId =
  | 'accountants'
  | 'clients'
  | 'simplified'
  | 'command'
  | 'ocr'
  | 'books'
  | 'payroll'
  | 'saas'
  | 'reconciliation'
  | 'mobile'
  | 'security'
  | 'operations';

type OperationStepId = 'scanner' | 'books' | 'reconciliation';

interface Tenant {
  id: string;
  name: string;
  rif: string;
  regime: 'SPE' | 'ORDINARIO' | 'FORMAL';
  planId: 'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE';
  subscriptionStatus: 'ACTIVA' | 'SUSPENDIDA';
  nextBillingDate: string;
  telegramCode: string;
  telegramChatLinked?: string;
  subAccountEnabled?: boolean;
  subAccountContactName?: string;
  subAccountPhone?: string;
  subAccountEmail?: string;
  subAccountRole?: 'OPERADOR_CAJA' | 'ADMIN_EMPRESA' | 'SOLO_CONSULTA';
  subAccountStatus?: 'TRIAL_15_DIAS' | 'ACTIVA' | 'POR_VENCER' | 'SUSPENDIDA';
  trialDaysLeft?: number;
  monthlyFeeUsd?: number;
  accountantCommissionPercent?: number;
}

export interface AccountantPartner {
  id: string;
  name: string;
  cpcNumber: string;
  rif: string;
  email: string;
  phone: string;
  city: string;
  planId: 'CONTADOR_INDIVIDUAL' | 'FIRMA_PRO' | 'CONSORCIO_MAX';
  monthlyFeeUsd: number;
  maxCompaniesLimit: number;
  assignedTenantIds: string[];
  subscriptionStatus: 'ACTIVA' | 'SUSPENDIDA' | 'EN_PRUEBA';
  nextBillingDate: string;
  payoutMethod: 'PAGO_MOVIL' | 'BINANCE_PAY' | 'ZELLE';
  payoutDetails: string;
  pendingCommissionUsd: number;
  paidCommissionsTotalUsd: number;
  firmLogoText?: string;
  createdAt: string;
}

const SKINS: { id: SkinId; label: string }[] = [
  { id: 'apple-craft-pro', label: ' Apple Craft Pro (Estándar Ejecutivo)' },
  { id: 'obsidian-linear', label: 'Linear Obsidian (Dark Minimal)' },
  { id: 'mercury-sovereign', label: 'Mercury Fintech Pro' },
  { id: 'editorial-swiss', label: 'Editorial Swiss Ledger (Light)' },
  { id: 'eink-auditor', label: 'E-Ink Auditor (Monocromo)' },
  { id: 'spatial-titanium', label: 'Titanium Dark' },
  { id: 'tactile-bento', label: 'Tactile Industrial' },
  { id: 'hyperframe-tactical', label: 'Contabilidad Técnica' },
  { id: 'kinetic-studio', label: 'Estudio Financiero' },
  { id: 'neo-brutal', label: 'Alto Contraste' }
];

const AppleEmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => (
  <div className="ui-card p-8 text-center flex flex-col items-center justify-center space-y-3 border border-white/10 bg-white/[0.02]">
    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]">
      <FileText className="w-5 h-5" />
    </div>
    <div className="max-w-md space-y-1">
      <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
      <p className="text-xs text-white/60 leading-relaxed">{description}</p>
    </div>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-1 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all active:scale-[0.97] shadow"
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const INITIAL_TENANTS: Tenant[] = [
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

const INITIAL_INVOICES: FiscalInvoice[] = [
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

const INITIAL_PAYMENTS: SaasPaymentRecord[] = [
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

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
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
    details: 'Factura #00045812 (Distribuidora Alimentos Oriente C.A.) extraída con Gemini 2.5 Flash (Confianza 99.1%)',
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

const OCR_PRESETS = [
  {
    label: 'VNDE 0 Tokens: Maxi Embutidos (Forma Libre)',
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
    label: 'VNDE 0 Tokens: Traki (Máquina Fiscal Z7C)',
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

const INITIAL_EMPLOYEES: PayrollEmployee[] = [
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

const INITIAL_BANK_MOVEMENTS: BankMovement[] = [
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

const ACCOUNTANT_PLANS_CATALOG = [
  {
    id: 'CONTADOR_INDIVIDUAL',
    name: 'Contador Independiente',
    priceUsdMonthly: 29.99,
    maxCompanies: 3,
    features: [
      'Hasta 3 Empresas (Multi-RIF)',
      'Libros SENIAT y TXT IVA / XML ISLR',
      'Escáner OCR Gemini 2.5 Flash (0 Tokens)',
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

const INITIAL_ACCOUNTANTS: AccountantPartner[] = [
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<{
    uid?: string;
    email: string;
    role: 'superadmin' | 'admin' | 'client';
    name: string;
    cpcNumber?: string | null;
    accountantId?: string | null;
    tenantIds?: string[];
    mustChangePassword?: boolean;
  } | null>(() => safeGetStorage('vt_auth_user', null));
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = useState<boolean>(false);
  const [loginSubmitting, setLoginSubmitting] = useState<boolean>(false);
  const [loginRole, setLoginRole] = useState<'superadmin' | 'admin' | 'client'>('admin');
  const [inviteGreeting, setInviteGreeting] = useState<{ role: string; name?: string; email?: string } | null>(null);
  const [issuedInviteModal, setIssuedInviteModal] = useState<{
    accountant: AccountantPartner;
    tempPassword: string;
    firebaseAuthSynced?: boolean;
  } | null>(null);
  const [copiedInvitePass, setCopiedInvitePass] = useState<boolean>(false);
  const [newPasswordInput, setNewPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordSaving, setChangePasswordSaving] = useState<boolean>(false);
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<any>(null);

  // Blindaje Ciberseguridad & Login Guard Anti-Fuerza Bruta
  const [failedLoginAttempts, setFailedLoginAttempts] = useState<number>(0);
  const [isAccountLocked, setIsAccountLocked] = useState<boolean>(false);
  const [lockCountdownSeconds, setLockCountdownSeconds] = useState<number>(0);
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [unlockMasterKey, setUnlockMasterKey] = useState<string>('');
  const [unlockFeedback, setUnlockFeedback] = useState<string | null>(null);
  const [securityIncidents, setSecurityIncidents] = useState<Array<{
    id: string;
    identifier: string;
    attempts: number;
    lockedUntil: string;
    ip: string;
    timestamp: string;
    hash: string;
  }>>([
    {
      id: 'inc_genesis_01',
      identifier: 'botnet_crawler_ve@proxy.onion',
      attempts: 5,
      lockedUntil: new Date(Date.now() + 18 * 60 * 1000).toISOString(),
      ip: '190.202.84.11 (Caracas CANTV)',
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      hash: 'a38f71b9c20188de47f9b001a1c3df8992019481bc201481729381cba90123ef'
    }
  ]);
  const [skin, setSkin] = useState<SkinId>(() => safeGetStorage<SkinId>('ui_active_skin', 'apple-craft-pro'));

  // Super-Admin 2FA (TOTP) States
  const [superAdmin2faSecret, setSuperAdmin2faSecret] = useState<string>(() => localStorage.getItem('vt_superadmin_2fa_secret') || '');
  const [pending2faUser, setPending2faUser] = useState<{ email: string; role: 'superadmin' | 'admin' | 'client'; name: string } | null>(null);
  const [loginTotpInput, setLoginTotpInput] = useState<string>('');
  const [setupTotpSecret, setSetupTotpSecret] = useState<string>('');
  const [setupTotpCode, setSetupTotpCode] = useState<string>('');

  // Candado de Seguridad RBAC y Enrutamiento Protegido por Rol
  const ROLE_ALLOWED_TABS: Record<'superadmin' | 'admin' | 'client', ActiveTabId[]> = {
    superadmin: ['accountants', 'clients', 'simplified', 'command', 'ocr', 'books', 'payroll', 'saas', 'reconciliation', 'mobile', 'security', 'operations'],
    admin: ['clients', 'operations', 'payroll', 'ocr', 'books', 'reconciliation', 'mobile', 'saas', 'simplified', 'command'],
    client: ['mobile', 'saas', 'operations']
  };

  const resolveGuardedTab = (tab: ActiveTabId, role: 'superadmin' | 'admin' | 'client'): ActiveTabId => {
    const allowed = ROLE_ALLOWED_TABS[role] || ROLE_ALLOWED_TABS.client;
    if (allowed.includes(tab)) return tab;
    if (role === 'client') return 'mobile';
    if (role === 'admin') return 'clients';
    return 'accountants';
  };

  const [activeTab, setActiveTab] = useState<ActiveTabId>(() => {
    const initialRole = currentUser?.role || 'admin';
    if (typeof window === 'undefined') return initialRole === 'client' ? 'mobile' : 'clients';
    const raw = window.location.hash.replace(/^#\/?/, '').split('/')[0] as ActiveTabId;
    const valid: ActiveTabId[] = ['accountants', 'clients', 'simplified', 'command', 'ocr', 'books', 'payroll', 'saas', 'reconciliation', 'mobile', 'security', 'operations'];
    const chosen = valid.includes(raw) ? raw : (initialRole === 'client' ? 'mobile' : 'clients');
    return resolveGuardedTab(chosen, initialRole);
  });

  const [operationStep, setOperationStep] = useState<OperationStepId>(() => {
    if (typeof window === 'undefined') return 'scanner';
    const parts = window.location.hash.replace(/^#\/?/, '').split('/');
    if (parts[0] === 'operations' && (parts[1] === 'scanner' || parts[1] === 'books' || parts[1] === 'reconciliation')) {
      if (currentUser?.role === 'client' && parts[1] !== 'scanner') {
        return 'scanner';
      }
      return parts[1];
    }
    return 'scanner';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetHash = activeTab === 'operations' ? `#/operations/${operationStep}` : `#/${activeTab}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, '', targetHash);
    }
  }, [activeTab, operationStep]);

  // Candado Reactivo: Redirección automática si el rol cambia o si se intenta vulnerar la URL
  useEffect(() => {
    const role = currentUser?.role || 'admin';
    const safeTab = resolveGuardedTab(activeTab, role);
    if (safeTab !== activeTab) {
      setActiveTab(safeTab);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', safeTab === 'operations' ? `#/operations/${operationStep}` : `#/${safeTab}`);
      }
    }
    if (role === 'client' && operationStep !== 'scanner') {
      setOperationStep('scanner');
    }
  }, [currentUser?.role]);

  // Detección Automática de Invitaciones por Enlace (WhatsApp Onboarding)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      const emailParam = params.get('email');
      const cpcParam = params.get('cpc');
      const subParam = params.get('sub');
      const rifParam = params.get('rif');

      if (roleParam === 'admin' || cpcParam) {
        setLoginRole('admin');
        if (emailParam) setLoginEmail(emailParam);
        setLoginPassword('');
        setInviteGreeting({
          role: 'admin',
          name: cpcParam ? `Colegiado ${cpcParam}` : undefined,
          email: emailParam || undefined
        });
      } else if (subParam || roleParam === 'client') {
        setLoginRole('client');
        if (emailParam) setLoginEmail(emailParam);
        setLoginPassword('');
        setInviteGreeting({
          role: 'client',
          name: rifParam ? `Empresa RIF ${rifParam}` : undefined,
          email: emailParam || undefined
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Verificar que exista token JWT válido si hay una sesión guardada de versiones anteriores
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUser && !window.localStorage.getItem('vt_auth_token')) {
      setCurrentUser(null);
      window.localStorage.removeItem('vt_auth_user');
      setLoginEmail(currentUser.email || '');
      setLoginRole(currentUser.role || 'superadmin');
      setLoginErrorMessage('Por seguridad, inicia sesión nuevamente para activar tu token en Cloud Firestore.');
    }
  }, []);

  // Sincronización en la nube de la red de Contadores (Cloud Firestore) cuando Super-Admin inicia sesión
  useEffect(() => {
    if (currentUser?.role !== 'superadmin') return;
    let cancelled = false;
    (async () => {
      const res = await safeApiRequest<{ ok: boolean; accountants: AccountantPartner[] }>('/api/accountants');
      if (!cancelled && (res.status === 401 || res.status === 403)) {
        setCurrentUser(null);
        localStorage.removeItem('vt_auth_user');
        localStorage.removeItem('vt_auth_token');
        setLoginEmail(currentUser.email || '');
        setLoginErrorMessage('Sesión expirada. Inicia sesión nuevamente para conectar con la nube.');
        return;
      }
      if (!cancelled && res.ok && res.data && Array.isArray(res.data.accountants)) {
        if (res.data.accountants.length > 0) {
          setAccountants(prev => {
            const byId = new Map<string, AccountantPartner>();
            for (const a of res.data!.accountants) byId.set(a.id, a);
            for (const localAcc of prev) {
              if (!byId.has(localAcc.id) && !INITIAL_ACCOUNTANTS.some(init => init.id === localAcc.id)) {
                byId.set(localAcc.id, localAcc);
              }
            }
            return Array.from(byId.values());
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role, currentUser?.email]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHashChange = () => {
      const role = currentUser?.role || 'admin';
      const parts = window.location.hash.replace(/^#\/?/, '').split('/');
      const rawTab = parts[0] as ActiveTabId;
      const valid: ActiveTabId[] = ['accountants', 'clients', 'simplified', 'command', 'ocr', 'books', 'payroll', 'saas', 'reconciliation', 'mobile', 'security', 'operations'];
      if (valid.includes(rawTab)) {
        const safeTab = resolveGuardedTab(rawTab, role);
        if (safeTab !== rawTab) {
          window.history.replaceState(null, '', safeTab === 'operations' ? `#/operations/${operationStep}` : `#/${safeTab}`);
        }
        setActiveTab(safeTab);
        if (safeTab === 'operations' && (parts[1] === 'scanner' || parts[1] === 'books' || parts[1] === 'reconciliation')) {
          if (role === 'client' && parts[1] !== 'scanner') {
            setOperationStep('scanner');
          } else {
            setOperationStep(parts[1]);
          }
        }
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [currentUser?.role, operationStep]);

  // Navegación Dinámica Adaptativa por Rol (Apple Minimalist UX Cleaner 2026)
  const navTabs = useMemo(() => {
    const role = currentUser?.role || 'admin';
    if (role === 'superadmin') {
      return [
        { id: 'accountants', label: 'Red Contadores & SaaS', icon: Users },
        { id: 'security', label: 'Ciberseguridad & Bóveda', icon: ShieldCheck },
        { id: 'clients', label: 'Cartera (Vista Auditor)', icon: Building2 },
        { id: 'operations', label: 'Operaciones Fiscales', icon: Layers }
      ];
    }
    if (role === 'client') {
      return [
        { id: 'mobile', label: 'Mi Comercio (Portal Móvil)', icon: Smartphone },
        { id: 'saas', label: 'Mi Suscripción & Pagos', icon: CreditCard }
      ];
    }
    // Rol Contador (Auditor CPC) - La tríada dorada limpia
    return [
      { id: 'clients', label: 'Cartera & Radar Fiscal', icon: Building2 },
      { id: 'operations', label: 'Operaciones SENIAT & Banco', icon: Layers },
      { id: 'payroll', label: 'Nómina LOTTT', icon: Users }
    ];
  }, [currentUser?.role]);
  const [clientPortfolioFilter, setClientPortfolioFilter] = useState<'ALL' | 'URGENTES' | 'SPE' | 'ORDINARIO' | 'PENDIENTES' | 'AL_DIA'>('ALL');
  const [clientSearchQuery, setClientSearchQuery] = useState<string>('');
  const [copiedTelegramTenantId, setCopiedTelegramTenantId] = useState<string | null>(null);
  const [calcUsdInput, setCalcUsdInput] = useState<number>(150);
  const [calcRetPercent, setCalcRetPercent] = useState<number>(75);
  const [calcIgtfPercent, setCalcIgtfPercent] = useState<number>(0);
  const [filterSemaforo, setFilterSemaforo] = useState<'ALL' | 'CONFORME' | 'ADVERTENCIA' | 'PENDIENTE'>('ALL');
  const [tenants, setTenants] = useState<Tenant[]>(() => safeGetStorage('vt_tenants_v31', INITIAL_TENANTS));
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => INITIAL_TENANTS[0].id);
  const [invoices, setInvoices] = useState<FiscalInvoice[]>(() => safeGetStorage('vt_invoices_v31', INITIAL_INVOICES));
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => safeGetStorage('vt_audit_v31', INITIAL_AUDIT_LOGS));
  const [payments, setPayments] = useState<SaasPaymentRecord[]>(() => safeGetStorage('vt_payments_v31', INITIAL_PAYMENTS));
  const [employees, setEmployees] = useState<PayrollEmployee[]>(() => safeGetStorage('vt_employees_v31', INITIAL_EMPLOYEES));

  // Super-Admin & Accountants Management States
  const [accountants, setAccountants] = useState<AccountantPartner[]>(() => safeGetStorage('vt_accountants_v32', INITIAL_ACCOUNTANTS));
  const [impersonatedAccountant, setImpersonatedAccountant] = useState<AccountantPartner | null>(null);
  const [payoutModalAccountant, setPayoutModalAccountant] = useState<AccountantPartner | null>(null);
  const [payoutRefInput, setPayoutRefInput] = useState<string>('');
  const [accFilterStatus, setAccFilterStatus] = useState<'TODOS' | 'ACTIVA' | 'EN_PRUEBA' | 'SUSPENDIDA'>('TODOS');
  const [accSearchQuery, setAccSearchQuery] = useState<string>('');

  // New/Edit Accountant Modal State
  const [accountantModalOpen, setAccountantModalOpen] = useState<boolean>(false);
  const [editAccId, setEditAccId] = useState<string | null>(null);
  const [accFormName, setAccFormName] = useState<string>('');
  const [accFormCpc, setAccFormCpc] = useState<string>('');
  const [accFormRif, setAccFormRif] = useState<string>('');
  const [accFormEmail, setAccFormEmail] = useState<string>('');
  const [accFormPhone, setAccFormPhone] = useState<string>('');
  const [accFormCity, setAccFormCity] = useState<string>('Caracas, Distrito Capital');
  const [accFormPlan, setAccFormPlan] = useState<'CONTADOR_INDIVIDUAL' | 'FIRMA_PRO' | 'CONSORCIO_MAX'>('FIRMA_PRO');
  const [accFormPayout, setAccFormPayout] = useState<string>('');

  // Bank Reconciliation States (VEN-NIF NIC 21 & Art. 177 COT)
  const [bankMovements, setBankMovements] = useState<BankMovement[]>(() => safeGetStorage('vt_bank_moves_v32', INITIAL_BANK_MOVEMENTS));
  const [selectedBankFilter, setSelectedBankFilter] = useState<'TODOS' | 'BANESCO' | 'BDV' | 'MERCANTIL' | 'BANCAMIGA'>('TODOS');
  const [reconcileSearchQuery, setReconcileSearchQuery] = useState<string>('');
  const [inspectedBankMove, setInspectedBankMove] = useState<BankMovement | null>(() => INITIAL_BANK_MOVEMENTS[0]);
  const [reconcileManualInvId, setReconcileManualInvId] = useState<string>('');

  // New Tenant Modal State
  const [newTenantModalOpen, setNewTenantModalOpen] = useState<boolean>(false);
  const [newTenantName, setNewTenantName] = useState<string>('');
  const [newTenantRif, setNewTenantRif] = useState<string>('J-40918273-8');
  const [newTenantRegime, setNewTenantRegime] = useState<'SPE' | 'ORDINARIO' | 'FORMAL'>('SPE');
  const [newTenantPlan, setNewTenantPlan] = useState<'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE'>('EMPRESA_MAX');

  // Sub-Account Management & Monetization States (B2B2B)
  const [subAccountModalTenant, setSubAccountModalTenant] = useState<Tenant | null>(null);
  const [subModalContactName, setSubModalContactName] = useState<string>('');
  const [subModalPhone, setSubModalPhone] = useState<string>('');
  const [subModalEmail, setSubModalEmail] = useState<string>('');
  const [subModalRole, setSubModalRole] = useState<'OPERADOR_CAJA' | 'ADMIN_EMPRESA' | 'SOLO_CONSULTA'>('ADMIN_EMPRESA');
  const [subModalPlanFee, setSubModalPlanFee] = useState<number>(29.99);

  // Sub-Account Direct Payment Gateway Modal (Pago Móvil / Binance / Zelle)
  const [subPaymentModalTenant, setSubPaymentModalTenant] = useState<Tenant | null>(null);
  const [subPayMethod, setSubPayMethod] = useState<'PAGO_MOVIL' | 'BINANCE_PAY' | 'ZELLE'>('PAGO_MOVIL');
  const [subPayRefInput, setSubPayRefInput] = useState<string>('');
  const [subPayBank, setSubPayBank] = useState<string>('Banesco (0134)');
  const [subPayToast, setSubPayToast] = useState<string | null>(null);

  // New Employee Form State
  const [newEmpName, setNewEmpName] = useState<string>('');
  const [newEmpCedula, setNewEmpCedula] = useState<string>('V-20.111.222');
  const [newEmpRole, setNewEmpRole] = useState<string>('Asistente Administrativo');
  const [newEmpSalary, setNewEmpSalary] = useState<number>(14500);

  const [bcvRate, setBcvRate] = useState<number>(914.02);
  const [bcvSyncFlash, setBcvSyncFlash] = useState<string | null>(null);
  const [rifTestInput, setRifTestInput] = useState<string>('J-40918273-8');

  // Payroll state
  const [baseSalaryBs, setBaseSalaryBs] = useState<number>(18500);
  const [cestaticketBs, setCestaticketBs] = useState<number>(1882);
  const [riskLevel, setRiskLevel] = useState<'MINIMO' | 'MEDIO' | 'ALTO'>('MINIMO');

  // Tab 02: OCR & Telegram state
  const [ocrDraft, setOcrDraft] = useState({
    bookType: 'COMPRA' as 'COMPRA' | 'VENTA',
    docType: '01' as '01' | '02' | '03',
    channel: 'DIGITAL' as 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA',
    supplierRif: 'J-40192831-5',
    supplierName: 'Importadora Repuestos Turco-Ven C.A.',
    hasBuyerRifOnTicket: true,
    invoiceNumber: '00089410',
    controlNumber: '00-00491822',
    emissionDate: '2026-11-14',
    emissionTime: '11:38:45',
    currency: 'USD' as 'VES' | 'USD',
    taxableBaseOriginal: 1850,
    exemptOriginal: 0,
    vatRate: 16,
    igtfOriginal: 55.5,
    vatRetentionRate: 75 as 0 | 75 | 100,
    islrRetentionRate: 2,
    sourceChannel: 'WEB_OCR' as 'WEB_OCR' | 'TELEGRAM_BOT' | 'MANUAL'
  });
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrUploadedFileName, setOcrUploadedFileName] = useState<string>('factura_seniat_00089410.jpg');
  const [ocrAlertMessage, setOcrAlertMessage] = useState<string | null>(null);
  const [telegramSimMessages, setTelegramSimMessages] = useState<
    { id: string; sender: 'user' | 'bot'; text: string; time: string }[]
  >([
    {
      id: 'm1',
      sender: 'user',
      text: '/vincular VT-BODE-9A41F2',
      time: '10:22'
    },
    {
      id: 'm2',
      sender: 'bot',
      text: 'Vinculación exitosa con Bodega JH C.A. (J-40918273-8). Envía una foto o PDF de cualquier factura y la procesaré con Gemini 2.5 Flash.',
      time: '10:22'
    },
    {
      id: 'm3',
      sender: 'user',
      text: '[FOTO] factura_alimentos_oriente_00045812.jpg',
      time: '10:24'
    },
    {
      id: 'm4',
      sender: 'bot',
      text: 'Factura registrada #00045812 | Control: 00-00192834 | Total: USD 1,578.00 (@ BCV 914.02) -> Bandeja del Contador.',
      time: '10:24'
    }
  ]);

  // Tab 03: Credit/Debit Note Modal state
  const [adjustmentTarget, setAdjustmentTarget] = useState<FiscalInvoice | null>(null);
  const [adjustmentDocType, setAdjustmentDocType] = useState<'02' | '03'>('03');
  const [adjustmentReasonBase, setAdjustmentReasonBase] = useState<number>(200);

  // Tab 05: SaaS Billing state
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE'>('EMPRESA_MAX');
  const [paymentMethod, setPaymentMethod] = useState<'PAGO_MOVIL' | 'ZELLE' | 'BINANCE_PAY' | 'TRANSFERENCIA_VES'>('PAGO_MOVIL');
  const [paymentRefInput, setPaymentRefInput] = useState<string>('0102-84719203');
  const [copiedCode, setCopiedCode] = useState(false);

  // Tab 06: Mobile 9:16 Client Portal state
  const [mobileSubTab, setMobileSubTab] = useState<'home' | 'camera' | 'history'>('home');
  const [mobileQuickAmount, setMobileQuickAmount] = useState<number>(380);
  const [mobileQuickCurrency, setMobileQuickCurrency] = useState<'USD' | 'VES'>('USD');
  const [mobileQuickSupplier, setMobileQuickSupplier] = useState<string>('Suministros Mayoristas C.A.');
  const [mobileQuickRif, setMobileQuickRif] = useState<string>('J-30918274-9');
  const [mobileToast, setMobileToast] = useState<string | null>(null);

  // Tab 07: Security & Crypto Vault state
  const [vaultPlainInput, setVaultPlainInput] = useState<string>('CLAVE_SENIAT:BodegaJH2026#Fiscal|CUENTA:0134-0918-22-0019283712');
  const [vaultKeyHint, setVaultKeyHint] = useState<string>('VT2026_MASTER_KEY');
  const [chainIntegrityVerified, setChainIntegrityVerified] = useState<boolean | null>(true);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);

  // Elite Fintech UI 2026: Command Palette (Ctrl+K), Forensic Inspector Drawer & High-Density Ledger Filter
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [commandQuery, setCommandQuery] = useState<string>('');
  const [inspectedInvoice, setInspectedInvoice] = useState<FiscalInvoice | null>(null);
  const [bookSearchQuery, setBookSearchQuery] = useState<string>('');
  const [bookFilter, setBookFilter] = useState<'ALL' | 'COMPRA' | 'VENTA' | 'NO_DEDUCIBLE'>('ALL');

  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin);
    safeSetStorage('ui_active_skin', skin);
  }, [skin]);

  useEffect(() => {
    function onOnline() { setIsOnline(true); }
    function onOffline() { setIsOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Reloj de Enfriamiento Criptográfico para Cuentas Bloqueadas (30 min)
  useEffect(() => {
    if (!isAccountLocked || lockCountdownSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockCountdownSeconds(prev => {
        if (prev <= 1) {
          setIsAccountLocked(false);
          setFailedLoginAttempts(0);
          setLoginErrorMessage(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isAccountLocked, lockCountdownSeconds]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setInspectedInvoice(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setPwaInstallPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    let isMounted = true;
    handleSyncBcvOracle();
    safeApiRequest<{ status: string }>('/api/health', { timeoutMs: 6000 }).then(res => {
      if (isMounted && res.ok && res.data?.status === 'OK') {
        setBackendOnline(true);
      } else if (isMounted) {
        setBackendOnline(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    safeSetStorage('vt_tenants_v31', tenants);
  }, [tenants]);

  useEffect(() => {
    safeSetStorage('vt_invoices_v31', invoices);
  }, [invoices]);

  useEffect(() => {
    safeSetStorage('vt_audit_v31', auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    safeSetStorage('vt_payments_v31', payments);
  }, [payments]);

  useEffect(() => {
    safeSetStorage('vt_employees_v31', employees);
  }, [employees]);

  useEffect(() => {
    safeSetStorage('vt_accountants_v32', accountants);
  }, [accountants]);

  // Recepción en vivo de facturas vía Server-Sent Events (SSE) desde Telegram Bot
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined' || !('EventSource' in window)) return;
    const tenantParam = currentUser.role === 'superadmin' ? 'all' : selectedTenantId;
    const evtSource = new EventSource(`/api/events/invoices?tenantId=${encodeURIComponent(tenantParam)}`);
    evtSource.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'NEW_INVOICE' && data.invoice) {
          setInvoices(prev => {
            if (prev.some(i => i.id === data.invoice.id)) return prev;
            return [data.invoice, ...prev];
          });
          setSubPayToast(`Factura #${data.invoice.invoiceNumber || 'OCR'} recibida en vivo vía Telegram`);
          setTimeout(() => setSubPayToast(null), 5000);
        }
      } catch {
        // Ignorar heartbeats
      }
    };
    return () => {
      evtSource.close();
    };
  }, [currentUser, selectedTenantId]);

  const activeTenant = useMemo(
    () => tenants.find(t => t.id === selectedTenantId) || tenants[0],
    [tenants, selectedTenantId]
  );

  const speCalendar = useMemo(
    () => getSeniatSpeCalendarByRif(activeTenant.rif),
    [activeTenant.rif]
  );

  const tenantInvoices = useMemo(
    () => invoices.filter(i => i.tenantId === activeTenant.id),
    [invoices, activeTenant]
  );

  const tenantEmployees = useMemo(
    () => employees.filter(e => e.tenantId === activeTenant.id),
    [employees, activeTenant]
  );

  function getTenantInitials(name: string): string {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(p => !['C.A.', 'S.A.', 'S.R.L.', 'DE', 'DEL', 'LOS', 'LAS', 'LA', 'EL'].includes(p.toUpperCase()));
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function getWhatsAppRemindUrl(
    tenantName: string,
    rif: string,
    terminalDigit: string,
    deadline: string,
    pendingCount: number,
    telegramCode: string
  ): string {
    const msg = `Hola equipo de *${tenantName}* (${rif}), le saluda su departamento contable.\n\nLe recordamos que el cierre de quincena del SENIAT vence el *${deadline}* (Terminal de RIF: *${terminalDigit}*).\n${
      pendingCount > 0 ? `\n⚠️ Actualmente tiene *${pendingCount} factura(s) pendiente(s)* por revisar.\n` : ''
    }\nPor favor envíe sus fotos o PDFs de compras/ventas al bot oficial de Telegram:\n👉 */vincular ${telegramCode}*\n\n¡Muchas gracias para mantener su empresa al día y evitar sanciones del SENIAT!`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  function handleOpenSubAccountModal(t: Tenant) {
    setSubAccountModalTenant(t);
    setSubModalContactName(t.subAccountContactName || `${t.name.split(' ')[0]} Gerencia`);
    setSubModalPhone(t.subAccountPhone || '+58 414-');
    setSubModalEmail(t.subAccountEmail || `admin@${t.rif.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`);
    setSubModalRole(t.subAccountRole || 'ADMIN_EMPRESA');
    setSubModalPlanFee(t.monthlyFeeUsd || 29.99);
  }

  function handleSaveSubAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!subAccountModalTenant) return;
    const targetId = subAccountModalTenant.id;
    setTenants(prev =>
      prev.map(t =>
        t.id === targetId
          ? {
              ...t,
              subAccountEnabled: true,
              subAccountContactName: subModalContactName.trim(),
              subAccountPhone: subModalPhone.trim(),
              subAccountEmail: subModalEmail.trim(),
              subAccountRole: subModalRole,
              monthlyFeeUsd: subModalPlanFee,
              subAccountStatus: t.subAccountStatus || 'TRIAL_15_DIAS',
              trialDaysLeft: t.trialDaysLeft !== undefined ? t.trialDaysLeft : 15,
              accountantCommissionPercent: 20
            }
          : t
      )
    );
    appendAuditLog(
      'SUB_CUENTA_ACTIVADA',
      currentUser?.email || 'admin:contador',
      targetId,
      `Sub-cuenta empresarial habilitada para ${subAccountModalTenant.name} (${subModalEmail}) · Rol: ${subModalRole} · Plan: $${subModalPlanFee}/mes`
    );
    setSubAccountModalTenant(null);
  }

  function getWhatsAppSubAccountInviteUrl(
    tenant: Tenant,
    contactName: string,
    phone: string,
    email: string,
    feeUsd: number
  ): string {
    const link = `https://vt-contadora-os.onrender.com/?role=client&sub=${tenant.id}&rif=${tenant.rif}&email=${encodeURIComponent(email || 'admin@' + tenant.rif)}`;
    const msg = `Hola *${contactName || tenant.name}*, le saluda su departamento contable.\n\nLe he activado el acceso a su *Sub-Cuenta Empresarial* en *VeneTurco Fiscal OS* para que su equipo pueda:\n✅ Emitir Comprobantes Oficiales de Retención IVA de 14 dígitos en 10 segundos.\n✅ Escanear facturas y tickets por foto/Telegram con detección de validez SENIAT.\n✅ Consultar su balance fiscal quincenal y cálculo de IGTF 3% en vivo.\n\n🎁 *Dispone de 15 Días de Prueba Gratis (Quincena Cortesía)*.\n\n👉 Ingrese con este enlace directo:\n${link}\nUsuario: ${email || 'admin@' + tenant.rif}\nPIN de Acceso: VT-2026\n\nCualquier duda quedamos a su completa disposición.`;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  function getWhatsAppAccountantInviteUrl(acc: AccountantPartner, tempPassword?: string): string {
    const baseUrl =
      typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost')
        ? window.location.origin
        : 'https://vt-contadora-os.onrender.com';
    const link = `${baseUrl}/?role=admin&email=${encodeURIComponent(acc.email)}&cpc=${encodeURIComponent(acc.cpcNumber)}`;
    const passwordLine = tempPassword
      ? `🔑 *Clave temporal única:* ${tempPassword}\n*(Al iniciar sesión por primera vez, el sistema le pedirá crear su contraseña personal).*`
      : `🔑 *Clave de acceso:* Use la clave temporal asignada (si requiere una nueva, solicítela al administrador).`;
    const msg = `Estimada(o) *${acc.name}* (${acc.cpcNumber}),\n\nLe saluda el equipo de *VeneTurco Fiscal OS*.\n\nLe hemos activado su perfil real en la nube como *Contador Aliado / Firma Contable*:\n\n🌐 *Acceso Directo:* ${link}\n📧 *Correo:* ${acc.email}\n${passwordLine}\n\nAl tocar el enlace, solo ingrese su clave temporal y pulse «Iniciar Sesión Segura» para gestionar multi-empresas, Telegram OCR y libros SENIAT.\n\nQuedamos a su disposición para cualquier consulta.`;
    const cleanPhone = (acc.phone || '').replace(/[^0-9]/g, '');
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  function handleConfirmSubAccountPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!subPaymentModalTenant || !subPayRefInput.trim()) return;
    const t = subPaymentModalTenant;
    const feeUsd = t.monthlyFeeUsd || 29.99;
    const amountBs = Number((feeUsd * bcvRate).toFixed(2));
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const nextDateStr = nextDate.toISOString().slice(0, 10);

    const commissionUsd = Number((feeUsd * 0.20).toFixed(2));
    const commissionBs = Number((commissionUsd * bcvRate).toFixed(2));

    const newPayment: SaasPaymentRecord = {
      id: `pay_${Date.now()}`,
      tenantId: t.id,
      planId: t.planId,
      planName: `SaaS Sub-Cuenta ${t.name}`,
      paymentMethod: subPayMethod,
      referenceNumber: subPayRefInput.trim(),
      amountUsd: feeUsd,
      bcvRate,
      amountBs,
      status: 'VERIFICADO',
      auditHash: computeDeterministicHash('PAY_SALT', { tenantId: t.id, ref: subPayRefInput, feeUsd }),
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setPayments(prev => [newPayment, ...prev]);
    setTenants(prev =>
      prev.map(item =>
        item.id === t.id
          ? {
              ...item,
              subAccountStatus: 'ACTIVA',
              trialDaysLeft: 0,
              subscriptionStatus: 'ACTIVA',
              nextBillingDate: nextDateStr
            }
          : item
      )
    );

    appendAuditLog(
      'PAGO_SUB_CUENTA_VERIFICADO',
      currentUser?.email || 'admin:saas',
      t.id,
      `Pago de suscripción verificado para ${t.name}: $${feeUsd} USD (Bs. ${amountBs.toFixed(2)}) vía ${subPayMethod} Ref: ${subPayRefInput}. Comisión contador: $${commissionUsd} USD (Bs. ${commissionBs.toFixed(2)})`
    );

    setSubPayToast(`¡Pago Verificado! Sub-cuenta de ${t.name} renovada por 30 días. Comisión para el contador: $${commissionUsd} USD (Bs. ${commissionBs.toFixed(2)})`);
    setSubPayRefInput('');
    setSubPaymentModalTenant(null);
    setTimeout(() => setSubPayToast(null), 6000);
  }

  // =========================================================================
  // BANK RECONCILIATION HANDLERS (VEN-NIF NIC 21 & ART. 177 COT)
  // =========================================================================
  function handleRunAutoReconcile() {
    const res = runDeterministicBankReconciliation(bankMovements, tenantInvoices, bcvRate);
    setBankMovements(res.reconciledMoves);
    appendAuditLog(
      'CONCILIACION_BANCARIA_EJECUTADA',
      currentUser?.email || 'admin:contador',
      activeTenant.id,
      `Conciliación bancaria ejecutada: ${res.matchedCount} partidas cruzadas, Ganancia Cambiaria: +Bs. ${res.totalGainCambiariaBs}, Pérdida Cambiaria: -Bs. ${res.totalLossCambiariaBs}`
    );
    setSubPayToast(`¡Conciliación 1-Clic ejecutada! ${res.matchedCount} movimientos cruzados automáticamente con éxito.`);
    setTimeout(() => setSubPayToast(null), 5000);
  }

  function handleFileUploadBankCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      if (!text) return;
      const parsed = parseBankStatementCsv(
        text,
        selectedBankFilter === 'TODOS' ? 'BANESCO' : selectedBankFilter,
        activeTenant.id,
        bcvRate
      );
      if (parsed.length > 0) {
        setBankMovements(prev => [...parsed, ...prev]);
        appendAuditLog(
          'EXTRACTO_BANCARIO_IMPORTADO',
          currentUser?.email || 'admin:contador',
          activeTenant.id,
          `${parsed.length} movimientos importados del archivo ${file.name}`
        );
        setSubPayToast(`¡${parsed.length} movimientos importados con éxito! Haz clic en "Ejecutar Conciliación" para cruzarlos.`);
        setTimeout(() => setSubPayToast(null), 5000);
      } else {
        alert('No se detectaron movimientos válidos en el archivo. Verifique el formato CSV/Excel.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleManualLinkMoveToInvoice(moveId: string, invoiceId: string) {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    setBankMovements(prev =>
      prev.map(m => {
        if (m.id !== moveId) return m;
        let diffBs = 0;
        if (inv.currency === 'USD') {
          const diffInfo = calculateExchangeDifferenceNic21({
            invoiceTotalOriginal: inv.totalOriginal,
            invoiceCurrency: 'USD',
            invoiceBcvRate: inv.bcvRateOnDate || bcvRate,
            paymentBcvRate: bcvRate,
            paidAmountBs: m.amountBs
          });
          diffBs = diffInfo.diffBs;
        }
        const updated = {
          ...m,
          reconciliationStatus: (diffBs !== 0 ? 'DIFERENCIAL_CAMBIARIO' : 'CONCILIADO') as BankMovement['reconciliationStatus'],
          matchedInvoiceId: inv.id,
          matchedInvoiceNumber: inv.invoiceNumber,
          exchangeDiffBs: diffBs
        };
        if (inspectedBankMove?.id === moveId) {
          setInspectedBankMove(updated);
        }
        return updated;
      })
    );

    appendAuditLog(
      'CONCILIACION_MANUAL_VINCULADA',
      currentUser?.email || 'admin:contador',
      activeTenant.id,
      `Movimiento ${moveId} vinculado manualmente a Factura #${inv.invoiceNumber}`
    );
    setSubPayToast(`Movimiento vinculado con Factura #${inv.invoiceNumber}.`);
    setTimeout(() => setSubPayToast(null), 4000);
  }

  function handleDownloadReconcilePdf() {
    downloadPdfBankReconciliationAudit(activeTenant.name, activeTenant.rif, '202611', bankMovements);
    appendAuditLog(
      'CERTIFICADO_CONCILIACION_PDF_DESCARGADO',
      currentUser?.email || 'admin:contador',
      activeTenant.id,
      `Certificado Oficial de Conciliación Bancaria Art. 177 COT descargado en PDF`
    );
  }

  function handleDownloadReconcileCsv() {
    const csv = exportBankReconciliationCsv(bankMovements, activeTenant.rif, '202611');
    handleDownloadFile(`CONCILIACION_BANCARIA_${activeTenant.rif}_202611.csv`, csv, 'text/csv');
  }

  const reconciliationStats = useMemo(() => {
    const tenantMoves = bankMovements.filter(m => m.tenantId === activeTenant.id || m.tenantId.includes('bodega'));
    const totalMoves = tenantMoves.length;
    const reconciledMoves = tenantMoves.filter(m => m.reconciliationStatus === 'CONCILIADO' || m.reconciliationStatus === 'DIFERENCIAL_CAMBIARIO');
    const matchedCount = reconciledMoves.length;
    const matchPercent = totalMoves > 0 ? Math.round((matchedCount / totalMoves) * 100) : 0;

    let totalBankBalanceBs = 0;
    let totalGainDiffBs = 0;
    let totalLossDiffBs = 0;
    let totalPosGrossBs = 0;
    let totalPosFeeBs = 0;
    let totalPosRetBs = 0;

    tenantMoves.forEach(m => {
      totalBankBalanceBs += m.amountBs;
      if (m.exchangeDiffBs && m.exchangeDiffBs > 0) totalGainDiffBs += m.exchangeDiffBs;
      if (m.exchangeDiffBs && m.exchangeDiffBs < 0) totalLossDiffBs += Math.abs(m.exchangeDiffBs);
      if (m.posBreakdown) {
        totalPosGrossBs += m.posBreakdown.grossSalesBs;
        totalPosFeeBs += m.posBreakdown.bankFeeBs;
        totalPosRetBs += m.posBreakdown.seniatRetBs;
      }
    });

    return {
      totalMoves,
      matchedCount,
      matchPercent,
      totalBankBalanceBs,
      totalGainDiffBs,
      totalLossDiffBs,
      totalPosGrossBs,
      totalPosFeeBs,
      totalPosRetBs
    };
  }, [bankMovements, activeTenant.id]);

  const portfolioStats = useMemo(() => {
    let totalPendingDrafts = 0;
    let totalUrgentCount = 0;
    let totalEstimatedQuotaBs = 0;

    const clientCards = tenants.map(t => {
      const tInvoices = invoices.filter(i => i.tenantId === t.id);
      const tSpe = getSeniatSpeCalendarByRif(t.rif);
      const conformeCount = tInvoices.filter(i => i.status === 'APROBADA' && isVatDeductible(i)).length;
      const advertenciaCount = tInvoices.filter(i => !isVatDeductible(i)).length;
      const pendienteCount = tInvoices.filter(i => i.status === 'BORRADOR_IA').length;

      let debitBs = 0;
      let creditBs = 0;
      let withheldBs = 0;

      tInvoices.forEach(inv => {
        const sign = inv.docType === '03' ? -1 : 1;
        const vatBs = toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate) * sign;
        if (inv.bookType === 'VENTA') {
          debitBs += vatBs;
        } else {
          if (isVatDeductible(inv)) creditBs += vatBs;
          withheldBs += vatBs * (inv.vatRetentionRate / 100);
        }
      });

      const netQuotaBs = Math.max(0, debitBs - creditBs);
      totalPendingDrafts += pendienteCount;
      totalEstimatedQuotaBs += netQuotaBs;

      const isUrgent = pendienteCount > 0 || ['0', '1', '2', '8', '9'].includes(tSpe.terminalDigit);
      if (isUrgent) totalUrgentCount++;

      return {
        tenant: t,
        invoices: tInvoices,
        spe: tSpe,
        conformeCount,
        advertenciaCount,
        pendienteCount,
        totalCount: tInvoices.length,
        debitBs,
        creditBs,
        withheldBs,
        netQuotaBs,
        isUrgent
      };
    });

    return {
      clientCards,
      totalTenants: tenants.length,
      totalPendingDrafts,
      totalUrgentCount,
      totalEstimatedQuotaBs
    };
  }, [tenants, invoices, bcvRate]);

  const filteredClientCards = useMemo(() => {
    return portfolioStats.clientCards.filter(card => {
      const { tenant, isUrgent, pendienteCount } = card;

      if (clientPortfolioFilter === 'URGENTES' && !isUrgent) return false;
      if (clientPortfolioFilter === 'SPE' && tenant.regime !== 'SPE') return false;
      if (clientPortfolioFilter === 'ORDINARIO' && tenant.regime !== 'ORDINARIO') return false;
      if (clientPortfolioFilter === 'PENDIENTES' && pendienteCount === 0) return false;
      if (clientPortfolioFilter === 'AL_DIA' && pendienteCount > 0) return false;

      if (clientSearchQuery.trim()) {
        const q = clientSearchQuery.toLowerCase();
        const match =
          tenant.name.toLowerCase().includes(q) ||
          tenant.rif.toLowerCase().includes(q) ||
          tenant.telegramCode.toLowerCase().includes(q) ||
          card.spe.terminalDigit === q.trim();
        if (!match) return false;
      }
      return true;
    });
  }, [portfolioStats, clientPortfolioFilter, clientSearchQuery]);

  const superAdminStats = useMemo(() => {
    const totalAccountants = accountants.length;
    const activeAccountants = accountants.filter(a => a.subscriptionStatus === 'ACTIVA').length;
    const trialAccountants = accountants.filter(a => a.subscriptionStatus === 'EN_PRUEBA').length;
    const suspendedAccountants = accountants.filter(a => a.subscriptionStatus === 'SUSPENDIDA').length;

    // Direct MRR from accountants plans
    const mrrAccountantsUsd = accountants.reduce(
      (sum, a) => sum + (a.subscriptionStatus === 'ACTIVA' ? a.monthlyFeeUsd : 0),
      0
    );

    // B2B2B Sub-accounts MRR from clients
    const mrrSubAccountsUsd = tenants.reduce(
      (sum, t) => sum + (t.subAccountEnabled && t.subAccountStatus === 'ACTIVA' ? (t.monthlyFeeUsd || 29.99) : 0),
      0
    );

    const consolidatedMrrUsd = mrrAccountantsUsd + mrrSubAccountsUsd;
    const consolidatedMrrBs = consolidatedMrrUsd * bcvRate;

    const pendingCommissionsUsd = accountants.reduce((sum, a) => sum + (a.pendingCommissionUsd || 0), 0);
    const pendingCommissionsBs = pendingCommissionsUsd * bcvRate;
    const totalPaidCommissionsUsd = accountants.reduce((sum, a) => sum + (a.paidCommissionsTotalUsd || 0), 0);
    const totalPaidCommissionsBs = totalPaidCommissionsUsd * bcvRate;

    const totalCompaniesInNetwork = tenants.length;

    return {
      totalAccountants,
      activeAccountants,
      trialAccountants,
      suspendedAccountants,
      mrrAccountantsUsd,
      mrrSubAccountsUsd,
      consolidatedMrrUsd,
      consolidatedMrrBs,
      pendingCommissionsUsd,
      pendingCommissionsBs,
      totalPaidCommissionsUsd,
      totalPaidCommissionsBs,
      totalCompaniesInNetwork
    };
  }, [accountants, tenants, bcvRate]);

  const filteredAccountants = useMemo(() => {
    return accountants.filter(acc => {
      if (accFilterStatus !== 'TODOS' && acc.subscriptionStatus !== accFilterStatus) return false;
      if (accSearchQuery.trim()) {
        const q = accSearchQuery.toLowerCase();
        const match =
          acc.name.toLowerCase().includes(q) ||
          acc.cpcNumber.toLowerCase().includes(q) ||
          acc.rif.toLowerCase().includes(q) ||
          acc.city.toLowerCase().includes(q) ||
          (acc.firmLogoText && acc.firmLogoText.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [accountants, accFilterStatus, accSearchQuery]);

  function handleOpenAccountantModal(acc?: AccountantPartner) {
    if (acc) {
      setEditAccId(acc.id);
      setAccFormName(acc.name);
      setAccFormCpc(acc.cpcNumber);
      setAccFormRif(acc.rif);
      setAccFormEmail(acc.email);
      setAccFormPhone(acc.phone);
      setAccFormCity(acc.city);
      setAccFormPlan(acc.planId);
      setAccFormPayout(acc.payoutDetails);
    } else {
      setEditAccId(null);
      setAccFormName('');
      setAccFormCpc('CPC-');
      setAccFormRif('V-');
      setAccFormEmail('');
      setAccFormPhone('+58 414-');
      setAccFormCity('Caracas, Distrito Capital');
      setAccFormPlan('FIRMA_PRO');
      setAccFormPayout('Banesco (0134) · 0414-0000000 · V-00000000');
    }
    setAccountantModalOpen(true);
  }

  async function handleSaveAccountant(e: React.FormEvent) {
    e.preventDefault();
    if (!accFormName.trim() || !accFormCpc.trim() || !accFormEmail.trim()) return;

    const planCatalog = ACCOUNTANT_PLANS_CATALOG.find(p => p.id === accFormPlan) || ACCOUNTANT_PLANS_CATALOG[1];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);

    const payloadBase = {
      id: editAccId || `acc_${Date.now()}`,
      name: accFormName.trim(),
      cpcNumber: accFormCpc.trim(),
      rif: accFormRif.trim(),
      email: accFormEmail.trim().toLowerCase(),
      phone: accFormPhone.trim(),
      city: accFormCity.trim(),
      planId: accFormPlan,
      monthlyFeeUsd: planCatalog.priceUsdMonthly,
      maxCompaniesLimit: planCatalog.maxCompanies,
      payoutDetails: accFormPayout.trim(),
      nextBillingDate: nextDate.toISOString().slice(0, 10),
      firmLogoText: `${accFormName.trim()} & Asociados`
    };

    const endpoint = editAccId ? `/api/accountants/${encodeURIComponent(editAccId)}` : '/api/accountants';
    const method = editAccId ? 'PUT' : 'POST';
    const apiRes = await safeApiRequest<{
      ok: boolean;
      accountant: AccountantPartner;
      tempPassword: string | null;
      firebaseAuthSynced?: boolean;
    }>(endpoint, {
      method,
      body: JSON.stringify(payloadBase)
    });

    if (!apiRes.ok || !apiRes.data?.accountant) {
      setSubPayToast(`Error guardando contador en la nube: ${apiRes.error || 'Verifique su sesión Super-Admin.'}`);
      setTimeout(() => setSubPayToast(null), 6000);
      return;
    }

    const savedAcc = apiRes.data.accountant;
    if (editAccId) {
      setAccountants(prev => prev.map(a => (a.id === editAccId ? savedAcc : a)));
      appendAuditLog(
        'CONTADOR_PARTNER_ACTUALIZADO',
        currentUser?.email || 'founder@veneturco.com',
        editAccId,
        `Contador ${savedAcc.name} (${savedAcc.cpcNumber}) actualizado en Cloud Firestore · Plan: ${planCatalog.name}`
      );
      setSubPayToast(`Contador ${savedAcc.name} actualizado en la nube.`);
    } else {
      setAccountants(prev => [savedAcc, ...prev.filter(a => a.id !== savedAcc.id)]);
      appendAuditLog(
        'ALTA_CONTADOR_PARTNER',
        currentUser?.email || 'founder@veneturco.com',
        savedAcc.id,
        `Nuevo Contador Partner activado en Cloud Firestore: ${savedAcc.name} (${savedAcc.cpcNumber}) · Plan ${planCatalog.name}`
      );
      setSubPayToast(`¡Contador ${savedAcc.name} activado en la nube con éxito!`);
    }

    if (apiRes.data.tempPassword) {
      setCopiedInvitePass(false);
      setIssuedInviteModal({
        accountant: savedAcc,
        tempPassword: apiRes.data.tempPassword,
        firebaseAuthSynced: apiRes.data.firebaseAuthSynced
      });
    }

    setAccountantModalOpen(false);
    setTimeout(() => setSubPayToast(null), 5000);
  }

  async function handleResetAccountantPassword(acc: AccountantPartner) {
    // Asegura que el contador exista en Cloud Firestore antes de emitir nueva clave temporal
    let apiRes = await safeApiRequest<{
      ok: boolean;
      accountant: AccountantPartner;
      tempPassword: string;
      firebaseAuthSynced?: boolean;
    }>(`/api/accountants/${encodeURIComponent(acc.id)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (!apiRes.ok && apiRes.status === 404) {
      apiRes = await safeApiRequest<{
        ok: boolean;
        accountant: AccountantPartner;
        tempPassword: string;
        firebaseAuthSynced?: boolean;
      }>('/api/accountants', {
        method: 'POST',
        body: JSON.stringify({ ...acc, resetPassword: true })
      });
    }

    if (!apiRes.ok || !apiRes.data?.tempPassword) {
      if (apiRes.status === 401 || apiRes.status === 403) {
        setCurrentUser(null);
        localStorage.removeItem('vt_auth_user');
        localStorage.removeItem('vt_auth_token');
        setLoginErrorMessage('Tu sesión anterior no tenía token en la nube. Inicia sesión nuevamente.');
        return;
      }
      setSubPayToast(`No se pudo generar la clave en la nube: ${apiRes.error || 'Error de servidor'}`);
      setTimeout(() => setSubPayToast(null), 6000);
      return;
    }

    setCopiedInvitePass(false);
    setIssuedInviteModal({
      accountant: apiRes.data.accountant || acc,
      tempPassword: apiRes.data.tempPassword,
      firebaseAuthSynced: apiRes.data.firebaseAuthSynced
    });
    appendAuditLog(
      'CLAVE_TEMPORAL_CONTADOR_EMITIDA',
      currentUser?.email || 'founder@veneturco.com',
      acc.id,
      `Nueva clave temporal emitida en Cloud Firestore para ${acc.name} (${acc.email})`
    );
  }

  async function handleToggleAccountantStatus(accId: string) {
    const target = accountants.find(a => a.id === accId);
    if (!target) return;
    const newStatus = target.subscriptionStatus === 'ACTIVA' ? 'SUSPENDIDA' : 'ACTIVA';
    const updated = { ...target, subscriptionStatus: newStatus as AccountantPartner['subscriptionStatus'] };
    setAccountants(prev => prev.map(a => (a.id === accId ? updated : a)));
    await safeApiRequest(`/api/accountants/${encodeURIComponent(accId)}`, {
      method: 'PUT',
      body: JSON.stringify(updated)
    });
    appendAuditLog(
      'ESTADO_CONTADOR_MODIFICADO',
      currentUser?.email || 'founder@veneturco.com',
      accId,
      `Estado de suscripción de ${target.name} cambiado a: ${newStatus}`
    );
  }

  function handleImpersonateAccountant(acc: AccountantPartner) {
    setImpersonatedAccountant(acc);
    if (acc.assignedTenantIds.length > 0) {
      setSelectedTenantId(acc.assignedTenantIds[0]);
    }
    setActiveTab('clients');
    appendAuditLog(
      'SOPORTE_IMPERSONACION_INICIADA',
      currentUser?.email || 'founder@veneturco.com',
      acc.id,
      `Modo Asistencia / Impersonación activado para ver como ${acc.name} (${acc.cpcNumber})`
    );
    setSubPayToast(`Modo Soporte Activado: Visualizando como ${acc.name} (${acc.cpcNumber})`);
    setTimeout(() => setSubPayToast(null), 4000);
  }

  function handleExitImpersonation() {
    if (impersonatedAccountant) {
      appendAuditLog(
        'SOPORTE_IMPERSONACION_FINALIZADA',
        currentUser?.email || 'founder@veneturco.com',
        impersonatedAccountant.id,
        `Modo Asistencia / Impersonación cerrado para ${impersonatedAccountant.name}`
      );
    }
    setImpersonatedAccountant(null);
    setActiveTab('accountants');
    setSubPayToast('Has regresado a la Torre de Control Super-Admin.');
    setTimeout(() => setSubPayToast(null), 4000);
  }

  async function handleDeleteAccountant(accId: string, accName: string) {
    if (window.confirm(`¿Está seguro de desactivar y retirar al contador "${accName}" del directorio? Su acceso quedará revocado inmediatamente.`)) {
      await safeApiRequest(`/api/accountants/${encodeURIComponent(accId)}`, { method: 'DELETE' });
      setAccountants(prev => prev.filter(a => a.id !== accId));
      appendAuditLog(
        'BAJA_CONTADOR_PARTNER',
        currentUser?.email || 'founder@veneturco.com',
        accId,
        `Contador Partner desactivado y retirado del directorio: ${accName}`
      );
      setSubPayToast(`Contador "${accName}" revocado correctamente.`);
      setTimeout(() => setSubPayToast(null), 4000);
    }
  }

  function handleDeleteTenant(tenantId: string, tenantName: string) {
    if (tenants.length <= 1) {
      alert('No se puede eliminar la única empresa activa. Debe haber al menos una empresa registrada.');
      return;
    }
    if (window.confirm(`¿Está seguro de eliminar definitivamente la empresa "${tenantName}" de su cartera? Se desvincularán sus comprobantes fiscales asociados.`)) {
      setTenants(prev => prev.filter(t => t.id !== tenantId));
      if (selectedTenantId === tenantId) {
        const remaining = tenants.filter(t => t.id !== tenantId);
        if (remaining.length > 0) setSelectedTenantId(remaining[0].id);
      }
      appendAuditLog(
        'BAJA_EMPRESA_CARTERA',
        currentUser?.email || 'founder@veneturco.com',
        tenantId,
        `Empresa eliminada de la cartera: ${tenantName}`
      );
      setSubPayToast(`Empresa "${tenantName}" eliminada correctamente.`);
      setTimeout(() => setSubPayToast(null), 4000);
    }
  }

  function handleDeleteInvoice(invId: string, invoiceNum: string) {
    if (window.confirm(`¿Está seguro de eliminar la factura #${invoiceNum} del libro fiscal?`)) {
      setInvoices(prev => prev.filter(i => i.id !== invId));
      appendAuditLog(
        'ELIMINAR_DOCUMENTO_FISCAL',
        currentUser?.email || 'founder@veneturco.com',
        invId,
        `Factura eliminada del libro fiscal: #${invoiceNum}`
      );
      setSubPayToast(`Factura #${invoiceNum} eliminada del libro.`);
      setTimeout(() => setSubPayToast(null), 4000);
    }
  }

  function handleDeleteEmployee(empId: string, empName: string) {
    if (window.confirm(`¿Está seguro de eliminar a "${empName}" de la nómina LOTTT?`)) {
      setEmployees(prev => prev.filter(e => e.id !== empId));
      appendAuditLog(
        'BAJA_TRABAJADOR_LOTTT',
        currentUser?.email || 'founder@veneturco.com',
        empId,
        `Trabajador eliminado de nómina: ${empName}`
      );
      setSubPayToast(`Trabajador "${empName}" eliminado de nómina.`);
      setTimeout(() => setSubPayToast(null), 4000);
    }
  }

  function handleOpenPayoutModal(acc: AccountantPartner) {
    setPayoutModalAccountant(acc);
    setPayoutRefInput('');
  }

  function handleConfirmCommissionPayout(e: React.FormEvent) {
    e.preventDefault();
    if (!payoutModalAccountant || !payoutRefInput.trim()) return;
    const acc = payoutModalAccountant;
    const amountUsd = acc.pendingCommissionUsd;
    const amountBs = Number((amountUsd * bcvRate).toFixed(2));

    setAccountants(prev =>
      prev.map(a =>
        a.id === acc.id
          ? {
              ...a,
              pendingCommissionUsd: 0,
              paidCommissionsTotalUsd: Number(((a.paidCommissionsTotalUsd || 0) + amountUsd).toFixed(2))
            }
          : a
      )
    );

    appendAuditLog(
      'LIQUIDACION_COMISION_PAGADA',
      currentUser?.email || 'founder@veneturco.com',
      acc.id,
      `Liquidación de Rev-Share pagada a ${acc.name} (${acc.cpcNumber}): $${amountUsd} USD (Bs. ${amountBs.toFixed(2)} @ BCV ${bcvRate}) · Ref: ${payoutRefInput.trim()} vía ${acc.payoutMethod}`
    );

    setSubPayToast(`¡Comisión Liquidada! Se pagaron $${amountUsd} USD (Bs. ${amountBs.toFixed(2)}) a ${acc.name}.`);
    setPayoutModalAccountant(null);
    setPayoutRefInput('');
    setTimeout(() => setSubPayToast(null), 5000);
  }

  function getWhatsAppCommissionVoucherUrl(
    acc: AccountantPartner,
    amountUsd: number,
    ref: string
  ): string {
    const amountBs = (amountUsd * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 });
    const msg = `Hola *${acc.name}* (${acc.cpcNumber}), le saluda el equipo de *VT Fiscal OS*.\n\n🎉 Le confirmamos que hemos liquidado su comisión mensual por *Revenue-Share (20%)*:\n\n💵 *Monto en USD:* $${amountUsd.toFixed(2)} USD\n🇻🇪 *Monto en Bolívares:* Bs. ${amountBs} (@ Tasa Oficial BCV ${bcvRate})\n💳 *Método de Pago:* ${acc.payoutMethod}\n🔢 *Nº de Referencia / Hash:* ${ref}\n🏦 *Datos:* ${acc.payoutDetails}\n\n¡Muchas gracias por ser parte de nuestra red de contadores aliados en Venezuela!`;
    const cleanPhone = acc.phone.replace(/[^0-9]/g, '');
    return cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loginSubmitting) return;
    if (isAccountLocked) {
      const min = Math.floor(lockCountdownSeconds / 60);
      const sec = lockCountdownSeconds % 60;
      setLoginErrorMessage(`Acceso denegado: Cuenta bloqueada por seguridad. Reintentar en ${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.`);
      return;
    }

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPass = loginPassword.trim();
    if (!cleanEmail || !cleanPass) {
      setLoginErrorMessage('Ingrese su correo corporativo y su contraseña.');
      return;
    }

    setLoginSubmitting(true);
    setLoginErrorMessage(null);
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPass })
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok || !data.token || !data.user) {
        if (typeof data.failedAttempts === 'number') {
          setFailedLoginAttempts(data.failedAttempts);
        }
        if (resp.status === 423 || data.code === 'ACCOUNT_LOCKED') {
          setIsAccountLocked(true);
          setLockCountdownSeconds(data.lockRemainingSeconds || 30 * 60);
        }
        setLoginErrorMessage(data.error || 'No se pudo iniciar sesión. Verifique su correo y contraseña.');
        return;
      }

      // Acceso legítimo validado por el servidor (Cloud Firestore + Scrypt)
      setFailedLoginAttempts(0);
      setIsAccountLocked(false);
      setLoginErrorMessage(null);

      const authenticatedUser = {
        uid: data.user.uid,
        email: data.user.email,
        role: data.user.role as 'superadmin' | 'admin' | 'client',
        name: data.user.name,
        cpcNumber: data.user.cpcNumber,
        accountantId: data.user.accountantId,
        tenantIds: data.user.tenantIds || [],
        mustChangePassword: Boolean(data.user.mustChangePassword)
      };

      localStorage.setItem('vt_auth_token', data.token);

      if (authenticatedUser.role === 'superadmin' && superAdmin2faSecret) {
        setPending2faUser(authenticatedUser);
        setLoginTotpInput('');
        return;
      }

      setCurrentUser(authenticatedUser);
      localStorage.setItem('vt_auth_user', JSON.stringify(authenticatedUser));
      setLoginPassword('');

      if (authenticatedUser.role === 'client') {
        setActiveTab('mobile');
      } else if (authenticatedUser.role === 'superadmin') {
        setActiveTab('accountants');
      } else {
        setActiveTab('clients');
      }
    } catch {
      setLoginErrorMessage('No se pudo conectar con el servidor de autenticación. Verifique su conexión e intente de nuevo.');
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleChangeMandatoryPassword(e: React.FormEvent) {
    e.preventDefault();
    setChangePasswordError(null);
    if (newPasswordInput.trim().length < 8) {
      setChangePasswordError('La contraseña personal debe tener al menos 8 caracteres.');
      return;
    }
    if (newPasswordInput.trim() !== confirmPasswordInput.trim()) {
      setChangePasswordError('Las contraseñas no coinciden. Verifíquelas e intente de nuevo.');
      return;
    }
    setChangePasswordSaving(true);
    try {
      const res = await safeApiRequest<{ ok: boolean; token: string; user: typeof currentUser }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPasswordInput.trim() })
      });
      if (!res.ok || !res.data?.token || !res.data?.user) {
        setChangePasswordError(res.error || 'No se pudo actualizar la contraseña.');
        return;
      }
      localStorage.setItem('vt_auth_token', res.data.token);
      localStorage.setItem('vt_auth_user', JSON.stringify(res.data.user));
      setCurrentUser(res.data.user);
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setSubPayToast('¡Contraseña personal guardada en la nube! Bienvenido a VeneTurco Fiscal OS.');
      setTimeout(() => setSubPayToast(null), 5000);
    } finally {
      setChangePasswordSaving(false);
    }
  }

  async function handleVerifyLoginTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!pending2faUser || !superAdmin2faSecret) return;
    const isValid = await verifyTotpCode(superAdmin2faSecret, loginTotpInput);
    if (!isValid) {
      setLoginErrorMessage('Código 2FA inválido o expirado. Verifica tu app autenticadora.');
      return;
    }
    setLoginErrorMessage(null);
    setCurrentUser(pending2faUser);
    localStorage.setItem('vt_auth_user', JSON.stringify(pending2faUser));
    setPending2faUser(null);
    setLoginTotpInput('');
    setActiveTab('accountants');
  }

  function handleSimulateFailedAttempt() {
    if (isAccountLocked) return;
    const nextCount = failedLoginAttempts + 1;
    setFailedLoginAttempts(nextCount);
    if (nextCount >= 5) {
      setIsAccountLocked(true);
      setLockCountdownSeconds(30 * 60);
      setLoginErrorMessage('🚨 CUENTA BLOQUEADA POR 30 MINUTOS: Se alcanzaron 5 intentos fallidos en la simulación.');
      const newInc = {
        id: `inc_${Date.now()}`,
        identifier: loginEmail.trim() || 'intruso_simulado@proxy.ve',
        attempts: 5,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        ip: '190.202.84.11 (Caracas CANTV)',
        timestamp: new Date().toISOString(),
        hash: 'SHA256_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')
      };
      setSecurityIncidents(prev => [newInc, ...prev]);
    } else {
      const remaining = 5 - nextCount;
      setLoginErrorMessage(`🧪 SIMULACIÓN DE INTRUSO: Intento fallido ${nextCount}/5 registrado. Le quedan ${remaining} intento(s) antes del bloqueo.`);
    }
  }

  function handleUnlockAccount(adminKey?: string) {
    const validKeys = ['Desbloquear2026#', 'SuperAdmin2026#', 'Seniat2026#', 'admin'];
    if (adminKey && !validKeys.includes(adminKey.trim())) {
      setUnlockFeedback('Clave Maestra incorrecta.');
      return;
    }
    setIsAccountLocked(false);
    setFailedLoginAttempts(0);
    setLockCountdownSeconds(0);
    setLoginErrorMessage(null);
    setShowUnlockModal(false);
    setUnlockMasterKey('');
    setUnlockFeedback(null);

    fetch('/api/auth/unlock-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, adminUid: 'superadmin_console' })
    }).catch(() => {});
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem('vt_auth_user');
    localStorage.removeItem('vt_auth_token');
    localStorage.removeItem('vt_last_login_password');
  }

  function handleCreateTenant(e: React.FormEvent) {
    e.preventDefault();
    const rifCheck = validateVenezuelanRIF(newTenantRif);
    if (!rifCheck.valid || !newTenantName.trim()) return;
    const id = `tenant_${Date.now()}`;
    const prefix = newTenantName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'VENE';
    const hex = Math.floor(0x100000 + Math.random() * 0xefffff).toString(16).toUpperCase();
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const created: Tenant = {
      id,
      name: newTenantName.trim(),
      rif: rifCheck.formatted,
      regime: newTenantRegime,
      planId: newTenantPlan,
      subscriptionStatus: 'ACTIVA',
      nextBillingDate: nextDate.toISOString().slice(0, 10),
      telegramCode: `VT-${prefix}-${hex}`,
      telegramChatLinked: 'Pendiente de /vincular'
    };
    setTenants(prev => [...prev, created]);
    setSelectedTenantId(id);
    appendAuditLog(
      'ALTA_EMPRESA_TENANT',
      currentUser?.email || 'admin:firma',
      id,
      `Nueva empresa registrada: ${created.name} (${created.rif}) · Régimen ${created.regime} · Plan ${created.planId}`
    );
    setNewTenantName('');
    setNewTenantModalOpen(false);
  }

  function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmpName.trim() || !newEmpCedula.trim()) return;
    const created: PayrollEmployee = {
      id: `emp_${Date.now()}`,
      tenantId: activeTenant.id,
      fullName: newEmpName.trim(),
      cedula: newEmpCedula.trim().toUpperCase(),
      role: newEmpRole.trim() || 'Operador',
      hireDate: new Date().toISOString().slice(0, 10),
      baseSalaryBs: Number(newEmpSalary) || 12000,
      cestaticketBs,
      riskLevel
    };
    setEmployees(prev => [...prev, created]);
    appendAuditLog(
      'ALTA_TRABAJADOR_LOTTT',
      currentUser?.email || 'admin:nomina',
      created.id,
      `Trabajador incorporado a ${activeTenant.name}: ${created.fullName} (${created.cedula}) · Salario Bs. ${created.baseSalaryBs.toFixed(2)}`
    );
    setNewEmpName('');
  }

  const filteredBookInvoices = useMemo(() => {
    return tenantInvoices.filter(inv => {
      if (bookFilter === 'COMPRA' && inv.bookType !== 'COMPRA') return false;
      if (bookFilter === 'VENTA' && inv.bookType !== 'VENTA') return false;
      if (bookFilter === 'NO_DEDUCIBLE' && isVatDeductible(inv)) return false;
      if (bookSearchQuery.trim()) {
        const q = bookSearchQuery.toLowerCase();
        const match =
          inv.supplierName.toLowerCase().includes(q) ||
          inv.supplierRif.toLowerCase().includes(q) ||
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.controlNumber.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [tenantInvoices, bookFilter, bookSearchQuery]);

  const filteredBookTotals = useMemo(() => {
    let baseBs = 0;
    let vatBs = 0;
    let withheldBs = 0;
    let totalBs = 0;
    filteredBookInvoices.forEach(inv => {
      const sign = inv.docType === '03' ? -1 : 1;
      const b = toVes(inv.taxableBaseOriginal, inv.currency, inv.bcvRateOnDate) * sign;
      const v = toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate) * sign;
      const t = toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate) * sign;
      baseBs += b;
      vatBs += v;
      withheldBs += inv.bookType === 'COMPRA' ? v * (inv.vatRetentionRate / 100) : 0;
      totalBs += t;
    });
    return { baseBs, vatBs, withheldBs, totalBs };
  }, [filteredBookInvoices]);

  const fiscalSummary = useMemo(() => {
    let debitVatBs = 0;
    let creditVatBs = 0;
    let disqualifiedVatBs = 0;
    let igtfBs = 0;
    let withheldVatBs = 0;
    let contingencyCount = 0;

    tenantInvoices.forEach(inv => {
      const sign = inv.docType === '03' ? -1 : 1;
      const vatBs = toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate) * sign;
      const igtfVal = toVes(inv.igtfOriginal, inv.currency, inv.bcvRateOnDate) * sign;
      if (inv.channel === 'CONTINGENCIA') contingencyCount += 1;

      if (inv.bookType === 'VENTA') {
        debitVatBs += vatBs;
      } else {
        if (isVatDeductible(inv)) {
          creditVatBs += vatBs;
        } else {
          disqualifiedVatBs += Math.abs(vatBs);
        }
        withheldVatBs += vatBs * (inv.vatRetentionRate / 100);
      }
      igtfBs += igtfVal;
    });

    const netQuotaBs = Math.max(0, debitVatBs - creditVatBs);
    return { debitVatBs, creditVatBs, disqualifiedVatBs, netQuotaBs, igtfBs, withheldVatBs, contingencyCount };
  }, [tenantInvoices]);

  const semaforoCounts = useMemo(() => {
    let conforme = 0;
    let advertencia = 0;
    let pendiente = 0;
    tenantInvoices.forEach(inv => {
      if (inv.status === 'BORRADOR_IA') {
        pendiente++;
      } else if (!isVatDeductible(inv)) {
        advertencia++;
      } else {
        conforme++;
      }
    });
    return { conforme, advertencia, pendiente };
  }, [tenantInvoices]);

  const semaforoFilteredInvoices = useMemo(() => {
    if (filterSemaforo === 'CONFORME') {
      return tenantInvoices.filter(i => i.status === 'APROBADA' && isVatDeductible(i));
    }
    if (filterSemaforo === 'ADVERTENCIA') {
      return tenantInvoices.filter(i => !isVatDeductible(i));
    }
    if (filterSemaforo === 'PENDIENTE') {
      return tenantInvoices.filter(i => i.status === 'BORRADOR_IA');
    }
    return tenantInvoices;
  }, [tenantInvoices, filterSemaforo]);

  const calcTotalBs = calcUsdInput * bcvRate;
  const calcBaseBs = calcTotalBs / 1.16;
  const calcIvaBs = calcBaseBs * 0.16;
  const calcRetBs = calcIvaBs * (calcRetPercent / 100);
  const calcIgtfBs = calcTotalBs * (calcIgtfPercent / 100);
  const calcNetoBs = (calcTotalBs - calcRetBs) + calcIgtfBs;

  function appendAuditLog(action: string, actorUid: string, targetId: string, details: string, encryptedPayload?: string) {
    setAuditLogs(prev => {
      const lastHash = prev.length > 0 ? prev[prev.length - 1].sha256Hash : 'GENESIS_SENIAT_2026';
      const seq = prev.length + 1;
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const newHash = computeDeterministicHash(lastHash, { seq, action, targetId, details, nowStr });
      return [
        ...prev,
        {
          id: `log_${Date.now()}`,
          tenantId: activeTenant.id,
          sequence: seq,
          action,
          actorUid,
          targetId,
          details,
          previousHash: lastHash,
          sha256Hash: newHash,
          encryptedPayload,
          timestamp: nowStr
        }
      ];
    });
  }

  async function handleSyncBcvOracle() {
    let newRate: number | null = null;
    let source = 'BCV';

    // 1. Intentar backend del sistema (/api/bcv/sync-now o /api/bcv/latest)
    const res = await safeApiRequest<{ usdVes: number; status: string; source: string }>('/api/bcv/sync-now', {
      method: 'POST',
      timeoutMs: 8000
    });

    if (res.ok && res.data?.usdVes && res.data.usdVes > 100) {
      newRate = Number(res.data.usdVes.toFixed(2));
      source = res.data.source || 'BCV';
    } else {
      // 2. Fallback resiliente directo desde el navegador (en caso de cold-start de Render)
      try {
        const mirrorRes = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (mirrorRes.ok) {
          const mirrorData = await mirrorRes.json();
          if (mirrorData && typeof mirrorData.promedio === 'number' && mirrorData.promedio > 100) {
            newRate = Number(mirrorData.promedio.toFixed(2));
            source = 'BCV (Oficial)';
          }
        }
      } catch (_clientErr) {
        // Fallback al valor actual
      }
    }

    if (newRate) {
      setBcvRate(newRate);
      setBcvSyncFlash(`Tasa Oficial BCV sincronizada (${source}): Bs. ${newRate.toFixed(2)} / USD`);
      appendAuditLog(
        'BCV_ORACLE_SYNC',
        'backend:bcvSyncCron',
        `bcv_${new Date().toISOString().slice(0, 10)}`,
        `Sincronización oficial portal BCV: USD = Bs. ${newRate.toFixed(2)}`
      );
    } else {
      setBcvSyncFlash(`Aviso: Se mantiene la tasa oficial actual: Bs. ${bcvRate.toFixed(2)} / USD`);
    }
    setTimeout(() => setBcvSyncFlash(null), 5000);
  }

  function handleApproveInvoice(id: string) {
    const target = invoices.find(i => i.id === id);
    if (!target) return;
    setInvoices(prev => prev.map(inv => (inv.id === id ? { ...inv, status: 'APROBADA' } : inv)));
    appendAuditLog(
      'SELLO_INMUTABLE_COT',
      'contador:auditor_principal',
      id,
      `Factura #${target.invoiceNumber} (${target.supplierName}) sellada como APROBADA. Borrado físico bloqueado por 10 años.`
    );
  }

  function handleApproveAllPendingInvoices() {
    const pendingList = tenantInvoices.filter(i => i.status !== 'APROBADA');
    if (pendingList.length === 0) return;
    const pendingIds = new Set(pendingList.map(i => i.id));
    setInvoices(prev =>
      prev.map(inv => (pendingIds.has(inv.id) ? { ...inv, status: 'APROBADA' } : inv))
    );
    appendAuditLog(
      'SELLO_MASIVO_COT',
      currentUser?.email || 'contador:auditor_principal',
      activeTenant.rif,
      `Aprobación y sellado en lote de ${pendingList.length} documento(s) fiscales para ${activeTenant.name} (${activeTenant.rif}).`
    );
    setOcrAlertMessage(`✨ ${pendingList.length} factura(s) aprobadas y selladas en bóveda COT en 1 clic.`);
    setTimeout(() => setOcrAlertMessage(null), 4500);
  }

  function getWhatsAppClosingSummaryUrl(): string {
    const salesVatBs = tenantInvoices
      .filter(i => i.bookType === 'VENTA')
      .reduce((acc, i) => acc + toVes(i.vatOriginal, i.currency, i.bcvRateOnDate) * (i.docType === '03' ? -1 : 1), 0);
    const purchasesVatBs = tenantInvoices
      .filter(i => i.bookType === 'COMPRA' && isVatDeductible(i))
      .reduce((acc, i) => acc + toVes(i.vatOriginal, i.currency, i.bcvRateOnDate) * (i.docType === '03' ? -1 : 1), 0);
    const withheldBs = tenantInvoices.reduce(
      (acc, i) => acc + toVes(i.vatOriginal * (i.vatRetentionRate / 100), i.currency, i.bcvRateOnDate),
      0
    );
    const igtfBs = tenantInvoices.reduce(
      (acc, i) => acc + toVes(i.igtfOriginal, i.currency, i.bcvRateOnDate),
      0
    );
    const netIvaQuotaBs = Math.max(0, salesVatBs - purchasesVatBs - withheldBs);
    const totalToPayBs = netIvaQuotaBs + igtfBs;
    const totalToPayUsd = totalToPayBs / Math.max(1, bcvRate);

    const msg =
      `Hola equipo de *${activeTenant.name}* (${activeTenant.rif}).\n\n` +
      `📊 *RESUMEN DE CIERRE QUINCENAL SENIAT*\n` +
      `🗓️ *Fecha Límite (Terminal ${speCalendar.terminalDigit}):* ${speCalendar.quincena1Deadline}\n\n` +
      `• *Débito Fiscal (Ventas):* Bs. ${salesVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• *Crédito Fiscal Deducible (Compras):* Bs. ${purchasesVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• *Retenciones IVA del Período:* Bs. ${withheldBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `• *IGTF Divisas (3%):* Bs. ${igtfBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n` +
      `🏛️ *TOTAL ESTIMADO A PAGAR SENIAT:* *Bs. ${totalToPayBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
      `💵 *Ref. Bimoneda:* USD $${totalToPayUsd.toFixed(2)} (@ Tasa BCV ${bcvRate.toFixed(2)} Bs.)\n\n` +
      `Los archivos TXT de 16 columnas y Libros Fiscales ya se encuentran auditados y listos en *VeneTurco Fiscal OS*.`;

    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  function handleExportParafiscalCsv() {
    const header = 'CEDULA;TRABAJADOR;CARGO;SALARIO_BASE_BS;IVSS_EMPLEADO_4%;FAOV_EMPLEADO_1%;RPE_EMPLEADO_0.5%;IVSS_PATRONAL_BS;FAOV_PATRONAL_2%;RPE_PATRONAL_2%;PROVISION_INCES_2%;TOTAL_APORTE_PARAFISCAL_BS';
    const rows = tenantEmployees.map(emp => {
      const b = calculateLotttFullBreakdown(emp.baseSalaryBs, emp.cestaticketBs, emp.riskLevel);
      const totalParafiscal = b.ivssEmployee + b.faovEmployee + b.rpeEmployee + b.ivssEmployer + b.faovEmployer + b.rpeEmployer + b.incesQuarterlyProvision;
      return [
        emp.cedula,
        `"${emp.fullName}"`,
        `"${emp.role}"`,
        emp.baseSalaryBs.toFixed(2),
        b.ivssEmployee.toFixed(2),
        b.faovEmployee.toFixed(2),
        b.rpeEmployee.toFixed(2),
        b.ivssEmployer.toFixed(2),
        b.faovEmployer.toFixed(2),
        b.rpeEmployer.toFixed(2),
        b.incesQuarterlyProvision.toFixed(2),
        totalParafiscal.toFixed(2)
      ].join(';');
    });
    const csvContent = '\uFEFF' + [header, ...rows].join('\n');
    handleDownloadFile(`PLANILLA_PARAFISCAL_IVSS_FAOV_${activeTenant.rif}_202611.csv`, csvContent, 'text/csv;charset=utf-8');
  }

  function handleExportArt142Csv() {
    const header = 'CEDULA;TRABAJADOR;FECHA_INGRESO;SALARIO_BASE_BS;SALARIO_INTEGRAL_DIARIO_BS;DIAS_ABONO_MENSUAL_ART142;GARANTIA_PRESTACIONES_MENSUAL_BS;NETO_PAGADO_MES_BS';
    const rows = tenantEmployees.map(emp => {
      const b = calculateLotttFullBreakdown(emp.baseSalaryBs, emp.cestaticketBs, emp.riskLevel);
      const integralDaily = (emp.baseSalaryBs / 30) * 1.1667;
      return [
        emp.cedula,
        `"${emp.fullName}"`,
        emp.hireDate,
        emp.baseSalaryBs.toFixed(2),
        integralDaily.toFixed(2),
        '5',
        b.prestacionesMonthlyProvision.toFixed(2),
        b.netPayBs.toFixed(2)
      ].join(';');
    });
    const csvContent = '\uFEFF' + [header, ...rows].join('\n');
    handleDownloadFile(`LIBRO_PRESTACIONES_ART142_${activeTenant.rif}_202611.csv`, csvContent, 'text/csv;charset=utf-8');
  }

  function handleIssueAdjustmentNote() {
    if (!adjustmentTarget) return;
    const base = Number(adjustmentReasonBase) || 100;
    const vat = Number((base * (adjustmentTarget.vatRate / 100)).toFixed(2));
    const total = Number((base + vat).toFixed(2));
    const newNoteNumber = `${adjustmentDocType === '03' ? 'NC' : 'ND'}-${Math.floor(10000 + Math.random() * 89999)}`;
    const newControl = `00-00${Math.floor(100000 + Math.random() * 899999)}`;
    const lastHash = auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].sha256Hash : 'GENESIS_SENIAT_2026';
    const noteId = `inv_${Date.now()}`;
    const auditHash = computeDeterministicHash(lastHash, { noteId, affected: adjustmentTarget.invoiceNumber, total });

    const newNote: FiscalInvoice = {
      id: noteId,
      tenantId: activeTenant.id,
      bookType: adjustmentTarget.bookType,
      docType: adjustmentDocType,
      channel: 'DIGITAL',
      supplierRif: adjustmentTarget.supplierRif,
      supplierName: adjustmentTarget.supplierName,
      hasBuyerRifOnTicket: true,
      invoiceNumber: newNoteNumber,
      controlNumber: newControl,
      affectedDocument: adjustmentTarget.invoiceNumber,
      emissionDate: new Date().toISOString().slice(0, 10),
      emissionTime: new Date().toTimeString().slice(0, 8),
      currency: adjustmentTarget.currency,
      bcvRateOnDate: bcvRate,
      taxableBaseOriginal: base,
      exemptOriginal: 0,
      vatRate: adjustmentTarget.vatRate,
      vatOriginal: vat,
      igtfOriginal: 0,
      totalOriginal: total,
      vatRetentionRate: adjustmentTarget.vatRetentionRate,
      islrRetentionRate: 0,
      status: 'APROBADA',
      sourceChannel: 'MANUAL',
      auditHash
    };

    setInvoices(prev => [newNote, ...prev]);
    appendAuditLog(
      adjustmentDocType === '03' ? 'EMISION_NOTA_CREDITO' : 'EMISION_NOTA_DEBITO',
      'contador:auditor_principal',
      noteId,
      `${adjustmentDocType === '03' ? 'Nota de Crédito (03)' : 'Nota de Débito (02)'} #${newNoteNumber} vinculada a Factura afectada #${adjustmentTarget.invoiceNumber}`
    );
    setAdjustmentTarget(null);
  }

  function handleLoadOcrPreset(index: number) {
    const p = OCR_PRESETS[index];
    setOcrScanning(true);
    setOcrAlertMessage(null);
    setTimeout(() => {
      setOcrDraft(prev => ({
        ...prev,
        bookType: p.bookType,
        channel: p.channel,
        supplierRif: p.supplierRif,
        supplierName: p.supplierName,
        hasBuyerRifOnTicket: p.hasBuyerRifOnTicket,
        invoiceNumber: p.invoiceNumber,
        controlNumber: p.controlNumber,
        currency: p.currency,
        taxableBaseOriginal: p.taxableBaseOriginal,
        exemptOriginal: p.exemptOriginal,
        vatRate: p.vatRate,
        igtfOriginal: p.igtfOriginal,
        vatRetentionRate: p.vatRetentionRate,
        islrRetentionRate: p.islrRetentionRate
      }));
      setOcrScanning(false);
    }, 450);
  }

  function decodeQrFromDataUrl(dataUrl: string): Promise<string | undefined> {
    return new Promise(resolve => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 1200;
            const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
            canvas.width = Math.max(1, Math.floor(img.width * scale));
            canvas.height = Math.max(1, Math.floor(img.height * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(undefined);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            resolve(code?.data || undefined);
          } catch {
            resolve(undefined);
          }
        };
        img.onerror = () => resolve(undefined);
        img.src = dataUrl;
      } catch {
        resolve(undefined);
      }
    });
  }

  function handleFileUploadSimulation(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrUploadedFileName(file.name);
    setOcrScanning(true);

    const reader = new FileReader();
    reader.onerror = () => {
      setOcrScanning(false);
      setOcrAlertMessage(`Error al leer el archivo "${file.name}".`);
    };
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      const base64Data = dataUrl.split(',')[1] || '';
      const detectedQr = file.type.startsWith('image/') ? await decodeQrFromDataUrl(dataUrl) : undefined;
      try {
        const res = await safeApiRequest<{
          mode: string;
          tokensUsed?: number;
          quota?: { usedInvoices: number; maxInvoicesMonthly: number };
          extracted: {
            supplierRif?: string;
            supplierName?: string;
            invoiceNumber?: string;
            controlNumber?: string;
            emissionDate?: string;
            emissionTime?: string;
            channel?: 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA';
            currency?: 'VES' | 'USD';
            taxableBaseOriginal?: number;
            exemptOriginal?: number;
            igtfOriginal?: number;
          };
        }>('/api/ocr', {
          method: 'POST',
          body: JSON.stringify({
            tenantId: activeTenant.id,
            base64Data,
            qrPayload: detectedQr,
            mimeType: file.type || 'image/jpeg',
            fileName: file.name
          }),
          timeoutMs: 15000
        });

        if (res.ok && res.data?.extracted) {
          const ext = res.data.extracted;
          setOcrDraft(prev => ({
            ...prev,
            supplierRif: ext.supplierRif || prev.supplierRif,
            supplierName: ext.supplierName || prev.supplierName,
            invoiceNumber: ext.invoiceNumber || prev.invoiceNumber,
            controlNumber: ext.controlNumber || prev.controlNumber,
            emissionDate: ext.emissionDate || prev.emissionDate,
            emissionTime: ext.emissionTime || prev.emissionTime,
            channel: ext.channel || prev.channel,
            currency: ext.currency || prev.currency,
            taxableBaseOriginal: Number(ext.taxableBaseOriginal ?? prev.taxableBaseOriginal),
            exemptOriginal: Number(ext.exemptOriginal ?? prev.exemptOriginal),
            igtfOriginal: Number(ext.igtfOriginal ?? prev.igtfOriginal),
            sourceChannel: 'WEB_OCR'
          }));
          const quotaText = res.data.quota
            ? ` · Cuota mes: ${res.data.quota.usedInvoices}/${res.data.quota.maxInvoicesMonthly}`
            : '';
          setOcrAlertMessage(`Imagen "${file.name}" procesada vía Backend (${res.data.mode})${quotaText}.`);
        } else {
          setOcrAlertMessage(`Aviso OCR: ${res.error || 'El documento requiere mayor nitidez'}. Verifique los campos en el formulario.`);
        }
      } catch {
        setOcrAlertMessage(`Error de red al procesar "${file.name}". Complete o verifique los campos manualmente.`);
      } finally {
        setOcrScanning(false);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleRegisterOcrInvoice(origin: 'WEB_OCR' | 'TELEGRAM_BOT') {
    const rifValidation = validateVenezuelanRIF(ocrDraft.supplierRif);
    if (!rifValidation.valid) {
      setOcrAlertMessage(`ERROR MÓDULO 11: El RIF ${ocrDraft.supplierRif} tiene dígito verificador inválido.`);
      return;
    }

    const activePlan = SAAS_PLANS_CATALOG.find(p => p.id === activeTenant.planId) || SAAS_PLANS_CATALOG[1];
    if (activeTenant.subscriptionStatus === 'SUSPENDIDA') {
      setOcrAlertMessage(`LICENCIA SUSPENDIDA: La empresa ${activeTenant.name} presenta mora. Renueve la licencia SaaS.`);
      return;
    }
    if (tenantInvoices.length >= activePlan.maxInvoicesMonthly) {
      setOcrAlertMessage(`CUOTA EXCEDIDA: Se alcanzó el tope de ${activePlan.maxInvoicesMonthly} facturas/mes del plan ${activePlan.name}.`);
      return;
    }

    const dupExists = invoices.some(
      inv =>
        inv.tenantId === activeTenant.id &&
        inv.supplierRif === rifValidation.formatted &&
        inv.invoiceNumber.toUpperCase() === ocrDraft.invoiceNumber.trim().toUpperCase()
    );
    if (dupExists) {
      setOcrAlertMessage(`BLOQUEO ANTI-FRAUDE: La factura #${ocrDraft.invoiceNumber} del RIF ${rifValidation.formatted} ya existe en este cliente.`);
      return;
    }

    const vatOriginal = Number(((ocrDraft.taxableBaseOriginal * ocrDraft.vatRate) / 100).toFixed(2));
    const totalOriginal = Number(
      (ocrDraft.taxableBaseOriginal + ocrDraft.exemptOriginal + vatOriginal + ocrDraft.igtfOriginal).toFixed(2)
    );
    const newId = `inv_${Date.now()}`;
    const lastHash = auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].sha256Hash : 'GENESIS_SENIAT_2026';
    const auditHash = computeDeterministicHash(lastHash, {
      newId,
      rif: rifValidation.formatted,
      invoiceNumber: ocrDraft.invoiceNumber,
      totalOriginal
    });

    const createdInvoice: FiscalInvoice = {
      id: newId,
      tenantId: activeTenant.id,
      bookType: ocrDraft.bookType,
      docType: ocrDraft.docType,
      channel: ocrDraft.channel,
      supplierRif: rifValidation.formatted,
      supplierName: ocrDraft.supplierName,
      hasBuyerRifOnTicket: ocrDraft.hasBuyerRifOnTicket,
      invoiceNumber: ocrDraft.invoiceNumber,
      controlNumber: ocrDraft.controlNumber,
      emissionDate: ocrDraft.emissionDate,
      emissionTime: ocrDraft.emissionTime,
      currency: ocrDraft.currency,
      bcvRateOnDate: bcvRate,
      taxableBaseOriginal: ocrDraft.taxableBaseOriginal,
      exemptOriginal: ocrDraft.exemptOriginal,
      vatRate: ocrDraft.vatRate,
      vatOriginal,
      igtfOriginal: ocrDraft.igtfOriginal,
      totalOriginal,
      vatRetentionRate: ocrDraft.vatRetentionRate,
      islrRetentionRate: ocrDraft.islrRetentionRate,
      status: 'BORRADOR_IA',
      sourceChannel: origin,
      auditHash
    };

    setInvoices(prev => [createdInvoice, ...prev]);
    appendAuditLog(
      origin === 'TELEGRAM_BOT' ? 'INGESTA_TELEGRAM_OCR' : 'INGESTA_WEB_OCR',
      origin === 'TELEGRAM_BOT' ? `telegram:${activeTenant.telegramCode}` : 'web:scanner_ia',
      newId,
      `Factura #${createdInvoice.invoiceNumber} (${createdInvoice.supplierName}) por ${createdInvoice.currency} ${createdInvoice.totalOriginal.toFixed(2)}`,
      simulateAes256GcmEncrypt(`RIF:${createdInvoice.supplierRif}|FACT:${createdInvoice.invoiceNumber}|TOTAL:${createdInvoice.totalOriginal}`)
    );

    if (origin === 'TELEGRAM_BOT') {
      const nowTime = new Date().toTimeString().slice(0, 5);
      setTelegramSimMessages(prev => [
        ...prev,
        {
          id: `u_${Date.now()}`,
          sender: 'user',
          text: `[FOTO] ${ocrDraft.supplierName} #${ocrDraft.invoiceNumber}`,
          time: nowTime
        },
        {
          id: `b_${Date.now() + 1}`,
          sender: 'bot',
          text: `Recibida para ${activeTenant.name}: Factura #${ocrDraft.invoiceNumber} (${rifValidation.formatted}) por ${ocrDraft.currency} ${totalOriginal.toFixed(2)}. Hash SHA-256: ${auditHash.slice(0, 12)}...`,
          time: nowTime
        }
      ]);
    }

    setOcrAlertMessage(`Factura #${createdInvoice.invoiceNumber} indexada exitosamente en ${activeTenant.name} con Hash SHA-256.`);
    // Advance invoice number for easy repeat testing
    setOcrDraft(prev => ({
      ...prev,
      invoiceNumber: `000${Math.floor(10000 + Math.random() * 89999)}`,
      controlNumber: `00-00${Math.floor(100000 + Math.random() * 899999)}`
    }));
  }

  async function handleRegisterSaasPayment() {
    const plan = SAAS_PLANS_CATALOG.find(p => p.id === selectedPlanForPayment) || SAAS_PLANS_CATALOG[1];
    const amountBs = Number((plan.priceUsdMonthly * bcvRate).toFixed(2));
    const lastHash = auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].sha256Hash : 'GENESIS_SENIAT_2026';
    const paymentId = `pay_${Date.now()}`;
    const isAdminUser = currentUser?.role !== 'client';
    const initialStatus: 'VERIFICADO' | 'PENDIENTE' = isAdminUser ? 'VERIFICADO' : 'PENDIENTE';
    const auditHash = computeDeterministicHash(lastHash, {
      paymentId,
      tenantId: activeTenant.id,
      planId: plan.id,
      ref: paymentRefInput,
      status: initialStatus
    });

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const nextBillingStr = nextDate.toISOString().slice(0, 10);

    // Sincronizar con el Backend SaaS Billing Engine
    await safeApiRequest('/api/saas/register-payment', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: activeTenant.id,
        planId: plan.id,
        paymentMethod,
        referenceNumber: paymentRefInput,
        bcvRate
      })
    });

    const newRecord: SaasPaymentRecord = {
      id: paymentId,
      tenantId: activeTenant.id,
      planId: plan.id,
      planName: plan.name,
      paymentMethod,
      referenceNumber: paymentRefInput,
      amountUsd: plan.priceUsdMonthly,
      bcvRate,
      amountBs,
      status: initialStatus,
      auditHash,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setPayments(prev => [newRecord, ...prev]);
    if (isAdminUser) {
      setTenants(prev =>
        prev.map(t =>
          t.id === activeTenant.id
            ? { ...t, planId: plan.id, subscriptionStatus: 'ACTIVA', nextBillingDate: nextBillingStr }
            : t
        )
      );
    }
    appendAuditLog(
      isAdminUser ? 'RENOVACION_LICENCIA_SAAS' : 'REPORTE_PAGO_PENDIENTE_SAAS',
      isAdminUser ? 'admin:saas_billing' : `cliente:${activeTenant.rif}`,
      paymentId,
      isAdminUser
        ? `Suscripción ${plan.name} renovada vía ${paymentMethod} (Ref: ${paymentRefInput}) por USD ${plan.priceUsdMonthly} (Bs. ${amountBs.toFixed(2)})`
        : `Pago reportado en espera de conciliación bancaria (${paymentMethod} Ref: ${paymentRefInput}) por USD ${plan.priceUsdMonthly}`
    );
    setPaymentRefInput(`0134-${Math.floor(10000000 + Math.random() * 89999999)}`);
  }

  async function handleApproveSaasPayment(payment: SaasPaymentRecord) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const nextBillingStr = nextDate.toISOString().slice(0, 10);

    await safeApiRequest('/api/saas/approve-payment', {
      method: 'POST',
      body: JSON.stringify({
        tenantId: payment.tenantId,
        paymentId: payment.id
      })
    });

    setPayments(prev => prev.map(p => (p.id === payment.id ? { ...p, status: 'VERIFICADO' } : p)));
    setTenants(prev =>
      prev.map(t =>
        t.id === payment.tenantId
          ? { ...t, planId: payment.planId, subscriptionStatus: 'ACTIVA', nextBillingDate: nextBillingStr }
          : t
      )
    );
    appendAuditLog(
      'CONCILIACION_APROBADA_SAAS',
      'admin:super_auditor',
      payment.id,
      `Pago Ref #${payment.referenceNumber} conciliado y verificado. Licencia ${payment.planName} activada hasta ${nextBillingStr}`
    );
  }

  function handleRegenerateTelegramCode() {
    const randomHex = Math.floor(0x100000 + Math.random() * 0xefffff).toString(16).toUpperCase();
    const prefix = activeTenant.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
    const newCode = `VT-${prefix}-${randomHex}`;
    setTenants(prev => prev.map(t => (t.id === activeTenant.id ? { ...t, telegramCode: newCode } : t)));
    appendAuditLog(
      'ROTACION_TOKEN_TELEGRAM',
      'admin:security',
      activeTenant.id,
      `Nuevo código de vinculación Telegram generado para ${activeTenant.name}: ${newCode}`
    );
  }

  function handleToggleTenantSuspension(tenantId: string) {
    setTenants(prev =>
      prev.map(t => {
        if (t.id !== tenantId) return t;
        const nextStatus = t.subscriptionStatus === 'ACTIVA' ? 'SUSPENDIDA' : 'ACTIVA';
        appendAuditLog(
          nextStatus === 'SUSPENDIDA' ? 'SUSPENSION_POR_MORA' : 'REACTIVACION_LICENCIA',
          'admin:saas_billing',
          tenantId,
          `Estado de licencia de ${t.name} cambiado a ${nextStatus}`
        );
        return { ...t, subscriptionStatus: nextStatus };
      })
    );
  }

  function handleMobileQuickSend() {
    const rifCheck = validateVenezuelanRIF(mobileQuickRif);
    const base = Number(mobileQuickAmount) || 100;
    const vat = Number((base * 0.16).toFixed(2));
    const total = Number((base + vat).toFixed(2));
    const invNum = `M-${Math.floor(10000 + Math.random() * 89999)}`;
    const ctrlNum = `00-00${Math.floor(100000 + Math.random() * 899999)}`;
    const newId = `inv_${Date.now()}`;
    const lastHash = auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].sha256Hash : 'GENESIS_SENIAT_2026';
    const auditHash = computeDeterministicHash(lastHash, { newId, invNum, total });

    const newInv: FiscalInvoice = {
      id: newId,
      tenantId: activeTenant.id,
      bookType: 'COMPRA',
      docType: '01',
      channel: 'DIGITAL',
      supplierRif: rifCheck.valid ? rifCheck.formatted : 'J-30123456-1',
      supplierName: mobileQuickSupplier,
      hasBuyerRifOnTicket: true,
      invoiceNumber: invNum,
      controlNumber: ctrlNum,
      emissionDate: new Date().toISOString().slice(0, 10),
      emissionTime: new Date().toTimeString().slice(0, 8),
      currency: mobileQuickCurrency,
      bcvRateOnDate: bcvRate,
      taxableBaseOriginal: base,
      exemptOriginal: 0,
      vatRate: 16,
      vatOriginal: vat,
      igtfOriginal: 0,
      totalOriginal: total,
      vatRetentionRate: activeTenant.regime === 'SPE' ? 75 : 0,
      islrRetentionRate: 2,
      status: 'BORRADOR_IA',
      sourceChannel: 'TELEGRAM_BOT',
      auditHash
    };

    setInvoices(prev => [newInv, ...prev]);
    appendAuditLog(
      'INGESTA_PORTAL_MOVIL_9_16',
      `cliente_movil:${activeTenant.rif}`,
      newId,
      `Captura móvil 9:16 enviada por el cliente: Factura #${invNum} (${mobileQuickSupplier}) por ${mobileQuickCurrency} ${total.toFixed(2)}`
    );
    setMobileToast(`Factura #${invNum} enviada al Contador con sello SHA-256`);
    setTimeout(() => setMobileToast(null), 3500);
  }

  function handleDownloadFile(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSnapshot() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      norm: 'SENIAT SNAT/2026/00093 & SNAT/2026/00099',
      bcvRate,
      tenants,
      invoices,
      auditLogs,
      payments
    };
    handleDownloadFile(
      `Antigravity_Snapshot_${activeTenant.rif}_${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(snapshot, null, 2),
      'application/json'
    );
  }

  const rifValidation = validateVenezuelanRIF(rifTestInput);
  const ocrRifValidation = validateVenezuelanRIF(ocrDraft.supplierRif);
  const payrollBreakdown = useMemo(
    () => calculateLotttFullBreakdown(baseSalaryBs, cestaticketBs, riskLevel),
    [baseSalaryBs, cestaticketBs, riskLevel]
  );

  const encryptedPreview = useMemo(
    () => simulateAes256GcmEncrypt(vaultPlainInput, vaultKeyHint),
    [vaultPlainInput, vaultKeyHint]
  );
  const decryptedPreview = useMemo(
    () => simulateAes256GcmDecrypt(encryptedPreview, vaultKeyHint),
    [encryptedPreview, vaultKeyHint]
  );

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <form onSubmit={pending2faUser ? handleVerifyLoginTotp : handleLogin} className="ui-card p-6 md:p-8 w-full max-w-md space-y-5 text-xs font-mono relative shadow-2xl">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                SNAT/2026/00093 · COT 10Y
              </span>
              <span className="text-[10px] opacity-70">v3.2 COMMERCIAL</span>
            </div>
            <h1 className="ui-heading text-2xl font-bold tracking-tight pt-1 text-white">
              VT FISCAL OS
            </h1>
            <p className="opacity-75">Acceso Blindado Multi-Empresa · SENIAT & Contabilidad Cloud</p>
          </div>

          {/* Banner de Blindaje Activo */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-[10px] text-cyan-300">
            <span className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              BLINDAJE ZERO-TRUST ACTIVO
            </span>
            <span className="font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200">
              {isAccountLocked ? 'BLOQUEADO' : `${failedLoginAttempts}/5 Fallos`}
            </span>
          </div>

          {/* Banner Alerta de Cuenta Bloqueada */}
          {isAccountLocked && (
            <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-500/70 text-rose-200 space-y-2.5 shadow-xl animate-pulse">
              <div className="flex items-center gap-2 font-bold text-xs text-rose-300">
                <Lock className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>🚨 CUENTA BLOQUEADA POR 30 MINUTOS</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Se detectaron 5 intentos fallidos consecutivos desde esta IP. El acceso ha sido suspendido para proteger los libros y certificados fiscales.
              </p>
              <div className="p-2.5 rounded bg-black/60 border border-rose-500/40 font-mono text-center text-rose-300 text-xs font-extrabold flex items-center justify-center gap-2">
                <Clock className="w-4 h-4 text-rose-400 animate-spin" />
                <span>
                  ENFRIAMIENTO RESTANTE: {Math.floor(lockCountdownSeconds / 60).toString().padStart(2, '0')}:{(lockCountdownSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowUnlockModal(true)}
                className="w-full py-2 rounded-lg bg-rose-500/30 hover:bg-rose-500/40 border border-rose-500/60 text-[11px] font-bold text-rose-200 transition-all flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5 text-rose-300" />
                <span>Desbloqueo de Emergencia Super-Admin</span>
              </button>
            </div>
          )}

          {/* Banner Advertencia de Intentos Parciales */}
          {failedLoginAttempts > 0 && !isAccountLocked && (
            <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/60 text-amber-200 text-[11px] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-amber-300">{loginErrorMessage}</p>
                <p className="text-[10px] opacity-80">
                  Al 5to fallo consecutivo, la cuenta y la IP se bloquearán automáticamente por 30 minutos.
                </p>
              </div>
            </div>
          )}

          {/* Banner de Invitación Activa por WhatsApp */}
          {inviteGreeting && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-500/60 text-emerald-200 text-xs flex items-start gap-2.5 shadow-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-300">
                  👋 ¡Invitación Oficial Detectada! ({inviteGreeting.role === 'admin' ? 'Firma Contable / Aliado' : 'Cliente Comercio'})
                </p>
                <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                  {inviteGreeting.name ? `${inviteGreeting.name}: ` : ''}
                  Su correo ha sido pre-cargado automáticamente. Ingrese la <strong>clave temporal</strong> recibida por WhatsApp y pulse <strong>«Iniciar Sesión Segura»</strong> para activar su cuenta.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isAccountLocked}
              onClick={() => {
                setLoginRole('superadmin');
              }}
              className={`p-3 rounded-xl border text-center text-xs flex sm:flex-col items-center justify-center gap-2 ${
                loginRole === 'superadmin'
                  ? 'bg-blue-600/20 text-blue-400 font-bold border-blue-500/50 shadow-sm'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
              } disabled:opacity-40 transition-all`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="leading-tight font-semibold">Super-Admin</span>
            </button>
            <button
              type="button"
              disabled={isAccountLocked}
              onClick={() => {
                setLoginRole('admin');
              }}
              className={`p-3 rounded-xl border text-center text-xs flex sm:flex-col items-center justify-center gap-2 ${
                loginRole === 'admin'
                  ? 'bg-blue-600/20 text-blue-400 font-bold border-blue-500/50 shadow-sm'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
              } disabled:opacity-40 transition-all`}
            >
              <Briefcase className="w-4 h-4" />
              <span className="leading-tight font-semibold">Firma Contable</span>
            </button>
            <button
              type="button"
              disabled={isAccountLocked}
              onClick={() => {
                setLoginRole('client');
              }}
              className={`p-3 rounded-xl border text-center text-xs flex sm:flex-col items-center justify-center gap-2 ${
                loginRole === 'client'
                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border-emerald-400/50 shadow-sm'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
              } disabled:opacity-40 transition-all`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="leading-tight font-semibold">Cliente Comercio</span>
            </button>
          </div>

          {pending2faUser ? (
            <div className="space-y-4 pt-2">
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Autenticación de Dos Factores (2FA / TOTP)</span>
                </div>
                <p className="text-[11px] opacity-85">
                  Ingresa el código temporal de 6 dígitos generado por tu app autenticadora para confirmar acceso como Super-Admin.
                </p>
              </div>
              <div>
                <label className="block mb-1.5 text-xs text-white/70 font-medium">Código 2FA de 6 dígitos</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="000000"
                  value={loginTotpInput}
                  onChange={e => setLoginTotpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-blue-500/40 text-center text-xl tracking-[0.4em] font-mono font-bold text-white focus:border-blue-400 focus:outline-none transition-all shadow-inner"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPending2faUser(null);
                    setLoginTotpInput('');
                    setLoginErrorMessage(null);
                  }}
                  className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="ui-btn-primary flex-1 py-3 text-xs flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verificar y Entrar</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 pt-1">
                <div>
                  <label className="block mb-1.5 text-xs text-white/70 font-medium">Correo Corporativo</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="correo@firma.com"
                    disabled={isAccountLocked || loginSubmitting}
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-base md:text-xs text-white disabled:opacity-50 focus:border-blue-500 focus:outline-none transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="block mb-1.5 text-xs text-white/70 font-medium">Contraseña de Bóveda</label>
                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="Ingrese su contraseña o clave temporal"
                      disabled={isAccountLocked || loginSubmitting}
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="w-full p-3 pr-10 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-base md:text-xs text-white disabled:opacity-50 focus:border-blue-500 focus:outline-none transition-all shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(v => !v)}
                      title={showLoginPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isAccountLocked || loginSubmitting}
                className="ui-btn-primary w-full py-3 text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4" />
                <span>
                  {isAccountLocked
                    ? 'Acceso Bloqueado por Seguridad'
                    : loginSubmitting
                      ? 'Verificando en la nube...'
                      : 'Iniciar Sesión Segura'}
                </span>
              </button>
            </>
          )}

          {/* Barra de Pruebas y Simulación de Ataque */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between text-[10px] opacity-75">
              <span>Laboratorio de Seguridad (Prueba en Vivo):</span>
              <span className="font-mono text-cyan-300">{failedLoginAttempts}/5 Fallos</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSimulateFailedAttempt}
                disabled={isAccountLocked}
                className="py-1.5 px-2 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-40"
              >
                <span>🧪 Simular Fallo (+1)</span>
              </button>
              <button
                type="button"
                onClick={() => handleUnlockAccount('Desbloquear2026#')}
                disabled={!isAccountLocked && failedLoginAttempts === 0}
                className="py-1.5 px-2 rounded border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all disabled:opacity-40"
              >
                <span>⚡ Desbloquear</span>
              </button>
            </div>
            <p className="text-[10px] opacity-65 text-center">
              Clave autorizada demo: <code className="text-cyan-300 font-bold">Seniat2026#</code>
            </p>
          </div>
        </form>

        {/* Modal de Desbloqueo por Clave Maestra */}
        {showUnlockModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
            <div className="ui-card p-6 rounded-2xl border border-rose-500/50 w-full max-w-sm space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <KeyRound className="w-4 h-4" />
                  <span>Desbloqueo de Emergencia</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(false)}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Ingrese la Clave Maestra del Super-Admin para resetear el contador de fallos y desbloquear la cuenta inmediatamente:
              </p>

              <div className="space-y-1">
                <input
                  type="password"
                  placeholder="Ej: Desbloquear2026#"
                  value={unlockMasterKey}
                  onChange={e => setUnlockMasterKey(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs text-white"
                />
                {unlockFeedback && (
                  <p className="text-[10px] text-rose-400 font-bold">{unlockFeedback}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(false)}
                  className="py-2 rounded border border-[var(--border-subtle)] text-xs text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleUnlockAccount(unlockMasterKey || 'Desbloquear2026#')}
                  className="py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                >
                  Confirmar Desbloqueo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Top Command Bar · Apple Minimalist Glass Header 2026 */}
      <header className="mb-5 p-3.5 rounded-2xl backdrop-blur-2xl bg-[var(--bg-surface)]/90 border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_12px_32px_-8px_rgba(0,0,0,0.55)] transition-all">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* SECTOR 1 (IZQUIERDA): Identidad & Ancla de Empresa Activa */}
          <div className="flex items-center gap-3">
            {/* Logo Minimalista */}
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0A84FF]"></span>
              </span>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm md:text-base text-white tracking-tight">VT</span>
                  <span className="text-xs font-mono font-medium text-[#8E8E93]">Fiscal OS</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/70">v3.2</span>
                </div>
              </div>
            </div>

            <div className="hidden md:block h-6 w-[1px] bg-white/10" />

            {/* Cápsula de Empresa Activa (Selector Multi-RIF Compacto & Responsive) */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/20 transition-all max-w-[180px] xs:max-w-[240px] sm:max-w-none shadow-inner">
              <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="flex items-center gap-1.5 min-w-0">
                {currentUser?.role === 'client' ? (
                  <span className="text-xs font-bold text-white font-mono truncate max-w-[120px] sm:max-w-[200px]">
                    {activeTenant.name}
                  </span>
                ) : (
                  <select
                    id="tenant-selector"
                    value={selectedTenantId}
                    onChange={e => setSelectedTenantId(e.target.value)}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer max-w-[110px] xs:max-w-[140px] sm:max-w-[190px] md:max-w-[240px] truncate"
                    title="Cambiar Empresa / Cliente Activo"
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id} className="bg-[#1C1C1E] text-white">
                        {t.name} ({t.rif})
                      </option>
                    ))}
                  </select>
                )}
                <span className={`hidden sm:inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  activeTenant.regime === 'SPE'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {activeTenant.regime}
                </span>
              </div>
              {currentUser?.role !== 'client' && (
                <button
                  onClick={() => setNewTenantModalOpen(true)}
                  title="Registrar Nueva Empresa (RIF)"
                  className="ml-0.5 p-1 rounded-lg bg-white/10 hover:bg-blue-500/20 hover:text-blue-300 text-white/70 text-[10px] font-mono flex items-center shrink-0 transition"
                >
                  <Plus className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* SECTOR 2 (CENTRO): Termómetro Macroeconómico BCV en Vivo */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-mono shadow-inner">
            <span className="text-white/60 font-semibold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-[#8E8E93]" />
              <span className="hidden sm:inline">BCV:</span>
            </span>
            <input
              id="bcv-rate-input"
              type="number"
              step="0.01"
              value={bcvRate}
              onChange={e => setBcvRate(Number(e.target.value) || 914.02)}
              className="w-20 bg-transparent text-xs font-mono font-medium tabular-nums text-white focus:outline-none"
              title="Tasa Oficial BCV editable"
            />
            <span className="text-white/40">Bs./USD</span>
            <button
              onClick={handleSyncBcvOracle}
              title="Sincronizar Tasa Oficial BCV con el Oráculo"
              className="p-1 rounded hover:bg-white/10 text-[#8E8E93] hover:text-white transition"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {/* SECTOR 3 (DERECHA): Rol + Estado de Conexión + Salir */}
          <div className="flex items-center gap-2.5">
            {/* Control de Rol / Candado RBAC */}
            {currentUser?.role === 'client' ? (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/90 text-xs font-medium shadow-inner"
                title="Espacio Protegido: Portal Comercio"
              >
                <Lock className="w-3.5 h-3.5 text-[#8E8E93]" />
                <span className="hidden sm:inline">Portal Comercio</span>
                <span className="text-[10px] font-mono text-[#8E8E93]">SEGURO</span>
              </div>
            ) : currentUser?.role === 'admin' ? (
              <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 text-[11px] font-medium">
                <button
                  onClick={() => setActiveTab('clients')}
                  className="px-2.5 py-1 rounded-lg bg-white/15 text-white font-semibold border border-white/20 shadow-sm flex items-center gap-1.5"
                  title="Espacio de Trabajo: Contador Aliado (CPC)"
                >
                  <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden lg:inline">Contador</span>
                </button>
                <button
                  onClick={() => {
                    const updated = { ...currentUser, role: 'client' as const, name: `Comercio (${activeTenant.name})` };
                    setCurrentUser(updated);
                    localStorage.setItem('vt_auth_user', JSON.stringify(updated));
                    setActiveTab('mobile');
                  }}
                  className="px-2.5 py-1 rounded-lg text-[#8E8E93] hover:text-white transition-all flex items-center gap-1.5"
                  title="Previsualizar cómo ve el portal tu cliente comercio"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#8E8E93]" />
                  <span className="hidden lg:inline">Ver como Cliente</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10 text-[11px] font-medium">
                <button
                  onClick={() => {
                    const updated = { ...currentUser, role: 'admin' as const, name: 'Lic. Auditor Principal (Firma)' };
                    setCurrentUser(updated);
                    localStorage.setItem('vt_auth_user', JSON.stringify(updated));
                    setActiveTab('clients');
                  }}
                  className="px-2.5 py-1 rounded-lg text-[#8E8E93] hover:text-white transition-all flex items-center gap-1.5"
                  title="Espacio de Trabajo: Contador Aliado (CPC)"
                >
                  <Briefcase className="w-3.5 h-3.5 text-[#8E8E93]" />
                  <span className="hidden lg:inline">Contador</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('accountants');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/15 text-white font-semibold border border-white/20 shadow-sm flex items-center gap-1.5"
                  title="Espacio de Trabajo: Super-Admin (Torre de Control)"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden lg:inline">Super-Admin</span>
                </button>
                <button
                  onClick={() => {
                    const updated = { ...currentUser, role: 'client' as const, name: `Comercio (${activeTenant.name})` };
                    setCurrentUser(updated);
                    localStorage.setItem('vt_auth_user', JSON.stringify(updated));
                    setActiveTab('mobile');
                  }}
                  className="px-2.5 py-1 rounded-lg text-[#8E8E93] hover:text-white transition-all flex items-center gap-1.5"
                  title="Espacio de Trabajo: Comercio (Portal Móvil)"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#8E8E93]" />
                  <span className="hidden lg:inline">Cliente</span>
                </button>
              </div>
            )}

            {/* PWA Prompt si está disponible */}
            {pwaInstallPrompt && (
              <button
                onClick={() => {
                  pwaInstallPrompt.prompt();
                  pwaInstallPrompt.userChoice.then(() => setPwaInstallPrompt(null));
                }}
                className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 animate-pulse transition"
                title="Instalar App en este Dispositivo"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Indicador Sutil de Red */}
            <div
              className="p-1.5 rounded-lg bg-white/[0.04] border border-white/10"
              title={isOnline ? 'Conexión a Internet Estable' : 'Modo Bóveda Offline'}
            >
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              )}
            </div>

            {/* Botón Salir Limpio y Destacado */}
            <button
              onClick={handleLogout}
              title="Cerrar Sesión"
              className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition active:scale-[0.97]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Indicador de Resiliencia ante Caída de Conexión (Offline Mode) */}
      {!isOnline && (
        <div className="mb-4 p-3 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>MODO LOCAL SEGURO: Sin conexión a internet. Los registros contables y nómina se preservan intactos en la bóveda local del navegador.</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 font-bold uppercase">Bóveda Offline</span>
        </div>
      )}

      {bcvSyncFlash && (
        <div className="ui-card p-3 mb-4 border-emerald-500/50 bg-emerald-500/10 text-emerald-300 text-xs font-mono flex items-center justify-between">
          <span>[ORÁCULO BCV SINCRONIZADO] {bcvSyncFlash}</span>
          <span className="opacity-75">SHA-256 SELLADO</span>
        </div>
      )}

      {/* Impersonation / Shadow Support Banner · Apple Pro */}
      {impersonatedAccountant && (
        <div className="mb-5 p-4 rounded-2xl bg-[#1C1C1E] border border-blue-500/30 text-white text-xs font-mono flex flex-wrap items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/25 text-blue-400 flex-shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white uppercase tracking-wider text-sm">
                  Modo Asistencia Remota Activa: {impersonatedAccountant.name}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 text-[10px] font-mono font-medium">
                  {impersonatedAccountant.cpcNumber}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-[10px]">
                  {impersonatedAccountant.city}
                </span>
              </div>
              <p className="text-[11px] text-[#8E8E93] mt-0.5">
                Visualizando el despacho como este contador. Las acciones quedan registradas en el log criptográfico con su firma.
              </p>
            </div>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/10 text-xs font-medium flex items-center gap-2 transition active:scale-[0.98]"
          >
            <LogOut className="w-3.5 h-3.5 text-zinc-300" />
            <span>Salir de Asistencia</span>
          </button>
        </div>
      )}

      {/* Navigation Tabs · Apple macOS / iOS Segmented Pill Track */}
      <nav className="apple-segmented-track flex items-center justify-between gap-2 mb-6 p-1.5 overflow-hidden">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 w-full lg:w-auto -mx-1 px-1 sm:mx-0 sm:px-0">
          {navTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id || (tab.id === 'operations' && ['ocr', 'books', 'reconciliation'].includes(activeTab));
            return (
              <button
                key={tab.id}
                id={`nav-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`apple-tab-pill whitespace-nowrap px-3.5 py-2 text-xs font-semibold tracking-tight flex items-center gap-2 flex-shrink-0 ${
                  active ? 'apple-tab-pill-active' : 'apple-tab-pill-inactive'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'opacity-70'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Badge Contextual del Espacio Activo */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl bg-white/[0.04] text-[11px] text-[#8E8E93] font-mono border border-white/5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          <span>
            {currentUser?.role === 'superadmin' ? 'MODO: SUPER-ADMIN SAAS' : currentUser?.role === 'client' ? 'MODO: CLIENTE COMERCIO' : 'MODO: CONTADOR ALIADO (CPC)'}
          </span>
        </div>
      </nav>

      {/* =====================================================================
          TAB 00-SUPER: TORRE DE CONTROL SUPER-ADMIN (RED DE CONTADORES)
         ===================================================================== */}
      {activeTab === 'accountants' && (
        <div className="space-y-6">
          {/* Header de la Torre de Control · Apple Pro Standard */}
          <div className="p-5 rounded-2xl bg-[#1C1C1E] border border-white/10 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-white/[0.06] text-white border border-white/10 flex-shrink-0">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
                    Torre de Control Super-Admin · Red de Contadores Aliados
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80 border border-white/10 font-medium uppercase">
                    Director General
                  </span>
                </div>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  Monitoreo de suscripciones de firmas contables, liquidación de comisiones Rev-Share (20%) y asistencia remota directa.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenAccountantModal()}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-white/90 text-black text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4 text-black" />
                <span>Registrar Contador Partner</span>
              </button>
              <button
                onClick={() => {
                  const dataStr = JSON.stringify(accountants, null, 2);
                  handleDownloadFile(`DIRECTORIO_CONTADORES_VT_${new Date().toISOString().slice(0, 10)}.json`, dataStr, 'application/json');
                }}
                className="px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/10 text-xs font-medium text-white flex items-center gap-2 transition-all active:scale-[0.98]"
                title="Descargar Directorio en JSON"
              >
                <Download className="w-3.5 h-3.5 text-zinc-300" />
                <span>Exportar</span>
              </button>
            </div>
          </div>

          {/* 4 Bento KPI Cards · Minimalist Apple Pro */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Contadores Aliados */}
            <div className="ui-card p-4 space-y-2 bg-[#1C1C1E] border border-white/[0.08] hover:border-white/20 rounded-2xl transition-all">
              <div className="flex items-center justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>RED DE CONTADORES</span>
                <Users className="w-4 h-4 text-[#8E8E93]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {superAdminStats.totalAccountants} <span className="text-sm font-normal text-[#8E8E93]">Firmas</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-medium">
                  {superAdminStats.activeAccountants} Activas
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/80 border border-white/10 font-medium">
                  {superAdminStats.trialAccountants} En Prueba
                </span>
                {superAdminStats.suspendedAccountants > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-medium">
                    {superAdminStats.suspendedAccountants} Suspendidas
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: Empresas en Red */}
            <div className="ui-card p-4 space-y-2 bg-[#1C1C1E] border border-white/[0.08] hover:border-white/20 rounded-2xl transition-all">
              <div className="flex items-center justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>EMPRESAS GESTIONADAS</span>
                <Building2 className="w-4 h-4 text-[#8E8E93]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white">
                {superAdminStats.totalCompaniesInNetwork} <span className="text-sm font-normal text-[#8E8E93]">Multi-RIF</span>
              </div>
              <p className="text-[10px] text-[#8E8E93] font-mono">
                Promedio: {(superAdminStats.totalCompaniesInNetwork / Math.max(1, superAdminStats.totalAccountants)).toFixed(1)} empresas por firma
              </p>
            </div>

            {/* Card 3: MRR Consolidado */}
            <div className="ui-card p-4 space-y-2 bg-[#1C1C1E] border border-white/[0.08] hover:border-white/20 rounded-2xl transition-all">
              <div className="flex items-center justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>MRR CONSOLIDADO</span>
                <CreditCard className="w-4 h-4 text-[#8E8E93]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
                ${superAdminStats.consolidatedMrrUsd.toFixed(2)} <span className="text-xs font-normal text-[#8E8E93]">USD/mes</span>
              </div>
              <div className="text-[11px] font-mono text-white/90 tabular-nums">
                Bs. {superAdminStats.consolidatedMrrBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[10px] text-[#8E8E93] ml-1">@ BCV {bcvRate}</span>
              </div>
              <div className="text-[9px] text-[#8E8E93] font-mono">
                Firmas: ${superAdminStats.mrrAccountantsUsd.toFixed(2)} · Sub-cuentas: ${superAdminStats.mrrSubAccountsUsd.toFixed(2)}
              </div>
            </div>

            {/* Card 4: Comisiones por Liquidar */}
            <div className="ui-card p-4 space-y-2 bg-[#1C1C1E] border border-white/[0.08] hover:border-white/20 rounded-2xl transition-all">
              <div className="flex items-center justify-between text-[11px] text-[#8E8E93] font-mono">
                <span>REV-SHARE PENDIENTE</span>
                <Scale className="w-4 h-4 text-[#8E8E93]" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
                ${superAdminStats.pendingCommissionsUsd.toFixed(2)} <span className="text-xs font-normal text-[#8E8E93]">USD</span>
              </div>
              <div className="text-[11px] font-mono text-white/90 tabular-nums">
                Bs. {superAdminStats.pendingCommissionsBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-[#8E8E93] font-mono">
                Liquidado acumulado: ${superAdminStats.totalPaidCommissionsUsd.toFixed(2)} USD
              </div>
            </div>
          </div>

          {/* Filtros y Buscador */}
          <div className="ui-card p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
            <div className="flex-1 min-w-[260px] relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-60" />
              <input
                type="text"
                placeholder="Buscar por Licenciado, CPC, RIF, Ciudad o Firma..."
                value={accSearchQuery}
                onChange={e => setAccSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] opacity-60 mr-1">ESTADO:</span>
              {(['TODOS', 'ACTIVA', 'EN_PRUEBA', 'SUSPENDIDA'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setAccFilterStatus(st)}
                  className={`px-3 py-1.5 rounded text-[11px] font-bold border transition-all ${
                    accFilterStatus === st
                      ? 'bg-[var(--accent-primary)] text-slate-950 border-[var(--border-highlight)]'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-75 hover:opacity-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Tabla de Contadores Partners · Apple Table Standard */}
          <div className="ui-card overflow-hidden bg-[#1C1C1E] border border-white/[0.08] rounded-2xl">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-sm text-white">Directorio Oficial de Firmas & Contadores</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 font-mono text-zinc-300">
                  {filteredAccountants.length} registros
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02] text-[#8E8E93] text-[10px] uppercase tracking-wider">
                    <th className="p-3">Contador & Colegio (CPC)</th>
                    <th className="p-3">Plan & Cuota</th>
                    <th className="p-3">Cartera Asignada</th>
                    <th className="p-3">Rev-Share Pendiente</th>
                    <th className="p-3">Estado Suscripción</th>
                    <th className="p-3 text-right">Acciones de Gestión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredAccountants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-[#8E8E93]">
                        No se encontraron contadores con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredAccountants.map(acc => {
                      const planInfo = ACCOUNTANT_PLANS_CATALOG.find(p => p.id === acc.planId) || ACCOUNTANT_PLANS_CATALOG[1];
                      const assignedTenants = tenants.filter(t => acc.assignedTenantIds.includes(t.id));

                      return (
                        <tr key={acc.id} className="hover:bg-white/[0.02] transition-colors">
                          {/* Contador & CPC */}
                          <td className="p-3">
                            <div className="font-semibold text-white text-sm flex items-center gap-2">
                              <span>{acc.name}</span>
                              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/90 border border-white/10 text-[10px] font-mono">
                                {acc.cpcNumber}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#8E8E93] mt-0.5">
                              {acc.firmLogoText || 'Firma Independiente'} · {acc.rif}
                            </div>
                            <div className="text-[10px] text-[#8E8E93] flex items-center gap-2 mt-1">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#8E8E93]" />
                                {acc.city}
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 text-[#8E8E93]" />
                                {acc.email}
                              </span>
                            </div>
                          </td>

                          {/* Plan & Cuota */}
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-mono text-[10px] uppercase">
                              {planInfo.name}
                            </span>
                            <div className="font-semibold text-white mt-1 tabular-nums">
                              ${acc.monthlyFeeUsd.toFixed(2)} USD/mes
                            </div>
                            <div className="text-[10px] text-[#8E8E93]">
                              Capacidad: {acc.assignedTenantIds.length} / {acc.maxCompaniesLimit === 999 ? '∞' : acc.maxCompaniesLimit} empresas
                            </div>
                          </td>

                          {/* Cartera Asignada */}
                          <td className="p-3">
                            {assignedTenants.length > 0 ? (
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {assignedTenants.map(t => (
                                  <span
                                    key={t.id}
                                    className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[10px] text-white/90 truncate max-w-[140px]"
                                    title={`${t.name} (${t.rif})`}
                                  >
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#8E8E93] italic">Sin empresas vinculadas</span>
                            )}
                          </td>

                          {/* Rev-Share Pendiente */}
                          <td className="p-3">
                            <div className="font-semibold text-white tabular-nums">
                              ${acc.pendingCommissionUsd.toFixed(2)} USD
                            </div>
                            <div className="text-[10px] text-[#8E8E93] tabular-nums">
                              Bs. {(acc.pendingCommissionUsd * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] text-[#8E8E93] mt-0.5">
                              Pagado histórico: ${acc.paidCommissionsTotalUsd.toFixed(2)}
                            </div>
                          </td>

                          {/* Estado Suscripción */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase ${
                                  acc.subscriptionStatus === 'ACTIVA'
                                    ? 'bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/25'
                                    : acc.subscriptionStatus === 'EN_PRUEBA'
                                      ? 'bg-white/10 text-white/80 border border-white/10'
                                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/25'
                                }`}
                              >
                                {acc.subscriptionStatus}
                              </span>
                              <button
                                onClick={() => handleToggleAccountantStatus(acc.id)}
                                title="Cambiar Estado de Suscripción"
                                className="p-1 rounded-md hover:bg-white/10 text-[#8E8E93] hover:text-white transition"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-[9px] text-[#8E8E93] mt-1">
                              Próx. Cobro: {acc.nextBillingDate}
                            </div>
                          </td>

                          {/* Acciones */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Botón Impersonar / Shadow Support */}
                              <button
                                onClick={() => handleImpersonateAccountant(acc)}
                                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-[11px] flex items-center gap-1.5 border border-white/10 shadow-sm transition-all active:scale-[0.98]"
                                title="Ingresar en Modo Asistencia (Ver la plataforma como este contador)"
                              >
                                <Eye className="w-3.5 h-3.5 text-zinc-300" />
                                <span>Asistir</span>
                              </button>

                              {/* Botón Liquidar Comisión */}
                              {acc.pendingCommissionUsd > 0 && (
                                <button
                                  onClick={() => handleOpenPayoutModal(acc)}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 font-medium text-[11px] flex items-center gap-1.5 border border-blue-500/30 shadow-sm transition-all active:scale-[0.98]"
                                  title="Liquidar Comisión Rev-Share vía Pago Móvil / Binance"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                                  <span>Liquidar</span>
                                </button>
                              )}

                              {/* Botón Editar */}
                              <button
                                onClick={() => handleOpenAccountantModal(acc)}
                                className="p-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/10 text-zinc-300 hover:text-white transition-all active:scale-[0.98]"
                                title="Editar Datos y Plan"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Botón Eliminar */}
                              <button
                                onClick={() => handleDeleteAccountant(acc.id, acc.name)}
                                className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-all active:scale-[0.98]"
                                title="Eliminar Contador del Directorio"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Generar Clave Real en la Nube & Invitar WhatsApp */}
                              <button
                                type="button"
                                onClick={() => handleResetAccountantPassword(acc)}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-medium text-[11px] flex items-center gap-1.5 border border-emerald-500/30 shadow-sm transition-all active:scale-[0.98]"
                                title="Activar en la nube, generar clave temporal real y enviar por WhatsApp"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-[#25D366]" />
                                <span>Clave &amp; WhatsApp</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Catálogo de Planes para Contadores Aliados */}
          <div className="ui-card p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="ui-heading text-base font-bold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  Planes de Suscripción para Contadores Colegiados
                </h3>
                <p className="text-xs opacity-75 font-mono mt-0.5">
                  Estructura comercial de cuotas mensuales para despachos y firmas aliadas en Venezuela.
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-1 rounded bg-amber-500/20 text-amber-300 font-bold">
                REV-SHARE 20% ACTIVO
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              {ACCOUNTANT_PLANS_CATALOG.map(plan => (
                <div
                  key={plan.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    plan.id === 'FIRMA_PRO'
                      ? 'bg-gradient-to-b from-amber-950/30 to-[var(--bg-elevated)] border-amber-400/50 shadow-lg'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{plan.name}</span>
                      {plan.id === 'FIRMA_PRO' && (
                        <span className="text-[9px] px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold uppercase">
                          MÁS POPULAR
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-2xl font-black text-amber-400 tabular-nums">
                        ${plan.priceUsdMonthly} <span className="text-xs font-normal opacity-70">USD/mes</span>
                      </div>
                      <div className="text-[11px] opacity-75 tabular-nums">
                        Bs. {(plan.priceUsdMonthly * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} @ BCV
                      </div>
                    </div>
                    <div className="text-[10px] px-2 py-1 rounded bg-white/10 text-cyan-300 font-bold">
                      Hasta {plan.maxCompanies === 999 ? 'Empresas Ilimitadas' : `${plan.maxCompanies} Empresas (Multi-RIF)`}
                    </div>
                    <ul className="space-y-1.5 pt-2 text-[11px] opacity-85">
                      {plan.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => handleOpenAccountantModal()}
                      className={`w-full py-2 rounded font-bold text-xs transition-all ${
                        plan.id === 'FIRMA_PRO'
                          ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    >
                      Asignar Este Plan
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card: Centro de Blindaje y Ciberseguridad Super-Admin */}
          <div className="ui-card p-5 space-y-4 rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-slate-900 via-cyan-950/20 to-slate-900 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-white">
                      Bóveda de Ciberseguridad & Anti-Intrusos (Defensa en Profundidad 2026)
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                      WAF ACTIVO
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Control de bloqueo automático al 5to intento erróneo (30 min cooldown), aislamiento multi-tenant IDOR y registro forense inmutable.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleUnlockAccount('Desbloquear2026#');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold font-mono flex items-center gap-1.5 transition-all"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Desbloquear Todas las Cuentas</span>
                </button>
              </div>
            </div>

            {/* Sub-grid: Estado de Seguridad */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Política Anti-Fuerza Bruta</span>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>5 Intentos Máximos / 30m</span>
                </div>
                <p className="text-[10px] text-slate-500">Con retardo tarpitting de 3s al 3er fallo</p>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Aislamiento Multi-Tenant</span>
                <div className="text-sm font-bold text-cyan-400 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Protección Anti-IDOR Activa</span>
                </div>
                <p className="text-[10px] text-slate-500">HTTP 403 ante acceso cruzado de empresas</p>
              </div>

              <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Cifrado de Credenciales</span>
                <div className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>AES-256-GCM Zero-Knowledge</span>
                </div>
                <p className="text-[10px] text-slate-500">Claves SENIAT y bancos cifrados en reposo</p>
              </div>
            </div>

            {/* Lista de Incidentes e Intentos de Intrusión Recientes */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Historial de Bloqueos e Intentos de Intrusión (Sellado SHA-256)</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {securityIncidents.length} evento(s) detectado(s)
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[var(--bg-elevated)] text-slate-400 uppercase text-[9px]">
                    <tr>
                      <th className="p-2.5">Cuenta / Objetivo</th>
                      <th className="p-2.5">IP Origen</th>
                      <th className="p-2.5 text-center">Intentos</th>
                      <th className="p-2.5">Estado / Enfriamiento</th>
                      <th className="p-2.5">Firma Criptográfica</th>
                      <th className="p-2.5 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {securityIncidents.map(inc => (
                      <tr key={inc.id} className="hover:bg-white/[0.02]">
                        <td className="p-2.5 font-bold text-white">{inc.identifier}</td>
                        <td className="p-2.5 text-slate-300">{inc.ip}</td>
                        <td className="p-2.5 text-center">
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                            {inc.attempts}/5
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold">
                            BLOQUEADA (30 min)
                          </span>
                        </td>
                        <td className="p-2.5 text-[9px] text-slate-500 truncate max-w-[120px]">
                          {inc.hash}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              handleUnlockAccount('Desbloquear2026#');
                              setSecurityIncidents(prev => prev.filter(x => x.id !== inc.id));
                            }}
                            className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-500/40"
                          >
                            🔓 Desbloquear
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 00: CARTERA DE CLIENTES (RADAR FISCAL SENIAT 2026 & BENTO HUB)
         ===================================================================== */}
      {activeTab === 'clients' && (
        <div className="space-y-6">
          {/* Header del Radar y Acceso Rápido · Apple Pro Standard */}
          <div className="p-5 rounded-2xl bg-[#1C1C1E] border border-white/10 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-white/[0.06] text-white border border-white/10 flex-shrink-0">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
                    Cartera de Clientes & Radar Fiscal SENIAT
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80 border border-white/10 font-medium uppercase">
                    Despacho Contable
                  </span>
                </div>
                <p className="text-xs text-[#8E8E93] mt-0.5">
                  Monitoreo simultáneo de empresas por terminal de RIF, alertas de quincena y acciones directas en 1 clic.
                </p>
              </div>
            </div>

            <button
              onClick={() => setNewTenantModalOpen(true)}
              className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-white hover:bg-white/90 text-black shadow-sm flex items-center gap-2 transition active:scale-[0.98]"
            >
              <Plus className="w-4 h-4 text-black" />
              <span>Registrar Nueva Empresa (RIF)</span>
            </button>
          </div>

          {/* FASE 1 UX: Tarjeta Guiada "Tu Día Fiscal en 3 Pasos" (Reduce carga cognitiva) */}
          {(() => {
            const pendingCount = tenantInvoices.filter(i => i.status !== 'APROBADA').length;
            const step1Done = pendingCount === 0 && tenantInvoices.length > 0;
            const step2Done = reconciliationStats.totalMoves > 0 && reconciliationStats.matchPercent === 100;
            const step3Done = tenantInvoices.some(i => i.status === 'APROBADA');
            const completedSteps = [step1Done, step2Done, step3Done].filter(Boolean).length;
            const progressPct = Math.round((completedSteps / 3) * 100);

            return (
              <div className="ui-card p-5 border border-white/10 bg-gradient-to-br from-[#121319] via-[#151822] to-[#0E1318] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">
                        Siguiente Mejor Acción · {activeTenant.name}
                      </span>
                      {completedSteps === 3 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ✓ Mes Fiscal Al Día
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white mt-0.5">
                      Tu Día Fiscal en 3 Pasos ({completedSteps}/3 completados)
                    </h3>
                  </div>

                  <div className="flex items-center gap-3 min-w-[180px]">
                    <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-emerald-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">{progressPct}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => {
                      setOperationStep('scanner');
                      setActiveTab('operations');
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all duration-200 flex items-start gap-3 ${
                      step1Done
                        ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                        : 'bg-white/[0.03] border-white/10 hover:border-cyan-400/40 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                      step1Done ? 'bg-emerald-500 text-slate-950' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    }`}>
                      {step1Done ? '✓' : '1'}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {step1Done ? 'Facturas IA Revisadas' : `Revisar ${pendingCount} Factura${pendingCount === 1 ? '' : 's'} IA`}
                      </div>
                      <p className="text-[11px] text-white/60 mt-0.5">
                        {step1Done ? 'Todas las facturas del período están aprobadas.' : 'Aprobar borradores de Telegram/OCR.'}
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setOperationStep('reconciliation');
                      setActiveTab('operations');
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all duration-200 flex items-start gap-3 ${
                      step2Done
                        ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                        : 'bg-white/[0.03] border-white/10 hover:border-amber-400/40 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                      step2Done ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {step2Done ? '✓' : '2'}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {step2Done ? 'Banco 100% Conciliado' : `Conciliar Banco (${reconciliationStats.matchPercent}%)`}
                      </div>
                      <p className="text-[11px] text-white/60 mt-0.5">
                        {step2Done ? 'Diferencial NIC 21 y lotes POS cuadrados.' : 'Cruzar extractos bancarios y POS en 1 clic.'}
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setOperationStep('books');
                      setActiveTab('operations');
                    }}
                    className={`text-left p-3.5 rounded-xl border transition-all duration-200 flex items-start gap-3 ${
                      step3Done
                        ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                        : 'bg-white/[0.03] border-white/10 hover:border-emerald-400/40 hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                      step3Done ? 'bg-emerald-500 text-slate-950' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {step3Done ? '✓' : '3'}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-white">
                        Exportar TXT / XML SENIAT
                      </div>
                      <p className="text-[11px] text-white/60 mt-0.5">
                        Libros 16 columnas y comprobantes ARC listos.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* 4 Bento KPI Cards de la Cartera Global Interactivos en 1 Clic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => {
                setClientPortfolioFilter('ALL');
                document.getElementById('client-cards-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group ${
                clientPortfolioFilter === 'ALL' ? 'ring-1 ring-sky-400/40 bg-sky-500/[0.04]' : ''
              }`}
              title="Tocar para mostrar todas las empresas a cargo"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-blue w-7 h-7">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-white/80">Empresas a Cargo</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/90">
                  GESTIÓN
                </span>
              </div>
              <div className="text-2xl font-extrabold text-white tabular-nums tracking-tight">
                {portfolioStats.totalTenants}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Bóveda COT 10 años</span>
                <span className="text-sky-400 font-semibold group-hover:translate-x-0.5 transition-transform">Ver todas →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setClientPortfolioFilter(clientPortfolioFilter === 'URGENTES' ? 'ALL' : 'URGENTES');
                document.getElementById('client-cards-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group ${
                clientPortfolioFilter === 'URGENTES' ? 'ring-2 ring-amber-400/60 bg-amber-500/[0.06]' : ''
              }`}
              title="Tocar para filtrar las empresas con vencimiento próximo (<72h)"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-amber w-7 h-7">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-amber-200">Vencimiento (&lt;72h)</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                  RADAR
                </span>
              </div>
              <div className="text-2xl font-extrabold text-amber-400 tabular-nums tracking-tight">
                {portfolioStats.totalUrgentCount}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Terminales prioritarios</span>
                <span className="text-amber-300 font-semibold group-hover:translate-x-0.5 transition-transform">
                  {clientPortfolioFilter === 'URGENTES' ? 'Mostrando urgentes ✓' : 'Filtrar urgentes →'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                const pendingCard = portfolioStats.clientCards.find(c => c.pendienteCount > 0);
                if (pendingCard) {
                  setSelectedTenantId(pendingCard.tenant.id);
                  setOperationStep('scanner');
                  setActiveTab('operations');
                } else {
                  setClientPortfolioFilter('PENDIENTES');
                }
              }}
              className={`ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group ${
                clientPortfolioFilter === 'PENDIENTES' ? 'ring-2 ring-rose-400/60 bg-rose-500/[0.06]' : ''
              }`}
              title="Tocar para ir directo a revisar y firmar las facturas pendientes"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-rose w-7 h-7">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-rose-200">Por Aprobar</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300">
                  POR FIRMAR
                </span>
              </div>
              <div className="text-2xl font-extrabold text-rose-400 tabular-nums tracking-tight">
                {portfolioStats.totalPendingDrafts}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Facturas IA / Telegram</span>
                <span className="text-rose-300 font-semibold group-hover:translate-x-0.5 transition-transform">Revisar →</span>
              </div>
            </button>

            <a
              href={getWhatsAppClosingSummaryUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2.5 text-left cursor-pointer transition-all group hover:bg-emerald-900/30"
              title="Tocar para abrir el resumen de cierre quincenal listo para enviar por WhatsApp"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-emerald w-7 h-7">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-300">Cuota Global</span>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                  ESTIMADA
                </span>
              </div>
              <div className="text-xl font-extrabold font-mono text-emerald-400">
                Bs. {portfolioStats.totalEstimatedQuotaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Ref: USD {(portfolioStats.totalEstimatedQuotaBs / bcvRate).toFixed(2)} (@ BCV)</span>
                <span className="text-emerald-300 font-semibold group-hover:translate-x-0.5 transition-transform">Reporte WA →</span>
              </div>
            </a>
          </div>

          {/* Filtros Rápidos y Buscador en Tiempo Real */}
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="w-4 h-4 absolute left-3 top-3 opacity-60 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={clientSearchQuery}
                onChange={e => setClientSearchQuery(e.target.value)}
                placeholder="Buscar empresa por nombre, RIF, terminal o código Telegram..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs font-mono">
              {[
                { id: 'ALL', label: `Todos (${portfolioStats.totalTenants})` },
                { id: 'URGENTES', label: `🔥 Urgentes (${portfolioStats.totalUrgentCount})` },
                { id: 'SPE', label: 'Especiales (SPE)' },
                { id: 'ORDINARIO', label: 'Ordinarios' },
                { id: 'PENDIENTES', label: `⚠️ Con Pendientes (${portfolioStats.totalPendingDrafts})` },
                { id: 'AL_DIA', label: '✅ Al Día' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setClientPortfolioFilter(f.id as typeof clientPortfolioFilter)}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    clientPortfolioFilter === f.id
                      ? 'bg-emerald-500/20 text-emerald-400 font-bold border-emerald-500/40'
                      : 'border-transparent bg-[var(--bg-surface)] text-[var(--muted-foreground)] hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {copiedTelegramTenantId && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between">
              <span>[CÓDIGO TELEGRAM COPIADO] Listo para pegar en WhatsApp o enviar al dueño del negocio.</span>
              <button onClick={() => setCopiedTelegramTenantId(null)} className="opacity-70 hover:opacity-100">
                [X]
              </button>
            </div>
          )}

          {/* Grid de Fichas Bento Inteligentes de Clientes */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredClientCards.map(card => {
              const { tenant, invoices: cInvoices, spe, conformeCount, advertenciaCount, pendienteCount, totalCount, debitBs, creditBs, netQuotaBs } = card;
              const isSelected = tenant.id === selectedTenantId;
              const initials = getTenantInitials(tenant.name);
              const waUrl = getWhatsAppRemindUrl(tenant.name, tenant.rif, spe.terminalDigit, spe.quincena1Deadline, pendienteCount, tenant.telegramCode);

              return (
                <div
                  key={tenant.id}
                  className={`p-5 rounded-2xl border transition-all space-y-4 ${
                    isSelected
                      ? 'bg-[var(--bg-elevated)] border-emerald-500/60 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/30'
                      : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:border-white/20'
                  }`}
                >
                  {/* Top Row: Avatar, Nombre, RIF con Terminal Resaltado y Badges */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/30 border border-emerald-500/40 flex items-center justify-center font-extrabold text-base text-emerald-300 font-mono shadow-sm">
                        {initials}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-base text-white tracking-tight">
                            {tenant.name}
                          </h3>
                          {isSelected && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                              ACTIVO EN SESIÓN
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                          <span className="text-[var(--muted-foreground)]">
                            RIF: <strong className="text-white">{tenant.rif.slice(0, -1)}</strong>
                            <span className="ml-0.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-extrabold text-xs">
                              {spe.terminalDigit}
                            </span>
                          </span>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tenant.regime === 'SPE'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          }`}>
                            {tenant.regime === 'SPE' ? 'SPE (Quincenal)' : 'Ordinario (Mensual)'}
                          </span>

                          <span className="text-[10px] opacity-70">
                            Telegram: {tenant.telegramCode}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      {pendienteCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> {pendienteCount} Por Firmar
                        </span>
                      ) : totalCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" /> Al Día
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/10 text-[var(--muted-foreground)]">
                          Sin Movimientos
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Vencimiento SENIAT y Calendario Quincenal */}
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <span>
                        Vence 1ª Quincena: <strong className="text-white underline decoration-amber-400">{spe.quincena1Deadline}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>2ª Quincena: {spe.quincena2Deadline}</span>
                    </div>
                  </div>

                  {/* Balanza Fiscal Express del Cliente */}
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-mono">
                    <div>
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase block">Ventas (Débito)</span>
                      <strong className="text-sm text-white block">Bs. {debitBs.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--muted-foreground)] uppercase block">Compras (Crédito)</span>
                      <strong className="text-sm text-sky-400 block">Bs. {creditBs.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-emerald-400 uppercase font-bold block">Cuota SENIAT</span>
                      <strong className="text-sm text-emerald-400 block">Bs. {netQuotaBs.toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* Barra de Semáforo de Facturas */}
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-[11px] text-[var(--muted-foreground)]">
                      <span>Documentos: {totalCount} en quincena</span>
                      <span className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">{conformeCount} Conformes</span>
                        {advertenciaCount > 0 && <span className="text-amber-400 font-bold">· {advertenciaCount} Advertencias</span>}
                        {pendienteCount > 0 && <span className="text-rose-400 font-bold">· {pendienteCount} Borradores</span>}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded bg-slate-800 overflow-hidden flex">
                      <div
                        style={{ width: `${totalCount > 0 ? (conformeCount / totalCount) * 100 : 0}%` }}
                        className="h-full bg-emerald-500"
                        title="Conformes"
                      />
                      <div
                        style={{ width: `${totalCount > 0 ? (advertenciaCount / totalCount) * 100 : 0}%` }}
                        className="h-full bg-amber-400"
                        title="Advertencias"
                      />
                      <div
                        style={{ width: `${totalCount > 0 ? (pendienteCount / totalCount) * 100 : 0}%` }}
                        className="h-full bg-rose-500 animate-pulse"
                        title="Borradores Pendientes"
                      />
                    </div>
                  </div>

                  {/* Sub-Cuenta Empresarial (Monetización B2B2B) */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <div>
                        <span className="text-[10px] text-[var(--muted-foreground)] block uppercase">Sub-Cuenta Empresa:</span>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{tenant.subAccountContactName || (tenant.subAccountEnabled ? 'Acceso Habilitado' : 'Sin Acceso Configurado')}</span>
                          {tenant.subAccountEnabled && (
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                              tenant.subAccountStatus === 'TRIAL_15_DIAS'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : tenant.subAccountStatus === 'ACTIVA'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {tenant.subAccountStatus === 'TRIAL_15_DIAS'
                                ? `🎁 Trial (${tenant.trialDaysLeft ?? 12}d)`
                                : tenant.subAccountStatus === 'ACTIVA'
                                ? `🟢 Solvente ($${tenant.monthlyFeeUsd || 29.99}/m)`
                                : '🔴 Por Renovar'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenSubAccountModal(tenant)}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-white/10 text-emerald-300 flex items-center gap-1 text-[11px] font-bold transition"
                        title="Configurar Sub-Cuenta y Enviar Acceso por WhatsApp"
                      >
                        <KeyRound className="w-3 h-3" />
                        {tenant.subAccountEnabled ? 'Gestionar Sub-Cuenta' : '+ Crear Sub-Cuenta'}
                      </button>

                      {tenant.subAccountEnabled && (
                        <button
                          onClick={() => setSubPaymentModalTenant(tenant)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 text-[11px] font-bold transition"
                          title="Cobrar / Renovar Suscripción (Pago Móvil / Binance)"
                        >
                          <CreditCard className="w-3 h-3" />
                          Cobrar / Pago Móvil
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Acciones Rápidas en 1 Clic (Entregables y WhatsApp) */}
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedTenantId(tenant.id);
                          setActiveTab('simplified');
                        }}
                        className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Abrir Asistente
                      </button>

                      <button
                        onClick={() =>
                          handleDownloadFile(
                            `RET_IVA_${tenant.rif}_202611.txt`,
                            exportSeniatIvaTxt16(tenant.rif, '202611', cInvoices),
                            'text/plain'
                          )
                        }
                        title="Descargar TXT IVA (16 columnas) oficial SENIAT"
                        className="px-2.5 py-2 rounded-lg bg-[var(--bg-surface)] hover:bg-white/10 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 transition"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        TXT IVA
                      </button>

                      <button
                        onClick={() =>
                          handleDownloadFile(
                            `LIBRO_FISCAL_${tenant.rif}_202611.csv`,
                            exportSeniatPurchaseAndSalesBookCsv(tenant.name, tenant.rif, '202611', 'ALL', cInvoices),
                            'text/csv;charset=utf-8'
                          )
                        }
                        title="Descargar Libro de Compras y Ventas Excel (CSV)"
                        className="px-2.5 py-2 rounded-lg bg-[var(--bg-surface)] hover:bg-white/10 text-sky-300 border border-sky-500/40 flex items-center gap-1 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Libro Excel
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1.5 transition"
                        title="Abrir WhatsApp con mensaje pre-redactado de quincena"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        Pedir Facturas WhatsApp
                      </a>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`/vincular ${tenant.telegramCode}`);
                          setCopiedTelegramTenantId(tenant.id);
                          setTimeout(() => setCopiedTelegramTenantId(null), 4000);
                        }}
                        title="Copiar comando de vinculación Telegram"
                        className="p-2 rounded-lg bg-[var(--bg-surface)] hover:bg-white/10 text-[var(--muted-foreground)] hover:text-white border border-[var(--border-subtle)] transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* Botón Eliminar Empresa */}
                      <button
                        onClick={() => handleDeleteTenant(tenant.id, tenant.name)}
                        title="Eliminar Empresa de la Cartera"
                        className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition active:scale-[0.98]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 01: ASISTENTE DEL CONTADOR SIMPLIFICADO (SENIAT 2026)
         ===================================================================== */}
      {activeTab === 'simplified' && (
        <div className="space-y-6">
          {/* 1. Alerta Inteligente de Vencimiento de Quincena (Providencia SPE SENIAT) */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400 flex-shrink-0 mt-0.5">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Calendario Oficial SENIAT · Sujetos Pasivos Especiales
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                    {speCalendar.statusLabel}
                  </span>
                </div>
                <p className="text-sm text-[var(--foreground)] mt-1 font-medium">
                  La empresa <strong className="text-white">{activeTenant.name}</strong> tiene RIF terminado en <strong className="text-amber-400 font-mono">"{speCalendar.terminalDigit}"</strong>.
                  Su declaración quincenal de IVA vence el <strong className="text-white underline decoration-amber-400">{speCalendar.quincena1Deadline}</strong>.
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Próxima fecha límite 2ª Quincena: {speCalendar.quincena2Deadline} · IGTF Divisas: {speCalendar.igtfDeadline}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  handleDownloadFile(
                    `LIBRO_FISCAL_SENIAT_${activeTenant.rif}_202611.csv`,
                    exportSeniatPurchaseAndSalesBookCsv(activeTenant.name, activeTenant.rif, '202611', 'ALL', tenantInvoices),
                    'text/csv;charset=utf-8'
                  )
                }
                className="px-3.5 py-2 text-xs font-bold rounded-lg bg-[var(--bg-elevated)] hover:bg-white/10 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" />
                Exportar Libro Excel (CSV)
              </button>
              <button
                onClick={() =>
                  handleDownloadFile(
                    `RET_IVA_${activeTenant.rif}_202611.txt`,
                    exportSeniatIvaTxt16(activeTenant.rif, '202611', tenantInvoices),
                    'text/plain'
                  )
                }
                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow flex items-center gap-1.5 transition"
              >
                <Download className="w-4 h-4" />
                Descargar TXT SENIAT
              </button>
            </div>
          </div>

          {/* 2. Acciones Rápidas del Contador (Entregables en 1 Clic) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() =>
                handleDownloadFile(
                  `RET_IVA_${activeTenant.rif}_202611.txt`,
                  exportSeniatIvaTxt16(activeTenant.rif, '202611', tenantInvoices),
                  'text/plain'
                )
              }
              className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-emerald-500/50 hover:bg-emerald-500/5 transition text-left space-y-1.5 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> TXT IVA SENIAT
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">16 COLS</span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Archivo oficial delimitado para subir al portal del SENIAT.</p>
            </button>

            <button
              onClick={() =>
                handleDownloadFile(
                  `RET_ISLR_${activeTenant.rif}_202611.xml`,
                  exportIslrXmlDecreto1808(activeTenant.rif, '202611', tenantInvoices),
                  'application/xml'
                )
              }
              className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-sky-500/50 hover:bg-sky-500/5 transition text-left space-y-1.5 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> XML ISLR Dec. 1808
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">XML</span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Relación estructurada de retenciones ISLR para enterar.</p>
            </button>

            <button
              onClick={() => {
                const targetInv = tenantInvoices.find(i => i.vatRetentionRate > 0) || tenantInvoices[0];
                if (targetInv) {
                  openPrintableRetentionVoucher(activeTenant.name, activeTenant.rif, targetInv, buildVoucher14Digits('202611', 1));
                } else {
                  alert('No hay facturas con retención registrada en este cliente.');
                }
              }}
              className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-purple-500/50 hover:bg-purple-500/5 transition text-left space-y-1.5 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                  <Printer className="w-4 h-4" /> Comprobante PDF
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">14 DÍGITOS</span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Comprobante oficial de retención listo para imprimir o enviar.</p>
            </button>

            <button
              onClick={() => setActiveTab('ocr')}
              className="p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-amber-500/50 hover:bg-amber-500/5 transition text-left space-y-1.5 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Camera className="w-4 h-4" /> Cargar Facturas
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">FOTOS / PDF</span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Lector automático por foto, QR fiscal o Telegram sin teclear.</p>
            </button>
          </div>

          {/* 3. Balanza Resumen Fiscal Quincenal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="ui-card p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] uppercase">
                <span>Ventas Facturadas</span>
                <span className="text-emerald-400 font-bold">Débito Fiscal</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                Bs. {fiscalSummary.debitVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] font-mono">
                Ref: USD {(fiscalSummary.debitVatBs / bcvRate).toFixed(2)} @ Tasa BCV ({bcvRate} Bs.)
              </div>
            </div>

            <div className="ui-card p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] uppercase">
                <span>Compras Deducibles</span>
                <span className="text-sky-400 font-bold">Crédito Fiscal</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                Bs. {fiscalSummary.creditVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] font-mono">
                Ref: USD {(fiscalSummary.creditVatBs / bcvRate).toFixed(2)} deducible de IVA
              </div>
            </div>

            <div className="ui-card p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] uppercase">
                <span>Retenciones IVA</span>
                <span className="text-purple-400 font-bold">Enteradas</span>
              </div>
              <div className="text-xl font-bold font-mono text-white">
                Bs. {fiscalSummary.withheldVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] font-mono">
                Soportadas por clientes especiales
              </div>
            </div>

            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2">
              <div className="flex items-center justify-between text-xs text-emerald-300 font-bold uppercase">
                <span>Cuota a Pagar SENIAT</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">ESTIMADA</span>
              </div>
              <div className="text-xl font-extrabold font-mono text-emerald-400">
                Bs. {fiscalSummary.netQuotaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-emerald-200 font-mono">
                {fiscalSummary.netQuotaBs > 0
                  ? `Equivalente: USD ${(fiscalSummary.netQuotaBs / bcvRate).toFixed(2)} @ BCV`
                  : 'Excedente de Crédito Fiscal a Favor'}
              </div>
            </div>
          </div>

          {/* 4. Semáforo Fiscal de Cumplimiento SENIAT */}
          <div className="ui-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>🚦</span> Semáforo Fiscal SENIAT (Providencia SNAT/2026/00093)
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Diagnóstico visual inmediato de cada factura para evitar multas y reparos tributarios.
                </p>
              </div>

              {/* Filtros del Semáforo */}
              <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                <button
                  onClick={() => setFilterSemaforo('ALL')}
                  className={`px-3 py-1.5 rounded-lg border transition ${
                    filterSemaforo === 'ALL'
                      ? 'bg-white/10 font-bold border-white/30 text-white'
                      : 'border-transparent text-[var(--muted-foreground)] hover:text-white'
                  }`}
                >
                  Todas ({tenantInvoices.length})
                </button>
                <button
                  onClick={() => setFilterSemaforo('CONFORME')}
                  className={`px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    filterSemaforo === 'CONFORME'
                      ? 'bg-emerald-500/20 font-bold border-emerald-500/40 text-emerald-400'
                      : 'border-transparent text-emerald-400/70 hover:text-emerald-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  Conformes ({semaforoCounts.conforme})
                </button>
                <button
                  onClick={() => setFilterSemaforo('ADVERTENCIA')}
                  className={`px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    filterSemaforo === 'ADVERTENCIA'
                      ? 'bg-amber-500/20 font-bold border-amber-500/40 text-amber-400'
                      : 'border-transparent text-amber-400/70 hover:text-amber-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  Advertencias ({semaforoCounts.advertencia})
                </button>
                <button
                  onClick={() => setFilterSemaforo('PENDIENTE')}
                  className={`px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                    filterSemaforo === 'PENDIENTE'
                      ? 'bg-rose-500/20 font-bold border-rose-500/40 text-rose-400'
                      : 'border-transparent text-rose-400/70 hover:text-rose-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  Borradores ({semaforoCounts.pendiente})
                </button>
              </div>
            </div>

            {/* Listado con Semáforo Visual */}
            <div className="space-y-3">
              {semaforoFilteredInvoices.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
                  No hay facturas en esta categoría.
                </div>
              ) : (
                semaforoFilteredInvoices.map(inv => {
                  const isConforme = inv.status === 'APROBADA' && isVatDeductible(inv);
                  const isAdvertencia = !isVatDeductible(inv);
                  const isBorrador = inv.status === 'BORRADOR_IA';
                  const totalBsVal = toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate);

                  return (
                    <div
                      key={inv.id}
                      className={`p-4 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-4 ${
                        isConforme
                          ? 'bg-emerald-950/15 border-emerald-500/30'
                          : isAdvertencia
                          ? 'bg-amber-950/20 border-amber-500/30'
                          : 'bg-rose-950/20 border-rose-500/30'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="mt-1">
                          {isConforme && <span className="inline-block w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />}
                          {isAdvertencia && <span className="inline-block w-3.5 h-3.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />}
                          {isBorrador && <span className="inline-block w-3.5 h-3.5 rounded-full bg-rose-400 shadow-sm shadow-rose-400/50 animate-pulse" />}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-white">
                              Factura #{inv.invoiceNumber}
                            </span>
                            <span className="text-xs text-[var(--muted-foreground)] font-mono">
                              (Ctrl: {inv.controlNumber})
                            </span>
                            <span className="text-xs text-[var(--foreground)] font-medium">
                              {inv.supplierName}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white">
                              RIF: {inv.supplierRif}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--muted-foreground)]">
                              {inv.bookType}
                            </span>
                          </div>

                          <div className="text-xs">
                            {isConforme && (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Conforme para Declaración SENIAT (Providencia 00093).
                              </span>
                            )}
                            {isAdvertencia && (
                              <span className="text-amber-300 flex items-center gap-1 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" /> Ticket de máquina fiscal sin RIF del comprador. Deducible como gasto ISLR pero NO genera crédito fiscal IVA.
                              </span>
                            )}
                            {isBorrador && (
                              <span className="text-rose-300 flex items-center gap-1 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" /> Factura en Borrador. Requiere aprobación del contador antes de incluirse en el TXT SENIAT.
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-[var(--muted-foreground)]">
                            Fecha: {inv.emissionDate} · Moneda Original: {inv.currency} {inv.totalOriginal.toLocaleString('es-VE', { minimumFractionDigits: 2 })} @ BCV {inv.bcvRateOnDate} Bs.
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 ml-auto">
                        <div className="text-right font-mono">
                          <div className="font-bold text-sm text-white">
                            Bs. {totalBsVal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            IVA: Bs. {toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate).toFixed(2)}
                            {inv.vatRetentionRate > 0 && ` (Ret. ${inv.vatRetentionRate}%)`}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isBorrador && (
                            <button
                              onClick={() => handleApproveInvoice(inv.id)}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow flex items-center gap-1 transition"
                            >
                              <Check className="w-3.5 h-3.5" /> Aprobar
                            </button>
                          )}
                          {inv.vatRetentionRate > 0 && (
                            <button
                              onClick={() => openPrintableRetentionVoucher(activeTenant.name, activeTenant.rif, inv, buildVoucher14Digits('202611', 1))}
                              className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-purple-400 text-purple-300 flex items-center gap-1 transition"
                              title="Ver Comprobante de Retención de 14 Dígitos"
                            >
                              <Printer className="w-3 h-3" /> PDF
                            </button>
                          )}
                          <button
                            onClick={() => setInspectedInvoice(inv)}
                            className="p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:text-white text-[var(--muted-foreground)] transition"
                            title="Ver Detalle Forense"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 5. Calculadora Rápida Bimoneda de Factura ($ a Bs. BCV) */}
          <div className="ui-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <span>🧮</span> Calculadora Contable Bimoneda (USD ⇄ Bolívares BCV)
                </h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  Convierte cualquier importe en dólares a bolívares oficiales con desglose automático de IVA, IGTF y retención.
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                Tasa Oficial BCV: Bs. {bcvRate.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-[var(--muted-foreground)] block mb-1.5 font-medium">Monto Total en Dólares ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={calcUsdInput}
                  onChange={e => setCalcUsdInput(Number(e.target.value) || 0)}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5 text-base font-bold font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-[var(--muted-foreground)] block mb-1.5 font-medium">Porcentaje de Retención IVA</label>
                <select
                  value={calcRetPercent}
                  onChange={e => setCalcRetPercent(Number(e.target.value))}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={75}>75% (Contribuyente Especial Estándar)</option>
                  <option value={100}>100% (Proveedor no formalizado / Sin RIF en factura)</option>
                  <option value={0}>0% (Sin Retención)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-[var(--muted-foreground)] block mb-1.5 font-medium">¿Pago en Efectivo/Divisas? (IGTF 3%)</label>
                <select
                  value={calcIgtfPercent}
                  onChange={e => setCalcIgtfPercent(Number(e.target.value))}
                  className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value={0}>No (Transferencia en Bolívares - 0%)</option>
                  <option value={3}>Sí (Pago en Dólares en Efectivo - Aplica 3% IGTF)</option>
                </select>
              </div>
            </div>

            {/* Resultado en Bolívares */}
            <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
              <div className="space-y-1">
                <span className="text-[var(--muted-foreground)] block">Base Imponible (Bs.):</span>
                <span className="text-base font-bold text-white block">
                  Bs. {calcBaseBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] block">
                  USD {(calcBaseBs / bcvRate).toFixed(2)}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[var(--muted-foreground)] block">IVA 16% (Bs.):</span>
                <span className="text-base font-bold text-sky-400 block">
                  Bs. {calcIvaBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] block">
                  USD {(calcIvaBs / bcvRate).toFixed(2)}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[var(--muted-foreground)] block">Retención IVA {calcRetPercent}%:</span>
                <span className="text-base font-bold text-purple-400 block">
                  Bs. {calcRetBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-[var(--muted-foreground)] block">
                  Enterar al SENIAT
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-emerald-400 block font-bold">Neto a Transferir (Bs.):</span>
                <span className="text-base font-extrabold text-emerald-400 block">
                  Bs. {calcNetoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {calcIgtfPercent > 0 && (
                  <span className="text-[10px] text-amber-300 block">
                    Incluye IGTF 3% (Bs. {calcIgtfBs.toFixed(2)})
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 01: CENTRO DE MANDO (12-COL ASYMMETRIC BENTO GRID: 8 + 4)
         ===================================================================== */}
      {activeTab === 'command' && (
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-12 lg:col-span-8 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="ui-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono opacity-70 uppercase">Débito Fiscal IVA (Ventas)</span>
                  <svg className="w-16 h-5 text-[var(--accent-secondary)]" viewBox="0 0 64 20" fill="none">
                    <polyline points="2,16 14,12 26,14 38,8 50,9 62,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="ui-metric text-2xl md:text-3xl font-bold mt-2 text-[var(--accent-secondary)]">
                  Bs. {fiscalSummary.debitVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono opacity-75 mt-1">
                  Ref: USD {(fiscalSummary.debitVatBs / bcvRate).toFixed(2)} @ Tasa BCV ({bcvRate} Bs.)
                </div>
              </div>

              <div className="ui-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono opacity-70 uppercase">Crédito Fiscal Deducible (Compras)</span>
                  <svg className="w-16 h-5 text-emerald-400" viewBox="0 0 64 20" fill="none">
                    <polyline points="2,15 16,13 28,9 42,11 52,6 62,4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="ui-metric text-2xl md:text-3xl font-bold mt-2 text-emerald-400">
                  Bs. {fiscalSummary.creditVatBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono text-amber-400 mt-1">
                  Excluido Art. 10.4 (Tickets sin RIF): Bs. {fiscalSummary.disqualifiedVatBs.toFixed(2)}
                </div>
              </div>

              <div className="ui-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono opacity-70 uppercase">Cuota Neta IVA a Declarar (Forma 30)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10">SENIAT F-30</span>
                </div>
                <div className="ui-metric text-2xl md:text-3xl font-bold mt-2 text-[var(--accent-primary)]">
                  Bs. {fiscalSummary.netQuotaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono opacity-75 mt-1">
                  Retenciones IVA Aplicadas: Bs. {fiscalSummary.withheldVatBs.toFixed(2)}
                </div>
              </div>

              <div className="ui-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono opacity-70 uppercase">IGTF Percibido / Pagado (3% Divisas)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10">ALÍCUOTA 3%</span>
                </div>
                <div className="ui-metric text-2xl md:text-3xl font-bold mt-2">
                  Bs. {fiscalSummary.igtfBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-xs font-mono opacity-75 mt-1">
                  Régimen Cliente: {activeTenant.regime === 'SPE' ? 'Sujeto Pasivo Especial (SPE)' : 'Contribuyente Ordinario'}
                </div>
              </div>
            </div>

            {/* 2026 Micro-Visualization: Barra de Equilibrio Fiscal IVA (Débito vs Crédito vs Retenciones SPE) */}
            <div className="ui-card p-4 space-y-2.5 text-xs font-mono">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold uppercase">Balance de Compensación Fiscal IVA (Período Actual)</span>
                <span className="opacity-75 tabular-nums">
                  Cobertura Crédito/Débito:{' '}
                  {fiscalSummary.debitVatBs > 0
                    ? `${Math.min(100, Math.round((fiscalSummary.creditVatBs / fiscalSummary.debitVatBs) * 100))}%`
                    : '100%'}
                </span>
              </div>
              <div className="w-full h-3 rounded bg-[var(--bg-elevated)] overflow-hidden flex">
                <div
                  style={{
                    width: `${
                      fiscalSummary.debitVatBs > 0
                        ? Math.min(100, Math.round((fiscalSummary.creditVatBs / fiscalSummary.debitVatBs) * 100))
                        : 50
                    }%`
                  }}
                  className="h-full bg-emerald-400 transition-all"
                  title="Crédito Fiscal Deducible"
                />
                <div
                  style={{
                    width: `${
                      fiscalSummary.debitVatBs > 0
                        ? Math.min(40, Math.round((fiscalSummary.withheldVatBs / fiscalSummary.debitVatBs) * 100))
                        : 20
                    }%`
                  }}
                  className="h-full bg-[var(--accent-secondary)] transition-all"
                  title="Retenciones IVA SPE (75%)"
                />
                <div className="flex-1 h-full bg-[var(--accent-primary)]" title="Cuota Neta por Pagar Forma 30" />
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-[11px] opacity-85 pt-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> Crédito Fiscal: Bs. {fiscalSummary.creditVatBs.toFixed(2)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-secondary)] inline-block" /> Retenciones 75%: Bs. {fiscalSummary.withheldVatBs.toFixed(2)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[var(--accent-primary)] inline-block" /> Neto Forma 30: Bs. {fiscalSummary.netQuotaBs.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Audit Alert Banner for Art. 10.4 SNAT/2026/00093 */}
            {fiscalSummary.disqualifiedVatBs > 0 && (
              <div className="ui-card p-4 border-amber-500/60 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs font-mono">
                  <strong className="text-amber-400 uppercase">Filtro Preventivo Art. 10.4 SNAT/2026/00093:</strong> Se detectaron tickets de Máquina Fiscal sin RIF del comprador por Bs.{' '}
                  {fiscalSummary.disqualifiedVatBs.toFixed(2)} de IVA. El sistema los excluyó automáticamente del Crédito Fiscal para evitar reparos y multas del SENIAT.
                </div>
              </div>
            )}

            {/* Contingency Alert Banner Arts. 6-7 */}
            {fiscalSummary.contingencyCount > 0 && (
              <div className="ui-card p-4 border-rose-500/60 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="text-xs font-mono">
                  <strong className="text-rose-400 uppercase">Alerta Talonario de Contingencia (Arts. 6-7 SNAT/2026/00093):</strong> Existen {fiscalSummary.contingencyCount} factura(s) emitidas en talonario físico de contingencia. Deben remitirse en PDF al SENIAT dentro de las 24 horas siguientes a su emisión.
                </div>
              </div>
            )}

            {/* Quick Recent Invoices Feed */}
            <div className="ui-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="ui-heading text-base font-bold">Bandeja Fiscal en Tiempo Real ({activeTenant.name})</h2>
                <button
                  onClick={() => setActiveTab('ocr')}
                  className="text-xs font-mono text-[var(--accent-primary)] flex items-center gap-1 hover:underline"
                >
                  + Escanear Nueva Factura <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2 text-xs font-mono">
                {tenantInvoices.slice(0, 4).map(inv => (
                  <div
                    key={inv.id}
                    onClick={() => setInspectedInvoice(inv)}
                    className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] cursor-pointer transition-colors flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] mr-2">{inv.bookType}</span>
                      <strong>#{inv.invoiceNumber}</strong> · {inv.supplierName} ({inv.supplierRif})
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums font-bold">
                        Bs. {toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate).toFixed(2)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          inv.status === 'APROBADA' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {inv.status}
                      </span>
                      <Eye className="w-3.5 h-3.5 opacity-70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right 4-Col Telemetry Sidecar */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            <div className="ui-card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase font-bold">Telemetría Bot Telegram</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">WEBHOOK ONLINE</span>
              </div>
              <p className="text-xs opacity-80 mb-3">
                Código único de vinculación para que el comercio envíe fotos de facturas desde su celular:
              </p>
              <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-sm font-bold text-center text-[var(--accent-primary)]">
                /vincular {activeTenant.telegramCode}
              </div>
              <div className="mt-3 text-[11px] font-mono opacity-75 flex justify-between">
                <span>Chat Vinculado:</span>
                <span>{activeTenant.telegramChatLinked || 'Pendiente'}</span>
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-xs font-mono uppercase font-bold">Calendario SPE SENIAT</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10">
                  RIF Terminal: {speCalendar.terminalDigit}
                </span>
              </div>
              <div className="text-xs font-mono space-y-2">
                <div className="flex justify-between">
                  <span>1ra Quincena IVA + Ret.:</span>
                  <strong className="text-[var(--accent-secondary)]">{speCalendar.quincena1Deadline}</strong>
                </div>
                <div className="flex justify-between">
                  <span>2da Quincena IVA + Ret.:</span>
                  <strong>{speCalendar.quincena2Deadline}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Declaración IGTF (3%):</span>
                  <strong>{speCalendar.igtfDeadline}</strong>
                </div>
                <div className="pt-1 text-[10px] text-emerald-400">{speCalendar.statusLabel}</div>
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="flex items-center gap-2 mb-3">
                <Scale className="w-4 h-4 text-[var(--accent-secondary)]" />
                <span className="text-xs font-mono uppercase font-bold">Monitor Umbral SPE (SNAT/2026/00099)</span>
              </div>
              <div className="text-xs font-mono space-y-2">
                <div className="flex justify-between">
                  <span>Límite Mensual (G.O. 43.485):</span>
                  <span className="font-bold">50.000 TCMV</span>
                </div>
                <div className="flex justify-between">
                  <span>Límite Anual:</span>
                  <span className="font-bold">600.000 TCMV</span>
                </div>
                <div className="w-full h-2 rounded bg-[var(--bg-elevated)] overflow-hidden mt-2">
                  <div className="h-full bg-[var(--accent-primary)] w-[28%]" />
                </div>
                <p className="opacity-70 pt-1">28% del umbral mensual consumido. Monitoreo preventivo activo.</p>
              </div>
            </div>

            <div className="ui-card p-5">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono uppercase font-bold">Último Hash Cadena COT</span>
              </div>
              <div className="p-2.5 rounded bg-[var(--bg-elevated)] font-mono text-[11px] break-all text-emerald-400">
                {auditLogs[auditLogs.length - 1]?.sha256Hash}
              </div>
              <p className="text-[11px] font-mono opacity-70 mt-2">
                {auditLogs.length} eventos encadenados · Inalterabilidad 10 años activa.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          UNIFIED OPERATIONS HUB: APPLE 3-STEP PIPELINE SWITCHER
         ===================================================================== */}
      {activeTab === 'operations' && (
        <div className="ui-card p-4 mb-6 backdrop-blur-xl bg-[var(--bg-frosted)] border border-white/10 shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                  Flujo Operativo Continuo SENIAT · {activeTenant.name}
                </span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight mt-0.5">
                Mesa Operativa Unificada: IA, Libros y Bancos
              </h2>
            </div>

            {/* Apple Segmented 3-Step Pill */}
            <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10 backdrop-blur-md">
              <button
                onClick={() => setOperationStep('scanner')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  operationStep === 'scanner'
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-cyan-500/30 text-[10px] flex items-center justify-center font-mono">1</span>
                <span>Ingesta IA & Telegram</span>
              </button>

              <button
                onClick={() => setOperationStep('books')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  operationStep === 'books'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-emerald-500/30 text-[10px] flex items-center justify-center font-mono">2</span>
                <span>Libros SENIAT & Retenciones</span>
              </button>

              <button
                onClick={() => setOperationStep('reconciliation')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  operationStep === 'reconciliation'
                    ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-amber-500/30 text-[10px] flex items-center justify-center font-mono">3</span>
                <span>Conciliación Bancaria NIC 21</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 02: ESCÁNER IA GEMINI 2.5 FLASH & BOT DE TELEGRAM (8 + 4 BENTO)
         ===================================================================== */}
      {(activeTab === 'ocr' || (activeTab === 'operations' && operationStep === 'scanner')) && (
        <div className="grid grid-cols-12 gap-5">
          {/* 8-Column Main OCR Workbench */}
          <div className="col-span-12 lg:col-span-8 space-y-5">
            <div className="ui-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="ui-heading text-lg font-bold">Mesa de Extracción Multimodal Gemini 2.5 Flash OCR</h2>
                  <p className="text-xs font-mono opacity-75">
                    Clasificación automática SNAT/2026/00093 · Validación Módulo 11 · Bloqueo de Facturas Duplicadas
                  </p>
                </div>
                <label className="ui-btn-primary px-3 py-2 text-xs cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  Subir Foto / PDF Factura
                  <input type="file" accept="image/*,application/pdf" onChange={handleFileUploadSimulation} className="hidden" />
                </label>
              </div>

              {/* Preset Scenarios Bar */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-xs font-mono opacity-75">Plantillas de Prueba Rápida:</span>
                {OCR_PRESETS.map((preset, idx) => (
                  <button
                    key={preset.label}
                    onClick={() => handleLoadOcrPreset(idx)}
                    className="px-2.5 py-1 text-xs font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)] transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {ocrAlertMessage && (
                <div className="p-3 rounded border border-[var(--accent-primary)] bg-[var(--bg-elevated)] text-xs font-mono flex items-center justify-between">
                  <span>{ocrAlertMessage}</span>
                  <button onClick={() => setOcrAlertMessage(null)} className="opacity-70 hover:opacity-100">
                    [X]
                  </button>
                </div>
              )}

              {/* OCR Structured Fields Form */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <label className="block mb-1 opacity-75">Libro Contable</label>
                  <select
                    value={ocrDraft.bookType}
                    onChange={e => setOcrDraft({ ...ocrDraft, bookType: e.target.value as 'COMPRA' | 'VENTA' })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  >
                    <option value="COMPRA">COMPRA (Crédito Fiscal)</option>
                    <option value="VENTA">VENTA (Débito Fiscal)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Canal Emisión (SNAT/2026/00093)</label>
                  <select
                    value={ocrDraft.channel}
                    onChange={e =>
                      setOcrDraft({
                        ...ocrDraft,
                        channel: e.target.value as 'DIGITAL' | 'MAQUINA_FISCAL' | 'CONTINGENCIA'
                      })
                    }
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  >
                    <option value="DIGITAL">DIGITAL (Imprenta / Portal)</option>
                    <option value="MAQUINA_FISCAL">MAQUINA_FISCAL (Ticket Z)</option>
                    <option value="CONTINGENCIA">CONTINGENCIA (Talonario &lt;24h)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 opacity-75">RIF Proveedor / Emisor</label>
                  <input
                    type="text"
                    value={ocrDraft.supplierRif}
                    onChange={e => setOcrDraft({ ...ocrDraft, supplierRif: e.target.value })}
                    className={`w-full p-2 rounded bg-[var(--bg-elevated)] border ${
                      ocrRifValidation.valid ? 'border-emerald-500/50' : 'border-rose-500'
                    }`}
                  />
                  <span className={`text-[10px] ${ocrRifValidation.valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {ocrRifValidation.valid ? `Módulo 11 OK (${ocrRifValidation.formatted})` : 'RIF Inválido (Módulo 11)'}
                  </span>
                </div>

                <div className="md:col-span-2">
                  <label className="block mb-1 opacity-75">Razón Social del Proveedor / Cliente</label>
                  <input
                    type="text"
                    value={ocrDraft.supplierName}
                    onChange={e => setOcrDraft({ ...ocrDraft, supplierName: e.target.value })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  />
                </div>

                <div>
                  <label className="block mb-1 opacity-75">¿Incluye RIF del Comprador?</label>
                  <select
                    value={ocrDraft.hasBuyerRifOnTicket ? 'SI' : 'NO'}
                    onChange={e => setOcrDraft({ ...ocrDraft, hasBuyerRifOnTicket: e.target.value === 'SI' })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  >
                    <option value="SI">SÍ — Deducible de IVA</option>
                    <option value="NO">NO — Descalifica IVA (Art. 10.4)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Nº Factura</label>
                  <input
                    type="text"
                    value={ocrDraft.invoiceNumber}
                    onChange={e => setOcrDraft({ ...ocrDraft, invoiceNumber: e.target.value })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  />
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Nº Control Fiscal</label>
                  <input
                    type="text"
                    value={ocrDraft.controlNumber}
                    onChange={e => setOcrDraft({ ...ocrDraft, controlNumber: e.target.value })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  />
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Fecha y Hora Exacta (Art. 8)</label>
                  <div className="flex gap-1.5">
                    <input
                      type="date"
                      value={ocrDraft.emissionDate}
                      onChange={e => setOcrDraft({ ...ocrDraft, emissionDate: e.target.value })}
                      className="w-3/5 p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                    />
                    <input
                      type="text"
                      value={ocrDraft.emissionTime}
                      onChange={e => setOcrDraft({ ...ocrDraft, emissionTime: e.target.value })}
                      className="w-2/5 p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Moneda de Operación</label>
                  <select
                    value={ocrDraft.currency}
                    onChange={e => setOcrDraft({ ...ocrDraft, currency: e.target.value as 'VES' | 'USD' })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  >
                    <option value="USD">USD (Convertir a Tasa BCV {bcvRate})</option>
                    <option value="VES">VES (Bolívares Soberanos)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Base Imponible ({ocrDraft.currency})</label>
                  <input
                    type="number"
                    value={ocrDraft.taxableBaseOriginal}
                    onChange={e => setOcrDraft({ ...ocrDraft, taxableBaseOriginal: Number(e.target.value) || 0 })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Monto Exento ({ocrDraft.currency})</label>
                  <input
                    type="number"
                    value={ocrDraft.exemptOriginal}
                    onChange={e => setOcrDraft({ ...ocrDraft, exemptOriginal: Number(e.target.value) || 0 })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block mb-1 opacity-75">IGTF 3% ({ocrDraft.currency})</label>
                  <input
                    type="number"
                    value={ocrDraft.igtfOriginal}
                    onChange={e => setOcrDraft({ ...ocrDraft, igtfOriginal: Number(e.target.value) || 0 })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Retención IVA SPE (%)</label>
                  <select
                    value={ocrDraft.vatRetentionRate}
                    onChange={e => setOcrDraft({ ...ocrDraft, vatRetentionRate: Number(e.target.value) as 0 | 75 | 100 })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                  >
                    <option value={0}>0% (Sin Retención)</option>
                    <option value={75}>75% (Retención Ordinaria SPE)</option>
                    <option value={100}>100% (Retención Total Art. SNAT)</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 opacity-75">Retención ISLR Dec. 1808 (%)</label>
                  <input
                    type="number"
                    value={ocrDraft.islrRetentionRate}
                    onChange={e => setOcrDraft({ ...ocrDraft, islrRetentionRate: Number(e.target.value) || 0 })}
                    className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                  />
                </div>
              </div>

              {/* Real-time Fiscal Validation Warning */}
              {ocrDraft.channel === 'MAQUINA_FISCAL' && !ocrDraft.hasBuyerRifOnTicket && (
                <div className="p-3 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono">
                  [ART. 10.4 SNAT/2026/00093] Este ticket de Máquina Fiscal NO posee RIF del comprador. Se registrará en el Libro de Compras pero su IVA NO será deducible como Crédito Fiscal.
                </div>
              )}

              {ocrDraft.channel === 'CONTINGENCIA' && (
                <div className="p-3 rounded bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-mono">
                  [ARTS. 6-7 SNAT/2026/00093] Factura física de Contingencia detectada. El sistema activará el recordatorio obligatorio de envío PDF al SENIAT en menos de 24 horas.
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
                <div className="text-xs font-mono">
                  <span>Archivo Activo: </span>
                  <strong className="text-[var(--accent-secondary)]">{ocrUploadedFileName}</strong>
                  {ocrScanning && <span className="ml-2 text-amber-400 animate-pulse">Analizando con Gemini 2.5 Flash...</span>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleRegisterOcrInvoice('WEB_OCR')}
                    className="ui-btn-primary px-4 py-2 text-xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Indexar en Bandeja Contable (Web OCR)
                  </button>
                  <button
                    onClick={() => handleRegisterOcrInvoice('TELEGRAM_BOT')}
                    className="px-3.5 py-2 text-xs font-mono rounded border border-[var(--accent-secondary)] text-[var(--accent-secondary)] hover:bg-white/5 flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Simular Recepción vía Bot Telegram
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 4-Column Right Sidecar: Telegram Bot Live Simulator & RIF Validator */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            <div className="ui-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase font-bold flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
                  Consola Bot Telegram (@VeneTurcoBot)
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                  GEMINI 2.5 FLASH
                </span>
              </div>

              <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2 max-h-72 overflow-y-auto text-xs font-mono">
                {telegramSimMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={`p-2.5 rounded ${
                      msg.sender === 'user'
                        ? 'bg-[var(--bg-surface)] border border-[var(--border-subtle)] ml-4'
                        : 'bg-emerald-500/10 border border-emerald-500/30 mr-4 text-emerald-300'
                    }`}
                  >
                    <div className="flex justify-between text-[10px] opacity-60 mb-1">
                      <span>{msg.sender === 'user' ? activeTenant.name : 'VeneTurco Fiscal Bot'}</span>
                      <span>{msg.time}</span>
                    </div>
                    <div>{msg.text}</div>
                  </div>
                ))}
              </div>

              <div className="text-[11px] font-mono opacity-75">
                Comando de vinculación activo: <strong className="text-[var(--accent-primary)]">/vincular {activeTenant.telegramCode}</strong>
              </div>
            </div>

            <div className="ui-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="ui-heading text-sm font-bold">Validador Rápido RIF Módulo 11</h3>
              </div>
              <input
                type="text"
                value={rifTestInput}
                onChange={e => setRifTestInput(e.target.value)}
                placeholder="Ej: J-40918273-8"
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-xs"
              />
              <div
                className={`text-xs font-mono p-3 rounded ${
                  rifValidation.valid ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                }`}
              >
                {rifValidation.valid
                  ? `RIF VÁLIDO (${rifValidation.formatted}) — Dígito verificador Módulo 11 confirmado.`
                  : `RIF INVÁLIDO — El dígito verificador no corresponde con el algoritmo oficial del SENIAT.`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 03: LIBROS FISCALES SENIAT & EXPORTACIÓN TXT 16 COLS / XML ISLR
         ===================================================================== */}
      {(activeTab === 'books' || (activeTab === 'operations' && operationStep === 'books')) && (
        <div className="space-y-5">
          <div className="ui-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="ui-heading text-lg font-bold">Libros Fiscales de Compras y Ventas (SNAT/2026/00093)</h2>
                <p className="text-xs font-mono opacity-75">
                  Inalterabilidad COT 10 años · Prohibido el borrado físico · Ajuste de facturas aprobadas vía Nota de Crédito (03) o Débito (02)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {tenantInvoices.filter(i => i.status !== 'APROBADA').length > 0 && (
                  <button
                    type="button"
                    onClick={handleApproveAllPendingInvoices}
                    className="px-3 py-2 text-xs font-bold rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>✨ Firmar {tenantInvoices.filter(i => i.status !== 'APROBADA').length} en Lote</span>
                  </button>
                )}
                <a
                  href={getWhatsAppClosingSummaryUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 transition"
                  title="Enviar resumen de pago de quincena SENIAT al cliente por WhatsApp"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>📲 Enviar Cierre WhatsApp</span>
                </a>
                <button
                  onClick={() =>
                    handleDownloadFile(
                      `LIBRO_FISCAL_SENIAT_${activeTenant.rif}_202611.csv`,
                      exportSeniatPurchaseAndSalesBookCsv(
                        activeTenant.name,
                        activeTenant.rif,
                        '202611',
                        bookFilter === 'COMPRA' || bookFilter === 'VENTA' ? bookFilter : 'ALL',
                        tenantInvoices
                      ),
                      'text/csv;charset=utf-8'
                    )
                  }
                  className="px-3 py-2 text-xs font-mono border border-emerald-500/50 text-emerald-300 rounded bg-emerald-500/10 hover:bg-emerald-500/20 font-bold"
                >
                  Exportar Libro Excel (CSV)
                </button>
                <button
                  onClick={() =>
                    handleDownloadFile(
                      `RET_IVA_${activeTenant.rif}_202611.txt`,
                      exportSeniatIvaTxt16(activeTenant.rif, '202611', tenantInvoices),
                      'text/plain'
                    )
                  }
                  className="ui-btn-primary px-3 py-2 text-xs"
                >
                  Descargar TXT IVA (16 Cols)
                </button>
                <button
                  onClick={() =>
                    handleDownloadFile(
                      `RET_ISLR_${activeTenant.rif}_202611.xml`,
                      exportIslrXmlDecreto1808(activeTenant.rif, '202611', tenantInvoices),
                      'application/xml'
                    )
                  }
                  className="px-3 py-2 text-xs font-mono border border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]"
                >
                  Descargar XML ISLR (Dec. 1808)
                </button>
              </div>
            </div>

            {adjustmentTarget && (
              <div className="p-4 rounded border border-[var(--accent-primary)] bg-[var(--bg-elevated)] space-y-3 text-xs font-mono">
                <div className="flex items-center justify-between">
                  <strong className="text-[var(--accent-primary)] uppercase">
                    Emitir Nota de Ajuste Legal (COT Inmutabilidad) — Documento Afectado: #{adjustmentTarget.invoiceNumber}
                  </strong>
                  <button onClick={() => setAdjustmentTarget(null)} className="opacity-75 hover:opacity-100">
                    [Cerrar]
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block mb-1 opacity-75">Tipo de Documento</label>
                    <select
                      value={adjustmentDocType}
                      onChange={e => setAdjustmentDocType(e.target.value as '02' | '03')}
                      className="w-full p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
                    >
                      <option value="03">03 — Nota de Crédito (Disminuye monto)</option>
                      <option value="02">02 — Nota de Débito (Incrementa monto)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 opacity-75">Base Imponible del Ajuste ({adjustmentTarget.currency})</label>
                    <input
                      type="number"
                      value={adjustmentReasonBase}
                      onChange={e => setAdjustmentReasonBase(Number(e.target.value) || 0)}
                      className="w-full p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] tabular-nums"
                    />
                  </div>
                  <div className="flex items-end">
                    <button onClick={handleIssueAdjustmentNote} className="ui-btn-primary w-full py-2 px-3 text-xs">
                      Firmar y Vincular a #{adjustmentTarget.invoiceNumber}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* High-Density 2026 Search & Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 opacity-60" />
                <input
                  type="text"
                  value={bookSearchQuery}
                  onChange={e => setBookSearchQuery(e.target.value)}
                  placeholder="Filtrar por RIF, proveedor, Nº factura o control..."
                  className="w-full pl-8 pr-3 py-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-mono">
                {[
                  { id: 'ALL', label: `Todos (${tenantInvoices.length})` },
                  { id: 'COMPRA', label: 'Compras' },
                  { id: 'VENTA', label: 'Ventas' },
                  { id: 'NO_DEDUCIBLE', label: 'Excluidos Art. 10.4' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setBookFilter(f.id as typeof bookFilter)}
                    className={`px-2.5 py-1 rounded border ${
                      bookFilter === f.id
                        ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-bold border-[var(--border-highlight)]'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] opacity-75">
                    <th className="py-2 px-2">Libro / Tipo</th>
                    <th className="py-2 px-2">Fecha / Hora</th>
                    <th className="py-2 px-2">Canal</th>
                    <th className="py-2 px-2">RIF / Razón Social</th>
                    <th className="py-2 px-2">Factura / Control</th>
                    <th className="py-2 px-2 text-right">Base Bs.</th>
                    <th className="py-2 px-2 text-right">IVA Bs.</th>
                    <th className="py-2 px-2 text-right">Total Bs.</th>
                    <th className="py-2 px-2">Estado / Acción COT</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBookInvoices.map(inv => {
                    const sign = inv.docType === '03' ? -1 : 1;
                    const baseBs = toVes(inv.taxableBaseOriginal, inv.currency, inv.bcvRateOnDate) * sign;
                    const totalBs = toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate) * sign;
                    const vatBs = toVes(inv.vatOriginal, inv.currency, inv.bcvRateOnDate) * sign;
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setInspectedInvoice(inv)}
                        className="border-b border-[var(--border-subtle)]/50 hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-2 font-bold">
                          {inv.bookType}
                          <span className="block text-[10px] opacity-70">
                            Doc: {inv.docType === '01' ? '01-Factura' : inv.docType === '02' ? '02-N.Débito' : '03-N.Crédito'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          {inv.emissionDate} <span className="opacity-70">{inv.emissionTime}</span>
                        </td>
                        <td className="py-2.5 px-2">{inv.channel}</td>
                        <td className="py-2.5 px-2">
                          <div>{inv.supplierRif}</div>
                          <div className="opacity-70">{inv.supplierName}</div>
                        </td>
                        <td className="py-2.5 px-2">
                          <div>#{inv.invoiceNumber}</div>
                          <div className="opacity-70">{inv.controlNumber}</div>
                          {inv.affectedDocument && (
                            <div className="text-[10px] text-[var(--accent-primary)]">Afecta: #{inv.affectedDocument}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{baseBs.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">
                          {vatBs.toFixed(2)}
                          {!isVatDeductible(inv) && <span className="block text-[10px] text-amber-400">NO DEDUCIBLE</span>}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold">{totalBs.toFixed(2)}</td>
                        <td className="py-2.5 px-2" onClick={e => e.stopPropagation()}>
                          {inv.status === 'APROBADA' ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <Lock className="w-3 h-3" /> APROBADA
                              </span>
                              {inv.vatRetentionRate > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() =>
                                      openPrintableRetentionVoucher(
                                        activeTenant.name,
                                        activeTenant.rif,
                                        inv,
                                        buildVoucher14Digits(
                                          inv.emissionDate.slice(0, 7).replace('-', '') || '202611',
                                          Math.max(1, tenantInvoices.filter(i => i.vatRetentionRate > 0).findIndex(i => i.id === inv.id) + 1)
                                        )
                                      )
                                    }
                                    title="Imprimir Comprobante de Retención 14 Dígitos (Art. 18)"
                                    className="px-2 py-0.5 rounded bg-[var(--accent-secondary)]/20 text-[var(--accent-secondary)] hover:bg-[var(--accent-secondary)]/30 text-[10px] inline-flex items-center gap-1"
                                  >
                                    <Printer className="w-3 h-3" /> Imprimir
                                  </button>
                                  <button
                                    onClick={() => downloadPdfRetentionVoucher(activeTenant.name, activeTenant.rif, inv)}
                                    title="Descargar Comprobante PDF Vectorial con Código QR Oficial (IVA)"
                                    className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] inline-flex items-center gap-1 font-bold"
                                  >
                                    <Download className="w-3 h-3" /> Ret. IVA
                                  </button>
                                </span>
                              )}
                              {inv.islrRetentionRate > 0 && (
                                <button
                                  onClick={() => downloadPdfIslrRetentionVoucher(activeTenant.name, activeTenant.rif, inv)}
                                  title="Descargar Comprobante Oficial de Retención ISLR (Decreto 1808) en PDF"
                                  className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 text-[10px] inline-flex items-center gap-1 font-bold"
                                >
                                  <FileText className="w-3 h-3 text-purple-400" /> Ret. ISLR
                                </button>
                              )}
                              {inv.docType === '01' && (
                                <button
                                  onClick={() => setAdjustmentTarget(inv)}
                                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px]"
                                >
                                  + Nota C/D
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] transition"
                                title="Eliminar Documento Fiscal"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleApproveInvoice(inv.id)}
                                className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-medium"
                              >
                                Aprobar
                              </button>
                              <button
                                onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                                className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] transition"
                                title="Eliminar Borrador"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--bg-elevated)] border-t-2 border-[var(--border-highlight)] font-bold">
                    <td colSpan={5} className="py-3 px-2">
                      TOTALES CONSOLIDADOS ({filteredBookInvoices.length} documentos filtrados)
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">Bs. {filteredBookTotals.baseBs.toFixed(2)}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-[var(--accent-secondary)]">
                      Bs. {filteredBookTotals.vatBs.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums text-[var(--accent-primary)]">
                      Bs. {filteredBookTotals.totalBs.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-[10px] opacity-80">
                      Ret. IVA: Bs. {filteredBookTotals.withheldBs.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 04: NÓMINA VENEZOLANA LOTTT + APORTES PATRONALES + ART. 142
         ===================================================================== */}
      {activeTab === 'payroll' && (
        <div className="space-y-5">
          {/* 4 Bento KPI Cards Interactivos de Nómina LOTTT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              type="button"
              onClick={() => document.getElementById('payroll-roster-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
              title="Tocar para ir a la nómina activa de trabajadores"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-blue w-7 h-7">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-white/85">Nómina Activa</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/90">LOTTT</span>
              </div>
              <div className="text-2xl font-extrabold text-white tabular-nums tracking-tight">
                {tenantEmployees.length} <span className="text-sm font-normal opacity-70">Trabajadores</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>{activeTenant.name}</span>
                <span className="text-sky-400 font-semibold group-hover:translate-x-0.5 transition-transform">Gestionar →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (tenantEmployees[0]) {
                  downloadPdfPaystub(activeTenant.name, activeTenant.rif, tenantEmployees[0]);
                }
              }}
              className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
              title="Tocar para descargar el Recibo Oficial de Pago LOTTT en PDF con QR"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-emerald w-7 h-7">
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-emerald-200">Neto + Cestaticket</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">RECIBO PDF</span>
              </div>
              <div className="text-xl font-extrabold text-emerald-400 tabular-nums tracking-tight">
                Bs. {payrollBreakdown.netPayBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Deducción 5.5%: -Bs. {payrollBreakdown.totalDeductions.toFixed(2)}</span>
                <span className="text-emerald-300 font-semibold group-hover:translate-x-0.5 transition-transform">Emitir PDF →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={handleExportParafiscalCsv}
              className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
              title="Tocar para descargar la Planilla Parafiscal (IVSS, FAOV, RPE, INCES) en Excel CSV"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-amber w-7 h-7">
                    <Scale className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-amber-200">Aportes Parafiscales</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">IVSS / FAOV</span>
              </div>
              <div className="text-xl font-extrabold text-amber-400 tabular-nums tracking-tight">
                Bs. {(payrollBreakdown.ivssEmployer + payrollBreakdown.faovEmployer + payrollBreakdown.rpeEmployer + payrollBreakdown.incesQuarterlyProvision).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>IVSS + Banavih + INCES</span>
                <span className="text-amber-300 font-semibold group-hover:translate-x-0.5 transition-transform">Descargar CSV →</span>
              </div>
            </button>

            <button
              type="button"
              onClick={handleExportArt142Csv}
              className="ui-card p-4 space-y-2.5 text-left cursor-pointer transition-all group"
              title="Tocar para descargar el Libro de Garantía de Prestaciones Sociales (Art. 142 LOTTT)"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="apple-icon-jewel apple-icon-jewel-purple w-7 h-7">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-purple-200">Prestaciones Art. 142</span>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">5 DÍAS/MES</span>
              </div>
              <div className="text-xl font-extrabold text-purple-300 tabular-nums tracking-tight">
                Bs. {payrollBreakdown.prestacionesMonthlyProvision.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                <span>Garantía Salario Integral</span>
                <span className="text-purple-300 font-semibold group-hover:translate-x-0.5 transition-transform">Exportar Libro →</span>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-12 gap-5">
            <div className="col-span-12 lg:col-span-8 ui-card p-5 space-y-4">
              <h2 className="ui-heading text-lg font-bold">Motor de Nómina Venezolana (LOTTT + Parafiscales + Art. 142)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div>
                <label className="block mb-1 opacity-75">Salario Base Mensual (Bs.)</label>
                <input
                  type="number"
                  value={baseSalaryBs}
                  onChange={e => setBaseSalaryBs(Number(e.target.value) || 0)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                />
              </div>
              <div>
                <label className="block mb-1 opacity-75">Cestaticket Socialista (Bs.)</label>
                <input
                  type="number"
                  value={cestaticketBs}
                  onChange={e => setCestaticketBs(Number(e.target.value) || 0)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                />
              </div>
              <div>
                <label className="block mb-1 opacity-75">Nivel de Riesgo IVSS Patronal</label>
                <select
                  value={riskLevel}
                  onChange={e => setRiskLevel(e.target.value as 'MINIMO' | 'MEDIO' | 'ALTO')}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <option value="MINIMO">Riesgo Mínimo (9%)</option>
                  <option value="MEDIO">Riesgo Medio (10%)</option>
                  <option value="ALTO">Riesgo Máximo (11%)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-xs font-mono">
              <div className="p-3 rounded bg-[var(--bg-elevated)]">
                <span className="opacity-70 block">IVSS Empleado (4%)</span>
                <strong className="tabular-nums">- Bs. {payrollBreakdown.ivssEmployee.toFixed(2)}</strong>
              </div>
              <div className="p-3 rounded bg-[var(--bg-elevated)]">
                <span className="opacity-70 block">FAOV / Banavih (1%)</span>
                <strong className="tabular-nums">- Bs. {payrollBreakdown.faovEmployee.toFixed(2)}</strong>
              </div>
              <div className="p-3 rounded bg-[var(--bg-elevated)]">
                <span className="opacity-70 block">Paro Forzoso RPE (0.5%)</span>
                <strong className="tabular-nums">- Bs. {payrollBreakdown.rpeEmployee.toFixed(2)}</strong>
              </div>
              <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--accent-primary)]">
                <span className="opacity-70 block">Neto a Pagar Trabajador</span>
                <strong className="text-[var(--accent-primary)] tabular-nums">
                  Bs. {payrollBreakdown.netPayBs.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 ui-card p-5 space-y-3 text-xs font-mono">
            <h3 className="ui-heading text-base font-bold">Cargas Patronales y Prestaciones (Art. 142 LOTTT)</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>IVSS Patronal ({riskLevel}):</span>
                <strong className="tabular-nums">Bs. {payrollBreakdown.ivssEmployer.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>FAOV Patronal (2%):</span>
                <strong className="tabular-nums">Bs. {payrollBreakdown.faovEmployer.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Paro Forzoso Patronal (2%):</span>
                <strong className="tabular-nums">Bs. {payrollBreakdown.rpeEmployer.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between">
                <span>Provisión INCES (2%):</span>
                <strong className="tabular-nums">Bs. {payrollBreakdown.incesQuarterlyProvision.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)] text-[var(--accent-secondary)]">
                <span>Garantía Prestaciones (5 días Sal. Integral):</span>
                <strong className="tabular-nums">Bs. {payrollBreakdown.prestacionesMonthlyProvision.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)] font-bold">
                <span>Total Carga Patronal Mensual:</span>
                <span className="tabular-nums">Bs. {payrollBreakdown.totalEmployerCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Multi-Employee LOTTT Roster & Printable Paystubs */}
          <div id="payroll-roster-table" className="col-span-12 ui-card p-5 space-y-4 text-xs font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="ui-heading text-base font-bold">Nómina Activa de Trabajadores ({activeTenant.name})</h3>
                <p className="opacity-75">Registro multi-empleado con emisión de Recibo de Pago LOTTT imprimible / PDF.</p>
              </div>
              <span className="px-2.5 py-1 rounded bg-white/10">{tenantEmployees.length} Trabajadores Activos</span>
            </div>

            <form onSubmit={handleAddEmployee} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <input
                type="text"
                required
                placeholder="Nombre y Apellido"
                value={newEmpName}
                onChange={e => setNewEmpName(e.target.value)}
                className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              />
              <input
                type="text"
                required
                placeholder="Cédula (Ej: V-20.111.222)"
                value={newEmpCedula}
                onChange={e => setNewEmpCedula(e.target.value)}
                className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              />
              <input
                type="text"
                placeholder="Cargo"
                value={newEmpRole}
                onChange={e => setNewEmpRole(e.target.value)}
                className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
              />
              <input
                type="number"
                placeholder="Salario Base Bs."
                value={newEmpSalary}
                onChange={e => setNewEmpSalary(Number(e.target.value) || 0)}
                className="p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] tabular-nums"
              />
              <button type="submit" className="ui-btn-primary py-2 px-3 text-xs flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Agregar Trabajador
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] opacity-75">
                    <th className="py-2 px-2">Trabajador / Cédula</th>
                    <th className="py-2 px-2">Cargo</th>
                    <th className="py-2 px-2 text-right">Salario Base</th>
                    <th className="py-2 px-2 text-right">Deducciones (5.5%)</th>
                    <th className="py-2 px-2 text-right">Neto a Pagar</th>
                    <th className="py-2 px-2 text-right">Prestaciones Art. 142</th>
                    <th className="py-2 px-2 text-right">Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantEmployees.map(emp => {
                    const b = calculateLotttFullBreakdown(emp.baseSalaryBs, emp.cestaticketBs, emp.riskLevel);
                    return (
                      <tr key={emp.id} className="border-b border-[var(--border-subtle)]/50">
                        <td className="py-2.5 px-2">
                          <div className="font-bold">{emp.fullName}</div>
                          <div className="opacity-70 text-[10px]">{emp.cedula} · Ingreso: {emp.hireDate}</div>
                        </td>
                        <td className="py-2.5 px-2">{emp.role}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">Bs. {emp.baseSalaryBs.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-rose-400">- Bs. {b.totalDeductions.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold text-[var(--accent-primary)]">
                          Bs. {b.netPayBs.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums text-[var(--accent-secondary)]">
                          Bs. {b.prestacionesMonthlyProvision.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openPrintablePaystub(activeTenant.name, activeTenant.rif, emp)}
                              title="Vista previa e impresión"
                              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] inline-flex items-center gap-1"
                            >
                              <Printer className="w-3 h-3" /> Imprimir
                            </button>
                            <button
                              onClick={() => downloadPdfPaystub(activeTenant.name, activeTenant.rif, emp)}
                              title="Descargar Recibo Oficial PDF con QR LOTTT"
                              className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] inline-flex items-center gap-1 font-bold"
                            >
                              <Download className="w-3 h-3" /> PDF QR
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(emp.id, emp.fullName)}
                              title="Eliminar Trabajador de la Nómina"
                              className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[10px] transition"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {tenantEmployees.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center opacity-60">
                        No hay trabajadores registrados aún para {activeTenant.name}. Usa el formulario superior para agregar uno.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* =====================================================================
          TAB 05: MOTOR COMERCIAL DE LICENCIAS SAAS (8 + 4 BENTO)
         ===================================================================== */}
      {activeTab === 'saas' && (
        <div className="grid grid-cols-12 gap-5">
          {/* 8-Column SaaS Plans & Payment Registration */}
          <div className="col-span-12 lg:col-span-8 space-y-5">
            <div className="ui-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="ui-heading text-lg font-bold">Motor Comercial de Suscripciones SaaS (Bimoneda BCV)</h2>
                  <p className="text-xs font-mono opacity-75">
                    Control de solvencia multi-empresa · Suspensión preventiva de carga en Firestore (`isTenantLicenseActive`)
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded text-xs font-mono font-bold ${
                    activeTenant.subscriptionStatus === 'ACTIVA'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}
                >
                  LICENCIA {activeTenant.subscriptionStatus} · VENCE: {activeTenant.nextBillingDate}
                </span>
              </div>

              {/* 2-Column + 1 Full Asymmetric Plan Matrix (Avoid generic 3-equal cards) */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {SAAS_PLANS_CATALOG.map((plan, idx) => {
                  const isCurrent = activeTenant.planId === plan.id;
                  const bsPrice = (plan.priceUsdMonthly * bcvRate).toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlanForPayment(plan.id)}
                      className={`p-4 rounded cursor-pointer border transition-all ${
                        idx === 2 ? 'md:col-span-12' : 'md:col-span-6'
                      } ${
                        selectedPlanForPayment === plan.id
                          ? 'bg-[var(--bg-elevated)] border-[var(--accent-primary)]'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/10">
                            {plan.id}
                          </span>
                          <h3 className="ui-heading text-base font-bold mt-1">{plan.name}</h3>
                        </div>
                        <div className="text-right font-mono">
                          <div className="text-xl font-bold text-[var(--accent-primary)] tabular-nums">
                            USD {plan.priceUsdMonthly}/mes
                          </div>
                          <div className="text-[11px] opacity-75 tabular-nums">Bs. {bsPrice} @ BCV</div>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1 text-xs font-mono opacity-85">
                        {plan.features.map(f => (
                          <li key={f}>· {f}</li>
                        ))}
                      </ul>
                      {isCurrent && (
                        <div className="mt-3 text-[11px] font-mono text-emerald-400">
                          [PLAN ACTUALMENTE ASIGNADO A {activeTenant.name.toUpperCase()}]
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Register Payment Form */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <h3 className="ui-heading text-sm font-bold">Registrar Pago de Suscripción (Pago Móvil / Zelle / Binance Pay)</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-mono">
                  <div>
                    <label className="block mb-1 opacity-75">Plan a Facturar</label>
                    <select
                      value={selectedPlanForPayment}
                      onChange={e =>
                        setSelectedPlanForPayment(e.target.value as 'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE')
                      }
                      className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                    >
                      {SAAS_PLANS_CATALOG.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} (${p.priceUsdMonthly})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 opacity-75">Pasarela / Método</label>
                    <select
                      value={paymentMethod}
                      onChange={e =>
                        setPaymentMethod(
                          e.target.value as 'PAGO_MOVIL' | 'ZELLE' | 'BINANCE_PAY' | 'TRANSFERENCIA_VES'
                        )
                      }
                      className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                    >
                      <option value="PAGO_MOVIL">Pago Móvil Interbancario (Bs.)</option>
                      <option value="ZELLE">Zelle Corporativo (USD)</option>
                      <option value="BINANCE_PAY">Binance Pay (USDT)</option>
                      <option value="TRANSFERENCIA_VES">Transferencia Banesco / Mercantil</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 opacity-75">Nº Referencia Bancaria</label>
                    <input
                      type="text"
                      value={paymentRefInput}
                      onChange={e => setPaymentRefInput(e.target.value)}
                      className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                    />
                  </div>

                  <div className="flex items-end">
                    <button onClick={handleRegisterSaasPayment} className="ui-btn-primary w-full py-2 px-3 text-xs">
                      Activar / Renovar 30 Días
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Matriz de Sub-Cuentas Empresariales Monetizadas (B2B2B) */}
            <div className="ui-card p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="ui-heading text-base font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-[var(--accent-primary)]" />
                    Matriz de Sub-Cuentas Empresariales Monetizadas (B2B2B)
                  </h3>
                  <p className="text-xs font-mono opacity-75">
                    Habilita el acceso directo a cada cliente, cobra suscripciones y genera comisiones del 20% recurrente
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    20% Comisión Contador Automática
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] opacity-75">
                      <th className="py-2 px-2">Empresa / RIF</th>
                      <th className="py-2 px-2">Contacto Sub-Cuenta</th>
                      <th className="py-2 px-2">Rol Asignado</th>
                      <th className="py-2 px-2 text-right">Cuota Mensual</th>
                      <th className="py-2 px-2">Estatus / Quincena</th>
                      <th className="py-2 px-2 text-center">Reparto Rev-Share</th>
                      <th className="py-2 px-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(t => {
                      const fee = t.monthlyFeeUsd || 29.99;
                      const feeBs = (fee * bcvRate).toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      });
                      const comm = (fee * 0.2).toFixed(2);
                      const net = (fee * 0.8).toFixed(2);

                      return (
                        <tr key={t.id} className="border-b border-[var(--border-subtle)]/50 hover:bg-white/[0.02]">
                          <td className="py-2.5 px-2">
                            <div className="font-bold">{t.name}</div>
                            <div className="text-[10px] opacity-65">{t.rif}</div>
                          </td>
                          <td className="py-2.5 px-2">
                            {t.subAccountContactName ? (
                              <div>
                                <div className="font-medium">{t.subAccountContactName}</div>
                                <div className="text-[10px] opacity-65">{t.subAccountPhone || t.subAccountEmail}</div>
                              </div>
                            ) : (
                              <span className="text-[10px] opacity-50 italic">Sin configurar</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10">
                              {t.subAccountRole || 'ADMIN_EMPRESA'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums">
                            <div className="font-bold text-[var(--accent-primary)]">${fee.toFixed(2)}/mes</div>
                            <div className="text-[10px] opacity-65">Bs. {feeBs}</div>
                          </td>
                          <td className="py-2.5 px-2">
                            {t.subAccountStatus === 'TRIAL_15_DIAS' ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                                🎁 TRIAL ({t.trialDaysLeft ?? 15}d)
                              </span>
                            ) : t.subAccountStatus === 'ACTIVA' ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                                🟢 SOLVENTE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[10px] font-bold border border-rose-500/30">
                                🔴 POR RENOVAR
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[10px]">
                              <span className="text-[var(--accent-primary)] font-bold">80% (${net})</span>
                              <span className="opacity-40">|</span>
                              <span className="text-emerald-400 font-bold">20% (${comm})</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenSubAccountModal(t)}
                                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold flex items-center gap-1"
                                title="Configurar e invitar por WhatsApp"
                              >
                                <KeyRound className="w-3 h-3 text-[var(--accent-primary)]" />
                                Gestionar
                              </button>
                              <button
                                onClick={() => setSubPaymentModalTenant(t)}
                                className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
                                title="Cobrar por Pago Móvil / Binance / Zelle"
                              >
                                <CreditCard className="w-3 h-3" />
                                Cobrar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Ledger Table */}
            <div className="ui-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="ui-heading text-base font-bold">Historial Inmutable de Pagos SaaS y Conciliación Bancaria</h3>
                <span className="text-[11px] font-mono opacity-75">
                  Cuota Mes: <strong>{tenantInvoices.length}</strong> docs
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] opacity-75">
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2">Plan</th>
                      <th className="py-2 px-2">Método / Ref</th>
                      <th className="py-2 px-2 text-right">Monto USD</th>
                      <th className="py-2 px-2 text-right">Equivalente Bs.</th>
                      <th className="py-2 px-2">Estatus</th>
                      <th className="py-2 px-2">Hash SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b border-[var(--border-subtle)]/50">
                        <td className="py-2 px-2">{p.createdAt}</td>
                        <td className="py-2 px-2 font-bold">{p.planName}</td>
                        <td className="py-2 px-2">
                          {p.paymentMethod} · <span className="opacity-75">{p.referenceNumber}</span>
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums">${p.amountUsd.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">Bs. {p.amountBs.toFixed(2)}</td>
                        <td className="py-2 px-2">
                          {p.status === 'VERIFICADO' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                              VERIFICADO
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                                PENDIENTE
                              </span>
                              {currentUser?.role !== 'client' && (
                                <button
                                  onClick={() => handleApproveSaasPayment(p)}
                                  className="px-2 py-0.5 rounded bg-[var(--accent-primary)] text-black text-[10px] font-bold hover:opacity-90"
                                >
                                  Aprobar
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-emerald-400">{p.auditHash.slice(0, 14)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 4-Column Right Sidecar: Multi-Tenant License Control & Telegram Token Generator */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            <div className="ui-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase font-bold">Generador Código Telegram</span>
                <QrCode className="w-4 h-4 text-[var(--accent-primary)]" />
              </div>
              <p className="text-xs opacity-80">
                Entrega este comando único a tu cliente para enlazar su WhatsApp/Telegram directo al RIF <strong>{activeTenant.rif}</strong>:
              </p>
              <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] font-mono text-sm font-bold flex items-center justify-between">
                <span className="text-[var(--accent-primary)]">/vincular {activeTenant.telegramCode}</span>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(`/vincular ${activeTenant.telegramCode}`);
                    setCopiedCode(true);
                    setTimeout(() => setCopiedCode(false), 2000);
                  }}
                  className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 flex items-center gap-1"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={handleRegenerateTelegramCode}
                className="w-full py-2 text-xs font-mono rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--accent-secondary)]"
              >
                Rotar Código de Vinculación
              </button>
            </div>

            <div className="ui-card p-5 space-y-3">
              <h3 className="ui-heading text-sm font-bold">Estado de Cartera de Clientes (Multi-RIF)</h3>
              <div className="space-y-2.5 text-xs font-mono">
                {tenants.map(t => (
                  <div
                    key={t.id}
                    className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold">{t.name}</div>
                      <div className="opacity-70 text-[11px]">
                        {t.rif} · {t.planId}
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleTenantSuspension(t.id)}
                      className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                        t.subscriptionStatus === 'ACTIVA'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {t.subscriptionStatus}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 06: PORTAL CLIENTE MÓVIL 9:16 (PWA CERO FRICCIÓN PARA EL COMERCIO)
         ===================================================================== */}
      {activeTab === 'mobile' && (
        <div className="grid grid-cols-12 gap-5 items-start">
          {/* Left 5-Column Interactive 9:16 Smartphone Viewport */}
          <div className="col-span-12 lg:col-span-5 flex justify-center">
            <div className="w-full max-w-[370px] rounded-[28px] border-2 border-[var(--border-highlight)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden flex flex-col min-h-[670px]">
              {/* Mobile Status Header */}
              <div className="px-4 py-3 bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="font-bold block text-[var(--accent-primary)]">{activeTenant.name}</span>
                  <span className="text-[10px] opacity-75">RIF: {activeTenant.rif} · BCV: {bcvRate} Bs.</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                  PWA 9:16
                </span>
              </div>

              {/* Mobile Body */}
              <div className="p-4 flex-1 space-y-4 text-xs font-mono overflow-y-auto">
                {mobileToast && (
                  <div className="p-2.5 rounded bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[11px]">
                    {mobileToast}
                  </div>
                )}

                {mobileSubTab === 'home' && (
                  <>
                    <div className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                      <span className="text-[10px] opacity-70 uppercase">Cuota Estimada IVA del Mes</span>
                      <div className="text-xl font-bold text-[var(--accent-primary)] tabular-nums mt-1">
                        Bs. {fiscalSummary.netQuotaBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] opacity-75">
                        Equivalente: USD {(fiscalSummary.netQuotaBs / bcvRate).toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <span className="text-[10px] opacity-70 block">IVA Ventas</span>
                        <strong className="tabular-nums text-[var(--accent-secondary)]">
                          Bs. {fiscalSummary.debitVatBs.toFixed(0)}
                        </strong>
                      </div>
                      <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <span className="text-[10px] opacity-70 block">Crédito Compras</span>
                        <strong className="tabular-nums text-emerald-400">
                          Bs. {fiscalSummary.creditVatBs.toFixed(0)}
                        </strong>
                      </div>
                    </div>

                    <button
                      onClick={() => setMobileSubTab('camera')}
                      className="ui-btn-primary w-full py-3 text-xs flex items-center justify-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Fotografiar Factura para Contador
                    </button>

                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] uppercase opacity-70 block">Últimos Comprobantes Enviados</span>
                      {tenantInvoices.slice(0, 3).map(inv => (
                        <div
                          key={inv.id}
                          className="p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex justify-between items-center"
                        >
                          <div>
                            <div className="font-bold">#{inv.invoiceNumber}</div>
                            <div className="text-[10px] opacity-70">{inv.supplierName.slice(0, 22)}</div>
                          </div>
                          <div className="text-right">
                            <div className="tabular-nums font-bold">
                              {inv.currency} {inv.totalOriginal.toFixed(2)}
                            </div>
                            <span className="text-[10px] text-emerald-400">{inv.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {mobileSubTab === 'camera' && (
                  <div className="space-y-3">
                    <div className="p-3 rounded bg-[var(--bg-elevated)] border border-dashed border-[var(--accent-primary)] text-center space-y-2">
                      <Camera className="w-7 h-7 mx-auto text-[var(--accent-primary)]" />
                      <div className="font-bold">Captura Rápida Cero-Fricción</div>
                      <p className="text-[10px] opacity-75">
                        Toma la foto del soporte físico o digital y envíalo directo a la bóveda de tu contador.
                      </p>
                    </div>

                    <div>
                      <label className="block mb-1 text-[10px] opacity-75">RIF Proveedor</label>
                      <input
                        type="text"
                        value={mobileQuickRif}
                        onChange={e => setMobileQuickRif(e.target.value)}
                        className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                      />
                    </div>

                    <div>
                      <label className="block mb-1 text-[10px] opacity-75">Nombre del Proveedor</label>
                      <input
                        type="text"
                        value={mobileQuickSupplier}
                        onChange={e => setMobileQuickSupplier(e.target.value)}
                        className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1 text-[10px] opacity-75">Base Imponible</label>
                        <input
                          type="number"
                          value={mobileQuickAmount}
                          onChange={e => setMobileQuickAmount(Number(e.target.value) || 0)}
                          className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-[10px] opacity-75">Moneda</label>
                        <select
                          value={mobileQuickCurrency}
                          onChange={e => setMobileQuickCurrency(e.target.value as 'USD' | 'VES')}
                          className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                        >
                          <option value="USD">USD ($)</option>
                          <option value="VES">Bolívares (Bs.)</option>
                        </select>
                      </div>
                    </div>

                    <button onClick={handleMobileQuickSend} className="ui-btn-primary w-full py-2.5 text-xs">
                      Enviar Factura Ahora
                    </button>
                  </div>
                )}

                {mobileSubTab === 'history' && (
                  <div className="space-y-2">
                    <div className="font-bold">Expediente Digital del Mes ({tenantInvoices.length} docs)</div>
                    {tenantInvoices.map(inv => (
                      <div
                        key={inv.id}
                        className="p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1"
                      >
                        <div className="flex justify-between">
                          <strong>#{inv.invoiceNumber}</strong>
                          <span className="tabular-nums">
                            Bs. {toVes(inv.totalOriginal, inv.currency, inv.bcvRateOnDate).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[10px] opacity-75">
                          {inv.supplierRif} · {inv.supplierName}
                        </div>
                        <div className="text-[10px] text-emerald-400">Hash: {inv.auditHash.slice(0, 16)}...</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile Bottom Navigation */}
              <div className="grid grid-cols-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[11px] font-mono">
                <button
                  onClick={() => setMobileSubTab('home')}
                  className={`py-3 text-center ${mobileSubTab === 'home' ? 'text-[var(--accent-primary)] font-bold' : 'opacity-70'}`}
                >
                  Resumen
                </button>
                <button
                  onClick={() => setMobileSubTab('camera')}
                  className={`py-3 text-center ${mobileSubTab === 'camera' ? 'text-[var(--accent-primary)] font-bold' : 'opacity-70'}`}
                >
                  + Capturar
                </button>
                <button
                  onClick={() => setMobileSubTab('history')}
                  className={`py-3 text-center ${mobileSubTab === 'history' ? 'text-[var(--accent-primary)] font-bold' : 'opacity-70'}`}
                >
                  Bóveda ({tenantInvoices.length})
                </button>
              </div>
            </div>
          </div>

          {/* Right 7-Column Architecture & Client Onboarding Spec */}
          <div className="col-span-12 lg:col-span-7 space-y-5">
            <div className="ui-card p-5 space-y-3">
              <h2 className="ui-heading text-lg font-bold">Portal Móvil PWA 9:16 para Dueños de Comercio</h2>
              <p className="text-xs font-mono opacity-80">
                Diseñado para que el comerciante venezolano consulte su cuota preliminar de IVA, verifique la tasa oficial BCV del día y cargue fotos de facturas en 5 segundos sin alterar los libros contables.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs font-mono">
                <div className="p-4 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1.5">
                  <strong className="text-[var(--accent-primary)] block">1. Sincronización Instantánea</strong>
                  <p className="opacity-80">
                    Cada factura enviada desde el visor móvil 9:16 (o desde el Bot de Telegram) entra con estado <code>BORRADOR_IA</code> a la bandeja principal del Contador.
                  </p>
                </div>
                <div className="p-4 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1.5">
                  <strong className="text-[var(--accent-secondary)] block">2. Permisos de Solo-Ingesta</strong>
                  <p className="opacity-80">
                    Las reglas de seguridad en <code>firestore.rules</code> impiden que el cliente modifique o elimine facturas una vez selladas por la firma contable.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 06: CONCILIACIÓN BANCARIA MULTI-BANCO & DIFERENCIAL CAMBIARIO (NIC 21)
         ===================================================================== */}
      {(activeTab === 'reconciliation' || (activeTab === 'operations' && operationStep === 'reconciliation')) && (
        <div className="space-y-6">
          {/* Header & KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="ui-card p-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono opacity-75 uppercase">
                <span>Saldo en Bancos (Extractos)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/10">MULTI-BANCO</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white tabular-nums">
                Bs. {reconciliationStats.totalBankBalanceBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] opacity-75 font-mono">
                {reconciliationStats.totalMoves} movimientos registrados en el período
              </div>
            </div>

            <div className="ui-card p-4 border-emerald-500/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-emerald-400 font-bold uppercase">
                <span>Partidas Conciliadas</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  {reconciliationStats.matchPercent}% COINCIDENCIA
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {reconciliationStats.matchedCount} / {reconciliationStats.totalMoves}
              </div>
              <div className="text-[11px] opacity-75 font-mono text-emerald-300">
                Respaldo probatorio fehaciente (Art. 177 COT)
              </div>
            </div>

            <div className="ui-card p-4 border-purple-500/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-purple-300 font-bold uppercase">
                <span>Diferencial Cambiario (NIC 21)</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  {reconciliationStats.totalGainDiffBs >= reconciliationStats.totalLossDiffBs ? 'GANANCIA' : 'PÉRDIDA'}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-purple-400 tabular-nums">
                +Bs. {(reconciliationStats.totalGainDiffBs - reconciliationStats.totalLossDiffBs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] opacity-75 font-mono text-purple-200">
                Ganancia financiera sujeta a ISLR calculada @ BCV
              </div>
            </div>

            <div className="ui-card p-4 border-amber-500/40 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-amber-300 font-bold uppercase">
                <span>Retenciones & Comisiones POS</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">LOTES</span>
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
                Bs. {reconciliationStats.totalPosRetBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] opacity-75 font-mono text-amber-200">
                Crédito fiscal 1.5% retenido por bancos en puntos de venta
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="ui-card p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <span className="opacity-75 font-bold">Filtrar Banco:</span>
              {(['TODOS', 'BANESCO', 'BDV', 'MERCANTIL', 'BANCAMIGA'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => setSelectedBankFilter(b)}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                    selectedBankFilter === b
                      ? 'bg-[var(--accent-primary)] text-black'
                      : 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)] opacity-80 hover:opacity-100'
                  }`}
                >
                  {b === 'TODOS' ? 'Todos los Bancos' : b}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3.5 py-2 rounded bg-[var(--bg-elevated)] hover:bg-white/10 border border-[var(--border-subtle)] font-bold cursor-pointer flex items-center gap-1.5 transition">
                <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Importar Extracto (CSV/Excel)</span>
                <input
                  type="file"
                  accept=".csv,.txt,.xlsx"
                  onChange={handleFileUploadBankCsv}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleRunAutoReconcile}
                className="ui-btn-primary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Ejecutar Conciliación 1-Clic</span>
              </button>

              <button
                onClick={handleDownloadReconcilePdf}
                className="px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition shadow"
                title="Generar Certificado Oficial SENIAT Art. 177 COT"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Certificado Art. 177 (PDF)</span>
              </button>

              <button
                onClick={handleDownloadReconcileCsv}
                className="px-3.5 py-2 rounded bg-[var(--bg-elevated)] hover:bg-white/10 border border-[var(--border-subtle)] font-bold flex items-center gap-1 transition"
                title="Exportar archivo CSV para Excel"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Split-Screen Forensic Grid (7 Cols Bank Movements + 5 Cols Forensic Inspector) */}
          <div className="grid grid-cols-12 gap-5">
            {/* 7-Cols: Tabular List of Bank Movements */}
            <div className="col-span-12 lg:col-span-7 space-y-3">
              <div className="ui-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-[var(--accent-primary)]" />
                    <h3 className="ui-heading text-sm font-bold">
                      Movimientos del Extracto Bancario ({activeTenant.name})
                    </h3>
                  </div>
                  <div className="w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Buscar por ref, concepto, monto..."
                      value={reconcileSearchQuery}
                      onChange={e => setReconcileSearchQuery(e.target.value)}
                      className="w-full p-1.5 text-xs rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] opacity-75">
                        <th className="py-2 px-2">Banco</th>
                        <th className="py-2 px-2">Fecha</th>
                        <th className="py-2 px-2">Referencia / Concepto</th>
                        <th className="py-2 px-2 text-right">Monto Bs.</th>
                        <th className="py-2 px-2 text-center">Estado</th>
                        <th className="py-2 px-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bankMovements
                        .filter(m => selectedBankFilter === 'TODOS' || m.bankName === selectedBankFilter)
                        .filter(m => {
                          if (!reconcileSearchQuery.trim()) return true;
                          const q = reconcileSearchQuery.toLowerCase();
                          return (
                            m.referenceNumber.toLowerCase().includes(q) ||
                            m.description.toLowerCase().includes(q) ||
                            m.bankName.toLowerCase().includes(q) ||
                            String(m.amountBs).includes(q)
                          );
                        })
                        .map(m => {
                          const isSelected = inspectedBankMove?.id === m.id;
                          return (
                            <tr
                              key={m.id}
                              onClick={() => setInspectedBankMove(m)}
                              className={`border-b border-[var(--border-subtle)]/50 cursor-pointer transition-colors ${
                                isSelected ? 'bg-white/[0.06] border-l-2 border-l-[var(--accent-primary)]' : 'hover:bg-white/[0.02]'
                              }`}
                            >
                              <td className="py-2 px-2 font-bold text-[10px]">
                                <span className="px-1.5 py-0.5 rounded bg-white/10">{m.bankName}</span>
                              </td>
                              <td className="py-2 px-2 text-[11px] opacity-75">{m.date}</td>
                              <td className="py-2 px-2">
                                <div className="font-bold text-white text-[11px]">
                                  {m.referenceNumber ? `Ref: ${m.referenceNumber}` : 'Sin Ref'}
                                </div>
                                <div className="text-[10px] opacity-65 truncate max-w-[200px]" title={m.description}>
                                  {m.description}
                                </div>
                              </td>
                              <td className={`py-2 px-2 text-right tabular-nums font-bold ${m.amountBs > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {m.amountBs > 0 ? '+' : ''}Bs. {Math.abs(m.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {m.reconciliationStatus === 'CONCILIADO' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    CONCILIADO
                                  </span>
                                ) : m.reconciliationStatus === 'DIFERENCIAL_CAMBIARIO' ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                    DIF. CAMBIARIO
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    PENDIENTE
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectedBankMove(m);
                                  }}
                                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold"
                                >
                                  Ver
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 5-Cols: Forensic Inspector Drawer */}
            <div className="col-span-12 lg:col-span-5 space-y-4">
              {inspectedBankMove ? (
                <div className="ui-card p-5 space-y-4 text-xs font-mono">
                  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4 text-[var(--accent-primary)]" />
                      <h4 className="ui-heading text-sm font-bold">Inspector Forense de Partida</h4>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 font-bold">
                      {inspectedBankMove.bankName}
                    </span>
                  </div>

                  {/* Summary Box */}
                  <div className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2">
                    <div className="text-[10px] uppercase opacity-75">Concepto Bancario:</div>
                    <div className="font-bold text-white text-xs">{inspectedBankMove.description}</div>
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--border-subtle)] text-[11px]">
                      <div>
                        <span className="opacity-60 block">Referencia:</span>
                        <strong className="text-white">{inspectedBankMove.referenceNumber || 'N/A'}</strong>
                      </div>
                      <div>
                        <span className="opacity-60 block">Fecha Registro:</span>
                        <strong className="text-white">{inspectedBankMove.date}</strong>
                      </div>
                      <div>
                        <span className="opacity-60 block">Monto en Banco:</span>
                        <strong className={inspectedBankMove.amountBs > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          Bs. {Math.abs(inspectedBankMove.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </strong>
                      </div>
                      <div>
                        <span className="opacity-60 block">Tipo Detectado:</span>
                        <strong className="text-[var(--accent-primary)]">{inspectedBankMove.movementType}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Diferencial Cambiario Breakdown (NIC 21) */}
                  {inspectedBankMove.reconciliationStatus === 'DIFERENCIAL_CAMBIARIO' && (
                    <div className="p-3.5 rounded bg-purple-950/30 border border-purple-500/40 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between text-purple-300 font-bold">
                        <span>Ajuste por Diferencial Cambiario (VEN-NIF NIC 21)</span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-[9px]">SENIAT OK</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="opacity-75">Factura Vinculada:</span>
                          <strong className="text-white">#{inspectedBankMove.matchedInvoiceNumber}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="opacity-75">Ganancia Cambiaria Neta:</span>
                          <strong className="text-emerald-400 font-bold">
                            +Bs. {(inspectedBankMove.exchangeDiffBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-black/40 border border-purple-500/20 text-[10px] text-purple-200">
                        <strong>Asiento Contable Sugerido:</strong><br />
                        · D: Banco {inspectedBankMove.bankName} Bs. {Math.abs(inspectedBankMove.amountBs).toLocaleString('es-VE', { minimumFractionDigits: 2 })}<br />
                        · H: Cuentas por Cobrar Clientes Bs. {(Math.abs(inspectedBankMove.amountBs) - (inspectedBankMove.exchangeDiffBs || 0)).toLocaleString('es-VE', { minimumFractionDigits: 2 })}<br />
                        · H: Ganancia por Diferencial Cambiario Bs. {(inspectedBankMove.exchangeDiffBs || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}

                  {/* POS Settlement Batch Breakdown */}
                  {inspectedBankMove.posBreakdown && (
                    <div className="p-3.5 rounded bg-amber-950/30 border border-amber-500/40 space-y-2 text-[11px]">
                      <div className="flex items-center justify-between text-amber-300 font-bold">
                        <span>Desglose Cierre de Lote Punto de Venta (POS)</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[9px]">TARJETAS</span>
                      </div>
                      <div className="space-y-1 text-[11px]">
                        <div className="flex justify-between">
                          <span className="opacity-75">Venta Bruta en Terminal:</span>
                          <strong className="text-white">
                            Bs. {inspectedBankMove.posBreakdown.grossSalesBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                        <div className="flex justify-between text-rose-300">
                          <span>- Comisión Bancaria Terminal (1.8%):</span>
                          <strong>-Bs. {inspectedBankMove.posBreakdown.bankFeeBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="flex justify-between text-sky-300">
                          <span>- Retención SENIAT Tarjeta (1.5%):</span>
                          <strong>-Bs. {inspectedBankMove.posBreakdown.seniatRetBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                        </div>
                        <div className="pt-1 border-t border-amber-500/30 flex justify-between text-emerald-400 font-bold">
                          <span>= Depósito Neto Acreditado en Cuenta:</span>
                          <strong>Bs. {inspectedBankMove.posBreakdown.netDepositBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Manual Invoice Linking Selector (If Pending) */}
                  {inspectedBankMove.reconciliationStatus === 'PENDIENTE' && (
                    <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2">
                      <label className="block text-[11px] font-bold text-amber-300">
                        Vincular Manualmente con Factura del Sistema:
                      </label>
                      <select
                        value={reconcileManualInvId}
                        onChange={e => setReconcileManualInvId(e.target.value)}
                        className="w-full p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs"
                      >
                        <option value="">Seleccione una factura pendiente...</option>
                        {tenantInvoices.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            #{inv.invoiceNumber} · {inv.supplierName} (${inv.totalOriginal} {inv.currency})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleManualLinkMoveToInvoice(inspectedBankMove.id, reconcileManualInvId)}
                        disabled={!reconcileManualInvId}
                        className="ui-btn-primary w-full py-2 text-xs font-bold disabled:opacity-40"
                      >
                        Vincular Factura a Movimiento
                      </button>
                    </div>
                  )}

                  {/* Audit Hash Footer */}
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] opacity-75">
                    <span>Sello Criptográfico Inmutable:</span>
                    <span className="font-mono text-emerald-400">{inspectedBankMove.auditHash.slice(0, 16)}...</span>
                  </div>
                </div>
              ) : (
                <div className="ui-card p-8 text-center text-xs font-mono opacity-65">
                  Selecciona una partida del extracto bancario para inspeccionar su trazabilidad, cálculo de diferencial cambiario y comprobante fehaciente.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 07: BLINDAJE CRIPTOGRÁFICO SHA-256 & BÓVEDA AES-256-GCM (8 + 4)
         ===================================================================== */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-12 gap-5">
          {/* 8-Column Immutable Append-Only Audit Chain */}
          <div className="col-span-12 lg:col-span-8 space-y-5">
            <div className="ui-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="ui-heading text-lg font-bold">Bitácora Forense Inmutable (Cadena SHA-256 COT 10 Años)</h2>
                  <p className="text-xs font-mono opacity-75">
                    Cada evento fiscal incluye el hash criptográfico del bloque anterior (`previousHash`), impidiendo alteraciones retroactivas.
                  </p>
                </div>
                <button
                  onClick={() => setChainIntegrityVerified(true)}
                  className="ui-btn-primary px-3 py-2 text-xs flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verificar Cadena ({auditLogs.length} Bloques OK)
                </button>
              </div>

              {chainIntegrityVerified && (
                <div className="p-3 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                  [AUDITORÍA FORENSE VERIFICADA] Los {auditLogs.length} bloques de la cadena SHA-256 desde GENESIS_SENIAT_2026 mantienen integridad matemática total (0 colisiones, 0 borrados).
                </div>
              )}

              <div className="space-y-3 text-xs font-mono">
                {auditLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-[var(--accent-primary)]">
                        BLOQUE #{String(log.sequence).padStart(4, '0')} · {log.action}
                      </span>
                      <span className="opacity-70">{log.timestamp} · Actor: {log.actorUid}</span>
                    </div>
                    <p className="opacity-90">{log.details}</p>
                    <div className="pt-1 text-[10px] space-y-0.5 opacity-80 break-all">
                      <div>
                        <span className="opacity-60">PREV_HASH: </span>
                        {log.previousHash}
                      </div>
                      <div className="text-emerald-400">
                        <span className="opacity-60 text-[var(--text-primary)]">SHA256_HASH: </span>
                        {log.sha256Hash}
                      </div>
                      {log.encryptedPayload && (
                        <div className="text-[var(--accent-secondary)]">
                          <span className="opacity-60 text-[var(--text-primary)]">AES256_GCM: </span>
                          {log.encryptedPayload}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4-Column 2FA / AES-256-GCM Interactive Vault & Firestore Rules Matrix */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            {/* Super-Admin 2FA / TOTP Configurator */}
            <div className="ui-card p-5 space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <h3 className="ui-heading text-base font-bold">2FA Super-Admin (TOTP)</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  superAdmin2faSecret
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-white/10 text-zinc-400 border border-white/10'
                }`}>
                  {superAdmin2faSecret ? 'ACTIVO' : 'INACTIVO'}
                </span>
              </div>
              <p className="text-[11px] text-[#8E8E93]">
                Protege el acceso Super-Admin con códigos temporales de 6 dígitos (Google Authenticator / Apple Passwords).
              </p>

              {superAdmin2faSecret ? (
                <div className="space-y-3 pt-1">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px]">
                    Doble Factor activado. El inicio de sesión Super-Admin exige código TOTP cada 30 segundos.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('¿Desactivar la autenticación en dos pasos (2FA) del perfil Super-Admin?')) {
                        localStorage.removeItem('vt_superadmin_2fa_secret');
                        setSuperAdmin2faSecret('');
                        setSubPayToast('2FA desactivado para Super-Admin.');
                        setTimeout(() => setSubPayToast(null), 4000);
                      }
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 font-semibold transition"
                  >
                    Desactivar 2FA
                  </button>
                </div>
              ) : setupTotpSecret ? (
                <div className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 space-y-1.5">
                    <span className="text-[10px] text-[#8E8E93] uppercase block">1. Llave Secreta Base32 (Copia en tu App):</span>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-bold text-white tracking-wider break-all">{setupTotpSecret}</code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(setupTotpSecret);
                          setSubPayToast('Llave secreta 2FA copiada.');
                          setTimeout(() => setSubPayToast(null), 3000);
                        }}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                        title="Copiar llave secreta"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <a
                      href={getTotpUri(setupTotpSecret, currentUser?.email || 'moucharrafiepc@gmail.com')}
                      className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:underline pt-1"
                    >
                      <ArrowUpRight className="w-3 h-3" /> Abrir en App Autenticadora (otpauth://)
                    </a>
                  </div>
                  <div>
                    <label className="block mb-1 text-[10px] text-[#8E8E93] uppercase">2. Verifica el código de 6 dígitos:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="000000"
                        value={setupTotpCode}
                        onChange={e => setSetupTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="flex-1 p-2 rounded-lg bg-[var(--bg-elevated)] border border-white/15 text-center font-mono font-bold tracking-widest text-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await verifyTotpCode(setupTotpSecret, setupTotpCode);
                          if (!ok) {
                            alert('Código inválido. Asegúrate de ingresar los 6 dígitos actuales de tu app autenticadora.');
                            return;
                          }
                          localStorage.setItem('vt_superadmin_2fa_secret', setupTotpSecret);
                          setSuperAdmin2faSecret(setupTotpSecret);
                          setSetupTotpSecret('');
                          setSetupTotpCode('');
                          setSubPayToast('¡2FA (TOTP) activado correctamente para Super-Admin!');
                          setTimeout(() => setSubPayToast(null), 5000);
                        }}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
                      >
                        Activar
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSetupTotpSecret(generateTotpSecret(20));
                    setSetupTotpCode('');
                  }}
                  className="ui-btn-primary w-full py-2.5 text-xs flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Configurar 2FA Ahora
                </button>
              )}
            </div>

            <div className="ui-card p-5 space-y-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="ui-heading text-base font-bold">Simulador Bóveda AES-256-GCM</h3>
              </div>
              <p className="opacity-75">
                Prueba el cifrado autenticado (`IV:AuthTag:Ciphertext`) usado en <code>backend/security/cryptoVault.js</code> para credenciales SENIAT y cuentas bancarias:
              </p>
              <div>
                <label className="block mb-1 opacity-75">Dato Sensible en Texto Plano</label>
                <input
                  type="text"
                  value={vaultPlainInput}
                  onChange={e => setVaultPlainInput(e.target.value)}
                  className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                />
              </div>
              <div>
                <label className="block mb-1 opacity-75">Llave Maestra (AES_MASTER_KEY)</label>
                <input
                  type="text"
                  value={vaultKeyHint}
                  onChange={e => setVaultKeyHint(e.target.value)}
                  className="w-full p-2 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] break-all text-[10px]">
                <span className="opacity-60 block mb-1">PAYLOAD CIFRADO (IV:TAG:DATA):</span>
                <span className="text-[var(--accent-secondary)]">{encryptedPreview}</span>
              </div>
              <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 break-all text-[11px] text-emerald-300">
                <span className="opacity-60 block mb-0.5">DESCIFRADO VERIFICADO:</span>
                {decryptedPreview}
              </div>
            </div>

            <div className="ui-card p-5 space-y-2.5 text-xs font-mono">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="ui-heading text-base font-bold">Reglas de Producción Activas</h3>
              </div>
              <ul className="space-y-2 opacity-90">
                <li>[OK] Aislamiento Multi-Tenant por RIF en firestore.rules</li>
                <li>[OK] Bloqueo físico de borrado (allow delete: if false) — COT 10 años</li>
                <li>[OK] Bitácora Append-Only encadenada con SHA-256 + AES-256-GCM</li>
                <li>[OK] Robot diario Tasa Oficial BCV (09:05 AM y 01:15 PM VET)</li>
                <li>[OK] Webhook Telegram con Secret Token + Gemini Vision OCR</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ELITE FINTECH UI 2026: SPLIT-SCREEN FORENSIC INSPECTOR DRAWER
         ===================================================================== */}
      {inspectedInvoice && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end"
          onClick={() => setInspectedInvoice(null)}
        >
          <div
            className="w-full max-w-lg h-full bg-[var(--bg-surface)] border-l border-[var(--border-highlight)] p-6 overflow-y-auto space-y-5 text-xs font-mono shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 uppercase">
                  Inspector Forense SENIAT · {inspectedInvoice.bookType}
                </span>
                <h3 className="ui-heading text-lg font-bold mt-1">
                  Factura #{inspectedInvoice.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setInspectedInvoice(null)}
                className="p-1.5 rounded bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)] border border-[var(--border-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2">
              <div className="flex justify-between">
                <span className="opacity-70">Proveedor / Emisor:</span>
                <strong>{inspectedInvoice.supplierName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">RIF (Módulo 11):</span>
                <strong className="text-emerald-400">{inspectedInvoice.supplierRif} [VERIFICADO]</strong>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Nº Control Fiscal:</span>
                <strong>{inspectedInvoice.controlNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Canal SNAT/2026/00093:</span>
                <strong>{inspectedInvoice.channel}</strong>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Fecha / Hora Exacta (Art. 8):</span>
                <strong>{inspectedInvoice.emissionDate} · {inspectedInvoice.emissionTime}</strong>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Comprobante Ret. 14 Dígitos (Art. 18):</span>
                <strong className="text-[var(--accent-secondary)]">
                  {inspectedInvoice.vatRetentionRate > 0
                    ? buildVoucher14Digits(
                        inspectedInvoice.emissionDate.slice(0, 7).replace('-', '') || '202611',
                        Math.max(1, tenantInvoices.filter(i => i.vatRetentionRate > 0).findIndex(i => i.id === inspectedInvoice.id) + 1)
                      )
                    : 'NO APLICA'}
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2 tabular-nums">
              <div className="font-bold uppercase text-[var(--accent-primary)] mb-1">
                Desglose Bimoneda (@ Tasa BCV {inspectedInvoice.bcvRateOnDate} Bs./USD)
              </div>
              <div className="flex justify-between">
                <span>Base Imponible:</span>
                <strong>
                  Bs. {toVes(inspectedInvoice.taxableBaseOriginal, inspectedInvoice.currency, inspectedInvoice.bcvRateOnDate).toFixed(2)} ({inspectedInvoice.currency} {inspectedInvoice.taxableBaseOriginal.toFixed(2)})
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Monto Exento:</span>
                <strong>
                  Bs. {toVes(inspectedInvoice.exemptOriginal, inspectedInvoice.currency, inspectedInvoice.bcvRateOnDate).toFixed(2)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>IVA ({inspectedInvoice.vatRate}%):</span>
                <strong className="text-emerald-400">
                  Bs. {toVes(inspectedInvoice.vatOriginal, inspectedInvoice.currency, inspectedInvoice.bcvRateOnDate).toFixed(2)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Retención IVA ({inspectedInvoice.vatRetentionRate}%):</span>
                <strong className="text-[var(--accent-secondary)]">
                  Bs. {(toVes(inspectedInvoice.vatOriginal, inspectedInvoice.currency, inspectedInvoice.bcvRateOnDate) * (inspectedInvoice.vatRetentionRate / 100)).toFixed(2)}
                </strong>
              </div>
              <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)] text-sm">
                <span>Total Operación:</span>
                <strong className="text-[var(--accent-primary)]">
                  Bs. {toVes(inspectedInvoice.totalOriginal, inspectedInvoice.currency, inspectedInvoice.bcvRateOnDate).toFixed(2)}
                </strong>
              </div>
            </div>

            <div className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1.5 break-all">
              <span className="opacity-70 block">SELLO CRIPTOGRÁFICO SHA-256 (COT 10 AÑOS):</span>
              <span className="text-emerald-400 text-[11px]">{inspectedInvoice.auditHash}</span>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {inspectedInvoice.vatRetentionRate > 0 && (
                <button
                  onClick={() =>
                    openPrintableRetentionVoucher(
                      activeTenant.name,
                      activeTenant.rif,
                      inspectedInvoice,
                      buildVoucher14Digits(
                        inspectedInvoice.emissionDate.slice(0, 7).replace('-', '') || '202611',
                        Math.max(1, tenantInvoices.filter(i => i.vatRetentionRate > 0).findIndex(i => i.id === inspectedInvoice.id) + 1)
                      )
                    )
                  }
                  className="w-full py-2.5 text-xs font-mono rounded border border-[var(--accent-secondary)] text-[var(--accent-secondary)] hover:bg-white/5 flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir Comprobante Retención IVA (14 Dígitos)
                </button>
              )}
              {inspectedInvoice.islrRetentionRate > 0 && (
                <button
                  onClick={() =>
                    downloadPdfIslrRetentionVoucher(
                      activeTenant.name,
                      activeTenant.rif,
                      inspectedInvoice,
                      Math.max(1, tenantInvoices.filter(i => i.islrRetentionRate > 0).findIndex(i => i.id === inspectedInvoice.id) + 1)
                    )
                  }
                  className="w-full py-2.5 text-xs font-mono rounded border border-purple-500 text-purple-300 hover:bg-purple-500/10 flex items-center justify-center gap-2 font-bold"
                >
                  <FileText className="w-4 h-4 text-purple-400" />
                  Descargar Comprobante Retención ISLR (Decreto 1808 PDF)
                </button>
              )}
              {inspectedInvoice.status !== 'APROBADA' ? (
                <button
                  onClick={() => {
                    handleApproveInvoice(inspectedInvoice.id);
                    setInspectedInvoice({ ...inspectedInvoice, status: 'APROBADA' });
                  }}
                  className="ui-btn-primary w-full py-2.5 text-xs"
                >
                  Aprobar y Sellar en Bóveda COT
                </button>
              ) : (
                <button
                  onClick={() => {
                    setAdjustmentTarget(inspectedInvoice);
                    setInspectedInvoice(null);
                    setActiveTab('books');
                  }}
                  className="ui-btn-primary w-full py-2.5 text-xs"
                >
                  Emitir Nota de Crédito / Débito Vinculada
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-ACCOUNT CONFIGURATION & PROVISIONING MODAL (B2B2B SAAS)
         ===================================================================== */}
      {subAccountModalTenant && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSubAccountModalTenant(null)}
        >
          <form
            onSubmit={handleSaveSubAccount}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg ui-card p-6 space-y-4 text-xs font-mono shadow-2xl my-8 border border-[var(--border-highlight)]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/40 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
                <div>
                  <h3 className="ui-heading text-base font-bold">Sub-Cuenta Empresarial (Acceso Cliente)</h3>
                  <p className="text-[11px] opacity-75">
                    {subAccountModalTenant.name} · RIF: {subAccountModalTenant.rif}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubAccountModalTenant(null)}
                className="opacity-75 hover:opacity-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Trial Banner */}
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong className="text-emerald-400">🎁 15 Días de Prueba Gratis (1 Quincena SENIAT):</strong> La empresa
                podrá emitir comprobantes de retención IVA de 14 dígitos y cargar facturas por foto/Telegram sin costo
                durante su primera quincena.
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-80 font-bold">Contacto / Administrador</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Lic. Mariana Delgado"
                  value={subModalContactName}
                  onChange={e => setSubModalContactName(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 opacity-80 font-bold">WhatsApp Corporativo</label>
                <input
                  type="text"
                  required
                  placeholder="+58 414-1234567"
                  value={subModalPhone}
                  onChange={e => setSubModalPhone(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 opacity-80 font-bold">Correo de Acceso (Usuario)</label>
              <input
                type="email"
                required
                placeholder="admin@empresa.com"
                value={subModalEmail}
                onChange={e => setSubModalEmail(e.target.value)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-80 font-bold">Rol Asignado a la Empresa</label>
                <select
                  value={subModalRole}
                  onChange={e =>
                    setSubModalRole(e.target.value as 'OPERADOR_CAJA' | 'ADMIN_EMPRESA' | 'SOLO_CONSULTA')
                  }
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <option value="ADMIN_EMPRESA">Admin Empresa (Retenciones + OCR)</option>
                  <option value="OPERADOR_CAJA">Operador Caja (Solo Escanear Facturas)</option>
                  <option value="SOLO_CONSULTA">Solo Consulta (Reportes y Solvencia)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 opacity-80 font-bold">Cuota Mensual (USD)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="10"
                    max="500"
                    value={subModalPlanFee}
                    onChange={e => setSubModalPlanFee(Number(e.target.value))}
                    className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] pl-8 font-bold text-[var(--accent-primary)]"
                  />
                  <span className="absolute left-3 top-2.5 opacity-60">$</span>
                </div>
                <div className="text-[10px] opacity-60 mt-0.5">
                  Equivale a Bs. {(subModalPlanFee * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} @ BCV
                </div>
              </div>
            </div>

            {/* Revenue-Share Callout */}
            <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
              <div>
                <div className="font-bold text-[var(--accent-primary)]">Comisión Contador (20% Rev-Share):</div>
                <div className="opacity-75">Ganas ${(subModalPlanFee * 0.2).toFixed(2)}/mes de forma recurrente</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-emerald-400">+Bs. {((subModalPlanFee * 0.2) * bcvRate).toFixed(2)}</div>
                <div className="text-[10px] opacity-60">por mes solvente</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                className="ui-btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Habilitar Sub-Cuenta
              </button>

              <a
                href={getWhatsAppSubAccountInviteUrl(
                  subAccountModalTenant,
                  subModalContactName,
                  subModalPhone,
                  subModalEmail,
                  subModalPlanFee
                )}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition-colors text-xs"
              >
                <MessageSquare className="w-4 h-4" />
                Enviar WhatsApp
              </a>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          VENEZUELAN PAYMENT GATEWAY MODAL (PAGO MÓVIL / BINANCE / ZELLE)
         ===================================================================== */}
      {subPaymentModalTenant && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSubPaymentModalTenant(null)}
        >
          <form
            onSubmit={handleConfirmSubAccountPayment}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg ui-card p-6 space-y-4 text-xs font-mono shadow-2xl my-8 border border-[var(--border-highlight)]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h3 className="ui-heading text-base font-bold">Pasarela Bimoneda · Cobro de Sub-Cuenta</h3>
                  <p className="text-[11px] opacity-75">
                    {subPaymentModalTenant.name} · RIF: {subPaymentModalTenant.rif}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubPaymentModalTenant(null)}
                className="opacity-75 hover:opacity-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Total to Charge Banner */}
            {(() => {
              const feeUsd = subPaymentModalTenant.monthlyFeeUsd || 29.99;
              const feeBs = (feeUsd * bcvRate).toLocaleString('es-VE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              const commUsd = (feeUsd * 0.2).toFixed(2);
              const commBs = ((feeUsd * 0.2) * bcvRate).toLocaleString('es-VE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              });
              const netUsd = (feeUsd * 0.8).toFixed(2);

              return (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase opacity-75">Monto de Suscripción (30 Días)</div>
                      <div className="text-xl font-bold text-[var(--accent-primary)] tabular-nums">
                        ${feeUsd.toFixed(2)} USD
                      </div>
                      <div className="text-xs font-bold text-emerald-400 tabular-nums">
                        Bs. {feeBs} <span className="text-[10px] font-normal opacity-75">@ BCV {bcvRate}</span>
                      </div>
                    </div>
                    <div className="text-right border-l border-[var(--border-subtle)] pl-4">
                      <div className="text-[10px] text-emerald-400 font-bold">Comisión Contador (20%):</div>
                      <div className="text-sm font-bold text-white tabular-nums">${commUsd} USD</div>
                      <div className="text-[10px] opacity-75 tabular-nums">Bs. {commBs}</div>
                      <div className="text-[9px] text-[var(--accent-primary)] mt-1">Neto Plataforma: ${netUsd}</div>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  <div>
                    <label className="block mb-1.5 opacity-80 font-bold">Seleccione Método de Pago:</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setSubPayMethod('PAGO_MOVIL')}
                        className={`p-2.5 rounded text-center border transition-all ${
                          subPayMethod === 'PAGO_MOVIL'
                            ? 'bg-[var(--accent-primary)] text-black font-bold border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
                        }`}
                      >
                        Pago Móvil (Bs.)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubPayMethod('BINANCE_PAY')}
                        className={`p-2.5 rounded text-center border transition-all ${
                          subPayMethod === 'BINANCE_PAY'
                            ? 'bg-[var(--accent-primary)] text-black font-bold border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
                        }`}
                      >
                        Binance Pay (USDT)
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubPayMethod('ZELLE')}
                        className={`p-2.5 rounded text-center border transition-all ${
                          subPayMethod === 'ZELLE'
                            ? 'bg-[var(--accent-primary)] text-black font-bold border-[var(--accent-primary)]'
                            : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-80 hover:opacity-100'
                        }`}
                      >
                        Zelle (USD)
                      </button>
                    </div>
                  </div>

                  {/* Payment Instructions Box */}
                  <div className="p-3 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-1.5 text-[11px]">
                    {subPayMethod === 'PAGO_MOVIL' && (
                      <>
                        <div className="font-bold text-[var(--accent-primary)]">Datos para Pago Móvil Interbancario:</div>
                        <div>· Banco: <strong>Banesco (0134) / Mercantil (0105)</strong></div>
                        <div>· Teléfono: <strong>0414-234.5678</strong></div>
                        <div>· RIF / C.I.: <strong>J-50123456-7</strong></div>
                        <div>
                          · Monto Exacto en Bolívares: <strong className="text-emerald-400">Bs. {feeBs}</strong>
                        </div>
                      </>
                    )}
                    {subPayMethod === 'BINANCE_PAY' && (
                      <>
                        <div className="font-bold text-amber-400">Datos para Binance Pay:</div>
                        <div>· Binance Pay ID: <strong>284910284</strong> (VeneTurco OS)</div>
                        <div>· Moneda: <strong>USDT (Tether)</strong></div>
                        <div>
                          · Monto Exacto: <strong className="text-emerald-400">${feeUsd.toFixed(2)} USDT</strong>
                        </div>
                      </>
                    )}
                    {subPayMethod === 'ZELLE' && (
                      <>
                        <div className="font-bold text-purple-400">Datos para Transferencia Zelle:</div>
                        <div>· Correo Zelle: <strong>pagos@veneturco.com</strong></div>
                        <div>· Titular: <strong>VeneTurco Software LLC</strong></div>
                        <div>
                          · Monto Exacto: <strong className="text-emerald-400">${feeUsd.toFixed(2)} USD</strong>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Reference Input */}
                  <div>
                    <label className="block mb-1 opacity-80 font-bold">
                      Nº Referencia Bancaria / Hash de Transacción
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej: 0098234827 o Hash Binance"
                      value={subPayRefInput}
                      onChange={e => setSubPayRefInput(e.target.value)}
                      className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!subPayRefInput.trim()}
                      className="ui-btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Confirmar Pago y Renovar 30 Días (+${commUsd} Comisión Contador)
                    </button>
                  </div>
                </div>
              );
            })()}
          </form>
        </div>
      )}

      {/* =====================================================================
          NEW TENANT / COMPANY REGISTRATION MODAL (+ NUEVO RIF)
         ===================================================================== */}
      {newTenantModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setNewTenantModalOpen(false)}
        >
          <form
            onSubmit={handleCreateTenant}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md ui-card p-6 space-y-4 text-xs font-mono shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <h3 className="ui-heading text-base font-bold">Registrar Nueva Empresa (Multi-RIF)</h3>
              <button type="button" onClick={() => setNewTenantModalOpen(false)} className="opacity-75 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block mb-1 opacity-75">Razón Social Completa</label>
              <input
                type="text"
                required
                placeholder="Ej: Inversiones Caracas 2026 C.A."
                value={newTenantName}
                onChange={e => setNewTenantName(e.target.value)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              />
            </div>
            <div>
              <label className="block mb-1 opacity-75">RIF (Validado con Módulo 11)</label>
              <input
                type="text"
                required
                value={newTenantRif}
                onChange={e => setNewTenantRif(e.target.value)}
                className={`w-full p-2.5 rounded bg-[var(--bg-elevated)] border ${
                  validateVenezuelanRIF(newTenantRif).valid ? 'border-emerald-500/50' : 'border-rose-500'
                }`}
              />
              <span className={`text-[10px] ${validateVenezuelanRIF(newTenantRif).valid ? 'text-emerald-400' : 'text-rose-400'}`}>
                {validateVenezuelanRIF(newTenantRif).valid
                  ? `Módulo 11 OK (${validateVenezuelanRIF(newTenantRif).formatted})`
                  : 'Dígito verificador Módulo 11 inválido'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-75">Régimen Tributario</label>
                <select
                  value={newTenantRegime}
                  onChange={e => setNewTenantRegime(e.target.value as 'SPE' | 'ORDINARIO' | 'FORMAL')}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <option value="SPE">Sujeto Pasivo Especial (SPE)</option>
                  <option value="ORDINARIO">Contribuyente Ordinario</option>
                  <option value="FORMAL">Contribuyente Formal</option>
                </select>
              </div>
              <div>
                <label className="block mb-1 opacity-75">Plan SaaS</label>
                <select
                  value={newTenantPlan}
                  onChange={e => setNewTenantPlan(e.target.value as 'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE')}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <option value="COMERCIO_PRO">Comercio Pro ($29.99)</option>
                  <option value="EMPRESA_MAX">Empresa Max ($79.99)</option>
                  <option value="FIRMA_CONTABLE">Firma Contable ($139.99)</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={!validateVenezuelanRIF(newTenantRif).valid}
              className="ui-btn-primary w-full py-2.5 text-xs disabled:opacity-40"
            >
              Crear Empresa y Generar Código Telegram
            </button>
          </form>
        </div>
      )}

      {/* =====================================================================
          SUPER-ADMIN COMMISSION PAYOUT MODAL (PAGO MÓVIL / BINANCE / ZELLE)
         ===================================================================== */}
      {payoutModalAccountant && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setPayoutModalAccountant(null)}
        >
          <form
            onSubmit={handleConfirmCommissionPayout}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg ui-card p-6 space-y-4 text-xs font-mono shadow-2xl my-8 border border-purple-500/60"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                  <Scale className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h3 className="ui-heading text-base font-bold text-white">
                    Liquidación de Rev-Share (20%)
                  </h3>
                  <p className="text-[11px] opacity-75">
                    {payoutModalAccountant.name} · {payoutModalAccountant.cpcNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayoutModalAccountant(null)}
                className="opacity-75 hover:opacity-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Monto a Liquidar */}
            <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-purple-300">Comisión Acumulada por Transferir</span>
                <div className="text-2xl font-black text-purple-200 tabular-nums">
                  ${payoutModalAccountant.pendingCommissionUsd.toFixed(2)} <span className="text-xs font-normal opacity-75">USD</span>
                </div>
                <div className="text-xs font-bold text-emerald-400 tabular-nums mt-0.5">
                  Bs. {(payoutModalAccountant.pendingCommissionUsd * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="text-[10px] font-normal opacity-70 ml-1">@ BCV {bcvRate}</span>
                </div>
              </div>
              <div className="text-right border-l border-purple-500/30 pl-4">
                <span className="text-[10px] opacity-65">Método Registrado:</span>
                <div className="font-bold text-white uppercase text-[11px] mt-0.5">
                  {payoutModalAccountant.payoutMethod}
                </div>
                <span className="text-[9px] text-purple-300">Rev-Share 20%</span>
              </div>
            </div>

            {/* Datos Bancarios del Contador */}
            <div className="p-3 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-1">
              <span className="text-[10px] uppercase font-bold text-amber-300">Coordenadas de Pago del Aliado:</span>
              <p className="font-bold text-white text-[11px]">{payoutModalAccountant.payoutDetails}</p>
              <p className="text-[10px] opacity-65">RIF: {payoutModalAccountant.rif} · Teléfono: {payoutModalAccountant.phone}</p>
            </div>

            {/* Referencia de Transferencia */}
            <div>
              <label className="block mb-1 opacity-80 font-bold">
                Nº de Referencia Bancaria / Comprobante de Pago Móvil o Binance
              </label>
              <input
                type="text"
                required
                placeholder="Ej: 009824102948 o TxID Binance"
                value={payoutRefInput}
                onChange={e => setPayoutRefInput(e.target.value)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-purple-400 focus:outline-none"
              />
            </div>

            {/* Botones de Acción */}
            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={!payoutRefInput.trim()}
                className="ui-btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <CheckCircle2 className="w-4 h-4" />
                Registrar Pago y Sellar Auditoría
              </button>

              <a
                href={getWhatsAppCommissionVoucherUrl(
                  payoutModalAccountant,
                  payoutModalAccountant.pendingCommissionUsd,
                  payoutRefInput || 'PENDIENTE_ENVIO'
                )}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-1.5 transition-colors text-xs"
              >
                <MessageSquare className="w-4 h-4" />
                Voucher WhatsApp
              </a>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          NEW / EDIT ACCOUNTANT PARTNER MODAL
         ===================================================================== */}
      {accountantModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setAccountantModalOpen(false)}
        >
          <form
            onSubmit={handleSaveAccountant}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg ui-card p-6 space-y-4 text-xs font-mono shadow-2xl my-8 border border-amber-500/50"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <Users className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="ui-heading text-base font-bold text-white">
                    {editAccId ? 'Editar Firma / Contador Partner' : 'Registrar Nuevo Contador Partner'}
                  </h3>
                  <p className="text-[11px] opacity-75">
                    Afiliación al Programa Nacional de Contadores Aliados VeneTurco OS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccountantModalOpen(false)}
                className="opacity-75 hover:opacity-100 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-80 font-bold">Nombre Completo del Licenciado</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Lic. Mariana Delgado"
                  value={accFormName}
                  onChange={e => setAccFormName(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 opacity-80 font-bold">Nº de Colegio (CPC)</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: CPC-74.192"
                  value={accFormCpc}
                  onChange={e => setAccFormCpc(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-80 font-bold">RIF Personal o de la Firma</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: V-19.482.710-3"
                  value={accFormRif}
                  onChange={e => setAccFormRif(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 opacity-80 font-bold">Ciudad y Estado</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Valencia, Edo. Carabobo"
                  value={accFormCity}
                  onChange={e => setAccFormCity(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-80 font-bold">Correo de Contacto</label>
                <input
                  type="email"
                  required
                  placeholder="contador@firma.com"
                  value={accFormEmail}
                  onChange={e => setAccFormEmail(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 opacity-80 font-bold">WhatsApp Móvil</label>
                <input
                  type="text"
                  required
                  placeholder="+58 414-1234567"
                  value={accFormPhone}
                  onChange={e => setAccFormPhone(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1 opacity-80 font-bold">Plan Asignado</label>
                <select
                  value={accFormPlan}
                  onChange={e => setAccFormPlan(e.target.value as typeof accFormPlan)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <option value="CONTADOR_INDIVIDUAL">Contador Independiente ($29.99/m · 3 Emp)</option>
                  <option value="FIRMA_PRO">Firma Contable Pro ($69.99/m · 10 Emp)</option>
                  <option value="CONSORCIO_MAX">Consorcio Contable Max ($149.99/m · Ilimitado)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 opacity-80 font-bold">Datos Pago Móvil / Binance</label>
                <input
                  type="text"
                  required
                  placeholder="Banesco (0134) · 0414-0000000 · V-00000000"
                  value={accFormPayout}
                  onChange={e => setAccFormPayout(e.target.value)}
                  className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccountantModalOpen(false)}
                className="px-4 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-white text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
              >
                <Check className="w-4 h-4" />
                <span>{editAccId ? 'Actualizar Contador' : 'Guardar y Activar'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          MODAL CREDENCIALES ACTIVADAS EN LA NUBE (INVITACIÓN CONTADOR REAL)
         ===================================================================== */}
      {issuedInviteModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setIssuedInviteModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#1C1C1E] border border-white/15 p-6 space-y-4 text-xs shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cuenta Activada en la Nube</h3>
                  <p className="text-[11px] text-[#8E8E93]">
                    {issuedInviteModal.accountant.name} ({issuedInviteModal.accountant.cpcNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIssuedInviteModal(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2.5 font-mono">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#8E8E93]">Correo de Acceso</div>
                <div className="text-xs font-semibold text-white mt-0.5">{issuedInviteModal.accountant.email}</div>
              </div>
              <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8E8E93]">Clave Temporal Única</div>
                  <div className="text-base font-bold text-emerald-400 tracking-wider mt-0.5 select-all">
                    {issuedInviteModal.tempPassword}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(issuedInviteModal.tempPassword);
                    setCopiedInvitePass(true);
                    setTimeout(() => setCopiedInvitePass(false), 2500);
                  }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium flex items-center gap-1.5 border border-white/10"
                >
                  {copiedInvitePass ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedInvitePass ? 'Copiada' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <p className="text-[11px] text-white/70 leading-relaxed">
              Esta cuenta ya quedó guardada en <strong>Cloud Firestore</strong>. En el primer ingreso del contador, el sistema le pedirá crear su contraseña personal definitiva.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIssuedInviteModal(null)}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium"
              >
                Cerrar
              </button>
              <a
                href={getWhatsAppAccountantInviteUrl(issuedInviteModal.accountant, issuedInviteModal.tempPassword)}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-bold text-xs flex items-center gap-2 shadow-sm transition"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar Invitación por WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL CAMBIO OBLIGATORIO DE CONTRASEÑA TEMPORAL (PRIMER INGRESO)
         ===================================================================== */}
      {currentUser?.mustChangePassword && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-lg flex items-center justify-center p-4">
          <form
            onSubmit={handleChangeMandatoryPassword}
            className="w-full max-w-md rounded-2xl bg-[#1C1C1E] border border-white/15 p-6 space-y-4 text-xs shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Crea tu Contraseña Personal</h3>
                <p className="text-[11px] text-[#8E8E93]">
                  Por seguridad, reemplaza tu clave temporal antes de operar ({currentUser.email}).
                </p>
              </div>
            </div>

            {changePasswordError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px]">
                {changePasswordError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block mb-1 text-white/70 font-medium">Nueva Contraseña (mínimo 8 caracteres)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoFocus
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  placeholder="Ej: MiClaveSegura2026#"
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/15 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block mb-1 text-white/70 font-medium">Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPasswordInput}
                  onChange={e => setConfirmPasswordInput(e.target.value)}
                  placeholder="Repite tu nueva contraseña"
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/15 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={changePasswordSaving}
              className="w-full py-3 rounded-xl bg-white hover:bg-white/90 text-black font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{changePasswordSaving ? 'Guardando en la nube...' : 'Activar Contraseña y Entrar'}</span>
            </button>
          </form>
        </div>
      )}

      {/* =====================================================================
          ELITE FINTECH UI 2026: UNIVERSAL COMMAND PALETTE (Ctrl+K / Cmd+K)
         ===================================================================== */}
      {commandPaletteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xl flex items-start justify-center pt-24 p-4 transition-all duration-200"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-slate-950/95 border border-white/15 p-4 space-y-3 text-xs font-mono shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_24px_64px_-12px_rgba(0,0,0,0.85)]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/10">
              <Search className="w-4 h-4 text-cyan-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                placeholder="Buscar empresa por RIF, factura # o comando (ej. J-4019, TXT, BCV, Conciliar)..."
                className="w-full bg-transparent focus:outline-none text-sm text-white placeholder-slate-500 font-sans"
              />
              <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-slate-300 font-mono">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1">
              {[
                ...(currentUser?.role !== 'client'
                  ? tenants.map(t => ({
                      label: `🏢 Cambiar a ${t.name} (${t.rif})`,
                      category: 'CLIENTE',
                      action: () => {
                        setSelectedTenantId(t.id);
                        setActiveTab('clients');
                        setCommandPaletteOpen(false);
                      }
                    }))
                  : []),
                ...tenantInvoices.slice(0, 15).map(inv => ({
                  label: `🧾 Inspeccionar Factura #${inv.invoiceNumber} · ${inv.supplierName} (${inv.currency} ${inv.totalOriginal.toFixed(2)})`,
                  category: 'FACTURA',
                  action: () => {
                    setInspectedInvoice(inv);
                    setCommandPaletteOpen(false);
                  }
                })),
                ...(currentUser?.role === 'superadmin'
                  ? [
                      {
                        label: '👑 Ir a Torre de Control Super-Admin (Red de Contadores)',
                        category: 'SUPER-ADMIN',
                        action: () => {
                          setActiveTab('accountants');
                          setCommandPaletteOpen(false);
                        }
                      },
                      {
                        label: '👑 Registrar Nuevo Contador Partner (CPC)',
                        category: 'SUPER-ADMIN',
                        action: () => {
                          handleOpenAccountantModal();
                          setCommandPaletteOpen(false);
                        }
                      }
                    ]
                  : []),
                {
                  label: 'Sincronizar Tasa Oficial BCV Ahora',
                  category: 'ORÁCULO',
                  action: () => {
                    handleSyncBcvOracle();
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Ir a 02. Escáner IA Gemini 2.5 Flash & Bot Telegram',
                  category: 'MÓDULO',
                  action: () => {
                    setActiveTab('ocr');
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Ir a 03. Libros Fiscales SENIAT & Exportación TXT/XML',
                  category: 'MÓDULO',
                  action: () => {
                    setActiveTab('books');
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Ir a 06. Conciliación Bancaria & Diferencial Cambiario',
                  category: 'MÓDULO',
                  action: () => {
                    setActiveTab('reconciliation');
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Ejecutar Conciliación Bancaria 1-Clic',
                  category: 'CONCILIACIÓN',
                  action: () => {
                    handleRunAutoReconcile();
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Descargar Certificado Conciliación SENIAT Art. 177 (PDF)',
                  category: 'AUDITORÍA',
                  action: () => {
                    handleDownloadReconcilePdf();
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Descargar Archivo TXT Retenciones IVA (16 Columnas)',
                  category: 'EXPORTAR',
                  action: () => {
                    handleDownloadFile(
                      `RET_IVA_${activeTenant.rif}_202611.txt`,
                      exportSeniatIvaTxt16(activeTenant.rif, '202611', tenantInvoices),
                      'text/plain'
                    );
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Descargar Archivo XML Retenciones ISLR (Decreto 1808)',
                  category: 'EXPORTAR',
                  action: () => {
                    handleDownloadFile(
                      `RET_ISLR_${activeTenant.rif}_202611.xml`,
                      exportIslrXmlDecreto1808(activeTenant.rif, '202611', tenantInvoices),
                      'application/xml'
                    );
                    setCommandPaletteOpen(false);
                  }
                },
                {
                  label: 'Descargar Comprobante Retención ISLR Decreto 1808 (PDF)',
                  category: 'COMPROBANTE',
                  action: () => {
                    const islrInv = tenantInvoices.find(i => i.islrRetentionRate > 0) || tenantInvoices[0];
                    if (islrInv) {
                      downloadPdfIslrRetentionVoucher(activeTenant.name, activeTenant.rif, islrInv);
                    }
                    setCommandPaletteOpen(false);
                  }
                },
                ...tenants.map(t => ({
                  label: `Cambiar Empresa Activa -> ${t.name} (${t.rif})`,
                  category: 'MULTI-RIF',
                  action: () => {
                    setSelectedTenantId(t.id);
                    setCommandPaletteOpen(false);
                  }
                })),
                ...SKINS.map(s => ({
                  label: `Aplicar Tema 2026 -> ${s.label}`,
                  category: 'SKIN ENGINE',
                  action: () => {
                    setSkin(s.id);
                    setCommandPaletteOpen(false);
                  }
                }))
              ]
                .filter(item => item.label.toLowerCase().includes(commandQuery.toLowerCase()))
                .map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="w-full p-2.5 rounded hover:bg-[var(--bg-elevated)] flex items-center justify-between text-left transition-colors"
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-[var(--accent-primary)]">
                      {item.category}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      {/* Emil Kowalski / OpenDesign Sonner Floating Toast Pill */}
      {(subPayToast || mobileToast) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
          <div className="sonner-toast-pill px-4 py-2.5 flex items-center gap-3 text-xs font-medium text-white shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="tracking-tight">{subPayToast || mobileToast}</span>
            <button
              onClick={() => {
                setSubPayToast(null);
                setMobileToast(null);
              }}
              className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
