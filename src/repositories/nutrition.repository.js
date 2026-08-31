/* Consultas de nutrición: biblioteca de alimentos y planes alimentarios.
   Este es el único nivel que habla con PostgreSQL. Todas las consultas usan
   parámetros ($1, $2, ...), nunca concatenación de texto.

   La nutrición vivía dentro del módulo de seguimiento, junto a mediciones y
   check-ins, cuando era un solo formulario. Al crecer hasta el tamaño de las
   rutinas se separó en su propio módulo de cuatro capas, como el resto. */

import { pool, withTransaction } from '../config/database.js';

/* ---------- Biblioteca de alimentos ---------- */

/* Las columnas que se devuelven siempre. Se nombran una sola vez para que las
   tres consultas de lectura no se separen con el tiempo. */
const FOOD_COLUMNS = `id, created_by, name, category, serving_size, serving_unit,
    calories, protein_g, carbs_g, fats_g, fiber_g, notes, is_public, is_active`;

/* Lo que ofrece el selector al armar un plan: los generales activos y los
   propios activos del entrenador. Un alimento desactivado deja de ofrecerse
   para planes nuevos, pero sigue existiendo dentro de los que ya lo usan. */
export async function listFoods(userId) {
  return (
    await pool.query(
      `SELECT ${FOOD_COLUMNS}
        FROM foods
        WHERE is_active = TRUE AND (is_public = TRUE OR created_by = $1)
        ORDER BY category NULLS LAST, name`,
      [userId],
    )
  ).rows;
}

/* La pantalla de administración: incluye también los desactivados, porque
   desde ahí es donde se vuelven a activar. Los generales van después de los
   propios para que el entrenador vea primero lo suyo. */
export async function foodLibrary(userId) {
  return (
    await pool.query(
      `SELECT ${FOOD_COLUMNS},
        -- En uso significa que algún plan lo tiene en un renglón, aunque ese
        -- plan esté archivado. La pantalla oculta entonces el botón de borrar.
        EXISTS(SELECT 1 FROM nutrition_items i WHERE i.food_id = foods.id) AS is_used
      FROM foods
      WHERE is_public = TRUE OR created_by = $1
      ORDER BY is_public, category NULLS LAST, name`,
      [userId],
    )
  ).rows;
}

/* Los parámetros de escritura van en el mismo orden en crear y en actualizar,
   así que se arman una sola vez. Un macro vacío se guarda como nulo y no como
   cero: "sin dato" y "cero gramos de grasa" no son lo mismo y sumarlos como
   si lo fueran falsearía el total del día. */
const foodValues = (input) => [
  input.name,
  input.category || null,
  input.servingSize,
  input.servingUnit,
  input.calories ?? null,
  input.proteinG ?? null,
  input.carbsG ?? null,
  input.fatsG ?? null,
  input.fiberG ?? null,
  input.notes || null,
];

export async function createFood(userId, input) {
  return (
    await pool.query(
      `INSERT INTO foods
        (created_by, name, category, serving_size, serving_unit,
         calories, protein_g, carbs_g, fats_g, fiber_g, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING ${FOOD_COLUMNS}`,
      [userId, ...foodValues(input)],
    )
  ).rows[0];
}

/* `is_public = FALSE` en el WHERE no sobra aunque ya se filtre por dueño: los
   alimentos generales no tienen dueño, pero deja explícito que desde una
   cuenta de entrenador no se tocan nunca. */
export async function updateFood(id, userId, input) {
  return (
    (
      await pool.query(
        `UPDATE foods
          SET name=$3, category=$4, serving_size=$5, serving_unit=$6,
              calories=$7, protein_g=$8, carbs_g=$9, fats_g=$10, fiber_g=$11, notes=$12
          WHERE id=$1 AND created_by=$2 AND is_public=FALSE
          RETURNING ${FOOD_COLUMNS}`,
        [id, userId, ...foodValues(input)],
      )
    ).rows[0] || null
  );
}

export async function setFoodStatus(id, userId, isActive) {
  return (
    (
      await pool.query(
        `UPDATE foods SET is_active=$3
          WHERE id=$1 AND created_by=$2 AND is_public=FALSE
          RETURNING ${FOOD_COLUMNS}`,
        [id, userId, isActive],
      )
    ).rows[0] || null
  );
}

/* Devuelve 'missing', 'used' o 'deleted'.

   Un alimento que ya forma parte de algún plan no se borra, solo se
   desactiva: el renglón que lo usa apunta a él con una clave foránea y
   eliminarlo destruiría el plan del atleta. La comprobación va dentro de la
   transacción y con el bloqueo puesto, para que no se cuele un plan nuevo
   entre la consulta y el borrado. Es la misma regla que en `deleteExercise`.

   Alcanza también a los planes archivados, que es lo correcto: siguen
   existiendo y hay que poder leerlos. */
