/* Reglas de la biblioteca de alimentos.

   Son las mismas que ya gobiernan la de ejercicios: cada entrenador
   administra solo lo suyo, los generales no se tocan desde ninguna cuenta, y
   desactivar retira el alimento del selector sin borrarlo.

   Los datos temporales llevan el prefijo `alimento-` y se eliminan al
   terminar comprobando el recuento, porque estas pruebas escriben en la
   misma base que sirve el sitio publicado. */

import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';
import * as users from '../src/repositories/auth.repository.js';
import * as nutrition from '../src/services/nutrition.service.js';

const marca = Date.now();

const crearUsuario = async (role, sufijo = '') =>
  users.createUser({
    email: `alimento-${role}${sufijo}-${marca}@demo.local`,
    passwordHash: await bcrypt.hash('Prueba123', 4),
    firstName: 'Alimento',
    lastName: 'Temporal',
    role,
  });

const nuevoAlimento = (nombre) => ({
  name: nombre,
  category: 'Proteínas',
  servingSize: 100,
  servingUnit: 'g',
  calories: 165,
  proteinG: 31,
  carbsG: 0,
  fatsG: 3.6,
  fiberG: null,
  notes: 'Peso en crudo.',
});

test('la biblioteca de alimentos respeta al dueño y el estado', async (t) => {
  const entrenador = await crearUsuario('trainer');
  const ajeno = await crearUsuario('trainer', 'b');
  const atleta = await crearUsuario('athlete');
  const ids = [entrenador.id, ajeno.id, atleta.id];

  t.after(async () => {
    await pool.query('DELETE FROM foods WHERE created_by = ANY($1::uuid[])', [ids]);
    const borrados = await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    assert.equal(borrados.rowCount, 3, 'deben eliminarse los tres usuarios temporales');

    /* Ningún general debe haber cambiado ni desaparecido por estas pruebas. */
    const generales = await pool.query(
      'SELECT COUNT(*)::int AS n FROM foods WHERE is_public = TRUE',
    );
    assert.ok(generales.rows[0].n > 0, 'los alimentos generales deben seguir ahí');
    await pool.end();
  });

  const propio = await nutrition.createFood(entrenador.id, nuevoAlimento('Pollo del entrenador'));

  await t.test('los generales están disponibles desde el primer día', async () => {
    const catalogo = await nutrition.listFoods(entrenador.id);
    const generales = catalogo.filter((food) => food.is_public);
    assert.ok(generales.length >= 40, 'la biblioteca general no debe arrancar vacía');

    /* Los macros van por porción, y la porción la define el propio alimento.
       Si esto se perdiera, un plan multiplicaría por la cantidad equivocada. */
    const huevo = generales.find((food) => food.name === 'Huevo entero');
    assert.ok(huevo, 'debe existir el huevo entre los generales');
    assert.equal(huevo.serving_unit, 'unidad');
    assert.equal(Number(huevo.serving_size), 1);
  });

  await t.test('el alimento propio aparece en el selector del dueño', async () => {
    const catalogo = await nutrition.listFoods(entrenador.id);
    assert.ok(catalogo.some((food) => food.id === propio.id));
  });

  await t.test('y no aparece en el de otro entrenador', async () => {
    const catalogo = await nutrition.listFoods(ajeno.id);
    assert.ok(!catalogo.some((food) => food.id === propio.id));
  });

  await t.test('un macro sin dato se guarda como nulo y no como cero', async () => {
    /* Cero es un valor legítimo: el agua no tiene calorías. Confundir "sin
       dato" con cero falsearía el total del día en cuanto se sumen. */
    assert.equal(propio.fiber_g, null);
    assert.equal(Number(propio.carbs_g), 0, 'y un cero explícito sí debe guardarse');
  });

  await t.test('otro entrenador no puede editarlo ni cambiarle el estado', async () => {
    await assert.rejects(
      () => nutrition.updateFood(propio.id, ajeno.id, nuevoAlimento('Secuestrado')),
      /no encontrado/,
    );
    await assert.rejects(
      () => nutrition.setFoodStatus(propio.id, ajeno.id, false),
      /no encontrado/,
    );
    await assert.rejects(() => nutrition.deleteFood(propio.id, ajeno.id), /no encontrado/);

    const catalogo = await nutrition.listFoods(entrenador.id);
    const sigue = catalogo.find((food) => food.id === propio.id);
    assert.equal(sigue.name, 'Pollo del entrenador', 'el nombre no debe haber cambiado');
  });

  await t.test('un alimento general no se puede modificar desde una cuenta', async () => {
    const general = (await nutrition.listFoods(entrenador.id)).find((food) => food.is_public);
    await assert.rejects(
      () => nutrition.updateFood(general.id, entrenador.id, nuevoAlimento('Mío ahora')),
      /no encontrado/,
    );
    await assert.rejects(
      () => nutrition.deleteFood(general.id, entrenador.id),
      /no encontrado/,
      'ni siquiera el dueño de la plataforma lo borra desde aquí',
    );
  });

  await t.test('desactivar lo retira del selector pero no de la biblioteca', async () => {
    await nutrition.setFoodStatus(propio.id, entrenador.id, false);

    const catalogo = await nutrition.listFoods(entrenador.id);
    assert.ok(!catalogo.some((food) => food.id === propio.id), 'no debe ofrecerse para planes');

    const biblioteca = await nutrition.foodLibrary(entrenador.id);
    const enBiblioteca = biblioteca.find((food) => food.id === propio.id);
    assert.ok(enBiblioteca, 'debe seguir en la pantalla de administración');
    assert.equal(enBiblioteca.is_active, false);
  });

  await t.test('y activarlo lo devuelve', async () => {
    await nutrition.setFoodStatus(propio.id, entrenador.id, true);
    const catalogo = await nutrition.listFoods(entrenador.id);
    assert.ok(catalogo.some((food) => food.id === propio.id));
  });

  await t.test('el atleta puede leer la biblioteca pero no administrarla', async () => {
    /* La lectura la necesita para ver el alimento dentro de su plan. Que no
       pueda escribir lo garantiza `requireRole` en la ruta, que tiene su
       propia prueba; aquí se comprueba que la lectura sí funcione. */
    const catalogo = await nutrition.listFoods(atleta.id);
    assert.ok(
      catalogo.every((food) => food.is_public),
      'solo debe ver los generales',
    );
  });

  await t.test('se puede borrar mientras ningún plan lo use', async () => {
    const desechable = await nutrition.createFood(entrenador.id, nuevoAlimento('Se va a borrar'));
    await nutrition.deleteFood(desechable.id, entrenador.id);

    const biblioteca = await nutrition.foodLibrary(entrenador.id);
    assert.ok(!biblioteca.some((food) => food.id === desechable.id));
  });
});
