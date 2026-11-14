# GEMINI.md — Contexto Maestro del Proyecto: VeneTurco Fiscal OS v3.1 (`contadora`)

Este repositorio contiene la plataforma SaaS multi-empresa **VeneTurco Fiscal OS v3.1 — SENIAT & Contabilidad Cloud**, diseñada para firmas contables y comercios en Venezuela bajo infraestructura de costo $0 inicial (Firebase Free Tier + Render Free Tier + Vercel Hobby + Bot de Telegram).

## 1. Arquitectura General del Repositorio
- `frontend/`: Aplicación Web Progresiva (PWA) en React 19 + TypeScript + Vite + Tailwind CSS con sistema visual **Anti-AI Skin Engine** (6 pieles intercambiables iniciando en `hyperframe-tactical` HUD).
- `backend/`: Servidor API blindado en Node.js + Express con `Helmet`, `CORS`, `express-rate-limit`, verificación de tokens JWT de Firebase Auth, cron job oficial de tasa BCV (`bcvSyncCron.js`), motor comercial de suscripciones SaaS (`saasBillingEngine.js`), webhook de recepción de facturas por Telegram (`telegramBot.js`) con OCR multimodal **Gemini 2.5 Flash**, y bóveda criptográfica `AES-256-GCM` + encadenamiento `SHA-256` (`cryptoVault.js`).
- `firebase/`: Reglas de seguridad de producción (`firestore.rules`, `storage.rules`) e índices compuestos (`firestore.indexes.json`).
- `docs/`: Manual de despliegue paso a paso y matriz de auditoría legal SENIAT 2026.

## 2. Reglas Fiscales Venezolanas Obligatorias (NO ALTERAR SIN VALIDACIÓN LEGAL)
1. **Providencia SNAT/2026/00093 (Gaceta Oficial 43.484)**:
   - Clasificación obligatoria por Canal de Emisión: `DIGITAL` (Imprenta Digital / Portal SENIAT), `MAQUINA_FISCAL` y `CONTINGENCIA` (Talonario físico).
   - **Art. 10.4**: Todo ticket de `MAQUINA_FISCAL` emitido sin RIF y Razón Social del comprador queda **descalificado automáticamente** para deducir Crédito Fiscal de IVA (`vatDeductible = false`).
   - **Arts. 6-7**: Toda factura emitida en `CONTINGENCIA` dispara alerta de reporte PDF obligatorio en menos de 24 horas.
   - **Art. 8**: Registro obligatorio de hora exacta (`HH:MM:SS`) y montos bimoneda (`VES` / `USD`) convertidos a la tasa oficial del BCV de la fecha de emisión.
   - **Art. 18**: Comprobantes de retención de IVA con numeración correlativa estricta de **14 dígitos** (`AAAAMMSSSSSSSS`).
2. **Providencia SNAT/2026/00099 (Gaceta Oficial 43.485)**:
   - Monitor continuo de umbrales para **Sujeto Pasivo Especial (SPE)**: `50.000 TCMV/mes` y `600.000 TCMV/año`.
3. **Código Orgánico Tributario (COT) — Inalterabilidad 10 Años**:
   - **Prohibido el borrado físico** (`allow delete: if false` en Firestore y Storage).
   - Toda factura con estado `APROBADA` es inmutable; cualquier ajuste requiere emitir una **Nota de Crédito (`03`)** o **Nota de Débito (`02`)** vinculada al documento afectado.
4. **Exportaciones Oficiales SENIAT**:
   - **Retenciones IVA**: Archivo `.txt` plano delimitado por tabulaciones (`\t`) de **16 columnas** exactas.
   - **Retenciones ISLR (Decreto 1808)**: Archivo `.xml` estructurado con código de concepto y porcentaje.
   - **Nómina LOTTT**: Cálculo semanal/quincenal/mensual con IVSS (4% empleado / 9-11% patronal), FAOV (1% / 2%), Paro Forzoso RPE (0.5% / 2%), INCES (2%), Cestaticket y provisión de Prestaciones Sociales (Art. 142 LOTTT).

## 3. Reglas de Diseño Visual (Anti-AI Skin Engine)
- **Prohibido** usar diseños genéricos de IA, tarjetas simétricas de 3 columnas o emojis decorativos en encabezados.
- Mantener la grilla Bento asimétrica de 12 columnas (`8` principales + `4` de telemetría), cruces tácticas de esquina en modo `hyperframe-tactical`, iconos `lucide-react` y tipografía `JetBrains Mono` con `tabular-nums` para todos los montos, RIFs, tasas BCV y hashes `SHA-256`.

## 4. Próximos Pasos para Continuar en Antigravity
1. Ejecutar `npm install` dentro de `frontend/` y `backend/`.
2. Configurar `frontend/.env` con las credenciales web de Firebase (`VITE_FIREBASE_*`) y `VITE_GEMINI_API_KEY` (o enrutar vía backend `/api/ocr`).
3. Configurar `backend/.env` a partir de `backend/.env.example` (`GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `AES_MASTER_KEY`).
4. Desplegar `firebase/firestore.rules` y `firebase/storage.rules` con `firebase deploy --only firestore,storage`.
