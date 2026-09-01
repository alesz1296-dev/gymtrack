import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';
import { destino, exigirLocal, sentenciasDestructivas } from './destino.js';

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/* A qué base se va a escribir, dicho en voz alta antes de tocar nada. El 14 de
   agosto se aplicaron migraciones a la base publicada creyendo que iban a la
   local, y no se supo hasta horas después. */
const { host, esLocal } = destino();
console.log(`Base de datos: ${host}${esLocal ? '' : '  (NO es local)'}`);

exigirLocal({
  comando: 'npm run db:migrate',
  variable: 'MIGRATE_ALLOW_REMOTE',
  motivo:
    'Migrar la base publicada cambia el esquema que usa el sitio en ese mismo\n' +
    '  instante. Si la migración quita algo, el código desplegado se rompe\n' +
    '  hasta que publiques la versión nueva.',
});

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

    /* Sobre una base remota, avisar antes de aplicar algo que quita: es la
       diferencia entre un despliegue tranquilo y tres pantallas caídas. */
    const destructivas = sentenciasDestructivas(sql);
    if (!esLocal && destructivas.length) {
      console.warn(
        `\n  AVISO: ${filename} elimina cosas del esquema (${destructivas.join(', ')}).`,
      );
      console.warn('  El código que está publicado ahora puede romperse en cuanto se aplique.');
      console.warn('  Despliega cuanto antes, o aplica esta migración justo antes de desplegar.\n');
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
