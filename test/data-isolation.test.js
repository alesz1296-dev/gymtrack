/* Aislamiento de datos entre atletas y entrenadores.

   Es la prueba más importante del proyecto en términos de daño evitado: se
   trata de una aplicación de salud, y un fallo de permisos aquí expondría
   mediciones corporales, check-ins y conversaciones privadas de otra persona.

   Monta dos parejas independientes —entrenador A con atleta A, entrenador B
   con atleta B— usando el flujo real de invitaciones, y comprueba que ninguna
   puede ver ni tocar los datos de la otra.

   La limpieza es explícita y en orden de dependencias: salvo notificaciones y
   tokens, las tablas referencian `users(id)` SIN `ON DELETE CASCADE`, así que
   borrar usuarios directamente fallaría. */

import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/database.js';
import * as users from '../src/repositories/auth.repository.js';
import * as links from '../src/services/links.service.js';
import * as tracking from '../src/services/tracking.service.js';
import * as nutrition from '../src/services/nutrition.service.js';
import * as messages from '../src/services/messages.service.js';

const marca = Date.now();

async function crearUsuario(role, sufijo) {
  return users.createUser({
    email: `aislamiento-${role}${sufijo}-${marca}@demo.local`,
    passwordHash: await bcrypt.hash('Prueba123', 4),
    firstName: 'Aislamiento',
    lastName: sufijo.toUpperCase(),
    role,
  });
}

/* Vincula usando el flujo real: crear invitación y aceptarla. De paso deja
   creada la conversación, que es lo que hace `acceptInvitation`. */
async function vincular(entrenador, atleta) {
  const invitacion = await links.createInvitation(entrenador.id);
  await links.acceptInvitation(invitacion.code, atleta.id);
  return invitacion;
}

const hoy = new Date().toISOString().slice(0, 10);

