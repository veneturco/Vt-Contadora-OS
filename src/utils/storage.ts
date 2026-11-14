// Utilidad de almacenamiento local seguro con protección contra QuotaExceededError,
// navegación privada restrictiva y deserialización segura de esquemas de datos.

export function safeGetStorage<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultValue;
    }
    const item = window.localStorage.getItem(key);
    if (!item) return defaultValue;
    return JSON.parse(item) as T;
  } catch (err) {
    console.warn(`[SafeStorage] Error leyendo clave "${key}", aplicando fallback seguro:`, err);
    return defaultValue;
  }
}

export function safeSetStorage<T>(key: string, value: T): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[SafeStorage] No se pudo guardar clave "${key}" (almacenamiento lleno o deshabilitado):`, err);
    return false;
  }
}
