/* Registro del plan de alimentación por el atleta: abrir el día, marcar
   comidas, sustituciones, cierre automático y cuadrícula de cumplimiento.

   Los datos temporales llevan el prefijo `registro-` y se eliminan al
   terminar comprobando el recuento, porque estas pruebas escriben en la misma
   base que sirve el sitio publicado. */

import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';
import * as users from '../src/repositories/auth.repository.js';
import * as nutrition from '../src/services/nutrition.service.js';

const marca = Date.now();

const crearUsuario = async (role, sufijo = '') =>
  users.createUser({
    email: `registro-${role}${sufijo}-${marca}@demo.local`,
    passwordHash: await bcrypt.hash('Prueba123', 4),
    firstName: 'Registro',
    lastName: 'Temporal',
    role,
  });

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

test('el atleta registra su plan comida por comida', async (t) => {
  const entrenador = await crearUsuario('trainer');
  const atleta = await crearUsuario('athlete');
  const ajeno = await crearUsuario('athlete', 'b');
  const ids = [entrenador.id, atleta.id, ajeno.id];

  const comoEntrenador = { id: entrenador.id, role: 'trainer' };
  const comoAtleta = { id: atleta.id, role: 'athlete' };

  await pool.query(
    "INSERT INTO trainer_athlete_links (trainer_id, athlete_id, status) VALUES ($1,$2,'active')",
    [entrenador.id, atleta.id],
  );

  t.after(async () => {
    /* Los registros del día caen en cascada desde el día del plan, y este
       desde el plan; las comidas marcadas desde el registro. */
    await pool.query('DELETE FROM nutrition_day_logs WHERE athlete_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM nutrition_plans WHERE trainer_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM trainer_athlete_links WHERE trainer_id = ANY($1::uuid[])', [ids]);
    const borrados = await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    assert.equal(borrados.rowCount, 3, 'deben eliminarse los tres usuarios temporales');
    await pool.end();
  });

  const catalogo = await nutrition.listFoods(entrenador.id);
  const huevo = catalogo.find((food) => food.name === 'Huevo entero');

  const plan = await nutrition.createPlan(entrenador.id, {
    athleteId: atleta.id,
    name: 'Plan con registro',
    status: 'active',
    weeks: 4,
    startDate: new Date().toISOString().slice(0, 10),
    days: semana({
      1: {
        name: 'Lunes',
        dayType: 'planned',
        meals: [
          { name: 'Desayuno', items: [{ foodId: huevo.id, quantity: 3 }] },
          { name: 'Comida', items: [{ freeText: 'Lo que haya' }] },
          { name: 'Cena', details: 'Ligera', items: [] },
        ],
      },
      2: { name: 'Martes', dayType: 'free', mirrorsDayOrder: null, meals: [] },
    }),
  });

  const completo = await nutrition.getPlan(plan.id, comoAtleta);
  const lunes = completo.days[0];
  const martes = completo.days[1];

  await t.test('abrir un día devuelve sus comidas sin marcar', async () => {
    const abierto = await nutrition.openDay(atleta.id, lunes.id, 1);
    assert.equal(abierto.totalMeals, 3);
    assert.equal(abierto.loggedMeals, 0);
    assert.equal(abierto.logged.length, 0);
    assert.equal(abierto.dayLog.completed_at, null, 'con comidas pendientes no está cumplido');
  });

  await t.test('abrir el mismo día dos veces reutiliza el registro', async () => {
    const primera = await nutrition.openDay(atleta.id, lunes.id, 1);
    const segunda = await nutrition.openDay(atleta.id, lunes.id, 1);
    assert.equal(primera.dayLog.id, segunda.dayLog.id);
  });

  await t.test('un día de otro atleta se rechaza', async () => {
    await assert.rejects(
      () => nutrition.openDay(ajeno.id, lunes.id, 1),
      /no pertenece a un plan activo tuyo/,
    );
  });

  await t.test('una semana fuera del plan se rechaza', async () => {
    await assert.rejects(() => nutrition.openDay(atleta.id, lunes.id, 9), /fuera del plan/);
  });

  let dayLogId;

  await t.test('marcar las comidas completa el día automáticamente', async () => {
    const abierto = await nutrition.openDay(atleta.id, lunes.id, 1);
    dayLogId = abierto.dayLog.id;

    const primera = await nutrition.logMeal(atleta.id, dayLogId, lunes.meals[0].id, {
      status: 'done',
    });
    assert.equal(primera.loggedMeals, 1);
    assert.equal(primera.dayLog.completed_at, null, 'con una de tres no se cierra');

    await nutrition.logMeal(atleta.id, dayLogId, lunes.meals[1].id, {
      status: 'swapped',
      notes: 'Cambié el pollo por atún',
    });

    const ultima = await nutrition.logMeal(atleta.id, dayLogId, lunes.meals[2].id, {
      status: 'done',
    });
    assert.equal(ultima.loggedMeals, 3);
    assert.ok(ultima.dayLog.completed_at, 'al marcar la última el día queda cumplido');
    assert.equal(ultima.newlyCompleted, true);
  });

  await t.test('la sustitución conserva su nota', async () => {
    const abierto = await nutrition.openDay(atleta.id, lunes.id, 1);
    const cambiada = abierto.logged.find((item) => item.mealId === lunes.meals[1].id);
    assert.equal(cambiada.status, 'swapped');
    assert.equal(cambiada.notes, 'Cambié el pollo por atún');
  });

  await t.test('volver a marcar una comida corrige en vez de duplicar', async () => {
    const resultado = await nutrition.logMeal(atleta.id, dayLogId, lunes.meals[1].id, {
      status: 'done',
      notes: '',
    });
    assert.equal(resultado.loggedMeals, 3, 'siguen siendo tres, no cuatro');

    const abierto = await nutrition.openDay(atleta.id, lunes.id, 1);
    const corregida = abierto.logged.find((item) => item.mealId === lunes.meals[1].id);
    assert.equal(corregida.status, 'done');
    assert.equal(corregida.notes, null, 'la nota vacía se borra');
  });

  await t.test('desmarcar una comida reabre el día', async () => {
    const resultado = await nutrition.unlogMeal(atleta.id, dayLogId, lunes.meals[0].id);
    assert.equal(resultado.loggedMeals, 2);
    assert.equal(resultado.dayLog.completed_at, null, 'el día vuelve a estar a medias');

    /* Y volver a marcarla lo cierra otra vez. */
    const cerrado = await nutrition.logMeal(atleta.id, dayLogId, lunes.meals[0].id, {
      status: 'done',
    });
    assert.ok(cerrado.dayLog.completed_at);
  });

  await t.test('una comida de otro día se rechaza', async () => {
    const otroPlan = await nutrition.createPlan(entrenador.id, {
      athleteId: atleta.id,
      name: 'Otro plan',
      status: 'active',
      weeks: 1,
      days: semana({
        1: {
          name: 'Único',
          dayType: 'planned',
          meals: [{ name: 'Algo', items: [], details: 'x' }],
        },
      }),
    });
    const otro = await nutrition.getPlan(otroPlan.id, comoAtleta);

    await assert.rejects(
      () => nutrition.logMeal(atleta.id, dayLogId, otro.days[0].meals[0].id, { status: 'done' }),
      /no pertenece al día de este registro/,
    );
  });

  await t.test('un registro ajeno no se puede tocar', async () => {
    await assert.rejects(
      () => nutrition.logMeal(ajeno.id, dayLogId, lunes.meals[0].id, { status: 'done' }),
      /Registro no encontrado/,
    );
    await assert.rejects(
      () => nutrition.unlogMeal(ajeno.id, dayLogId, lunes.meals[0].id),
      /Registro no encontrado/,
    );
  });

  await t.test('un día libre queda cumplido al abrirlo, sin comidas', async () => {
    const abierto = await nutrition.openDay(atleta.id, martes.id, 1);
    assert.equal(abierto.totalMeals, 0);
    assert.ok(abierto.dayLog.completed_at, 'sin nada que marcar, se cierra solo');
  });

  await t.test('lo registrado en una semana no cuenta en otra', async () => {
    const semana3 = await nutrition.openDay(atleta.id, lunes.id, 3);
    assert.notEqual(semana3.dayLog.id, dayLogId, 'cada semana tiene su propio registro');
    assert.equal(semana3.loggedMeals, 0);
  });

  await t.test('la cuadrícula refleja semana, día y sustituciones', async () => {
    const { progress } = await nutrition.planProgress(plan.id, comoEntrenador);

    const lunesSemana1 = progress.find((p) => p.weekNumber === 1 && p.dayOrder === 1);
    assert.ok(lunesSemana1);
    assert.equal(lunesSemana1.status, 'completed');
    assert.equal(lunesSemana1.completedExercises, 3, 'tres comidas marcadas');
    assert.equal(lunesSemana1.totalExercises, 3);
    assert.equal(lunesSemana1.offPlanMeals, 0, 'la sustitución se corrigió a "done"');

    const lunesSemana3 = progress.find((p) => p.weekNumber === 3 && p.dayOrder === 1);
    assert.equal(lunesSemana3.status, 'in_progress');

    /* Un día que el atleta nunca abrió no aparece, igual que en las rutinas. */
    assert.ok(!progress.some((p) => p.weekNumber === 2));
  });

  await t.test('el entrenador ve la cuadrícula y un ajeno no', async () => {
    const propia = await nutrition.planProgress(plan.id, comoEntrenador);
    assert.ok(propia.progress.length > 0);

    await assert.rejects(
      () => nutrition.planProgress(plan.id, { id: ajeno.id, role: 'athlete' }),
      /no encontrado/,
    );
  });

  await t.test('modificar el plan conserva lo ya registrado', async () => {
    /* La cuadrícula se consulta por el linaje, así que una versión nueva del
       plan sigue mostrando lo que el atleta registró sobre la anterior. */
    const nuevo = await nutrition.updatePlan(plan.id, entrenador.id, {
      athleteId: atleta.id,
      name: 'Plan con registro v2',
      status: 'active',
      weeks: 4,
      startDate: new Date().toISOString().slice(0, 10),
      days: semana({
        1: { name: 'Lunes', dayType: 'planned', meals: [{ name: 'Desayuno', details: 'Igual' }] },
      }),
    });

    const { progress } = await nutrition.planProgress(nuevo.id, comoEntrenador);
    assert.ok(
      progress.some((p) => p.weekNumber === 1 && p.dayOrder === 1),
      'el registro anterior sigue visible desde la versión nueva',
    );
  });
});
