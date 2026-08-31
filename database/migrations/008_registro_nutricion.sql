/* Registro de cumplimiento del plan de alimentación.

   Mismo modelo que el de las rutinas —una fila por día abierto y otra por
   pieza marcada— pero la pieza aquí es la COMIDA, no el alimento. Marcar
   alimento por alimento serían quince toques al día y nadie lo haría; marcar
   solo el día entero perdería justo lo que el entrenador necesita saber, que
   es qué comida se salta la gente. La comida es la unidad correcta: entre
   tres y seis toques al día.

   A diferencia de un entrenamiento, una comida no solo se hace o no se hace.
   El documento de visión ya preveía "marcar comidas, registrar sustituciones
   y dejar comentarios", así que el estado distingue haberla seguido de haber
   comido otra cosa. Un plan que solo admite "sí" o "no" empuja a mentir. */

CREATE TYPE nutrition_log_status AS ENUM ('done', 'swapped', 'skipped');

/* Un día del plan, abierto por el atleta en una semana concreta.

   Aquí sí hay unicidad por franja, al revés que en `workout_sessions`: se
   entrena dos veces el mismo día de forma legítima, pero el lunes de la
   semana 2 solo se come una vez. */
CREATE TABLE nutrition_day_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES users(id),
  nutrition_day_id UUID NOT NULL REFERENCES nutrition_days(id) ON DELETE CASCADE,
  week_number SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 52),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (athlete_id, nutrition_day_id, week_number)
);

/* Una fila por comida marcada. Es lo que permite avanzar de a una y decidir
   cuándo el día queda cumplido. */
CREATE TABLE nutrition_meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_log_id UUID NOT NULL REFERENCES nutrition_day_logs(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES nutrition_meals(id) ON DELETE CASCADE,
  status nutrition_log_status NOT NULL DEFAULT 'done',
  /* Para la sustitución: "cambié el pollo por atún". Corto a propósito, es
     una nota al margen y no un diario. */
  notes VARCHAR(500),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (day_log_id, meal_id)
);

/* El atleta consulta su semana en curso y el entrenador la cuadrícula
   completa de un plan; las dos consultas parten del día. */
CREATE INDEX idx_nutrition_day_logs_day
  ON nutrition_day_logs(nutrition_day_id, week_number);

CREATE INDEX idx_nutrition_day_logs_athlete
  ON nutrition_day_logs(athlete_id, created_at DESC);
