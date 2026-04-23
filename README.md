# Clínica Veterinaria — Sistema Full-Stack con Seguridad de BD
## Corte 3 · Base de Datos Avanzadas · UP Chiapas

**Alumno:** [Mayte Jackellin Villanueva Velasco]  
**Matrícula:** 243748  
**Docente:** Mtro. Ramsés Alejandro Camas Nájera  

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL 16 |
| Caché | Redis 7 |
| API | Node.js + Express 5 |
| Frontend | HTML + JS vanilla |
| Contenedores | Docker + Docker Compose |

---

## Cómo levantar el sistema

```bash
# Clonar el repositorio
git clone https://github.com/[tu-usuario]/corte3-bda-243748

# Copiar variables de entorno
cp .env.example .env

# Levantar todo
docker compose up --build
```

El sistema queda disponible en:
- Frontend: `http://localhost:3001`
- API: `http://localhost:3000/api`

---

## Documento de decisiones de diseño

### Pregunta 1 — ¿Qué política RLS aplicaste a la tabla `mascotas`?

La política aplicada en `backend/06_rls.sql` es:

```sql
CREATE POLICY pol_mascotas_vet
ON mascotas FOR SELECT TO rol_veterinario
USING (
    id IN (
        SELECT mascota_id FROM vet_atiende_mascota
        WHERE vet_id = NULLIF(current_setting('app.vet_id', true), '')::INT
    )
);
```

Lo que hace: cada vez que un usuario con `rol_veterinario` ejecuta un
`SELECT` sobre `mascotas`, PostgreSQL evalúa la cláusula `USING` fila
por fila. Solo devuelve las filas cuyo `id` aparece en `vet_atiende_mascota`
vinculado al `vet_id` de la sesión actual. Si `app.vet_id = 1`, solo
pasan las mascotas de Dr. López. Si la variable no está seteada,
`NULLIF` convierte la cadena vacía a `NULL`, el cast a `INT` devuelve
`NULL`, y la comparación falla para todas las filas — resultado: 0 filas.

Para recepción y admin existen políticas separadas con `USING (true)`
y `FOR ALL` respectivamente, que permiten ver todo sin filtro.

Las tres vistas sensibles tienen `security_invoker = on` en
`backend/04_views.sql` para que hereden el contexto RLS del usuario
que las consulta, no del creador.

---

### Pregunta 2 — Vector de ataque del mecanismo de identificación de veterinario y cómo se previene

Se usa `set_config('app.vet_id', vet_id, true)` para comunicar la
identidad del veterinario a PostgreSQL en cada request.

**Vector de ataque posible:** si el frontend pudiera mandar un `vet_id`
arbitrario en la request, un atacante podría enviar `vet_id=2` estando
autenticado como Dr. López y ver las mascotas de Dra. García.

**Cómo lo previene el sistema:**

1. El `vet_id` que llega al endpoint se valida con `parseInt()` y se
   verifica que sea mayor a 0 — se rechaza cualquier valor no numérico.
2. El `vet_id` proviene de la sesión del servidor (establecida en el
   login), no de un campo libre del formulario. El formulario de agendar
   cita oculta el campo de veterinario cuando el rol es `veterinario`
   y usa el `vet_id` de sesión directamente.
3. Incluso si alguien manipulara la request con herramientas como
   Postman, el pool de conexiones de la API conecta con el usuario de BD
   correspondiente al `vet_id` — un atacante que mande `vet_id=2`
   pero esté autenticado como `dr_lopez` recibirá un error porque
   `dr_lopez` no puede conectar con las credenciales de `dra_garcia`.

---

### Pregunta 3 — SECURITY DEFINER y prevención de escalada de privilegios

Se usa `SECURITY DEFINER` en las dos funciones de trigger:
`fn_trg_historial_cita` y `fn_trg_alerta_stock`, ambas en
`backend/03_triggers.sql`.

**Por qué fue necesario:** los triggers se disparan en el contexto del
usuario que ejecuta el INSERT. `dr_lopez` tiene solo `SELECT` sobre
`historial_movimientos` y ningún permiso sobre `alertas`. Sin
`SECURITY DEFINER`, el trigger falla con `permission denied` al
intentar insertar en esas tablas de auditoría — lo cual es exactamente
el error que se presentó durante el desarrollo.

**Medida tomada para prevenir escalada de privilegios:**

```sql
CREATE OR REPLACE FUNCTION fn_trg_historial_cita()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public   -- ← mitigación del vector search_path
AS $$
...
```

El `SET search_path = public` fijado directamente en la función impide
que un atacante cree un schema propio con funciones maliciosas del mismo
nombre y las ejecute con privilegios elevados. Sin este fix, si
`search_path` incluyera un schema del atacante antes que `public`,
PostgreSQL resolvería llamadas como `NOW()` o `FORMAT()` hacia versiones
maliciosas. Con `SET search_path = public` la función siempre resuelve
nombres en `public` únicamente.