export async function deleteFood(id, userId) {
  return withTransaction(async (client) => {
    const food = (
      await client.query(
        'SELECT id FROM foods WHERE id=$1 AND created_by=$2 AND is_public=FALSE FOR UPDATE',
        [id, userId],
      )
    ).rows[0];
    if (!food) return 'missing';

    if (
      (await client.query('SELECT 1 FROM nutrition_items WHERE food_id=$1 LIMIT 1', [id])).rowCount
    )
      return 'used';

    await client.query('DELETE FROM foods WHERE id=$1', [id]);
    return 'deleted';
  });
}

/* ---------- Planes alimentarios ---------- */

/* Inserta un plan completo: el plan, sus siete días, las comidas de cada día
   y los renglones de cada comida. Se llama siempre dentro de una transacción,
   propia al crear y compartida al reemplazar.

   `end_date` se deriva del inicio y la duración y no se recibe del cliente,
   para que no puedan quedar incoherentes entre sí. */
async function insertPlan(client, trainerId, input, originPlanId = null) {
  const plan = (
    await client.query(
      `INSERT INTO nutrition_plans
        (trainer_id, athlete_id, name, description, calories, protein_g, carbs_g,
         fats_g, fiber_g, water_ml, status, start_date, end_date, weeks, origin_plan_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
        CASE WHEN $12::date IS NULL THEN NULL ELSE $12::date + ($13::int * 7 - 1) END,
        $13,$14)
      RETURNING *`,
      [
        trainerId,
        input.athleteId,
        input.name,
        input.description || null,
        /* Los objetivos diarios son opcionales; sin valor se guarda nulo y no
           cero, porque "sin objetivo" y "cero calorías" no son lo mismo. */
        input.calories ?? null,
        input.proteinG ?? null,
        input.carbsG ?? null,
        input.fatsG ?? null,
        input.fiberG ?? null,
        input.waterMl ?? null,
        /* El valor por defecto se repite aquí y no solo en la validación de la
           ruta: un plan creado desde el servicio, como en las pruebas, no pasa
           por Zod y se quedaría sin estado. */
        input.status ?? 'active',
        input.startDate || null,
        input.weeks ?? 1,
        originPlanId,
      ],
    )
  ).rows[0];

  /* Un plan creado desde cero es el origen de su propio linaje. */
  if (!plan.origin_plan_id) {
    await client.query('UPDATE nutrition_plans SET origin_plan_id=id WHERE id=$1', [plan.id]);
    plan.origin_plan_id = plan.id;
  }

  /* Las comidas ya resueltas de cada franja, para poder copiarlas en los días
     espejo sin volver a consultarlas. */
  const mealsByDayOrder = new Map();

  for (let dayIndex = 0; dayIndex < input.days.length; dayIndex += 1) {
    const dayInput = input.days[dayIndex];
    const dayOrder = dayIndex + 1;
    const dayType = dayInput.dayType ?? 'planned';

    /* Un día libre nunca tiene comidas ni espejo, aunque el cliente los envíe. */
    const mirrors = dayType === 'planned' ? (dayInput.mirrorsDayOrder ?? null) : null;
    let meals = dayType === 'planned' ? (dayInput.meals ?? []) : [];

    /* Si el día apunta a otro y no trae comidas propias, se copian las del día
       espejado. Siempre es una franja anterior, así que ya está resuelta. */
    if (mirrors && meals.length === 0) meals = mealsByDayOrder.get(mirrors) ?? [];

    const day = (
      await client.query(
        `INSERT INTO nutrition_days (plan_id,name,day_order,day_type,mirrors_day_order,notes)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [plan.id, dayInput.name, dayOrder, dayType, mirrors, dayInput.notes || null],
      )
    ).rows[0];

    for (let mealIndex = 0; mealIndex < meals.length; mealIndex += 1) {
      const mealInput = meals[mealIndex];
      const meal = (
        await client.query(
          `INSERT INTO nutrition_meals (day_id,name,meal_order,details)
          VALUES ($1,$2,$3,$4) RETURNING id`,
          [day.id, mealInput.name, mealIndex + 1, mealInput.details || null],
        )
      ).rows[0];

      for (let itemIndex = 0; itemIndex < (mealInput.items ?? []).length; itemIndex += 1) {
        const item = mealInput.items[itemIndex];
        /* La restricción de la tabla exige una cosa o la otra, nunca las dos.
           La validación ya lo garantiza; esto solo elige qué columnas van. */
        const esAlimento = Boolean(item.foodId);
        await client.query(
          `INSERT INTO nutrition_items (meal_id,item_order,food_id,quantity,free_text,notes)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            meal.id,
            itemIndex + 1,
            esAlimento ? item.foodId : null,
            esAlimento ? item.quantity : null,
            esAlimento ? null : item.freeText,
            item.notes || null,
          ],
        );
      }
    }

    mealsByDayOrder.set(dayOrder, meals);
  }

  return plan;
}

