/**
 * Configuración dinámica del frontend
 * Se adapta automáticamente al servidor donde se sirve
 */

// Detectar URL del API dinámicamente basado en el servidor actual
function getApiUrl() {
  const hostname = window.location.hostname;
  const port = window.location.port;
  
  // Si estamos en localhost, usa puerto 3000 del API
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  
  // Si estamos en producción/docker, usa el mismo host en puerto 3000
  if (port) {
    return `http://${hostname}:3000/api`;
  }
  
  // Fallback: mismo host (asume que API está en la misma URL)
  return `http://${hostname}:3000/api`;
}

// URL base del API — dinámica según servidor
window.API_URL = getApiUrl();

// Mapeo de roles a vet_id
// En producción, esto podría venir del servidor vía fetch
window.VET_IDS = {
  veterinario: 1,
  recepcion: null,
  admin: null
};

// Otros valores configurables
window.APP_CONFIG = {
  cache_ttl_seconds: 300,
  environment: 'production'
};

console.log(`[CONFIG] API URL: ${window.API_URL}`);
console.log(`[CONFIG] Current hostname: ${window.location.hostname}`);
