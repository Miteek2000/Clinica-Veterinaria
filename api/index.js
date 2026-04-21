const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const cors = require('cors');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(cors());

// Pool de conexiones a PostgreSQL
const pool = new Pool({
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
});

// Cliente Redis
const redis = createClient({
    socket: { host: config.redis.host, port: config.redis.port }
});
redis.connect().then(() => console.log('[REDIS] Conectado'));

// ============================================================
// HELPER: obtener conexión con rol y vet_id de sesión
// Este helper es clave para que RLS funcione correctamente
// ============================================================
async function getConn(rol, vetId = null) {
    // Obtener credenciales desde config (variables de entorno)
    const creds = config.roles[rol] || config.roles.recepcion;
    const client = await (new Pool({
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: creds.user,
        password: creds.password,
    })).connect();

    if (vetId) {
        // SET LOCAL establece el contexto SOLO para esta transacción
        // Esto es lo que las políticas RLS leen con current_setting('app.vet_id')
        await client.query('BEGIN');
        await client.query('SET LOCAL app.vet_id = $1', [vetId]);
    }
    return client;
}

// ============================================================
// ENDPOINT: búsqueda de mascotas
// AQUÍ está el hardening contra SQL injection
// ============================================================
app.get('/api/mascotas', async (req, res) => {
    const { q, rol, vet_id } = req.query;
    const client = await getConn(rol, vet_id);
    try {
        // $1 es el parámetro parametrizado — NUNCA concatenación de strings
        // Esta es la línea que previene SQL injection (señálala en la defensa)
        const result = await client.query(
            `SELECT m.id, m.nombre, m.especie, d.nombre AS dueno
             FROM mascotas m
             JOIN duenos d ON d.id = m.dueno_id
             WHERE m.nombre ILIKE $1`,
            [`%${q || ''}%`]   // <-- parámetro, nunca: `...WHERE nombre ILIKE '%${q}%'`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('[ERROR] GET /api/mascotas:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        if (vet_id) await client.query('ROLLBACK'); // limpia el SET LOCAL
        client.release();
    }
});

// ============================================================
// ENDPOINT: vacunación pendiente CON CACHÉ REDIS
// ============================================================
app.get('/api/vacunacion-pendiente', async (req, res) => {
    const { rol, vet_id } = req.query;

    try {
        // Intento de cache HIT
        const cached = await redis.get(config.cache.keyVacunacion);
        if (cached) {
            console.log(`[CACHE HIT] vacunacion_pendiente — ${new Date().toISOString()}`);
            return res.json({ source: 'cache', data: JSON.parse(cached) });
        }

        // Cache MISS — consulta a BD
        console.log(`[CACHE MISS] vacunacion_pendiente — consultando BD`);
        const start = Date.now();
        const client = await getConn(rol, vet_id);
        try {
            const result = await client.query('SELECT * FROM v_mascotas_vacunacion_pendiente');
            const latency = Date.now() - start;
            console.log(`[BD] Consulta completada en ${latency}ms`);

            // Guardar en Redis con TTL
            await redis.setEx(config.cache.keyVacunacion, config.cache.ttl, JSON.stringify(result.rows));
            res.json({ source: 'database', latency_ms: latency, data: result.rows });
        } finally {
            if (vet_id) await client.query('ROLLBACK');
            client.release();
        }
    } catch (err) {
        console.error('[ERROR] GET /api/vacunacion-pendiente:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// ENDPOINT: aplicar vacuna (invalida el caché)
// ============================================================
app.post('/api/vacunas', async (req, res) => {
    const { mascota_id, vacuna_id, veterinario_id, rol, vet_id } = req.body;
    const client = await getConn(rol, vet_id);
    try {
        const result = await client.query(
            `INSERT INTO vacunas_aplicadas (mascota_id, vacuna_id, veterinario_id, fecha_aplicacion, costo_cobrado)
             VALUES ($1, $2, $3, CURRENT_DATE, (SELECT costo_unitario FROM inventario_vacunas WHERE id = $2))
             RETURNING id`,
            [mascota_id, vacuna_id, veterinario_id]
        );

        // INVALIDACIÓN del caché — datos cambiaron
        await redis.del(config.cache.keyVacunacion);
        console.log(`[CACHE INVALIDADO] vacunacion_pendiente por nueva vacuna`);

        res.json({ ok: true, id: result.rows[0].id });
    } catch (err) {
        console.error('[ERROR] POST /api/vacunas:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        if (vet_id) await client.query('ROLLBACK');
        client.release();
    }
});

// ============================================================
// ENDPOINT: Agendar cita (usa el procedure existente)
// ============================================================
app.post('/api/citas', async (req, res) => {
    const { mascota_id, veterinario_id, fecha_hora, motivo, rol, vet_id } = req.body;
    const client = await getConn(rol, vet_id);
    try {
        await client.query(
            'CALL sp_agendar_cita($1, $2, $3, $4, NULL)',
            [mascota_id, veterinario_id, fecha_hora, motivo]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[ERROR] POST /api/citas:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        if (vet_id) await client.query('ROLLBACK');
        client.release();
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Iniciar servidor
app.listen(config.server.port, () => {
    console.log(`[API] Escuchando en puerto ${config.server.port}`);
    console.log(`[ENV] BD: ${config.db.database}`);
});