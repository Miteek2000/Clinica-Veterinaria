const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const cors = require('cors');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(cors());

// ============================================================
// POOLS — uno por usuario de BD, creados UNA sola vez al arrancar
// ============================================================
const pools = {};

// Recepción y admin
for (const [rol, creds] of Object.entries(config.roles)) {
    if (rol === 'recepcion' || rol === 'admin') {
        pools[rol] = new Pool({
            host: config.db.host,
            port: config.db.port,
            database: config.db.database,
            user: creds.user,
            password: creds.password,
        });
        console.log(`[POOL] "${rol}" → ${creds.user}`);
    }
}

// Un pool por cada veterinario individual
for (const [vetId, creds] of Object.entries(config.vetUsers)) {
    pools[`vet_${vetId}`] = new Pool({
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: creds.user,
        password: creds.password,
    });
    console.log(`[POOL] "vet_${vetId}" → ${creds.user}`);
}

// ============================================================
// HELPERS DE CONEXIÓN
// ============================================================
async function getConn(rol, vetId = null) {
    let pool;
    const vetKey = `vet_${vetId}`;

    if (rol === 'veterinario' && vetId && pools[vetKey]) {
        pool = pools[vetKey];
        console.log(`[CONN] Conectando como ${config.vetUsers[vetId]?.user} (vet_id=${vetId})`);
    } else {
        pool = pools[rol] || pools.recepcion;
        console.log(`[CONN] Conectando como rol "${rol}"`);
    }

    const client = await pool.connect();

    // SET LOCAL requiere una transacción activa
    if (vetId && rol === 'veterinario') {
        await client.query('BEGIN');
        await client.query('SELECT set_config($1, $2, true)', ['app.vet_id', String(vetId)]);
        console.log(`[CONN] SET LOCAL app.vet_id = ${vetId}`);
    }

    return client;
}

async function releaseConn(client, hasTransaction, success) {
    try {
        if (hasTransaction) {
            await client.query(success ? 'COMMIT' : 'ROLLBACK');
        }
    } finally {
        client.release();
    }
}

// ============================================================
// REDIS
// ============================================================
const redis = createClient({
    socket: { host: config.redis.host, port: config.redis.port }
});
redis.on('error', err => console.error('[REDIS] Error:', err.message));
redis.connect().then(() => console.log('[REDIS] Conectado'));

// ============================================================
// GET /api/mascotas  — búsqueda con hardening SQL injection
// La línea de defensa es: client.query(sql, [$1])
// Archivo: api/index.js  — ver comentario inline abajo
// ============================================================
app.get('/api/mascotas', async (req, res) => {
    const { q, rol, vet_id } = req.query;

    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }

    const hasTransaction = !!(vetIdNum && rol === 'veterinario');
    const client = await getConn(rol, vetIdNum);
    let ok = false;
    try {
        // HARDENING: $1 es parámetro separado — el driver pg nunca lo interpola
        // en el SQL string. Esto previene todos los ataques de SQL injection.
        // Línea de defensa señalable en defensa oral: la siguiente línea.
        const result = await client.query(
            `SELECT m.id, m.nombre, m.especie, d.nombre AS dueno
             FROM mascotas m
             JOIN duenos d ON d.id = m.dueno_id
             WHERE m.nombre ILIKE $1`,
            [`%${q || ''}%`]
        );
        ok = true;
        res.json(result.rows);
    } catch (err) {
        console.error('[ERROR] GET /api/mascotas:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        await releaseConn(client, hasTransaction, ok);
    }
});

