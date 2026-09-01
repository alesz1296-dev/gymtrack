/* A qué base apunta la configuración, y si conviene dejar que un comando
   escriba en ella.

   El usuario decidió el 31 de agosto **seguir trabajando contra Neon**, la
   misma base que sirve el sitio publicado. Es su proyecto y sus datos están
   ahí; la decisión se respeta y no se le pone un muro delante.

   Eso cambia qué protección tiene sentido. De los dos incidentes que hubo,
   ninguno se habría evitado impidiendo migrar la base publicada: en el primero
   la intención *era* migrarla, y el segundo fue un script de diagnóstico que
   ni siquiera pasaba por aquí. Lo que sí habría avisado a tiempo es reparar en
   que la migración **eliminaba una columna** mientras el código desplegado
   seguía usándola.

   Así que el badén se pone exactamente ahí y en ningún otro sitio: migrar
   Neon no cuesta nada, pero hacerlo con una migración destructiva exige
   decirlo a propósito. La regla del 14 de agosto —"antes de tocar datos,
   comprobar a qué base apunta `.env`"— se conserva como aviso en cada
   ejecución, para que no dependa de que alguien se acuerde. */

import { env } from '../src/config/environment.js';

const LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

export function destino() {
  const host = new URL(env.databaseUrl).hostname;
  return { host, esLocal: LOCALES.has(host) };
}

/* Detiene el comando si la base no es local y no se ha pedido a propósito.

   Lo usa solo `db:seed`, y ahí sí tiene sentido incondicional: sembrar las
   cuentas de demostración en la base publicada mezclaría usuarios falsos con
   los reales, y eso no tiene ningún uso legítimo en este proyecto. */
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
