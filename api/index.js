const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const cors = require('cors');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(cors());

// POOLS FIJOS — se crean una sola vez al arrancar
const pools = {};

// Pools para roles fijos (recepción y admin)
for (const [rol, creds] of Object.entries(config.roles)) {
    if (rol === 'recepcion' || rol === 'admin') {
        pools[rol] = new Pool({
            host: config.db.host,
            port: config.db.port,
            database: config.db.database,
            user: creds.user,
            password: creds.password,
        });
    }
}

// POOLS FIJOS — se crean una sola vez al arrancar
const pools = {};

console.log('[INIT] Creando pools...');
console.log('[CONFIG] config.roles:', Object.keys(config.roles));
console.log('[CONFIG] config.vetUsers:', Object.keys(config.vetUsers || {}));

// Pools para roles fijos (recepción y admin)
for (const [rol, creds] of Object.entries(config.roles)) {
    if (rol === 'recepcion' || rol === 'admin') {
        pools[rol] = new Pool({
            host: config.db.host,
            port: config.db.port,
            database: config.db.database,
            user: creds.user,
            password: creds.password,
        });
        console.log(`[POOL] Creado pool "${rol}" para usuario ${creds.user}`);
    }
}

// Pools para cada veterinario individual
if (config.vetUsers) {
    for (const [vetId, creds] of Object.entries(config.vetUsers)) {
        pools[`vet_${vetId}`] = new Pool({
            host: config.db.host,
            port: config.db.port,
            database: config.db.database,
            user: creds.user,
            password: creds.password,
        });
        console.log(`[POOL] Creado pool "vet_${vetId}" para usuario ${creds.user}`);
    }
} else {
    console.warn('[POOL] config.vetUsers no definido!');
}

async function getConn(rol, vetId = null) {
    let pool;
    if (rol === 'veterinario' && vetId && config.vetUsers && config.vetUsers[String(vetId)]) {
        // Conectar como el veterinario específico
        pool = pools[`vet_${vetId}`];
        console.log(`[POOL] Conectando con vet_${vetId}`);
    } else {
        pool = pools[rol] || pools.recepcion;
        console.log(`[POOL] Conectando con rol "${rol}"`);
    }

    const client = await pool.connect();

    if (vetId && rol === 'veterinario') {
        await client.query('BEGIN');
        await client.query('SET LOCAL app.vet_id = $1', [String(vetId)]);
        console.log(`[QUERY] SET LOCAL app.vet_id=${vetId}`);
    }
    return client;
}

// Helper para liberar correctamente
// Nota: solo veterinario hace BEGIN, así que solo esos necesitan COMMIT/ROLLBACK
async function releaseConn(client, vetId, commit = true) {
    try {
        if (vetId) {
            // Si hubo transacción (veterinario), cerrarla
            await client.query(commit ? 'COMMIT' : 'ROLLBACK');
        }
    } finally {
        client.release();
    }
}
// Cliente Redis
const redis = createClient({
    socket: { host: config.redis.host, port: config.redis.port }
});
redis.connect().then(() => console.log('[REDIS] Conectado'));



// ============================================================
// ENDPOINT: búsqueda de mascotas
// AQUÍ está el hardening contra SQL injection
// ============================================================
app.get('/api/mascotas', async (req, res) => {
    const { q, rol, vet_id } = req.query;
    
    // Validar vet_id
    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }
    
    const client = await getConn(rol, vetIdNum);
    let ok = false;
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
        ok = true;
        res.json(result.rows);
    } catch (err) {
        console.error('[ERROR] GET /api/mascotas:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        await releaseConn(client, vetIdNum, ok);
    }
});

// ============================================================
// ENDPOINT: vacunación pendiente CON CACHÉ REDIS
// ============================================================
app.get('/api/vacunacion-pendiente', async (req, res) => {
    const { rol, vet_id } = req.query;

    // Validar vet_id
    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }

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
        const client = await getConn(rol, vetIdNum);
        let ok = false;
        try {
            const result = await client.query('SELECT * FROM v_mascotas_vacunacion_pendiente');
            const latency = Date.now() - start;
            console.log(`[BD] Consulta completada en ${latency}ms`);

            // Guardar en Redis con TTL
            await redis.setEx(config.cache.keyVacunacion, config.cache.ttl, JSON.stringify(result.rows));
            ok = true;
            res.json({ source: 'database', latency_ms: latency, data: result.rows });
        } finally {
            await releaseConn(client, vetIdNum, ok);
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
    
    // Validar vet_id
    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }
    
    const client = await getConn(rol, vetIdNum);
    let ok = false;
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

        ok = true;
        res.json({ ok: true, id: result.rows[0].id });
    } catch (err) {
        console.error('[ERROR] POST /api/vacunas:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        await releaseConn(client, vetIdNum, ok);
    }
});

// ============================================================
// ENDPOINT: Agendar cita (usa el procedure existente)
// ============================================================
app.post('/api/citas', async (req, res) => {
    const { mascota_id, veterinario_id, fecha_hora, motivo, rol, vet_id } = req.body;
    
    // Validar vet_id
    const vetIdNum = vet_id ? parseInt(vet_id) : null;
    if (vet_id && (isNaN(vetIdNum) || vetIdNum < 1)) {
        return res.status(400).json({ error: 'vet_id inválido' });
    }
    
    const client = await getConn(rol, vetIdNum);
    let ok = false;
    try {
        await client.query(
            'CALL sp_agendar_cita($1, $2, $3, $4, NULL)',
            [mascota_id, veterinario_id, fecha_hora, motivo]
        );
        ok = true;
        res.json({ ok: true });
    } catch (err) {
        console.error('[ERROR] POST /api/citas:', err.message);
        res.status(400).json({ error: err.message });
    } finally {
        await releaseConn(client, vetIdNum, ok);
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