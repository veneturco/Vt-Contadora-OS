# Dossier Legal Tributario SENIAT 2026 — Guía de Operación para el Contador
**Plataforma:** VeneTurco Fiscal OS v3.2 (Arquitectura VNDE Blindada)  
**Destinatario:** Departamento Contable, Contadores Públicos Colegiados (CPC) y Asesores Tributarios de la Empresa  
**Vigencia Fiscal:** Ejercicio 2026  

---

## 1. Resumen Ejecutivo del Marco Normativo Aplicable

El ejercicio contable y tributario en Venezuela para empresas catalogadas como **Sujetos Pasivos Especiales (SPE)** o contribuyentes ordinarios se rige por un marco normativo interconectado. Cada botón, validación y reporte de **VeneTurco Fiscal OS** fue programado para dar cumplimiento exacto a las siguientes disposiciones legales vigentes del SENIAT y el Estado venezolano:

| Jerarquía Legal | Norma / Instrumento | Gaceta Oficial | Ámbito de Aplicación en la App |
| :--- | :--- | :--- | :--- |
| **Código Marco** | **Código Orgánico Tributario (COT)** | G.O. N° 6.507 Ext. (2020) | Resguardo 10 años (Art. 54/145), Sanciones e Ilícitos (Arts. 99-115) |
| **Ley Especial** | **Ley de Impuesto al Valor Agregado (LIVA)** | G.O. N° 6.507 Ext. (2020) | Débito/Crédito Fiscal (Arts. 28-36), Alícuota 16%, Período Quincenal SPE |
| **Providencia** | **SNAT/2011/00071 (Facturación)** | G.O. N° 39.795 (2011) | 16 requisitos formales de facturas, Formas Libres, Regla Crédito Fiscal Art. 54 |
| **Providencia** | **SNAT/2018/0141 (Máquinas Fiscales)** | G.O. N° 41.518 (2018) | Transmisión de datos, Reportes Z, Tickets de caja y exigencia de RIF |
| **Providencia** | **SNAT/2015/0049 (Retenciones IVA)** | G.O. N° 40.720 (2015) | Sujetos Pasivos Especiales, Retención 75%/100%, Comprobante 14 dígitos, TXT 16 cols |
| **Decreto** | **Decreto Presidencial N° 1.808 (ISLR)** | G.O. N° 36.203 (1997) | Retenciones de ISLR (2%, 3%, 5%), Sustraendos UT, Generación XML SENIAT |
| **Ley Especial** | **Ley de Reforma del IGTF** | G.O. N° 6.687 Ext. (2022) | Alícuota 3% sobre divisas/cripto en SPE (Providencia SNAT/2022/000013) |
| **Convenio** | **Convenio Cambiario N° 1 (BCV)** | G.O. N° 6.405 Ext. (2018) | Obligatoriedad contable de conversión a Tasa Oficial BCV del día |
| **Providencia** | **SNAT/2025/000091 (Calendario SPE 2026)**| G.O. N° 43.283 (2025) | Vencimientos quincenales por terminal numérico del RIF de la empresa |

---

## 2. Detalle de Leyes y su Mapeo con VeneTurco Fiscal OS

### 1. Providencia Administrativa SNAT/2011/00071 — Emisión de Facturas y Medios de Control
* **Objetivo Legal:** Establece los requisitos que debe contener toda factura comercial emitida o recibida en el territorio nacional.
* **Artículos Críticos para el Contador:**
  * **Artículos 13 al 17:** Requisitos obligatorios: Denominación "Factura", Número de Factura, Número de Control preimpreso o digital asignado por imprenta autorizada, Fecha de emisión, RIF del emisor y receptor, descripción de bienes/servicios, desglose de base imponible, exentos y alícuota de IVA del 16%.
  * **Artículo 54 (La regla de oro del Crédito Fiscal):** Las facturas emitidas mediante **Máquinas Fiscales (tickets)** *sólo dan derecho a crédito fiscal de IVA para el comprador si el ticket contiene impreso de forma indeleble el número de RIF y la Razón Social del comprador*. Si el ticket dice "Consumidor Final" o no tiene el RIF del negocio, el IVA pagado **NO se puede descontar en la declaración quincenal**.
* **Cómo lo resuelve la aplicación:**
  * El **Semáforo Fiscal Inteligente** clasifica automáticamente:
    * 🟢 **Verde (Conforme):** Factura cumple todos los datos y RIF comprador. Da crédito fiscal 100%.
    * 🟡 **Amarillo (Alerta de Máquina Fiscal sin RIF):** La IA detectó ticket de máquina fiscal sin RIF de la empresa. El sistema alerta al contador: *"Deducible para gasto ISLR, pero NO genera Crédito Fiscal de IVA (Art. 54 Prov. 00071)"*. Evita reparos del SENIAT.
    * 🔴 **Rojo (Borrador Incompleto):** Faltan datos críticos como número de control o fecha.

---

