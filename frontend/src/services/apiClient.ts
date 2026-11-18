// Cliente de red defensivo para VeneTurco Fiscal OS v3.1
// Incluye timeouts automáticos con AbortController, validación de conexión offline,
// inyección de token de autorización y manejo de errores estructurado.

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
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
