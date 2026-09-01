/* El guardarraíl que separa la base local de la publicada.

   Nace de dos incidentes reales, no de una precaución teórica: una migración
   que quitó una columna y tumbó tres pantallas del sitio hasta el despliegue,
   y un script de diagnóstico que dejó un `search_path` pegado en el pool de
   producción. Estas pruebas fijan que la protección siga puesta. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sentenciasDestructivas } from '../database/destino.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('reconoce las sentencias que eliminan algo del esquema', () => {
  const destructivas = [
    'ALTER TABLE nutrition_meals DROP COLUMN plan_id;',
    'DROP TABLE usuarios;',
    'DROP TYPE food_unit;',
    'ALTER TABLE x DROP CONSTRAINT y;',
    'ALTER TABLE x RENAME COLUMN a TO b;',
    /* En minúsculas y con espaciado raro también. */
    'alter table x   drop   column y;',
  ];
  for (const sql of destructivas)
    assert.ok(sentenciasDestructivas(sql).length, `debería avisar de: ${sql}`);

  const aditivas = [
    'CREATE TABLE foods (id UUID PRIMARY KEY);',
    'ALTER TABLE routines ADD COLUMN weeks SMALLINT;',
    'CREATE INDEX idx_x ON y(z);',
    "INSERT INTO foods (name) VALUES ('Pollo');",
  ];
  for (const sql of aditivas)
    assert.deepEqual(sentenciasDestructivas(sql), [], `no debería avisar de: ${sql}`);
});

test('un comentario que habla de eliminar no cuenta como sentencia', () => {
  /* Casi todas las migraciones de este proyecto explican en prosa lo que
     hacen. "Al eliminar la columna se van sus restricciones" es una
     explicación, no un DROP, y avisar por eso convertiría el guardarraíl en
     ruido que se acaba ignorando. */
  const sql = `
    /* Al eliminar la columna se van con ella su clave foránea.
       No se hace un DROP TABLE porque destruiría el historial. */
    -- ojo: aquí NO hay ningún DROP COLUMN
    ALTER TABLE nutrition_meals ADD COLUMN day_id UUID;`;
  assert.deepEqual(sentenciasDestructivas(sql), []);
});

test('la migración 007 se reconoce como destructiva y las demás no', async () => {
  /* Es la que rompió el sitio publicado el 31 de agosto: eliminó
     `nutrition_meals.plan_id` mientras el código desplegado la consultaba. Si
     el detector dejara de verla, habría dejado de servir para lo único que
     tiene que servir. */
  const septima = await read('../database/migrations/007_nutricion_semanal.sql');
  assert.ok(sentenciasDestructivas(septima).length, 'la 007 quita una columna');

  for (const nombre of [
    '001_initial_schema.sql',
    '004_rutinas_semanales.sql',
    '006_biblioteca_alimentos.sql',
    '008_registro_nutricion.sql',
  ]) {
    const sql = await read(`../database/migrations/${nombre}`);
    assert.deepEqual(sentenciasDestructivas(sql), [], `${nombre} es aditiva`);
  }
});

test('migrar una base remota no se bloquea, pero destruir sí', async () => {
  const [migrate, seed, destino] = await Promise.all([
    read('../database/migrate.js'),
    read('../database/seed.js'),
    read('../database/destino.js'),
  ]);

  /* El usuario decidió el 31 de agosto seguir trabajando contra Neon. Poner un
     badén en cada migración solo enseñaría a escribir la variable sin leerla, y
     además no habría evitado ninguno de los dos incidentes que hubo. */
  assert.ok(!migrate.includes('exigirLocal('), 'migrar una base remota no se bloquea');

  /* El badén va donde estuvo el daño: una migración que ELIMINA algo rompe el
     código publicado en el instante en que se aplica. */
  assert.match(migrate, /MIGRATE_ALLOW_DESTRUCTIVE/);
  assert.match(migrate, /sentenciasDestructivas\(sql\)/);
  assert.match(migrate, /process\.exit\(1\)/, 'y se detiene de verdad');

  /* Sembrar sí se bloquea siempre: mezclar cuentas demo con usuarios reales no
     tiene ningún uso legítimo en este proyecto. */
  assert.match(seed, /exigirLocal\(/, 'seed debe pedir base local');
  assert.match(seed, /SEED_ALLOW_REMOTE/);

  /* Los dos comandos dicen a qué base van ANTES de escribir nada. El 14 de
     agosto se migró la base publicada creyendo que era la local y no se supo
     hasta horas después. */
  for (const source of [migrate, seed])
    assert.match(source, /console\.log\(`Base de datos: \$\{host\}/);

  /* La comprobación vive en un solo sitio, no copiada en cada comando. */
  assert.match(destino, /export function exigirLocal/);
  assert.ok(!seed.includes("=== 'localhost'"), 'seed no debe repetir la comprobación');
});

test('el ejecutor aislado se salta el guardarraíl a propósito y lo explica', async () => {
  const source = await read('../database/pruebas-aisladas.js');

  /* Puede saltárselo porque escribe en un esquema temporal que destruye al
     terminar; ninguna tabla real está a tiro. Sin el comentario, el próximo
     que lo lea pensaría que es un descuido y lo copiaría a otro sitio. */
  assert.match(source, /MIGRATE_ALLOW_DESTRUCTIVE: 'true'/);
  assert.match(source, /esquema es temporal|se destruye al terminar/);
  assert.match(source, /DROP SCHEMA IF EXISTS/, 'y lo destruye pase lo que pase');
});