export async function createPlan(trainerId, input) {
  return withTransaction((client) => insertPlan(client, trainerId, input));
}

/* Modificar un plan no reescribe sus filas: archiva la versión anterior y
   crea una nueva heredando el linaje. Así lo que el atleta ya registró sobre
   el plan viejo sigue apuntando a algo que existe. */
export async function replacePlan(id, trainerId, input) {
  return withTransaction(async (client) => {
    const previous = (
      await client.query(
        'SELECT id, origin_plan_id FROM nutrition_plans WHERE id=$1 AND trainer_id=$2 FOR UPDATE',
        [id, trainerId],
      )
    ).rows[0];
    if (!previous) return null;

    await client.query("UPDATE nutrition_plans SET status='archived' WHERE id=$1", [id]);
    return insertPlan(client, trainerId, input, previous.origin_plan_id || previous.id);
  });
}

/* `archived` solo lo usa el entrenador. El atleta ve siempre y únicamente sus
   planes activos: uno archivado dejó de estar vigente y mostrárselo solo
   confundiría sobre qué le toca comer. */
export async function listPlans(user, archived = false) {
  const condition =
    user.role === 'trainer'
      ? `p.trainer_id = $1 AND p.status ${archived ? '=' : '<>'} 'archived'`
      : "p.athlete_id = $1 AND p.status = 'active'";

  return (
    await pool.query(
      `SELECT p.*, u.first_name AS athlete_first_name, u.last_name AS athlete_last_name,
        (SELECT COUNT(*)::int FROM nutrition_days d
          WHERE d.plan_id = p.id AND d.day_type = 'planned') AS planned_days
      FROM nutrition_plans p
      LEFT JOIN users u ON u.id = p.athlete_id
      WHERE ${condition}
      ORDER BY p.updated_at DESC`,
      [user.id],
    )
  ).rows;
}

export async function setPlanStatus(id, trainerId, status) {
  return (
    await pool.query(
      `UPDATE nutrition_plans SET status = $3
        WHERE id = $1 AND trainer_id = $2
        RETURNING id, name, status`,
      [id, trainerId, status],
    )
  ).rows[0];
}

/* El plan completo con sus tres niveles anidados.

   Se resuelve con subconsultas y no con un triple GROUP BY: agrupar tres
   tablas a la vez obliga a nombrar cada columna en el GROUP BY y el resultado
   deja de leerse. Cada nivel trae sus hijos ya armados.

   Los macros del alimento se leen de `foods` en cada consulta y no se copian
   al renglón: si el entrenador corrige una errata en un alimento, todos los
   planes que lo usan se corrigen con él. */
const PLAN_DAYS_QUERY = `
  SELECT d.id, d.name, d.day_order, d.day_type, d.mirrors_day_order, d.notes,
    COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', m.id, 'name', m.name, 'order', m.meal_order, 'details', m.details,
          'items', COALESCE((
            SELECT json_agg(
              json_build_object(
                'id', i.id, 'order', i.item_order, 'foodId', i.food_id,
                'freeText', i.free_text, 'quantity', i.quantity, 'notes', i.notes,
                'name', f.name, 'category', f.category, 'isActive', f.is_active,
                'servingSize', f.serving_size, 'servingUnit', f.serving_unit,
                'calories', f.calories, 'proteinG', f.protein_g, 'carbsG', f.carbs_g,
                'fatsG', f.fats_g, 'fiberG', f.fiber_g
              ) ORDER BY i.item_order
            )
            FROM nutrition_items i
            LEFT JOIN foods f ON f.id = i.food_id
            WHERE i.meal_id = m.id
          ), '[]')
        ) ORDER BY m.meal_order
      )
      FROM nutrition_meals m WHERE m.day_id = d.id
    ), '[]') AS meals
  FROM nutrition_days d
  WHERE d.plan_id = $1
  ORDER BY d.day_order`;

export async function getPlan(id, user) {
  const condition = user.role === 'trainer' ? 'p.trainer_id = $2' : 'p.athlete_id = $2';
  const plan = (
    await pool.query(
      `SELECT p.*, u.first_name AS athlete_first_name, u.last_name AS athlete_last_name
        FROM nutrition_plans p
        LEFT JOIN users u ON u.id = p.athlete_id
        WHERE p.id=$1 AND ${condition}`,
      [id, user.id],
    )
  ).rows[0];
  if (!plan) return null;

  plan.days = (await pool.query(PLAN_DAYS_QUERY, [id])).rows;
  return plan;
}
