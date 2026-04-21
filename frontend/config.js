/**
 * Configuración dinámica del frontend
 * Se adapta automáticamente al servidor donde se sirve
 */

// Detectar URL del API dinámicamente basado en el servidor actual
window.API_URL = (function() {
  const h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : `http://${h}:3000/api`;
})();

// Cada veterinario tiene su propio vet_id del schema
window.USUARIOS = [
  { label: 'Dr. López (Veterinario)',   rol: 'veterinario', vet_id: 1 },
  { label: 'Dra. García (Veterinario)', rol: 'veterinario', vet_id: 2 },
  { label: 'Dr. Méndez (Veterinario)',  rol: 'veterinario', vet_id: 3 },
  { label: 'Recepción',                 rol: 'recepcion',   vet_id: null },
  { label: 'Administrador',             rol: 'admin',       vet_id: null },
];

console.log('[CONFIG] API URL:', window.API_URL);
console.log('[CONFIG] Usuarios disponibles:', window.USUARIOS.length);
