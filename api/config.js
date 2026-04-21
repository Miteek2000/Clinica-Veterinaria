/**
 * Configuración centralizada del API
 * Todas las variables se leen desde .env
 */

require('dotenv').config();

const config = {
  // PostgreSQL
  db: {
    host: process.env.DB_HOST || 'db',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },

  // Servidor
  server: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
  },

  // Caché
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '300'), // segundos
    keyVacunacion: process.env.CACHE_KEY_VACUNACION || 'vacunacion:pendiente',
  },

  // Mapeo de roles a credenciales de BD
  // En producción real, usarías JWT + sesiones
  // Estos usuarios deben existir en la BD con sus roles asignados
  roles: {
    veterinario: {
      user: process.env.DB_USER_VETERINARIO || 'dr_lopez',
      password: process.env.DB_PASS_VETERINARIO || 'lopez123',
    },
    recepcion: {
      user: process.env.DB_USER_RECEPCION || 'recepcion1',
      password: process.env.DB_PASS_RECEPCION || 'recep123',
    },
    admin: {
      user: process.env.DB_USER_ADMIN || 'admin_vet',
      password: process.env.DB_PASS_ADMIN || 'admin123',
    },
  },
};

// Validación de variables críticas
const requiredVars = [
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD'
];

const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`[ERROR] Variables de entorno faltantes: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`[CONFIG] Ambiente: ${config.server.env}`);
console.log(`[CONFIG] Puerto: ${config.server.port}`);
console.log(`[CONFIG] BD: ${config.db.host}:${config.db.port}/${config.db.database}`);
console.log(`[CONFIG] Redis: ${config.redis.host}:${config.redis.port}`);
console.log(`[CONFIG] Cache TTL: ${config.cache.ttl}s`);

module.exports = config;
