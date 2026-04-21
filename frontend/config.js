/**
 * Configuración dinámica del frontend
 * Carga variables desde variables de entorno o usa valores por defecto
 */

// URL base del API
window.API_URL = process.env.REACT_APP_API_URL || 
                 process.env.VUE_APP_API_URL ||
                 (window.location.hostname === 'localhost' 
                   ? 'http://localhost:3000/api' 
                   : `http://${window.location.hostname}:3000/api`);

// Mapeo de roles a vet_id
// En producción real, esto vendría del backend después del login
window.VET_IDS = process.env.REACT_APP_VET_IDS || {
  veterinario: 1,
  recepcion: null,
  admin: null
};

// Otros valores configurables
window.APP_CONFIG = {
  cache_ttl_seconds: process.env.REACT_APP_CACHE_TTL || 300,
  environment: process.env.NODE_ENV || 'development'
};

console.log(`[CONFIG] API URL: ${window.API_URL}`);
console.log(`[CONFIG] Environment: ${window.APP_CONFIG.environment}`);
