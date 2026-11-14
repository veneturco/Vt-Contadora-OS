# VeneTurco Fiscal OS v3.1 🇻🇪 🇹🇷

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)
![SENIAT 2026 Ready](https://img.shields.io/badge/SENIAT-SNAT%2F2026%2F00093-amber?style=flat-square)
![React 19](https://img.shields.io/badge/React-19-blue?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square)
![Node Express](https://img.shields.io/badge/Backend-Express%20Node.js-green?style=flat-square)
![License](https://img.shields.io/badge/License-Proprietary%20SaaS-purple?style=flat-square)

Plataforma empresarial de contabilidad fiscal multi-empresa bimoneda (USD/VES) diseñada para el cumplimiento estricto de las Providencias Administrativas del SENIAT **SNAT/2026/00093** (G.O. 43.484) y **SNAT/2026/00099** (G.O. 43.485), Ley Orgánica del Trabajo (LOTTT Art. 142) y Código Orgánico Tributario (COT - Inmutabilidad 10 Años).

---

## ⚡ Módulos Integrados

1. **01. Centro de Mando:** Bento Grid 8+4, métricas fiscales bimoneda, inspector oficial Módulo 11 en vivo y calendario SPE por terminal de RIF.
2. **02. Escáner IA & Telegram:** Extracción multicanal (`DIGITAL`, `MAQUINA_FISCAL`, `CONTINGENCIA`) con Gemini 2.5 Flash Vision, regla de no-deducibilidad Art. 10.4 y bot receptor Telegram.
3. **03. Libros SENIAT & TXT/XML:** Libro de Compras con totales calculados (`<tfoot>`), emisión de Comprobantes de Retención de 14 Dígitos (`AAAAMMSSSSSSSS`), exportación TXT de 16 columnas tabuladas y XML ISLR Decreto 1808.
4. **04. Nómina LOTTT & Recibos:** Salario integral, parafiscales (IVSS 4%/9-11%, FAOV 1%/2%, RPE 0.5%/2%, INCES 2%), provisión mensual de prestaciones Art. 142 y recibos individuales imprimibles.
5. **05. Licencias SaaS:** Tarifario en USD con cobro en Bolívares a tasa oficial BCV y corte automático por morosidad.
6. **06. Portal Móvil 9:16:** Interfaz de autoservicio para contribuyentes y envío rápido de facturas.
7. **07. Bóveda SHA-256 & Cifrado AES-256-GCM:** Encadenamiento criptográfico COT de 10 años para inmutabilidad de registros contables.

---

## 🏗️ Estructura del Repositorio

```text
├── api/
│   └── index.js                 # Serverless Function Entrypoint para Vercel
├── backend/
│   ├── security/
│   │   └── cryptoVault.js       # Cifrado AES-256-GCM y hashing SHA-256
│   ├── services/
│   │   ├── bcvSyncCron.js       # Oráculo BCV con anti-ban, cooldown y jitter
│   │   ├── saasBillingEngine.js # Suscripciones y morosidad
│   │   ├── seniatEngine.js      # Módulo 11, 16-col TXT, XML 1808 y LOTTT
│   │   └── telegramBot.js       # Bot con control de cuotas y retry_after
│   ├── tests/
│   │   └── seniat.test.js       # Batería de pruebas automatizadas (7/7 tests)
│   └── server.js                # Servidor Express con IDOR protection y rate limits
├── frontend/
│   ├── public/                  # Favicon y PWA manifest.json
│   ├── src/
│   │   ├── services/
│   │   │   └── apiClient.ts     # Cliente HTTP con AbortController y timeouts
│   │   ├── styles/
│   │   │   └── adaptive-skin-engine.css # Motor de 9 skins fintech 2026
│   │   ├── utils/
│   │   │   ├── seniatEngine.ts  # Motores de cálculo, comprobantes y validaciones
│   │   │   └── storage.ts       # Almacenamiento local defensivo anti-quota crash
│   │   ├── App.tsx              # Aplicación SPA con Command Palette Ctrl+K
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── firebase/
│   ├── firestore.rules          # Reglas de seguridad inmutables COT 10 años
│   ├── storage.rules
│   └── firestore.indexes.json
├── package.json                 # Orquestador raíz para Vercel
├── vercel.json                  # Configuración de build, serverless rewrites y crons
├── .gitignore
├── .env.example
└── README.md
```

---

## 🚀 Despliegue en Vercel

### Paso 1: Conectar Repositorio en Vercel
1. Sube este repositorio a tu cuenta de **GitHub**.
2. Ingresa a [vercel.com](https://vercel.com/) y haz clic en **Add New... > Project**.
3. Selecciona tu repositorio de GitHub.
4. Vercel detectará automáticamente la configuración gracias a [`vercel.json`](./vercel.json).

### Paso 2: Configurar Variables de Entorno en Vercel
En la sección **Settings > Environment Variables** de tu proyecto en Vercel, agrega:

| Variable | Tipo | Descripción |
| :--- | :---: | :--- |
| `NODE_ENV` | Backend | `production` |
| `ALLOWED_ORIGIN` | Backend | URL de tu despliegue (ej. `https://mi-empresa.vercel.app`) |
| `AES_MASTER_KEY` | Backend | 64 caracteres hex (`openssl rand -hex 32`) |
| `GEMINI_API_KEY` | Backend | Clave de Google AI Studio |
| `TELEGRAM_BOT_TOKEN` | Backend | Token de BotFather para Telegram Bot |
| `TELEGRAM_WEBHOOK_SECRET` | Backend | Clave secreta anti-spoofing para webhooks |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Backend | JSON en una línea de las credenciales de Firebase Admin |
| `VITE_FIREBASE_API_KEY` | Frontend | Clave pública de Firebase Web SDK |
| `VITE_FIREBASE_AUTH_DOMAIN` | Frontend | Dominio de Firebase Auth |
| `VITE_FIREBASE_PROJECT_ID` | Frontend | ID del proyecto en Firebase |

### Paso 3: Desplegar
Haz clic en **Deploy**. Vercel compilará el frontend con Vite y empaquetará el backend como Serverless Function accesible en `/api/*` y `/webhooks/*`.

---

## 💻 Ejecución Local

```bash
# 1. Clonar repositorio
git clone <URL_DE_TU_REPOSITORIO>
cd VeneTurco_Fiscal_OS

# 2. Instalar dependencias
npm install --prefix backend
npm install --prefix frontend

# 3. Correr pruebas unitarias (7/7)
npm run test

# 4. Iniciar servidores en modo desarrollo
npm run dev:backend   # Express en http://localhost:8080
npm run dev:frontend  # Vite en http://localhost:5173
```

---

## 🛡️ Licencia y Normas Tributarias
Desarrollado bajo los estándares tributarios de la República Bolivariana de Venezuela: Providencias Administrativas SENIAT SNAT/2026/00093 y SNAT/2026/00099. Propiedad comercial reservada.
