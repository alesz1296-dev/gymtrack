/* Planes de alimentación semanales: días, comidas, renglones, días espejo,
   versionado al modificar y archivado.

   Los datos temporales llevan el prefijo `nutri-` y se eliminan al terminar
   comprobando el recuento, porque estas pruebas escriben en la misma base que
   sirve el sitio publicado. */

import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';
import * as users from '../src/repositories/auth.repository.js';
import * as nutrition from '../src/services/nutrition.service.js';

const marca = Date.now();

const crearUsuario = async (role, sufijo = '') =>
  users.createUser({
    email: `nutri-${role}${sufijo}-${marca}@demo.local`,
    passwordHash: await bcrypt.hash('Prueba123', 4),
    firstName: 'Nutricion',
    lastName: 'Temporal',
    role,
  });

/* Siete franjas: la primera con plan y el resto libres, que es como nace la
   semana en el constructor. Se rellena solo lo que cada prueba necesita. */
const semana = (definidos = {}) =>
  Array.from({ length: 7 }, (_, index) => {
    const order = index + 1;
    return (
      definidos[order] ?? {
        name: `Día ${order}`,
        dayType: 'free',
        mirrorsDayOrder: null,
        meals: [],
      }
    );
  });

test('plan de alimentación semanal con días, comidas y renglones', async (t) => {
  const entrenador = await crearUsuario('trainer');
  const atleta = await crearUsuario('athlete');
  const ajeno = await crearUsuario('trainer', 'b');
  const ids = [entrenador.id, atleta.id, ajeno.id];

  const comoEntrenador = { id: entrenador.id, role: 'trainer' };
  const comoAtleta = { id: atleta.id, role: 'athlete' };

  await pool.query(
    "INSERT INTO trainer_athlete_links (trainer_id, athlete_id, status) VALUES ($1,$2,'active')",
    [entrenador.id, atleta.id],
  );

  t.after(async () => {
    /* Días, comidas y renglones caen en cascada desde el plan. */
    await pool.query('DELETE FROM nutrition_plans WHERE trainer_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM foods WHERE created_by = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM trainer_athlete_links WHERE trainer_id = ANY($1::uuid[])', [ids]);
    const borrados = await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    assert.equal(borrados.rowCount, 3, 'deben eliminarse los tres usuarios temporales');
    await pool.end();
  });

  const catalogo = await nutrition.listFoods(entrenador.id);
  const pollo = catalogo.find((food) => food.name === 'Pechuga de pollo');
  const arroz = catalogo.find((food) => food.name === 'Arroz blanco cocido');
  assert.ok(pollo && arroz, 'la biblioteca general debe traer los alimentos de referencia');

  const diaConPlan = {
    name: 'Lunes',
    dayType: 'planned',
    mirrorsDayOrder: null,
    notes: 'Beber agua entre comidas.',
    meals: [
      {
        name: 'Desayuno',
        items: [{ foodId: pollo.id, quantity: 150 }],
      },
      {
        name: 'Comida',
        details: 'Repartir en dos tomas si hace falta.',
        items: [
          { foodId: arroz.id, quantity: 200 },
          { freeText: 'Lo que sobró de la cena de ayer' },
        ],
      },
    ],
  };

  const plan = await nutrition.createPlan(entrenador.id, {
    athleteId: atleta.id,
    name: 'Plan semanal de prueba',
    status: 'active',
    weeks: 4,
    startDate: new Date().toISOString().slice(0, 10),
    calories: 2400,
    proteinG: 180,
    days: semana({
      1: diaConPlan,
      /* El Día 3 repite al Día 1 sin enviar comidas: el servidor las copia. */
      3: { name: 'Miércoles', dayType: 'planned', mirrorsDayOrder: 1, meals: [] },
    }),
  });

  await t.test('guarda los tres niveles anidados', async () => {
    const completo = await nutrition.getPlan(plan.id, comoEntrenador);
    assert.equal(completo.days.length, 7, 'la semana se guarda entera');

    const lunes = completo.days[0];
    assert.equal(lunes.day_type, 'planned');
    assert.equal(lunes.meals.length, 2);
    assert.equal(lunes.meals[0].name, 'Desayuno');
    assert.equal(lunes.meals[0].items.length, 1);
    assert.equal(lunes.meals[1].items.length, 2);
  });

  await t.test('un renglón es un alimento con cantidad o un texto libre', async () => {
    const completo = await nutrition.getPlan(plan.id, comoEntrenador);
    const [conAlimento, libre] = completo.days[0].meals[1].items;

    assert.equal(conAlimento.foodId, arroz.id);
    assert.equal(Number(conAlimento.quantity), 200);
    assert.equal(conAlimento.freeText, null);
    /* Los macros se leen de la biblioteca, no se copian al renglón. */
    assert.equal(conAlimento.name, 'Arroz blanco cocido');
    assert.equal(Number(conAlimento.servingSize), 100);

    assert.equal(libre.foodId, null);
    assert.equal(libre.quantity, null);
    assert.equal(libre.freeText, 'Lo que sobró de la cena de ayer');
  });

  await t.test('el día espejo copia las comidas de verdad', async () => {
    const completo = await nutrition.getPlan(plan.id, comoEntrenador);
    const miercoles = completo.days[2];

    assert.equal(miercoles.mirrors_day_order, 1, 'conserva la etiqueta del día que repite');
    assert.equal(miercoles.meals.length, 2, 'y sus comidas existen en filas propias');
    assert.equal(miercoles.meals[1].items.length, 2);

    /* Filas propias, no las mismas: si compartieran identificador, editar una
       cambiaría la otra. */
    assert.notEqual(miercoles.meals[0].id, completo.days[0].meals[0].id);
  });

  await t.test('los días libres se guardan sin comidas', async () => {
    const completo = await nutrition.getPlan(plan.id, comoEntrenador);
    const libres = completo.days.filter((day) => day.day_type === 'free');
    assert.equal(libres.length, 5);
    assert.ok(libres.every((day) => day.meals.length === 0));
  });

  /* Las reglas de la semana —día libre sin comidas, espejo hacia atrás, forma
     de cada renglón— viven en la validación de la ruta y se comprueban en
     `nutrition-validation.test.js`, sin base de datos. Aquí solo va lo que
     depende de PostgreSQL. */

  await t.test('un plan de otro atleta exige vínculo activo', async () => {
    await assert.rejects(
      () =>
        nutrition.createPlan(ajeno.id, {
          athleteId: atleta.id,
          name: 'Plan intruso',
          weeks: 1,
          days: semana({ 1: diaConPlan }),
        }),
      /no está vinculado contigo/,
    );
  });

  await t.test('un entrenador ajeno no puede leer el plan', async () => {
    await assert.rejects(
      () => nutrition.getPlan(plan.id, { id: ajeno.id, role: 'trainer' }),
      /no encontrado/,
    );
  });

  await t.test('el atleta ve su plan activo', async () => {
    const suyos = await nutrition.listPlans(comoAtleta);
    assert.ok(suyos.some((item) => item.id === plan.id));
  });

  await t.test('la semana en curso se calcula desde la fecha de inicio', () => {
    assert.equal(nutrition.currentWeek({ start_date: null, weeks: 4 }), 1);

    const hace10Dias = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(nutrition.currentWeek({ start_date: hace10Dias, weeks: 4 }), 2);

    /* Nunca se pasa de la duración del plan. */
    const hace100Dias = new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(nutrition.currentWeek({ start_date: hace100Dias, weeks: 4 }), 4);
  });

  await t.test('un alimento usado en un plan ya no se puede borrar', async () => {
    const propio = await nutrition.createFood(entrenador.id, {
      name: 'Batido en uso',
      servingSize: 1,
      servingUnit: 'porción',
      calories: 300,
    });

    /* Mientras no esté en ningún plan sí se borra: se comprueba justo después. */
    await nutrition.updatePlan(plan.id, entrenador.id, {
      athleteId: atleta.id,
      name: 'Plan semanal de prueba',
      status: 'active',
      weeks: 4,
      days: semana({
        1: {
          name: 'Lunes',
          dayType: 'planned',
          meals: [{ name: 'Batido', items: [{ foodId: propio.id, quantity: 1 }] }],
        },
      }),
    });

    await assert.rejects(
      () => nutrition.deleteFood(propio.id, entrenador.id),
      /solo puede desactivarse/,
    );

    const biblioteca = await nutrition.foodLibrary(entrenador.id);
    assert.equal(
      biblioteca.find((food) => food.id === propio.id).is_used,
      true,
      'la biblioteca debe marcarlo como en uso',
    );
  });

  await t.test('modificar archiva la versión anterior y conserva el linaje', async () => {
    const activos = await nutrition.listPlans(comoEntrenador);
    const vigente = activos.filter((item) => item.origin_plan_id === plan.origin_plan_id);
    assert.equal(vigente.length, 1, 'solo debe quedar una versión activa');
    assert.notEqual(vigente[0].id, plan.id, 'y no es la original');
    assert.equal(vigente[0].origin_plan_id, plan.origin_plan_id, 'el linaje se hereda');

    const archivados = await nutrition.listPlans(comoEntrenador, true);
    assert.ok(
      archivados.some((item) => item.id === plan.id),
      'la versión anterior queda archivada',
    );

    /* Y el atleta ve solo la vigente, nunca las dos a la vez. */
    const delAtleta = await nutrition.listPlans(comoAtleta);
    assert.ok(!delAtleta.some((item) => item.id === plan.id));
  });

  await t.test('archivar y restaurar a mano', async () => {
    const vigente = (await nutrition.listPlans(comoEntrenador))[0];

    await assert.rejects(
      () => nutrition.setPlanStatus(vigente.id, ajeno.id, 'archived'),
      /no encontrado/,
      'un entrenador ajeno no puede archivarlo',
    );

    await nutrition.setPlanStatus(vigente.id, entrenador.id, 'archived');
    assert.ok(!(await nutrition.listPlans(comoAtleta)).some((item) => item.id === vigente.id));

    await nutrition.setPlanStatus(vigente.id, entrenador.id, 'active');
    const restaurado = await nutrition.getPlan(vigente.id, comoEntrenador);
    assert.equal(restaurado.days.length, 7, 'conserva sus días al restaurarlo');
  });
});
