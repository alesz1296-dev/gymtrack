/* Ejecuta las pruebas contra un esquema temporal en lugar de contra las tablas
   reales.

   `npm test` a secas escribe en la misma base que sirve el sitio publicado:
   crea usuarios, planes y rutinas, y los borra al terminar. Funciona porque
   cada prueba limpia lo suyo y comprueba el recuento, pero depende de esa
   disciplina y no de una separación real de entornos.

   Esto da la separación sin tocar `.env` ni montar otra base: crea un esquema
   nuevo, aplica las ocho migraciones desde cero dentro de él, ejecuta la suite
   y lo destruye. Nada de lo que hagan las pruebas puede alcanzar una tabla
   real, porque no las ven.

   Uso:  npm run test:aislado

   El esquema se elige con `search_path` en la propia cadena de conexión, así
   que ningún módulo de `src` necesita saber que esto existe.

   El archivo NO puede llamarse `test-algo.js`: `node --test` da por prueba
   todo lo que encaje en `test-*.js`, `*.test.js`, `*_test.js` o cuelgue de una
   carpeta `test/`, así que con ese nombre `npm test` se ejecutaba a sí mismo
   de forma anidada. Se descubrió porque la suite pasó de 182 pruebas a 183. */

import { spawnSync } from 'node:child_process';
import { env } from '../src/config/environment.js';
import { pool } from '../src/config/database.js';

const schema = `prueba_${Date.now()}`;

const url = new URL(env.databaseUrl);
/* El pooler de Neon rechaza el parámetro `options` con un error de protocolo
   (08P01); el punto de conexión directo sí lo acepta. Quitar el sufijo no
   afecta a una base que no sea de Neon, porque entonces no está. */
url.hostname = url.hostname.replace('-pooler', '');
url.searchParams.set('options', `-c search_path=${schema}`);

function correr(args, titulo) {
  console.log(`\n--- ${titulo} ---`);
  return spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url.toString() },
  }).status;
}

await pool.query(`CREATE SCHEMA ${schema}`);
console.log(`Esquema temporal creado. Las tablas reales no se tocan.`);

let estado = 1;
try {
  estado = correr(['database/migrate.js'], 'Migraciones desde cero');
  if (estado === 0) estado = correr(['--test'], 'Pruebas');
} finally {
  /* Se destruye pase lo que pase, incluso si las pruebas fallan a la mitad. */
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.schemata
      WHERE schema_name LIKE 'prueba_%'`,
  );
  console.log(`\nEsquemas temporales restantes: ${rows[0].n}`);
  await pool.end();
}

process.exit(estado ?? 1);
