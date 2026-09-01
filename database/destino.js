/* A qué base apunta la configuración, y si conviene dejar que un comando
   escriba en ella.

   Existe porque este proyecto ha trabajado durante semanas contra la misma
   base que sirve el sitio publicado, y eso ya ha costado dos incidentes:
   una migración que quitó una columna y tumbó tres pantallas hasta el
   despliegue, y un script de diagnóstico que dejó un `search_path` pegado en
   una conexión del pool.

   La regla que quedó establecida el 14 de agosto es "antes de tocar datos,
   comprobar a qué base apunta `.env`; no fiarse de lo que diga la
   documentación". Esto la convierte en código, para que no dependa de que
   alguien se acuerde. */

import { env } from '../src/config/environment.js';

const LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

export function destino() {
  const host = new URL(env.databaseUrl).hostname;
  return { host, esLocal: LOCALES.has(host) };
}

/* Detiene el comando si la base no es local y no se ha pedido a propósito.

   No es un muro: hay motivos legítimos para migrar la base publicada. Es un
   badén, para que nunca vuelva a ocurrir *sin querer*, que es como ocurrió. */
export function exigirLocal({ comando, variable, motivo }) {
  const { host, esLocal } = destino();
  if (esLocal || process.env[variable] === 'true') return { host, esLocal };

  console.error(`\n  La conexión apunta a "${host}", que no es una base local.`);
  console.error(`  ${motivo}\n`);
  console.error(`  Si de verdad quieres hacerlo:  ${variable}=true ${comando}\n`);
  process.exit(1);
}

/* Avisa cuando una migración pendiente elimina algo.

   Una migración que solo AÑADE es inofensiva para el código ya publicado: las
   columnas nuevas se ignoran. Una que QUITA rompe el sitio en el instante en
   que se aplica, y la ventana no se cierra hasta el despliegue. Fue
   exactamente lo que pasó con `007_nutricion_semanal.sql`, que eliminó
   `nutrition_meals.plan_id` mientras el código publicado todavía la
   consultaba. */
const DESTRUCTIVAS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+TYPE\b/i,
  /\bDROP\s+CONSTRAINT\b/i,
  /\bRENAME\s+(?:COLUMN|TO)\b/i,
];

export function sentenciasDestructivas(sql) {
  /* Los comentarios se descartan: casi todas las migraciones de este proyecto
     explican en prosa lo que hacen, y "elimina la columna" en un comentario
     no es una sentencia. */
  const codigo = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
  return DESTRUCTIVAS.filter((patron) => patron.test(codigo)).map(
    (patron) => codigo.match(patron)[0],
  );
}
