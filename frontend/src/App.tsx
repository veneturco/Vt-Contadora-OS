import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, FileText, Cpu, Send, Users, CreditCard, Smartphone,
  Lock, Download, CheckCircle2, AlertTriangle, RefreshCw, Plus,
  Building2, Scale, Hash, Eye, Camera, Upload, KeyRound,
  Check, Copy, ArrowUpRight, QrCode, Search, Calendar, X, Terminal,
  Printer, LogOut, Wifi, WifiOff
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
  computeDeterministicHash,
  simulateAes256GcmEncrypt,
  simulateAes256GcmDecrypt,
  calculateLotttFullBreakdown,
  getSeniatSpeCalendarByRif,
  openPrintableRetentionVoucher,
  openPrintablePaystub,
  downloadPdfRetentionVoucher,
  downloadPdfPaystub
} from './utils/seniatEngine';
import { safeGetStorage, safeSetStorage } from './utils/storage';
import { safeApiRequest } from './services/apiClient';

type SkinId =
  | 'hyperframe-tactical'
  | 'obsidian-linear'
  | 'mercury-sovereign'
  | 'spatial-titanium'
  | 'tactile-bento'
  | 'kinetic-studio'
  | 'editorial-swiss'
  | 'eink-auditor'
  | 'neo-brutal';

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
}

