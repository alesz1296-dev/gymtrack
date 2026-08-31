/* Aritmética y presentación de los macros de un plan, y la copia de un plan.
   Módulos puros: sin DOM, sin servidor y sin base de datos. */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  itemMacros,
  sumItems,
  dayMacros,
  formatQuantity,
  formatUnit,
  formatMacro,
  goalProgress,
} from '../public/js/comun/nutricion-macros.js';
import { planCopyDraft, copiedPlanName, emptyWeek } from '../public/js/comun/plan-copia.js';

/* Como llegan de la API: los NUMERIC de PostgreSQL vienen en texto. */
const pollo = {
  foodId: 'f1',
  name: 'Pechuga de pollo',
  quantity: '150.00',
  servingSize: '100.00',
  servingUnit: 'g',
  calories: '165.00',
  proteinG: '31.00',
  carbsG: '0.00',
  fatsG: '3.60',
  fiberG: null,
};

const huevo = {
  foodId: 'f2',
  name: 'Huevo entero',
  quantity: '3.00',
  servingSize: '1.00',
  servingUnit: 'unidad',
  calories: '72.00',
  proteinG: '6.30',
  carbsG: '0.40',
  fatsG: '4.80',
  fiberG: '0.00',
};

const libre = { foodId: null, quantity: null, freeText: 'Lo que sobró de ayer' };

test('los macros se escalan por la porción del propio alimento', () => {
  /* 150 g de algo medido por 100 g son 1,5 porciones. */
  const macros = itemMacros(pollo);
  assert.equal(macros.calories, 247.5);
  assert.equal(macros.proteinG, 46.5);
  assert.equal(macros.carbsG, 0);

  /* Y 3 unidades de algo medido por 1 unidad son 3 porciones. */
  assert.equal(itemMacros(huevo).calories, 216);
  assert.equal(itemMacros(huevo).proteinG, 18.9);
});

test('un macro sin dato queda nulo y no en cero', () => {
  /* La fibra del pollo es desconocida; la del huevo es cero de verdad. */
  assert.equal(itemMacros(pollo).fiberG, null);
  assert.equal(itemMacros(huevo).fiberG, 0);
});

test('un texto libre no tiene macros', () => {
  assert.equal(itemMacros(libre), null);
  assert.equal(itemMacros({ foodId: 'f1', quantity: null, servingSize: '100' }), null);
  /* Una porción de cero dividiría entre cero. */
  assert.equal(itemMacros({ foodId: 'f1', quantity: '10', servingSize: '0' }), null);
});

test('la suma avisa cuando está incompleta', () => {
  const completa = sumItems([huevo]);
  assert.equal(completa.calories, 216);
  assert.equal(completa.incomplete, false);

  /* El pollo no tiene fibra, así que el total es un mínimo y hay que decirlo:
     mostrar la suma con la misma seguridad en los dos casos sería mentir. */
  assert.equal(sumItems([pollo]).incomplete, true);

  /* Y un texto libre tampoco se puede contar. */
  const conLibre = sumItems([huevo, libre]);
  assert.equal(conLibre.calories, 216, 'lo conocido sí se suma');
  assert.equal(conLibre.incomplete, true);
});

test('la suma de un día recorre todas sus comidas', () => {
  const dia = {
    day_type: 'planned',
    meals: [{ items: [huevo] }, { items: [huevo, libre] }],
  };
  assert.equal(dayMacros(dia).calories, 432);
  assert.equal(dayMacros(dia).incomplete, true);

  /* Un día libre no suma nada, y eso no es estar incompleto: es que no hay
     nada planificado. */
  const dialibre = dayMacros({ day_type: 'free', meals: [] });
  assert.equal(dialibre.calories, 0);
  assert.equal(dialibre.incomplete, false);
});

test('las cantidades se escriben en la unidad del alimento', () => {
  assert.equal(formatQuantity(pollo), '150 g');
  assert.equal(formatQuantity(huevo), '3 unidades');
  assert.equal(formatQuantity({ ...huevo, quantity: '1.00' }), '1 unidad');
  assert.equal(formatQuantity(libre), '', 'el texto libre no lleva cantidad');
});

