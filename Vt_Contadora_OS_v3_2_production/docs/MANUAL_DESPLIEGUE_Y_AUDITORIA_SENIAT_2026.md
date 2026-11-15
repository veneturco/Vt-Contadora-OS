# VeneTurco Fiscal OS v3.1 — Manual de Despliegue ($0 Infraestructura) y Auditoría SENIAT 2026

## 1. Arquitectura Blindada Incluida en este Paquete
- `firebase/firestore.rules`: Aislamiento Multi-Tenant estricto por `tenantId` (RIF), bloqueo absoluto de borrado físico (`allow delete: if false`) por exigencia de resguardo de 10 años del Código Orgánico Tributario, inmutabilidad de facturas aprobadas y verificación automática de suscripción activa (`isTenantLicenseActive`).
- `firebase/storage.rules`: Bóveda privada cifrada para imágenes y PDFs de facturas hasta 12 MB sin opción de sobrescritura ni borrado.
- `backend/services/bcvSyncCron.js`: Robot automático de sincronización de tasa oficial USD/EUR del BCV (09:05 AM y 01:15 PM hora de Caracas) con hash de integridad.
- `backend/services/saasBillingEngine.js`: Motor comercial de licencias SaaS (Comercio Pro $29.99, Empresa Max $79.99, Firma Contable $139.99) con conversión a tasa BCV, registro de Pago Móvil / Zelle / Binance y suspensión automática por mora.
- `backend/services/telegramBot.js`: Webhook de recepción cero-fricción por Telegram (`/vincular CODIGO`) con extracción multimodal Gemini Vision OCR y bloqueo de duplicados.
- `backend/services/seniatEngine.js`: Validador Módulo 11 de RIF venezolano, generador de comprobantes de retención de 14 dígitos (`AAAAMMSSSSSSSS`), archivo plano `.txt` de 16 columnas para Retenciones IVA y archivo `.xml` Decreto 1808 para Retenciones ISLR.

## 2. Pasos de Despliegue en la Nube (Costo $0 Inicial)
1. **Firebase (Google Cloud)**: Crea el proyecto en `console.firebase.google.com`, habilita Authentication, Firestore y Storage, y publica `firebase/firestore.rules` y `firebase/storage.rules`.
2. **Telegram Bot**: Crea el bot con `@BotFather`, obtén el token y registra tu webhook en `https://tu-servidor.onrender.com/webhooks/telegram`.
3. **Render (Backend Node.js Free Tier)**: Sube la carpeta `backend/` a GitHub, créala como Web Service en Render y carga las variables de `backend/.env.example`.
4. **Vercel (Frontend PWA Free Tier)**: Despliega el frontend conectado a tu dominio (`app.veneturco.com`).
