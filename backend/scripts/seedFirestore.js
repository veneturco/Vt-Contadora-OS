// Script de Inicialización y Poblado de Datos Oficiales para Google Cloud Firestore
// VeneTurco Fiscal OS v3.1 // Cumplimiento SENIAT 2026
require('dotenv').config();
const admin = require('firebase-admin');

async function seed() {
  console.log('--- INICIALIZADOR DE BOVEDA CLOUD FIRESTORE ---');
  let serviceAccountStr = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!serviceAccountStr && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('Aviso: FIREBASE_SERVICE_ACCOUNT_JSON no configurado. Operando en modo local.');
    return;
  }

  let serviceAccount;
  if (serviceAccountStr) {
    try {
      serviceAccount = JSON.parse(serviceAccountStr);
    } catch {
      serviceAccount = JSON.parse(Buffer.from(serviceAccountStr, 'base64').toString('utf8'));
    }
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
  } else if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  console.log('Conexión con Cloud Firestore establecida con éxito.');

  // Sembrar Catálogo de Planes SaaS
  const plans = [
    {
      id: 'COMERCIO_PRO',
      name: 'Comercio Autónomo Pro',
      priceUsdMonthly: 49.00,
      maxInvoicesMonthly: 400,
      hasGeminiOcr: true,
      hasTelegramBot: true,
      hasLotttPayroll: false,
      description: 'Ideal para comercios minoristas y panaderías con libro de compras automatizado.'
    },
    {
      id: 'EMPRESA_MAX',
      name: 'Empresa & SPE Max (Sujeto Pasivo Especial)',
      priceUsdMonthly: 79.00,
      maxInvoicesMonthly: 1800,
      hasGeminiOcr: true,
      hasTelegramBot: true,
      hasLotttPayroll: true,
      description: 'Retenciones IVA 75%/100%, generación de comprobantes 14D y nómina LOTTT completa.'
    },
    {
      id: 'FIRMA_CONTABLE',
      name: 'Firma Contable Multiempresa',
      priceUsdMonthly: 139.00,
      maxInvoicesMonthly: 10000,
      hasGeminiOcr: true,
      hasTelegramBot: true,
      hasLotttPayroll: true,
      description: 'Multi-tenant ilimitado, bóveda criptográfica SHA-256 y exportaciones TXT/XML para SENIAT.'
    }
  ];

  for (const plan of plans) {
    await db.collection('saas_plans').doc(plan.id).set(plan, { merge: true });
    console.log(`Plan ${plan.name} verificado.`);
  }

  // Sembrar Empresas Iniciales (Tenants)
  const tenants = [
    {
      id: 'tenant_bodega_jh',
      name: 'Inversiones y Alimentos Bodega J&H C.A.',
      rif: 'J-40918273-8',
      regime: 'SPE',
      planId: 'EMPRESA_MAX',
      subscriptionStatus: 'ACTIVA',
      nextBillingDate: '2026-12-14',
      telegramCode: 'VT-BODE-9A41F2',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tenant_veneturco',
      name: 'VeneTurco Repuestos & Logística S.A.',
      rif: 'J-50123984-1',
      regime: 'SPE',
      planId: 'FIRMA_CONTABLE',
      subscriptionStatus: 'ACTIVA',
      nextBillingDate: '2026-12-01',
      telegramCode: 'VT-TURC-7B12C4',
      createdAt: new Date().toISOString()
    }
  ];

  for (const t of tenants) {
    await db.collection('tenants').doc(t.id).set(t, { merge: true });
    console.log(`Empresa ${t.name} (${t.rif}) verificada.`);
  }

  console.log('POBLADO EXITOSO DE CLOUD FIRESTORE!');
}

seed().catch(err => {
  console.error('Error poblando Firestore:', err);
  process.exit(1);
});
