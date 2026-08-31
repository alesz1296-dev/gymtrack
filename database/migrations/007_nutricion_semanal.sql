/* Planes de alimentación semanales, con días, comidas y renglones.

   Hasta ahora un plan era una lista plana de comidas sin ninguna noción de
   día: el mismo menú para siempre. Pasa a tener la misma forma que las
   rutinas —siete franjas, duración en semanas, días espejo y versionado—
   con un nivel más, porque un día tiene comidas y una comida tiene alimentos:

       plan → día (1..7) → comida (Desayuno, Comida...) → renglón

   Compatible hacia atrás: las comidas que ya existieran pasan al Día 1 de su
   plan, que queda como un plan de una semana.

   Un renglón es UNA de dos cosas, nunca las dos: un alimento de la biblioteca
   con su cantidad, o un texto libre. El texto libre no es un parche, es una
   decisión: obligar a catalogar "lo que sobró de anoche" para poder escribirlo
   haría que el entrenador dejara de usar la pantalla. */

/* Solo dos valores. Las rutinas distinguen descanso de descanso opcional
   porque el atleta puede decidir entrenar igual; en alimentación esa
   distinción no significa nada. O el día tiene plan, o es libre. */
CREATE TYPE nutrition_day_type AS ENUM ('planned', 'free');

/* `end_date` se deriva del inicio y la duración, igual que en las rutinas, y
   por el mismo motivo: recibirla del cliente permitiría que quedaran
   incoherentes entre sí.

   `origin_plan_id` conserva el linaje. Modificar un plan archiva la versión
   anterior y crea una nueva, para no romper lo que el atleta ya registrará
   sobre él en la fase 3; sin este enlace ese historial se perdería de vista
   cada vez que el entrenador ajusta el menú. */
ALTER TABLE nutrition_plans
  ADD COLUMN weeks SMALLINT NOT NULL DEFAULT 1 CHECK (weeks BETWEEN 1 AND 52),
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD COLUMN origin_plan_id UUID REFERENCES nutrition_plans(id);

UPDATE nutrition_plans SET origin_plan_id = id WHERE origin_plan_id IS NULL;

/* `mirrors_day_order` solo guarda la etiqueta del día espejo ("igual al
   Día 1"). Las comidas se copian de verdad en filas propias, para que cada
   día sea independiente después de guardar. */
CREATE TABLE nutrition_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  day_order SMALLINT NOT NULL CHECK (day_order BETWEEN 1 AND 7),
  day_type nutrition_day_type NOT NULL DEFAULT 'planned',
  mirrors_day_order SMALLINT,
  notes TEXT,
  UNIQUE (plan_id, day_order),
  CONSTRAINT nutrition_days_mirror_range
    CHECK (mirrors_day_order IS NULL OR mirrors_day_order BETWEEN 1 AND 7),
  CONSTRAINT nutrition_days_mirror_not_self
    CHECK (mirrors_day_order IS NULL OR mirrors_day_order <> day_order)
);

CREATE INDEX idx_nutrition_days_plan ON nutrition_days(plan_id);

/* Las comidas pasan de colgar del plan a colgar del día. */
ALTER TABLE nutrition_meals
  ADD COLUMN day_id UUID REFERENCES nutrition_days(id) ON DELETE CASCADE;

/* Un Día 1 para cada plan que ya tuviera comidas.
   El valor del enum se convierte de forma explícita: dentro de un SELECT el
   literal se toma por texto y PostgreSQL no lo ajusta solo, a diferencia de
   lo que ocurre en un INSERT con VALUES. */
INSERT INTO nutrition_days (plan_id, name, day_order, day_type)
SELECT DISTINCT m.plan_id, 'Día 1', 1, 'planned'::nutrition_day_type
FROM nutrition_meals m;

UPDATE nutrition_meals m
   SET day_id = d.id
  FROM nutrition_days d
 WHERE d.plan_id = m.plan_id AND d.day_order = 1;

/* Al eliminar la columna se van con ella su clave foránea y la unicidad
   compuesta que la incluía, así que la nueva se declara después. */
ALTER TABLE nutrition_meals DROP COLUMN plan_id;

ALTER TABLE nutrition_meals
  ALTER COLUMN day_id SET NOT NULL,
  /* `details` deja de ser obligatorio: era el único sitio donde escribir la
     comida y ahora eso vive en los renglones. Sigue existiendo como nota
     libre de la comida entera ("repartir en dos tomas"). */
  ALTER COLUMN details DROP NOT NULL,
  ADD CONSTRAINT nutrition_meals_day_slot UNIQUE (day_id, meal_order);

/* Un renglón de una comida.

   `quantity` va expresada en la unidad del propio alimento, que es como
   piensa quien arma el plan: "150 g de pollo", "3 unidades de huevo". El
   factor para escalar los macros es quantity / serving_size.

   No se copian los macros aquí. Si el entrenador corrige el valor de un
   alimento, los planes que lo usan deben corregirse con él; congelarlos
   obligaría a rehacer cada plan a mano para arreglar una errata. */
CREATE TABLE nutrition_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id UUID NOT NULL REFERENCES nutrition_meals(id) ON DELETE CASCADE,
  item_order SMALLINT NOT NULL CHECK (item_order > 0),
  food_id UUID REFERENCES foods(id),
  free_text VARCHAR(300),
  quantity NUMERIC(9, 2) CHECK (quantity > 0),
  notes TEXT,
  UNIQUE (meal_id, item_order),
  /* O alimento con cantidad, o texto libre. Nunca las dos cosas ni ninguna:
     una fila a medias no se sabría dibujar ni sumar. */
  CONSTRAINT nutrition_items_content CHECK (
    (food_id IS NOT NULL AND quantity IS NOT NULL AND free_text IS NULL)
    OR (food_id IS NULL AND quantity IS NULL AND free_text IS NOT NULL)
  )
);

/* Lo consulta `deleteFood` para negarse a borrar un alimento que ya esté en
   algún plan, que es la comprobación que la fase 1 dejó pendiente. */
CREATE INDEX idx_nutrition_items_food
  ON nutrition_items(food_id)
  WHERE food_id IS NOT NULL;
