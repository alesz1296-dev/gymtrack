/* Consultas de seguimiento: mediciones corporales, check-ins periódicos y
   planes nutricionales. Este es el único nivel que habla con PostgreSQL.
   Todas las consultas usan parámetros ($1, $2, ...), nunca concatenación de
   datos del usuario.

   Aviso sobre `${column}`: en dos consultas el nombre de la columna se elige
   según el rol. No es un dato escrito por nadie, sino uno de dos valores
   fijos decididos en este mismo archivo, así que no abre una vía de
   inyección; los valores sí viajan siempre como parámetros. */

import { pool } from '../config/database.js';

/* ---------- Mediciones ---------- */

/* Guarda una medición. Si ya existe una del mismo atleta en esa fecha, se
   actualiza en lugar de duplicarla: así corregir una medición del día no
   deja dos filas en el historial ni en las gráficas. */
/* Solo existe una medición por atleta y día, así que registrar dos veces la
   misma fecha actualiza la fila en lugar de crear otra. Eso es lo correcto,
   pero el entrenador y el atleta pueden anotar cosas distintas del mismo día:
   si él apunta el peso y ella la cintura, la segunda escritura no puede
   borrar la primera. Por eso cada columna se combina con `COALESCE`: un campo
   que llega vacío significa «no lo medí», no «bórralo».

   La contrapartida es que desde el formulario no se puede vaciar un valor ya
   guardado; para corregir un dato hay que escribir el nuevo encima. */
export async function addMeasurement(athleteId, recordedBy, input) {
  const { rows } = await pool.query(
    `INSERT INTO measurements
       (athlete_id, recorded_by, measured_at, weight_kg, body_fat_percent,
        waist_cm, hip_cm, chest_cm, arm_cm, thigh_cm, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (athlete_id, measured_at) DO UPDATE SET
       recorded_by      = EXCLUDED.recorded_by,
       weight_kg        = COALESCE(EXCLUDED.weight_kg, measurements.weight_kg),
       body_fat_percent = COALESCE(EXCLUDED.body_fat_percent, measurements.body_fat_percent),
       waist_cm         = COALESCE(EXCLUDED.waist_cm, measurements.waist_cm),
       hip_cm           = COALESCE(EXCLUDED.hip_cm, measurements.hip_cm),
       chest_cm         = COALESCE(EXCLUDED.chest_cm, measurements.chest_cm),
       arm_cm           = COALESCE(EXCLUDED.arm_cm, measurements.arm_cm),
       thigh_cm         = COALESCE(EXCLUDED.thigh_cm, measurements.thigh_cm),
       notes            = COALESCE(EXCLUDED.notes, measurements.notes)
     RETURNING *`,
    [
      athleteId,
      recordedBy,
      input.measuredAt,
      /* Todas las medidas son opcionales: sin valor se guarda nulo, que
         significa "no se midió", distinto de haber medido cero. */
      input.weightKg ?? null,
      input.bodyFatPercent ?? null,
      input.waistCm ?? null,
      input.hipCm ?? null,
      input.chestCm ?? null,
      input.armCm ?? null,
      input.thighCm ?? null,
      input.notes || null,
    ],
  );

  return rows[0];
}

export async function measurements(athleteId) {
  const { rows } = await pool.query(
    `SELECT *
       FROM measurements
      WHERE athlete_id = $1
      ORDER BY measured_at DESC
      LIMIT 365`,
    [athleteId],
  );

  return rows;
}

/* ---------- Check-ins ---------- */

export async function createCheckin(athleteId, input) {
  const { rows } = await pool.query(
    `INSERT INTO checkins
       (athlete_id, trainer_id, checkin_date, energy, sleep_hours, stress,
        hunger, adherence, pain_details, wins, difficulties)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      athleteId,
      input.trainerId,
      input.checkinDate,
      input.energy,
      input.sleepHours,
      input.stress,
      input.hunger,
      input.adherence,
      input.painDetails || null,
      input.wins || null,
      input.difficulties || null,
    ],
  );

  return rows[0];
}

/* La misma consulta sirve a las dos pantallas: el entrenador ve los
   check-ins que recibió y el atleta los que envió. */
export async function checkins(user) {
  const column = user.role === 'trainer' ? 'trainer_id' : 'athlete_id';

  const { rows } = await pool.query(
    `SELECT
       c.*,
       a.first_name AS athlete_first_name,
       a.last_name  AS athlete_last_name,
       t.first_name AS trainer_first_name,
       t.last_name  AS trainer_last_name
     FROM checkins c
     JOIN users a ON a.id = c.athlete_id
     JOIN users t ON t.id = c.trainer_id
     WHERE c.${column} = $1
     ORDER BY checkin_date DESC
     LIMIT 100`,
    [user.id],
  );

  return rows;
}

/* El `trainer_id = $2` no es un filtro cualquiera: impide que un entrenador
   responda un check-in que no le fue enviado. Si no coincide, no se
   actualiza ninguna fila y se devuelve undefined. */
export async function reviewCheckin(trainerId, id, feedback) {
  const { rows } = await pool.query(
    `UPDATE checkins
        SET trainer_feedback = $3,
            reviewed_at = NOW()
      WHERE id = $1 AND trainer_id = $2
      RETURNING *`,
    [id, trainerId, feedback],
  );

  return rows[0];
}
/* Los planes nutricionales se movieron a `nutrition.repository.js` cuando
   la nutrición pasó a ser un módulo propio. */
