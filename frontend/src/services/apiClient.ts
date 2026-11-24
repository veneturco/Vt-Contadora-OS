// Cliente de red defensivo para VeneTurco Fiscal OS v3.4
// Incluye timeouts automáticos con AbortController, validación de conexión offline,
// inyección de token de autorización, cola offline de alertas y reporte automático de errores >= 500.

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export interface TelemetryErrorPayload {
  severity?: 'CRITICAL' | 'WARNING' | 'INFO';
  source?: string;
  category?: string;
  message: string;
  stack?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  tenantId?: string;
  userEmail?: string;
}

const PENDING_TELEMETRY_KEY = 'vt_pending_telemetry_v1';
let lastTelemetryAt = 0;

function queueOfflineTelemetry(payload: TelemetryErrorPayload) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(PENDING_TELEMETRY_KEY);
    const list: TelemetryErrorPayload[] = raw ? JSON.parse(raw) : [];
    list.push(payload);
    window.localStorage.setItem(PENDING_TELEMETRY_KEY, JSON.stringify(list.slice(-15)));
  } catch {
    // ignore storage quota
  }
}

export async function flushPendingErrorTelemetry(): Promise<void> {
  try {
    if (typeof window === 'undefined' || !navigator.onLine || !window.localStorage) return;
    const raw = window.localStorage.getItem(PENDING_TELEMETRY_KEY);
    if (!raw) return;
    const list: TelemetryErrorPayload[] = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return;
    window.localStorage.removeItem(PENDING_TELEMETRY_KEY);
    const storedToken = window.localStorage.getItem('vt_auth_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (storedToken) headers.Authorization = `Bearer ${storedToken}`;
    for (const item of list.slice(-10)) {
      await fetch('/api/guardian/telemetry', {
        method: 'POST',
        headers,
        body: JSON.stringify(item)
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function reportClientErrorTelemetry(payload: TelemetryErrorPayload): void {
  try {
    if (typeof window === 'undefined' || !payload?.message) return;
    const now = Date.now();
    if (now - lastTelemetryAt < 2500 && payload.severity !== 'CRITICAL') return;
    lastTelemetryAt = now;

    let userEmail = payload.userEmail;
    if (!userEmail) {
      try {
        const storedUser = JSON.parse(window.localStorage.getItem('vt_auth_user') || 'null');
        if (storedUser?.email) userEmail = storedUser.email;
      } catch {
        // ignore
      }
    }

    const enriched: TelemetryErrorPayload = {
      severity: payload.severity || 'WARNING',
      source: payload.source || 'frontend',
      category: payload.category || 'FRONTEND_RUNTIME',
      message: String(payload.message).slice(0, 400),
      stack: payload.stack ? String(payload.stack).slice(0, 1200) : undefined,
      route: payload.route || window.location.hash || window.location.pathname || '#/',
      method: payload.method,
      statusCode: payload.statusCode,
      tenantId: payload.tenantId,
      userEmail
    };

    if (!navigator.onLine) {
      queueOfflineTelemetry(enriched);
      return;
    }

    const storedToken = window.localStorage.getItem('vt_auth_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (storedToken) headers.Authorization = `Bearer ${storedToken}`;

    fetch('/api/guardian/telemetry', {
      method: 'POST',
      headers,
      body: JSON.stringify(enriched)
    }).catch(() => {
      queueOfflineTelemetry(enriched);
    });
  } catch {
    // never throw inside error reporter
  }
}

export async function safeApiRequest<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<ApiResponse<T>> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Sin conexión a internet. Verifique su conectividad de red.'
    };
  }

  const { timeoutMs = 12000, headers = {}, ...restOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const finalHeaders = new Headers(headers);
    if (!finalHeaders.has('Authorization')) {
      const storedToken =
        typeof window !== 'undefined' ? window.localStorage.getItem('vt_auth_token') : null;
      if (storedToken) {
        finalHeaders.set('Authorization', `Bearer ${storedToken}`);
      } else if (import.meta.env.DEV) {
        finalHeaders.set('Authorization', 'Bearer DEV_LOCAL_BYPASS');
      }
    }
    if (!finalHeaders.has('Content-Type') && restOptions.method && restOptions.method !== 'GET') {
      finalHeaders.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...restOptions,
      headers: finalHeaders,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `Error HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson && errorJson.error) {
          errorMsg = errorJson.error;
        }
      } catch (_parseErr) {
        // Usa el mensaje HTTP por defecto si el cuerpo no es JSON
      }
      if (response.status >= 500 && !url.includes('/api/guardian/telemetry')) {
        reportClientErrorTelemetry({
          severity: 'CRITICAL',
          source: 'api_client',
          category: 'API_HTTP_5XX',
          message: `${restOptions.method || 'GET'} ${url} -> HTTP ${response.status}: ${errorMsg}`,
          route: url,
          method: restOptions.method || 'GET',
          statusCode: response.status
        });
      }
      return { ok: false, status: response.status, data: null, error: errorMsg };
    }

    // Procesa respuesta JSON de forma segura
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as T;
      return { ok: true, status: response.status, data, error: null };
    }

    const text = (await response.text()) as unknown as T;
    return { ok: true, status: response.status, data: text, error: null };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          data: null,
          error: `Tiempo de espera agotado (${Math.round(timeoutMs / 1000)}s) al consultar el servidor.`
        };
      }
      return { ok: false, status: 0, data: null, error: err.message };
    }
    return { ok: false, status: 0, data: null, error: 'Fallo desconocido de red.' };
  }
}