// ============================================================
// GET /api/vacunacion-pendiente — con caché Redis (filtrado por vet_id)
// ============================================================
app.get('/api/vacunacion-pendiente', async (req, res) => {
    const { rol, vet_id } = req.query;

    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }

    try {
        // Generar clave de caché diferenciada por rol y vet_id
        let cacheKey = config.cache.keyVacunacion;
        if (rol === 'veterinario' && vetIdNum) {
            cacheKey = `${config.cache.keyVacunacion}:vet_${vetIdNum}`;
        } else if (rol === 'admin') {
            cacheKey = `${config.cache.keyVacunacion}:admin`;
        } else if (rol === 'recepcion') {
            cacheKey = `${config.cache.keyVacunacion}:recepcion`;
        }

        // Intentar cache HIT primero
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`[CACHE HIT] vacunacion_pendiente (${cacheKey}) — ${new Date().toISOString()}`);
            return res.json({ source: 'cache', data: JSON.parse(cached) });
        }

        // Cache MISS — ir a BD
        console.log(`[CACHE MISS] vacunacion_pendiente (${cacheKey}) — consultando BD`);
        const start = Date.now();
        const hasTransaction = !!(vetIdNum && rol === 'veterinario');
        const client = await getConn(rol, vetIdNum);
        let ok = false;
        try {
            const result = await client.query(
                'SELECT * FROM v_mascotas_vacunacion_pendiente'
            );
            const latency = Date.now() - start;
            console.log(`[BD] Consulta en ${latency}ms — ${result.rows.length} filas (clave: ${cacheKey})`);

            await redis.setEx(cacheKey, config.cache.ttl, JSON.stringify(result.rows));
            ok = true;
            res.json({ source: 'database', latency_ms: latency, data: result.rows });
        } finally {
            await releaseConn(client, hasTransaction, ok);
        }
    } catch (err) {
        console.error('[ERROR] GET /api/vacunacion-pendiente:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// POST /api/vacunas — aplica vacuna e invalida caché
// ============================================================
app.post('/api/vacunas', async (req, res) => {
    const { mascota_id, vacuna_id, veterinario_id, rol, vet_id } = req.body;

    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }

    const hasTransaction = !!(vetIdNum && rol === 'veterinario');
    const client = await getConn(rol, vetIdNum);
    let ok = false;
    try {
        const result = await client.query(
            `INSERT INTO vacunas_aplicadas
                (mascota_id, vacuna_id, veterinario_id, fecha_aplicacion, costo_cobrado)
             VALUES ($1, $2, $3, CURRENT_DATE,
                    (SELECT costo_unitario FROM inventario_vacunas WHERE id = $2))
             RETURNING id`,
            [mascota_id, vacuna_id, veterinario_id]
        );

        // Invalidar caché: los datos cambiaron
        await redis.del(config.cache.keyVacunacion);
        console.log(`[CACHE INVALIDADO] vacunacion_pendiente — nueva vacuna aplicada`);

        ok = true;
        res.json({ ok: true, id: result.rows[0].id });
    } catch (err) {
        console.error('[ERROR] POST /api/vacunas:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        await releaseConn(client, hasTransaction, ok);
    }
});

// ============================================================
// POST /api/citas — agenda cita usando el procedure
// ============================================================
app.post('/api/citas', async (req, res) => {
    const { mascota_id, veterinario_id, fecha_hora, motivo, rol, vet_id } = req.body;

    // Validaciones
    const mascotaIdNum = mascota_id ? parseInt(mascota_id) : null;
    if (!mascotaIdNum || isNaN(mascotaIdNum) || mascotaIdNum < 1) {
        return res.status(400).json({ error: 'mascota_id inválido (debe ser > 0)' });
    }

    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }

    const vetIdCita = veterinario_id ? parseInt(veterinario_id) : null;
    if (!vetIdCita || isNaN(vetIdCita) || vetIdCita < 1) {
        return res.status(400).json({ error: 'veterinario_id inválido (debe ser > 0)' });
    }

    if (!fecha_hora || fecha_hora.trim() === '') {
        return res.status(400).json({ error: 'fecha_hora es requerida' });
    }

    const hasTransaction = !!(vetIdNum && rol === 'veterinario');
    const client = await getConn(rol, vetIdNum);
    let ok = false;
    try {
        await client.query(
            'CALL sp_agendar_cita($1, $2, $3, $4, NULL)',
            [mascotaIdNum, vetIdCita, fecha_hora, motivo]
        );
        ok = true;
        res.json({ ok: true });
    } catch (err) {
        console.error('[ERROR] POST /api/citas:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        await releaseConn(client, hasTransaction, ok);
    }
});

// ============================================================
// GET /health
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// GET /api/historial — registro de auditoría
// ============================================================
app.get('/api/historial', async (req, res) => {
    const { rol, vet_id } = req.query;

    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }

    const hasTransaction = !!(vetIdNum && rol === 'veterinario');
    const client = await getConn(rol, vetIdNum);
    let ok = false;
    try {
        const result = await client.query(
            `SELECT id, tipo, referencia_id, descripcion, fecha 
             FROM historial_movimientos 
             ORDER BY fecha DESC LIMIT 100`
        );
        ok = true;
        res.json(result.rows);
    } catch (err) {
        console.error('[ERROR] GET /api/historial:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        await releaseConn(client, hasTransaction, ok);
    }
});

// ============================================================
// ARRANQUE
// ============================================================
app.listen(config.server.port, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log(`║  API lista en http://localhost:${config.server.port}/api  ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
});