---

### Pregunta 4 — TTL del caché Redis y justificación

**TTL elegido:** 300 segundos (5 minutos), configurado en `.env` como
`CACHE_TTL=300`.

**Justificación:** La consulta de `v_mascotas_vacunacion_pendiente`
tarda aproximadamente 28ms en BD local con los datos de prueba. En
producción con más registros sería significativamente más. La pantalla
se consulta varias veces por hora durante el horario de atención.

**Si fuera demasiado bajo (ej. 10 segundos):** el caché casi nunca
tendría tiempo de ser útil — casi cada request sería CACHE MISS y la
consulta iría a BD, eliminando el beneficio del caché por completo.

**Si fuera demasiado alto (ej. 1 hora):** al aplicar una vacuna a
Firulais, esa mascota seguiría apareciendo en la lista de vacunación
pendiente durante hasta 1 hora, mostrando información médica incorrecta.

**Estrategia de invalidación:** al aplicar una vacuna (`POST /api/vacunas`),
la API elimina inmediatamente todas las keys de Redis relacionadas con
vacunación pendiente — incluyendo las keys por veterinario y por rol.
La próxima consulta siempre resulta en CACHE MISS con datos frescos,
sin depender de esperar el TTL.

---

### Pregunta 5 — Línea exacta de hardening contra SQL injection

**Endpoint crítico:** `GET /api/mascotas` — búsqueda por nombre de mascota.
Este es el endpoint que recibe input libre del usuario desde el frontend.

**Archivo:** `api/index.js`  
**Línea de defensa:**

```js
// api/index.js — GET /api/mascotas
const result = await client.query(
    `SELECT m.id, m.nombre, m.especie, d.nombre AS dueno
     FROM mascotas m
     JOIN duenos d ON d.id = m.dueno_id
     WHERE m.nombre ILIKE $1`,
    [`%${q || ''}%`]      // ← línea que protege el sistema
);
```

**Qué protege y de qué:** el parámetro `$1` en la query y el array
`[...]` como segundo argumento de `client.query()` son la defensa.
El driver `pg` de Node.js envía el valor del usuario al servidor
PostgreSQL como parámetro de protocolo binario, completamente separado
del string SQL. PostgreSQL nunca interpreta el valor como código SQL —
sin importar qué caracteres contenga (`'`, `;`, `--`, `UNION`, etc.),
siempre se trata como texto literal para el `ILIKE`.

Esto previene los ataques documentados en el cuaderno: quote-escape,
stacked queries y union-based injection.

---

### Pregunta 6 — Operaciones que se rompen si se revocan todos los permisos del veterinario excepto SELECT en mascotas

Si `rol_veterinario` tuviera únicamente `SELECT ON mascotas`:

**1. Agendar citas falla:**
El procedure `sp_agendar_cita` hace `INSERT INTO citas`. Sin
`INSERT ON citas`, el procedure lanza `permission denied for table citas`
al intentar registrar la cita, aunque el trigger de historial tenga
`SECURITY DEFINER`.

**2. Aplicar vacunas falla:**
El endpoint `POST /api/vacunas` hace `INSERT INTO vacunas_aplicadas`.
Sin `INSERT ON vacunas_aplicadas`, PostgreSQL rechaza la operación con
`permission denied`. El veterinario no podría registrar ninguna vacuna.

**3. La vista de vacunación pendiente devuelve error:**
`v_mascotas_vacunacion_pendiente` tiene `security_invoker = on`, por lo
que se ejecuta con los permisos del veterinario. La vista hace `LEFT JOIN`
con `vacunas_aplicadas` e `inventario_vacunas`. Sin `SELECT` sobre esas
tablas, PostgreSQL lanza `permission denied` al evaluar la vista,
impidiendo ver la lista de vacunación pendiente completamente.

---

## Estructura del repositorio

```
corte3-bda-243748/
├── README.md
├── cuaderno_ataques.md
├── schema_corte3.sql
├── docker-compose.yml
├── .env.example
├── .gitignore
├── backend/
│   ├── 02_procedures.sql   — sp_agendar_cita, fn_total_facturado
│   ├── 03_triggers.sql     — trg_historial_cita, trg_alerta_stock
│   ├── 04_views.sql        — vistas con security_invoker
│   ├── 05_roles_y_permisos.sql  — GRANT/REVOKE por rol
│   └── 06_rls.sql          — políticas RLS con NULLIF
├── api/
│   ├── index.js            — endpoints con queries parametrizadas
│   ├── config.js           — configuración desde .env
│   ├── Dockerfile
│   └── package.json
└── frontend/
    ├── index.html          — 3 pantallas obligatorias
    ├── config.js           — URL dinámica del API
    └── Dockerfile
```