### 2. Providencia Administrativa SNAT/2015/0049 — Régimen de Retenciones de IVA para Sujetos Pasivos Especiales
* **Objetivo Legal:** Obliga a los contribuyentes calificados como "Sujetos Pasivos Especiales" a retener el IVA a sus proveedores y enterarlo quincenalmente al Fisco Nacional.
* **Artículos Críticos:**
  * **Artículo 1 al 4:** Designación de agentes de retención.
  * **Artículo 5 (Porcentaje de Retención):**
    * **75% del IVA:** Alícuota general aplicable a proveedores formales regulares.
    * **100% del IVA:** Obligatorio cuando:
      1. El proveedor no esté inscrito en el RIF o el RIF sea inexistente/inválido según Módulo 11.
      2. Los datos de la factura no coincidan con el portal del SENIAT.
      3. La factura no cumpla con la Providencia 00071.
      4. El proveedor haya sido objeto de sanción de clausura por el SENIAT en los últimos 2 años.
  * **Artículo 16 y 18 (Comprobante de Retención de 14 dígitos):**
    * El comprobante debe emitirse obligatoriamente con una codificación de **14 dígitos numéricos**:  
      `Comprobante = AAAA + MM + SSSSSSSS`  
      * `AAAA`: Año fiscal (ej. `2026`).
      * `MM`: Mes del ejercicio (ej. `11`).
      * `SSSSSSSS`: Secuencia correlativa de 8 dígitos (ej. `00000001`).
  * **Estructura Técnica del Archivo TXT de 16 Columnas:**
    * El SENIAT exige que las retenciones se enteren mediante la subida al portal `www.seniat.gob.ve` de un archivo de texto plano delimitado por tabuladores (`\t`) con exactamente 16 campos normalizados.
* **Cómo lo resuelve la aplicación:**
  * Botón **"Generar TXT SENIAT (16 cols)"**: Compila instantáneamente el archivo en el formato exacto exigido por el portal.
  * Botón **"Comprobante PDF (14 Dígitos)"**: Genera el comprobante oficial listo para imprimir o enviar por WhatsApp/Correo al proveedor con el formato de 14 dígitos legales y tabla de desglose.
  * Algoritmo **Módulo 11 de RIF**: Valida automáticamente si el RIF del proveedor es legítimo. Si es inválido, sugiere activar la retención del **100%**.

---

### 3. Decreto Presidencial N° 1.808 — Reglamento Parcial de la Ley de ISLR en Materia de Retenciones
* **Objetivo Legal:** Dicta la obligación de practicar retenciones de Impuesto Sobre la Renta en el momento del pago o abono en cuenta por conceptos comerciales.
* **Artículos y Tarifas Críticas (Artículo 9):**
  * **Numeral 1 (Honorarios Profesionales):**
    * Personas Jurídicas Domiciliadas: **5%** sin sustraendo.
    * Personas Naturales Residentes: **3%** con sustraendo acumulado según la Unidad Tributaria.
  * **Numeral 11 (Ejecución de Obras y Prestación de Servicios Generales):**
    * Personas Jurídicas: **2%** sobre la base imponible.
    * Personas Naturales: **1%** con sustraendo.
  * **Numeral 13 (Fletes y Transporte):**
    * Personas Jurídicas: **3%** (transporte de carga) o **5%**.
  * **Comisiones Mercantiles y Arrendamientos Inmobiliarios:**
    * **5%** personas jurídicas.
* **Formato XML SENIAT:**
  * El portal fiscal no acepta texto plano para ISLR: exige un archivo `.xml` con etiquetas `<RelacionRetencionesISLR>`, `<RifAgente>`, `<Periodo>`, `<DetalleRetencion>`, `<CodigoConcepto>` (ej. 055 para honorarios, 041 publicidad, 023 contratistas).
* **Cómo lo resuelve la aplicación:**
  * Botón **"Descargar XML ISLR"**: Genera el árbol XML formateado y codificado según el esquema XML Schema del SENIAT para subir directamente a la declaración de retenciones de ISLR.

---

### 4. Ley de Reforma del IGTF (2022) y Providencia SNAT/2022/000013
* **Objetivo Legal:** Aplica un impuesto a los pagos realizados en moneda extranjera (dólares, euros, pesos) o criptoactivos distintos al Petro sin intermediación bancaria nacional (efectivo USD, Zelle, transferencias internacionales, Binance/USDT) cuando el cobrador es Sujeto Pasivo Especial.
* **Alícuota:** **3%** sobre el total facturado o pagado en divisas.
* **Cómo lo resuelve la aplicación:**
  * La **Calculadora Contable Bimoneda** calcula en tiempo real la base imponible en USD, la convierte a Bolívares a la tasa oficial del BCV del día, aplica el IVA 16% y calcula automáticamente la alícuota del **3% de IGTF Divisas**.

---

