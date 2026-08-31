/* Reglas de la semana de un plan de alimentación.

   Viven en el esquema de validación de la ruta, no en el servicio, así que se
   prueban contra el esquema directamente. Sin servidor ni base de datos.

   Esto salió de un error propio: la primera versión de estas comprobaciones
   llamaba al servicio, que **no pasa por la validación**, así que un plan
   inválido llegaba hasta PostgreSQL y fallaba por una restricción de la tabla
   en lugar de por la regla que se quería comprobar. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { planInput } from '../src/routes/nutrition.routes.js';

const ATLETA = '11111111-1111-4111-8111-111111111111';
const ALIMENTO = '22222222-2222-4222-8222-222222222222';

const comida = () => ({ name: 'Desayuno', items: [{ foodId: ALIMENTO, quantity: 150 }] });

/* Siete franjas: libres salvo las que cada caso defina. */
const semana = (definidos = {}) =>
  Array.from({ length: 7 }, (_, index) => {
    const order = index + 1;
    return definidos[order] ?? { name: `Día ${order}`, dayType: 'free', meals: [] };
  });

const plan = (days) => ({ athleteId: ATLETA, name: 'Plan de prueba', weeks: 1, days });

/* Devuelve los mensajes de error, o un arreglo vacío si el plan es válido. */
function errores(entrada) {
  const resultado = planInput.safeParse(entrada);
  return resultado.success ? [] : resultado.error.issues.map((issue) => issue.message);
}

test('un plan bien formado se acepta y recibe sus valores por defecto', () => {
  const resultado = planInput.safeParse(
    plan(semana({ 1: { name: 'Lunes', dayType: 'planned', meals: [comida()] } })),
  );

  assert.ok(resultado.success, JSON.stringify(errores(plan(semana()))));
  assert.equal(resultado.data.status, 'active', 'un plan nuevo nace activo');
  assert.equal(resultado.data.weeks, 1);
});

test('un día libre no puede tener comidas', () => {
  const mensajes = errores(
    plan(semana({ 1: { name: 'Lunes', dayType: 'free', meals: [comida()] } })),
  );
  assert.ok(
    mensajes.some((m) => /día libre no puede tener comidas/.test(m)),
    mensajes.join(' | '),
  );
});

test('un día con plan necesita al menos una comida', () => {
  const mensajes = errores(plan(semana({ 1: { name: 'Lunes', dayType: 'planned', meals: [] } })));
  assert.ok(
    mensajes.some((m) => /necesita al menos una comida/.test(m)),
    mensajes.join(' | '),
  );
});

test('una comida necesita renglones o una descripción', () => {
  /* Con descripción y sin renglones es válido: es el texto libre que se
     conservó a propósito para quien prefiera escribir el menú a mano. */
  const soloTexto = plan(
    semana({
      1: {
        name: 'Lunes',
        dayType: 'planned',
        meals: [{ name: 'Comida', details: 'Lo de siempre, sin pesar nada.', items: [] }],
      },
    }),
  );
  assert.deepEqual(errores(soloTexto), []);

  const vacia = plan(
    semana({ 1: { name: 'Lunes', dayType: 'planned', meals: [{ name: 'Comida', items: [] }] } }),
  );
  assert.ok(errores(vacia).some((m) => /al menos un alimento o una descripción/.test(m)));
});

test('un renglón es un alimento con cantidad o un texto libre, nunca ambos', () => {
  const caso = (items) =>
    errores(
      plan(semana({ 1: { name: 'Lunes', dayType: 'planned', meals: [{ name: 'C', items }] } })),
    );

  assert.deepEqual(caso([{ foodId: ALIMENTO, quantity: 100 }]), [], 'alimento con cantidad');
  assert.deepEqual(caso([{ freeText: 'Una manzana' }]), [], 'texto libre');

  assert.ok(caso([{ foodId: ALIMENTO }]).length, 'un alimento sin cantidad no vale');
  assert.ok(caso([{ quantity: 100 }]).length, 'una cantidad sin alimento no vale');
  assert.ok(
    caso([{ foodId: ALIMENTO, quantity: 100, freeText: 'y además texto' }]).length,
    'las dos cosas a la vez no valen',
  );
  assert.ok(caso([{}]).length, 'un renglón vacío no vale');
});

test('un día solo puede repetir un día anterior', () => {
  const alFuturo = plan(
    semana({
      1: { name: 'Lunes', dayType: 'planned', mirrorsDayOrder: 5, meals: [] },
      5: { name: 'Viernes', dayType: 'planned', meals: [comida()] },
    }),
  );
  assert.ok(errores(alFuturo).some((m) => /repetir un día anterior/.test(m)));

  const aSiMismo = plan(
    semana({ 3: { name: 'Miércoles', dayType: 'planned', mirrorsDayOrder: 3, meals: [] } }),
  );
  assert.ok(errores(aSiMismo).some((m) => /repetir un día anterior/.test(m)));
});

test('no se puede repetir un día libre', () => {
  const mensajes = errores(
    plan(
      semana({
        1: { name: 'Lunes', dayType: 'free', meals: [] },
        2: { name: 'Martes', dayType: 'planned', mirrorsDayOrder: 1, meals: [] },
      }),
    ),
  );
  assert.ok(
    mensajes.some((m) => /No se puede repetir un día libre/.test(m)),
    mensajes.join(' | '),
  );
});

test('un día espejo válido no necesita enviar comidas', () => {
  /* El servidor copia las del día repetido, así que la lista llega vacía a
     propósito y eso no puede tomarse por un día sin comidas. */
  const valido = plan(
    semana({
      1: { name: 'Lunes', dayType: 'planned', meals: [comida()] },
      3: { name: 'Miércoles', dayType: 'planned', mirrorsDayOrder: 1, meals: [] },
    }),
  );
  assert.deepEqual(errores(valido), []);
});

test('la semana no puede tener más de siete días', () => {
  assert.ok(errores(plan([...semana(), { name: 'Día 8', dayType: 'free', meals: [] }])).length);
});
