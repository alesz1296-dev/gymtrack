/* Dibujado de la semana de un plan de alimentación.

   Lo usan la lista del entrenador, la pantalla del atleta y la ficha
   individual. Se extrajo a un módulo compartido en cuanto fue el segundo
   sitio que lo necesitaba: tres copias de ochenta líneas se separan solas con
   el tiempo, como ya pasó con el mapa de cumplimiento de las rutinas.

   Todo lo que aquí se interpola viene del entrenador, así que se escapa. */

import { escapeHtml } from './dom.js';
import {
  dayMacros,
  mealMacros,
  itemMacros,
  formatMacro,
  formatQuantity,
} from './nutricion-macros.js';

/* Duración del plan en palabras. Cuatro semanas se leen mejor como un mes. */
export function durationLabel(weeks) {
  const total = weeks || 1;
  if (total === 1) return '1 semana';
  if (total === 4) return '4 semanas (1 mes)';
  return `${total} semanas`;
}

/* Una línea de macros. Se usa igual para un renglón, una comida y un día, así
   que el formato no puede divergir entre los tres niveles. */
export function macroLine(macros, { withFiber = false } = {}) {
  const partes = [
    `${formatMacro(macros.calories)} kcal`,
    `P ${formatMacro(macros.proteinG)} g`,
    `C ${formatMacro(macros.carbsG)} g`,
    `G ${formatMacro(macros.fatsG)} g`,
  ];
  if (withFiber) partes.push(`F ${formatMacro(macros.fiberG)} g`);
  return partes.join(' · ');
}

function renderItem(item) {
  /* Un texto libre no tiene macros y no debe fingir que los tiene. */
  if (!item.foodId)
    return `
        <li class="plan-item">
          <span class="plan-item-name">${escapeHtml(item.freeText || '')}</span>
          <span class="plan-item-macros muted">libre</span>
        </li>`;

  const macros = itemMacros(item);
  const inactivo = item.isActive === false ? ' <span class="badge neutral">desactivado</span>' : '';

  return `
        <li class="plan-item">
          <span class="plan-item-name">
            ${escapeHtml(item.name || 'Alimento')}${inactivo}
            <small class="muted">${escapeHtml(formatQuantity(item))}</small>
          </span>
          <span class="plan-item-macros muted">
            ${macros ? macroLine(macros) : 'sin datos'}
          </span>
        </li>`;
}

/* `decorate` deja que la pantalla del atleta añada su estado y sus botones sin
   que este módulo aprenda nada del registro: recibe la comida y devuelve
   `{ badge, footer }`, los dos opcionales. La pantalla del entrenador no lo
   pasa y obtiene la misma vista de lectura de siempre. */
function renderMeal(meal, decorate) {
  const macros = mealMacros(meal);
  const nota = meal.details ? `<p class="muted">${escapeHtml(meal.details)}</p>` : '';
  const extra = decorate?.(meal) ?? {};

  return `
      <article class="plan-meal">
        <div class="plan-meal-head">
          <strong>${escapeHtml(meal.name || 'Comida')}</strong>
          <span class="muted">${macroLine(macros)}</span>
        </div>
        ${extra.badge ?? ''}
        ${
          meal.items.length
            ? `<ul class="plan-items">${meal.items.map(renderItem).join('')}</ul>`
            : ''
        }
        ${nota}
        ${extra.footer ?? ''}
      </article>`;
}

/* Etiqueta del día: libre, copia de otro día, o nada si es normal. */
function dayBadge(day) {
  if (day.day_type === 'free') return '<span class="badge neutral">Día libre</span>';
  if (day.mirrors_day_order != null)
    return `<span class="badge">Igual al Día ${day.mirrors_day_order}</span>`;
  return '';
}

export function renderPlanDay(day, options = {}) {
  const { decorateMeal, dayHeader = '', dayFooter = '' } = options;
  const macros = dayMacros(day);
  const notas = day.notes ? `<p class="muted">${escapeHtml(day.notes)}</p>` : '';

  /* Un día libre se dice, no se deja en blanco: un hueco parecería un plan
     que no cargó. */
  if (day.day_type === 'free')
    return `
      <section class="plan-day is-free">
        <h3>Día ${day.day_order} · ${escapeHtml(day.name)} ${dayBadge(day)}</h3>
        <p class="muted">Sin plan de comidas asignado.</p>
        ${notas}
        ${dayFooter}
      </section>`;

  const aviso = macros.incomplete
    ? '<small class="muted">Hay renglones sin datos nutricionales, así que el total es un mínimo.</small>'
    : '';

  return `
      <section class="plan-day">
        <h3>Día ${day.day_order} · ${escapeHtml(day.name)} ${dayBadge(day)}</h3>
        ${dayHeader}
        ${notas}
        <div class="plan-meals">${day.meals.map((meal) => renderMeal(meal, decorateMeal)).join('')}</div>
        <p class="day-total">
          <strong>Total del día</strong>
          <span>${macroLine(macros, { withFiber: true })}</span>
          ${aviso}
        </p>
        ${dayFooter}
      </section>`;
}

export function renderPlanWeek(plan, options = {}) {
  if (!plan.days?.length) return '<div class="empty">Este plan no tiene días.</div>';
  return plan.days.map((day) => renderPlanDay(day, options)).join('');
}

/* Los objetivos diarios del plan, cuando el entrenador los definió. Son la
   meta, independientes de lo que sumen las comidas. */
export function renderGoals(plan) {
  const objetivos = [
    ['Calorías', plan.calories, 'kcal'],
    ['Proteína', plan.protein_g, 'g'],
    ['Carbohidratos', plan.carbs_g, 'g'],
    ['Grasas', plan.fats_g, 'g'],
    ['Fibra', plan.fiber_g, 'g'],
    ['Agua', plan.water_ml, 'ml'],
  ].filter(([, value]) => value !== null && value !== undefined);

  if (!objetivos.length) return '';

  return `
    <div class="grid three mt">
      ${objetivos
        .map(
          ([label, value, unit]) => `
        <div>
          <strong>${formatMacro(value, 1)} ${unit}</strong><br>
          <small class="muted">${label}</small>
        </div>`,
        )
        .join('')}
    </div>`;
}