test('los datos de una pareja entrenador-atleta son invisibles para la otra', async (t) => {
  const entrenadorA = await crearUsuario('trainer', 'a');
  const atletaA = await crearUsuario('athlete', 'a');
  const entrenadorB = await crearUsuario('trainer', 'b');
  const atletaB = await crearUsuario('athlete', 'b');
  const ids = [entrenadorA.id, atletaA.id, entrenadorB.id, atletaB.id];

  t.after(async () => {
    await pool.query('DELETE FROM messages WHERE sender_id = ANY($1::uuid[])', [ids]);
    await pool.query(
      'DELETE FROM conversations WHERE trainer_id = ANY($1::uuid[]) OR athlete_id = ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM measurements WHERE athlete_id = ANY($1::uuid[]) OR recorded_by = ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM checkins WHERE athlete_id = ANY($1::uuid[]) OR trainer_id = ANY($1::uuid[])',
      [ids],
    );
    /* Las comidas del plan sí desaparecen solas: cascadean desde el plan. */
    await pool.query(
      'DELETE FROM nutrition_plans WHERE trainer_id = ANY($1::uuid[]) OR athlete_id = ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM invitations WHERE trainer_id = ANY($1::uuid[]) OR accepted_by = ANY($1::uuid[])',
      [ids],
    );
    await pool.query(
      'DELETE FROM trainer_athlete_links WHERE trainer_id = ANY($1::uuid[]) OR athlete_id = ANY($1::uuid[])',
      [ids],
    );
    const borrados = await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    assert.equal(borrados.rowCount, 4, 'deben eliminarse los cuatro usuarios temporales');
    await pool.end();
  });

  await vincular(entrenadorA, atletaA);
  await vincular(entrenadorB, atletaB);

  await t.test('una invitación no sirve dos veces ni después de vencer', async () => {
    const invitacion = await links.createInvitation(entrenadorA.id);
    await links.acceptInvitation(invitacion.code, atletaB.id);

    /* Reutilizar el mismo código debe fallar: es de un solo uso. */
    await assert.rejects(
      () => links.acceptInvitation(invitacion.code, atletaB.id),
      /no existe, venció o ya fue utilizada/,
    );

    const vencida = await links.createInvitation(entrenadorA.id);
    await pool.query(
      `UPDATE invitations SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [vencida.id],
    );
    await assert.rejects(
      () => links.acceptInvitation(vencida.code, atletaB.id),
      /no existe, venció o ya fue utilizada/,
    );

    /* Se deshace el vínculo creado aquí para no contaminar el resto. */
    await pool.query(
      'DELETE FROM trainer_athlete_links WHERE trainer_id = $1 AND athlete_id = $2',
      [entrenadorA.id, atletaB.id],
    );
    await pool.query('DELETE FROM conversations WHERE trainer_id = $1 AND athlete_id = $2', [
      entrenadorA.id,
      atletaB.id,
    ]);
  });

  await t.test('las mediciones solo las ve el atleta y su propio entrenador', async () => {
    await tracking.addMeasurement(entrenadorA, {
      athleteId: atletaA.id,
      measuredAt: hoy,
      weightKg: 80,
    });

    assert.equal((await tracking.listMeasurements(atletaA, undefined)).length, 1);
    assert.equal((await tracking.listMeasurements(entrenadorA, atletaA.id)).length, 1);

    /* El entrenador ajeno no puede leerlas... */
    await assert.rejects(
      () => tracking.listMeasurements(entrenadorB, atletaA.id),
      /no está vinculado contigo/,
    );
    /* ...ni escribirlas. */
    await assert.rejects(
      () =>
        tracking.addMeasurement(entrenadorB, {
          athleteId: atletaA.id,
          measuredAt: hoy,
          weightKg: 99,
        }),
      /no está vinculado contigo/,
    );
    /* Y un atleta no puede asomarse a los datos de otro. */
    await assert.rejects(() => tracking.listMeasurements(atletaB, atletaA.id), /Sin permiso/);
    await assert.rejects(
      () =>
        tracking.addMeasurement(atletaB, { athleteId: atletaA.id, measuredAt: hoy, weightKg: 50 }),
      /Sin permiso/,
    );

    /* La medición ajena no se coló en la lista del otro atleta. */
    assert.equal((await tracking.listMeasurements(atletaB, undefined)).length, 0);
  });

  await t.test('un check-in solo llega a su entrenador y solo él lo responde', async () => {
    const datos = {
      checkinDate: hoy,
      energy: 7,
      sleepHours: 8,
      stress: 3,
      hunger: 4,
      adherence: 90,
    };

    /* No se puede enviar un check-in a un entrenador con quien no hay vínculo. */
    await assert.rejects(
      () => tracking.createCheckin(atletaA, { ...datos, trainerId: entrenadorB.id }),
      /no está vinculado contigo/,
    );

    const checkin = await tracking.createCheckin(atletaA, { ...datos, trainerId: entrenadorA.id });

    /* El entrenador ajeno no puede responderlo: para él no existe. */
    await assert.rejects(
      () => tracking.reviewCheckin(entrenadorB, checkin.id, 'Intento ajeno'),
      /no encontrado/,
    );

    const revisado = await tracking.reviewCheckin(entrenadorA, checkin.id, 'Bien hecho');
    assert.equal(revisado.id, checkin.id);
  });

  await t.test('un plan de nutrición exige vínculo activo', async () => {
    /* Un plan es ahora una semana de siete franjas. Solo la primera tiene
       comidas; lo que se comprueba aquí es el permiso, no la forma. */
    const plan = {
      name: 'Plan de prueba',
      calories: 2000,
      weeks: 1,
      days: Array.from({ length: 7 }, (_, index) =>
        index === 0
          ? {
              name: 'Día 1',
              dayType: 'planned',
              meals: [{ name: 'Desayuno', details: 'Avena', items: [] }],
            }
          : { name: `Día ${index + 1}`, dayType: 'free', meals: [] },
      ),
    };

    await assert.rejects(
      () => nutrition.createPlan(entrenadorB.id, { ...plan, athleteId: atletaA.id }),
      /no está vinculado contigo/,
    );

    const creado = await nutrition.createPlan(entrenadorA.id, {
      ...plan,
      athleteId: atletaA.id,
    });
    assert.ok(creado.id);
  });

  await t.test('la conversación es privada para sus dos participantes', async () => {
    const { rows } = await pool.query(
      'SELECT id FROM conversations WHERE trainer_id = $1 AND athlete_id = $2',
      [entrenadorA.id, atletaA.id],
    );
    const conversacion = rows[0].id;

    await messages.send(conversacion, atletaA.id, 'Mensaje privado');
    assert.equal((await messages.messages(conversacion, entrenadorA.id)).length, 1);

    /* Ni el entrenador ni el atleta de la otra pareja pueden leerla ni
       escribir en ella, aunque conozcan su identificador. */
    for (const intruso of [entrenadorB, atletaB]) {
      await assert.rejects(
        () => messages.messages(conversacion, intruso.id),
        /No perteneces a esta conversación/,
      );
      await assert.rejects(
        () => messages.send(conversacion, intruso.id, 'Intento de intrusión'),
        /No perteneces a esta conversación/,
      );
    }

    /* Y tampoco aparece en su listado. `conversations` recibe el objeto del
       usuario, no su identificador. */
    const ajenas = await messages.conversations(entrenadorB);
    assert.ok(
      !ajenas.some((c) => c.id === conversacion),
      'la conversación ajena no debe aparecer en el listado',
    );
  });

  await t.test('terminar la vinculación corta el acceso del entrenador', async () => {
    await pool.query(
      "UPDATE trainer_athlete_links SET status = 'ended', ended_at = NOW() WHERE trainer_id = $1 AND athlete_id = $2",
      [entrenadorA.id, atletaA.id],
    );

    /* El entrenador deja de ver los datos en cuanto termina la relación. */
    await assert.rejects(
      () => tracking.listMeasurements(entrenadorA, atletaA.id),
      /no está vinculado contigo/,
    );

    /* Pero el atleta conserva su propio historial, que es la regla acordada
       desde el principio: los datos corporales son suyos. */
    assert.equal((await tracking.listMeasurements(atletaA, undefined)).length, 1);
  });
});
