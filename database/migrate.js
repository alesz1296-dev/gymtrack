import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { destino, sentenciasDestructivas } from './destino.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/* A qué base se va a escribir, dicho en voz alta antes de tocar nada. El 14 de
   agosto se aplicaron migraciones a la base publicada creyendo que iban a la
   local, y no se supo hasta horas después.

   Migrar una base remota NO se bloquea: en este proyecto es lo normal, porque
   se trabaja contra la misma base que sirve el sitio. Poner un badén en cada
   migración solo enseñaría a escribir la variable sin leerla. */
const { host, esLocal } = destino();
console.log(`Base de datos: ${host}${esLocal ? '' : '  (NO es local)'}`);

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const applied = new Set(
    (await pool.query('SELECT filename FROM schema_migrations')).rows.map((row) => row.filename),
  );
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
  const pendientes = files.filter((file) => !applied.has(file));

  if (!pendientes.length) {
    console.log('Migraciones al día.');
  }

  for (const filename of pendientes) {
    const sql = await fs.readFile(path.join(directory, filename), 'utf8');

    /* Aquí sí se para, y solo aquí.

       Una migración que solo AÑADE es inofensiva para el código publicado: las
       columnas nuevas se ignoran. Una que QUITA rompe el sitio en el instante
       en que se aplica, y la ventana no se cierra hasta el despliegue. Pasó
       con la 007 y el sitio estuvo con tres pantallas caídas.

       Es el único caso que merece detener el comando, porque es el único en
       que la consecuencia no se ve hasta que alguien abre esa pantalla. */
    const destructivas = sentenciasDestructivas(sql);
    if (!esLocal && destructivas.length && process.env.MIGRATE_ALLOW_DESTRUCTIVE !== 'true') {
      console.error(`\n  ${filename} ELIMINA cosas del esquema: ${destructivas.join(', ')}.`);
      console.error(`  La base "${host}" es la que sirve el sitio publicado.`);
      console.error('  En cuanto se aplique, el código que está desplegado ahora puede');
      console.error('  romperse, y seguirá roto hasta que publiques la versión nueva.\n');
      console.error('  Lo correcto son dos despliegues: primero el código que ya no usa');
      console.error('  lo que se va a quitar, y la migración después.\n');
      console.error('  Si lo tienes decidido y vas a desplegar acto seguido:');
      console.error('    MIGRATE_ALLOW_DESTRUCTIVE=true npm run db:migrate\n');
      process.exit(1);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Aplicada: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  if (pendientes.length) console.log('Migraciones al día.');
} finally {
  await pool.end();
}