test('las unidades se pluralizan salvo gramos y mililitros', () => {
  assert.equal(formatUnit('g', 150), 'g');
  assert.equal(formatUnit('ml', 200), 'ml');
  assert.equal(formatUnit('porción', 2), 'porciones');
  assert.equal(formatUnit('rebanada', 2), 'rebanadas');
  assert.equal(formatUnit('taza', 1), 'taza');
});

test('un macro sin dato se muestra como raya', () => {
  assert.equal(formatMacro(null), '—');
  assert.equal(formatMacro(0), '0', 'cero sí es un dato');
  assert.equal(formatMacro(247.5), '248');
  assert.equal(formatMacro(46.53, 1), '46.5');
});

test('el avance sobre el objetivo solo existe si hay objetivo', () => {
  assert.equal(goalProgress(1200, 2400), 0.5);
  assert.equal(goalProgress(1200, null), null);
  assert.equal(goalProgress(1200, 0), null);
});

/* ---------- Copia de un plan ---------- */

const planGuardado = {
  name: 'Definición',
  athlete_id: 'a1',
  description: 'Fase 1',
  weeks: 4,
  calories: 2400,
  protein_g: 180,
  days: [
    {
      day_order: 1,
      name: 'Lunes',
      day_type: 'planned',
      mirrors_day_order: null,
      notes: 'Beber agua',
      meals: [{ name: 'Desayuno', details: '', items: [huevo, libre] }],
    },
    {
      day_order: 3,
      name: 'Miércoles',
      day_type: 'planned',
      mirrors_day_order: 1,
      meals: [{ name: 'Desayuno', items: [huevo] }],
    },
  ],
};

test('la copia conserva el plan completo en las franjas correctas', () => {
  const draft = planCopyDraft(planGuardado, new Date('2026-08-31T10:00:00'));

  assert.equal(draft.week.length, 7);
  assert.equal(draft.week[0].name, 'Lunes');
  assert.equal(draft.week[0].meals[0].items.length, 2);
  assert.equal(draft.week[0].notes, 'Beber agua');

  /* El día 2 no venía en el plan, así que queda como franja libre vacía. */
  assert.equal(draft.week[1].dayType, 'free');
  assert.equal(draft.week[1].meals.length, 0);

  assert.equal(draft.week[2].mirrorsDayOrder, 1, 'el día espejo conserva su referencia');

  /* Los objetivos diarios viajan con la copia. */
  assert.equal(draft.calories, 2400);
  assert.equal(draft.weeks, 4);

  /* Y empieza hoy, no cuando empezó el original: se está asignando ahora. */
  assert.equal(draft.startDate, '2026-08-31');
});

test('la copia conserva los datos del alimento para poder dibujarse sola', () => {
  const item = planCopyDraft(planGuardado).week[0].meals[0].items[0];
  assert.equal(item.foodId, 'f2');
  assert.equal(item.name, 'Huevo entero');
  assert.equal(item.servingUnit, 'unidad');
  assert.equal(item.calories, '72.00', 'los macros viajan para poder sumar sin la biblioteca');

  const textoLibre = planCopyDraft(planGuardado).week[0].meals[0].items[1];
  assert.equal(textoLibre.foodId, null);
  assert.equal(textoLibre.freeText, 'Lo que sobró de ayer');
});

test('el nombre de la copia respeta el límite y no acumula sufijos', () => {
  assert.equal(copiedPlanName('Definición'), 'Definición (copia)');
  assert.equal(copiedPlanName('Definición (copia)'), 'Definición (copia)');
  assert.ok(copiedPlanName('x'.repeat(200)).length <= 140);
});

test('una semana vacía nace con el primer día planificado', () => {
  const week = emptyWeek();
  assert.equal(week.length, 7);
  assert.equal(week[0].dayType, 'planned');
  assert.ok(week.slice(1).every((day) => day.dayType === 'free'));
});
