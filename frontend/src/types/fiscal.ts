export type SkinId =
  | 'obsidian-champagne'
  | 'swiss-ivory'
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

export type ActiveTabId =
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

export type OperationStepId = 'scanner' | 'books' | 'reconciliation';

export interface Tenant {
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