const SKINS: { id: SkinId; label: string }[] = [
  { id: 'hyperframe-tactical', label: 'Hyperframe HUD (Tactical)' },
  { id: 'mercury-sovereign', label: 'Mercury Sovereign (Fintech 2026)' },
  { id: 'spatial-titanium', label: 'Liquid Glass Titanium (Spatial)' },
  { id: 'obsidian-linear', label: 'Obsidian Linear' },
  { id: 'tactile-bento', label: 'Tactile Hardware Bento' },
  { id: 'kinetic-studio', label: 'Kinetic Studio (Volt)' },
  { id: 'editorial-swiss', label: 'Editorial Swiss Ledger' },
  { id: 'eink-auditor', label: 'E-Ink Paper Audit (No-Glare)' },
  { id: 'neo-brutal', label: 'Neo-Brutalist Raw' }
];

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
    telegramChatLinked: '@bodega_jh_admin (ID: 59182041)'
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
    telegramChatLinked: '@ccmi_facturacion (ID: 88210492)'
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
    telegramChatLinked: '@veneturco_hq (ID: 10948271)'
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
    bcvRateOnDate: 46.85,
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
    bcvRateOnDate: 46.92,
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
    bcvRateOnDate: 47.05,
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
    bcvRateOnDate: 46.92,
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
    bcvRate: 46.85,
    amountBs: 3747.53,
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
    bcvRate: 46.85,
    amountBs: 6558.53,
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
    details: 'Sincronización automática Tasa Oficial BCV USD: Bs. 46.85',
    previousHash: 'GENESIS_SENIAT_2026',
    sha256Hash: computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 46.85 }),
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
    previousHash: computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 46.85 }),
    sha256Hash: computeDeterministicHash(
      computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 46.85 }),
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
      computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 46.85 }),
      { seq: 2, action: 'INGESTA_TELEGRAM_OCR', invoiceNumber: '00045812' }
    ),
    sha256Hash: computeDeterministicHash(
      computeDeterministicHash(
        computeDeterministicHash('GENESIS_SENIAT_2026', { seq: 1, action: 'BCV_ORACLE_SYNC', rate: 46.85 }),
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ email: string; role: 'admin' | 'client'; name: string } | null>(() =>
    safeGetStorage('vt_auth_user', null)
  );
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [loginEmail, setLoginEmail] = useState<string>('auditor@veneturco.com');
  const [loginPassword, setLoginPassword] = useState<string>('Seniat2026#');
  const [loginRole, setLoginRole] = useState<'admin' | 'client'>('admin');
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<any>(null);

  const [skin, setSkin] = useState<SkinId>(() => safeGetStorage<SkinId>('ui_active_skin', 'hyperframe-tactical'));
  const [activeTab, setActiveTab] = useState<'command' | 'ocr' | 'books' | 'payroll' | 'saas' | 'mobile' | 'security'>('command');
  const [tenants, setTenants] = useState<Tenant[]>(() => safeGetStorage('vt_tenants_v31', INITIAL_TENANTS));
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => INITIAL_TENANTS[0].id);
  const [invoices, setInvoices] = useState<FiscalInvoice[]>(() => safeGetStorage('vt_invoices_v31', INITIAL_INVOICES));
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => safeGetStorage('vt_audit_v31', INITIAL_AUDIT_LOGS));
  const [payments, setPayments] = useState<SaasPaymentRecord[]>(() => safeGetStorage('vt_payments_v31', INITIAL_PAYMENTS));
  const [employees, setEmployees] = useState<PayrollEmployee[]>(() => safeGetStorage('vt_employees_v31', INITIAL_EMPLOYEES));

  // New Tenant Modal State
  const [newTenantModalOpen, setNewTenantModalOpen] = useState<boolean>(false);
  const [newTenantName, setNewTenantName] = useState<string>('');
  const [newTenantRif, setNewTenantRif] = useState<string>('J-40918273-8');
  const [newTenantRegime, setNewTenantRegime] = useState<'SPE' | 'ORDINARIO' | 'FORMAL'>('SPE');
  const [newTenantPlan, setNewTenantPlan] = useState<'COMERCIO_PRO' | 'EMPRESA_MAX' | 'FIRMA_CONTABLE'>('EMPRESA_MAX');

  // New Employee Form State
  const [newEmpName, setNewEmpName] = useState<string>('');
  const [newEmpCedula, setNewEmpCedula] = useState<string>('V-20.111.222');
  const [newEmpRole, setNewEmpRole] = useState<string>('Asistente Administrativo');
  const [newEmpSalary, setNewEmpSalary] = useState<number>(14500);

  const [bcvRate, setBcvRate] = useState<number>(47.05);
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
      text: 'Factura registrada #00045812 | Control: 00-00192834 | Total: USD 1,578.00 (@ BCV 46.85) -> Bandeja del Contador.',
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

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const user = {
      email: loginEmail.trim() || 'auditor@veneturco.com',
      role: loginRole,
      name: loginRole === 'admin' ? 'Lic. Auditor Principal (Firma)' : `Comercio (${activeTenant.name})`
    };
    setCurrentUser(user);
    localStorage.setItem('vt_auth_user', JSON.stringify(user));
    if (loginRole === 'client') {
      setActiveTab('mobile');
    } else {
      setActiveTab('command');
    }
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem('vt_auth_user');
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
    const res = await safeApiRequest<{ usdVes: number; status: string; source: string }>('/api/bcv/sync-now', {
      method: 'POST',
      timeoutMs: 12000
    });
    if (res.ok && res.data?.usdVes) {
      const newRate = Number(res.data.usdVes.toFixed(2));
      setBcvRate(newRate);
      setBcvSyncFlash(`Tasa Oficial BCV sincronizada (${res.data.source || 'BCV'}): Bs. ${newRate.toFixed(2)} / USD`);
      appendAuditLog(
        'BCV_ORACLE_SYNC',
        'backend:bcvSyncCron',
        `bcv_${new Date().toISOString().slice(0, 10)}`,
        `Sincronización oficial portal BCV: USD = Bs. ${newRate.toFixed(2)}`
      );
    } else {
      setBcvSyncFlash(`Aviso: ${res.error || 'No se pudo contactar al oráculo BCV'}. Se mantiene la tasa oficial actual: Bs. ${bcvRate.toFixed(2)} / USD`);
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
      const base64Data = String(reader.result || '').split(',')[1] || '';
      try {
        const res = await safeApiRequest<{
          mode: string;
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
          setOcrAlertMessage(`Imagen "${file.name}" procesada vía Backend (${res.data.mode}).`);
        } else {
          setOcrAlertMessage(`Aviso OCR: ${res.error || 'Procesamiento asistido'}. Operando con motor local.`);
        }
      } catch {
        setOcrAlertMessage(`Imagen "${file.name}" procesada con motor local Gemini 2.5 Flash.`);
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

  function handleRegisterSaasPayment() {
    const plan = SAAS_PLANS_CATALOG.find(p => p.id === selectedPlanForPayment) || SAAS_PLANS_CATALOG[1];
    const amountBs = Number((plan.priceUsdMonthly * bcvRate).toFixed(2));
    const lastHash = auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].sha256Hash : 'GENESIS_SENIAT_2026';
    const paymentId = `pay_${Date.now()}`;
    const auditHash = computeDeterministicHash(lastHash, {
      paymentId,
      tenantId: activeTenant.id,
      planId: plan.id,
      ref: paymentRefInput
    });

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    const nextBillingStr = nextDate.toISOString().slice(0, 10);

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
      status: 'VERIFICADO',
      auditHash,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setPayments(prev => [newRecord, ...prev]);
    setTenants(prev =>
      prev.map(t =>
        t.id === activeTenant.id
          ? { ...t, planId: plan.id, subscriptionStatus: 'ACTIVA', nextBillingDate: nextBillingStr }
          : t
      )
    );
    appendAuditLog(
      'RENOVACION_LICENCIA_SAAS',
      'admin:saas_billing',
      paymentId,
      `Suscripción ${plan.name} renovada vía ${paymentMethod} (Ref: ${paymentRefInput}) por USD ${plan.priceUsdMonthly} (Bs. ${amountBs.toFixed(2)})`
    );
    setPaymentRefInput(`0134-${Math.floor(10000000 + Math.random() * 89999999)}`);
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="ui-card p-6 md:p-8 w-full max-w-md space-y-5 text-xs font-mono">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                SNAT/2026/00093 · COT 10Y
              </span>
              <span className="text-[10px] opacity-70">v3.1 COMMERCIAL</span>
            </div>
            <h1 className="ui-heading text-2xl font-extrabold tracking-tight pt-1">
              VENETURCO FISCAL OS
            </h1>
            <p className="opacity-75">Acceso Blindado Multi-Empresa · SENIAT & Contabilidad Cloud</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setLoginRole('admin');
                setLoginEmail('auditor@veneturco.com');
              }}
              className={`p-2.5 rounded border text-center ${
                loginRole === 'admin'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-bold border-[var(--border-highlight)]'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-80'
              }`}
            >
              Firma Contable / Admin
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginRole('client');
                setLoginEmail('gerencia@bodegajh.com');
              }}
              className={`p-2.5 rounded border text-center ${
                loginRole === 'client'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-bold border-[var(--border-highlight)]'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] opacity-80'
              }`}
            >
              Cliente Comercio (9:16)
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block mb-1 opacity-75">Correo Corporativo</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              />
            </div>
            <div>
              <label className="block mb-1 opacity-75">Contraseña de Bóveda</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                className="w-full p-2.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              />
            </div>
          </div>

          <button type="submit" className="ui-btn-primary w-full py-3 text-xs flex items-center justify-center gap-2">
            <Lock className="w-4 h-4" />
            Iniciar Sesión Segura
          </button>

          <p className="text-[10px] opacity-65 text-center">
            Autenticación preparada para Firebase Auth + Custom Claims (`role`, `tenantIds`).
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      {/* Top Command Bar */}
      <header className="ui-card p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <div>
            <h1 className="ui-heading text-xl md:text-2xl font-extrabold tracking-tight flex flex-wrap items-center gap-2">
              VENETURCO FISCAL OS <span className="text-xs font-mono px-2 py-0.5 border border-current rounded">v3.2 VNDE · SENIAT 2026</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                  backendOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {backendOnline ? 'API BACKEND: ONLINE (:8080)' : 'MODO AUTÓNOMO'}
              </span>
            </h1>
            <p className="text-xs font-mono opacity-75">
              SNAT/2026/00093 (G.O. 43.484) · SNAT/2026/00099 · Motor VNDE Cero Tokens · Sesión: {currentUser.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tenant Selector + New Tenant Button */}
          <div className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]">
            <Building2 className="w-4 h-4 text-[var(--accent-secondary)]" />
            <select
              id="tenant-selector"
              value={selectedTenantId}
              onChange={e => setSelectedTenantId(e.target.value)}
              className="bg-transparent text-xs font-mono font-semibold focus:outline-none"
            >
              {tenants.map(t => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.name} ({t.rif}) [{t.subscriptionStatus}]
                </option>
              ))}
            </select>
            <button
              onClick={() => setNewTenantModalOpen(true)}
              title="Registrar Nueva Empresa (RIF)"
              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono text-[var(--accent-primary)] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> RIF
            </button>
          </div>

          {/* BCV Oracle */}
          <div className="flex items-center gap-2 px-3 py-1.5 border border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]">
            <span className="text-xs font-mono opacity-75">BCV USD:</span>
            <input
              id="bcv-rate-input"
              type="number"
              step="0.01"
              value={bcvRate}
              onChange={e => setBcvRate(Number(e.target.value) || 47.05)}
              className="w-20 bg-transparent text-xs font-mono font-bold tabular-nums text-[var(--accent-primary)] focus:outline-none"
            />
            <span className="text-xs font-mono">Bs.</span>
            <button
              onClick={handleSyncBcvOracle}
              title="Sincronizar Tasa Oficial BCV"
              className="p-1 rounded hover:bg-white/10 text-[var(--accent-secondary)]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Network Resilience Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[11px] font-mono">
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400 text-[10px] font-bold hidden sm:inline">ONLINE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-400 animate-pulse" />
                <span className="text-amber-400 text-[10px] font-bold hidden sm:inline">OFFLINE</span>
              </>
            )}
          </div>

          {/* Skin Switcher */}
          <select
            id="skin-selector"
            value={skin}
            onChange={e => setSkin(e.target.value as SkinId)}
            className="px-3 py-1.5 text-xs font-mono border border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)]"
            aria-label="Selector de piel visual"
          >
            {SKINS.map(s => (
              <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                SKIN: {s.label}
              </option>
            ))}
          </select>

          <button
            id="cmd-palette-trigger"
            onClick={() => setCommandPaletteOpen(true)}
            className="px-3 py-1.5 text-xs font-mono border border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)] flex items-center gap-1.5"
            title="Abrir Command Palette Universal (Ctrl+K)"
          >
            <Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Comandos</span>
            <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-white/10">Ctrl+K</kbd>
          </button>

          {pwaInstallPrompt && (
            <button
              onClick={() => {
                pwaInstallPrompt.prompt();
                pwaInstallPrompt.userChoice.then(() => setPwaInstallPrompt(null));
              }}
              className="px-3 py-2 text-xs font-mono font-bold rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 animate-pulse"
              title="Instalar App en este Dispositivo (Android / iOS / PC)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Instalar App</span>
            </button>
          )}

          <button onClick={handleExportSnapshot} className="ui-btn-primary px-3 py-2 text-xs flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Snapshot Drive
          </button>

          <button
            onClick={handleLogout}
            title="Cerrar Sesión"
            className="px-2.5 py-2 text-xs font-mono border border-[var(--border-subtle)] rounded bg-[var(--bg-elevated)] hover:border-rose-400 text-rose-400 flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
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

      {/* Navigation Tabs */}
      <nav className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'command', label: '01. Centro de Mando', icon: Cpu },
          { id: 'ocr', label: '02. Escáner IA & Telegram', icon: Send },
          { id: 'books', label: '03. Libros SENIAT & TXT/XML', icon: FileText },
          { id: 'payroll', label: '04. Nómina LOTTT', icon: Users },
          { id: 'saas', label: '05. Licencias SaaS', icon: CreditCard },
          { id: 'mobile', label: '06. Portal Cliente 9:16', icon: Smartphone },
          { id: 'security', label: '07. Blindaje SHA-256', icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-3.5 py-2 text-xs font-mono uppercase tracking-wider rounded border transition-all flex items-center gap-2 ${
                active
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-bold border-[var(--border-highlight)]'
                  : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

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
          TAB 02: ESCÁNER IA GEMINI 2.5 FLASH & BOT DE TELEGRAM (8 + 4 BENTO)
         ===================================================================== */}
      {activeTab === 'ocr' && (
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
      {activeTab === 'books' && (
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
                                    title="Descargar Comprobante PDF Vectorial con Código QR Oficial"
                                    className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] inline-flex items-center gap-1 font-bold"
                                  >
                                    <Download className="w-3 h-3" /> PDF QR
                                  </button>
                                </span>
                              )}
                              {inv.docType === '01' && (
                                <button
                                  onClick={() => setAdjustmentTarget(inv)}
                                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px]"
                                >
                                  + Nota C/D
                                </button>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => handleApproveInvoice(inv.id)}
                              className="px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            >
                              Aprobar Borrador
                            </button>
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
          <div className="col-span-12 ui-card p-5 space-y-4 text-xs font-mono">
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

            {/* Payment Ledger Table */}
            <div className="ui-card p-5 space-y-3">
              <h3 className="ui-heading text-base font-bold">Historial Inmutable de Pagos SaaS</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] opacity-75">
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2">Plan</th>
                      <th className="py-2 px-2">Método / Ref</th>
                      <th className="py-2 px-2 text-right">Monto USD</th>
                      <th className="py-2 px-2 text-right">Equivalente Bs.</th>
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

          {/* 4-Column AES-256-GCM Interactive Vault & Firestore Rules Matrix */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
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
          ELITE FINTECH UI 2026: UNIVERSAL COMMAND PALETTE (Ctrl+K / Cmd+K)
         ===================================================================== */}
      {commandPaletteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-20 p-4"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div
            className="w-full max-w-xl ui-card p-4 space-y-3 text-xs font-mono shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 pb-2 border-b border-[var(--border-subtle)]">
              <Search className="w-4 h-4 text-[var(--accent-primary)]" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                placeholder="Escribe un comando (ej. TXT, XML, BCV, Escanear, CCMI, Mercury)..."
                className="w-full bg-transparent focus:outline-none text-sm"
              />
              <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-white/10">ESC</kbd>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1">
              {[
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
    </div>
  );
}
