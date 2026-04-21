window.API_URL = (function() {
  const h = window.location.hostname;
  const apiPort = window.API_PORT || '3000';
  return (h === 'localhost' || h === '127.0.0.1')
    ? `http://localhost:${apiPort}/api`
    : `http://${h}:${apiPort}/api`;
})();


window.USUARIOS = [
  { label: 'Dr. López (Veterinario)',   rol: 'veterinario', vet_id: 1 },
  { label: 'Dra. García (Veterinario)', rol: 'veterinario', vet_id: 2 },
  { label: 'Dr. Méndez (Veterinario)',  rol: 'veterinario', vet_id: 3 },
  { label: 'Recepción',                 rol: 'recepcion',   vet_id: null },
  { label: 'Administrador',             rol: 'admin',       vet_id: null },
];

console.log('[CONFIG] API URL:', window.API_URL);
console.log('[CONFIG] Usuarios disponibles:', window.USUARIOS.length);