### 5. Convenio Cambiario N° 1 y Ley del Banco Central de Venezuela
* **Objetivo Legal:** Regula la libre convertibilidad y establece que todo documento fiscal expresado en moneda extranjera debe contener de forma obligatoria la tasa de cambio oficial de referencia del BCV de la fecha de emisión, y su contabilidad debe llevarse en Bolívares.
* **Riesgo:** Utilizar tasas del mercado paralelo ("Dólar Monitor" o tasas no oficiales) acarrea reparos fiscales por subvaluación de ingresos o sobrevaluación de créditos fiscales, con multas de hasta 300% del tributo omitido.
* **Cómo lo resuelve la aplicación:**
  * Oráculo Macroconómico BCV Multi-Fuente: Sincroniza dos veces al día la tasa oficial de `bcv.org.ve` / `dolarapi.com` y guarda el valor oficial histórico para cada factura emitida o recibida.

---

### 6. Código Orgánico Tributario (COT 2020) — Deberes Formales y Prescripción de 10 Años
* **Objetivo Legal:** Es la ley madre que tipifica los derechos, obligaciones, ilícitos y sanciones tributarias en Venezuela.
* **Artículos Críticos para el Contador:**
  * **Artículo 54 y Artículo 145:** Obligación de conservar todos los libros contables, facturas, comprobantes de retención y soportes magnéticos o digitales por un lapso mínimo de **diez (10) años**.
    * *¿Por qué 10 años?* Para Sujetos Pasivos Especiales y en materia de retenciones, el plazo de prescripción de las facultades de fiscalización del SENIAT se extiende a 10 años.
  * **Artículo 101 y 102 (Ilícitos Formales relativos a la emisión de facturas y libros):**
    * No emitir facturas conformes a la ley, no llevar libros de compras y ventas, o llevarlos con un atraso superior a un mes calendario acarrea **multa pecuniaria anclada a la moneda de mayor valor del BCV (Euros) + CLAUSURA INMEDIATA DE 5 A 10 DÍAS CONTINUOS del establecimiento comercial**.
  * **Artículo 115 (Apropiación Indebida de Retenciones):**
    * Retener IVA o ISLR a un proveedor y no enterarlo al SENIAT dentro de los plazos del calendario legal se considera retención indebida, tipificada como delito penal tributario sancionado con penas privativas de libertad de 4 a 6 años.
* **Cómo lo resuelve la aplicación:**
  * **Reglas Firestore `allow delete: if false`:** No permite que ningún usuario borre físicamente facturas o comprobantes históricos, garantizando el cumplimiento de los 10 años de auditoría digital inmutable del COT.
  * **Libro de Compras y Ventas al Día:** Exportación automática a Excel/PDF de los libros foliados conforme al Art. 75 del Reglamento de IVA para evitar cierres de 10 días.

---

### 7. Calendario de Sujetos Pasivos Especiales (SPE 2026)
* **Objetivo Legal:** El SENIAT publica anualmente una providencia administrativa (ej. SNAT/2025/000091) con las fechas límite fatales para presentar:
  1. Declaración y pago del IVA (1ra y 2da quincena).
  2. Enteramiento de Retenciones de IVA (Quincenal).
  3. Enteramiento de Retenciones de ISLR.
  4. Declaración de IGTF.
* **Regla del Terminal de RIF:** Los vencimientos se asignan según el último dígito numérico del RIF del contribuyente (0 al 9).
* **Cómo lo resuelve la aplicación:**
  * **Banner Inteligente de Vencimiento SENIAT:** Lee el último dígito del RIF de la empresa configurado (ej. RIF `J-41298765-4` -> Terminal `4`) y muestra en tiempo real cuántos días y horas quedan para el cierre de la quincena.

---

## 3. Matriz Rápida para el Contador: "Botón en la App vs. Artículo de Ley"

| Elemento en Pantalla de VeneTurco Fiscal OS | Función Operativa | Base Legal que lo Exige |
| :--- | :--- | :--- |
| **Semáforo Verde 🟢** | Factura aprobada con crédito fiscal íntegro | Art. 33 Ley de IVA; Art. 13 Providencia 00071 |
| **Semáforo Amarillo 🟡** | Alerta: Ticket fiscal sin RIF (Gasto ISLR, no IVA) | Art. 54 Providencia 00071; Art. 33 Numeral 1 LIVA |
| **Botón "Generar TXT SENIAT"** | Archivo plano 16 columnas para portal fiscal | Art. 16 Providencia SNAT/2015/0049 |
| **Botón "Descargar XML ISLR"** | Archivo estructurado de retenciones de renta | Decreto Presidencial N° 1.808 (Reglamento ISLR) |
| **Botón "Comprobante PDF"** | Voucher con formato de 14 dígitos `AAAAMMSSSSSSSS` | Art. 18 Providencia SNAT/2015/0049 |
| **Calculadora IGTF (3%)** | Desglose en Bolívares y Divisas | Ley IGTF 2022; Providencia SNAT/2022/000013 |
| **Tasa BCV del Día** | Conversión obligatoria para registros contables | Convenio Cambiario N° 1 (BCV); Art. 126 COT |
| **Banner de Vencimiento RIF** | Alerta de fecha límite quincenal según terminal | Providencia Calendario SPE 2026 (SNAT/2025/000091) |
| **Bóveda Inmutable (Sin Borrado)** | Resguardo de comprobantes por 10 años | Art. 54 y 145 Código Orgánico Tributario (COT 2020) |
