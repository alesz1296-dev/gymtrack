/* Plan de alimentación del atleta.

   La pantalla abre en el día que toca hoy, que es para lo que se entra: ver
   qué hay que comer. El resto de la semana está a un toque, en la misma tira
   de días que usa la pantalla de rutinas.

   El día de hoy lo calcula el servidor y no este módulo, para que no dependa
   del reloj del teléfono. */

import { initNavigation } from '../comun/navigation.js';
import { api, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';
import { icon } from '../comun/icons.js';
import { renderPlanDay, renderGoals, durationLabel } from '../comun/plan-detalle.js';
import { dayMacros, formatMacro } from '../comun/nutricion-macros.js';

await initNavigation();

const container = document.querySelector('#plans');
const message = document.querySelector('#message');

/* Plan abierto y día seleccionado dentro de él. Un atleta puede tener más de
   un plan activo, así que el estado se guarda por plan. */
const seleccion = new Map();

function dayBadge(day) {
  if (day.day_type === 'free') return { icon: 'luna', text: 'Libre' };
  if (day.mirrors_day_order != null)
    return { icon: 'copiar', text: `Igual al Día ${day.mirrors_day_order}` };

  const macros = dayMacros(day);
  return { icon: 'nutricion', text: `${formatMacro(macros.calories)} kcal` };
}

function renderTabs(plan, selected) {
  return `
    <div class="day-tabs" role="tablist" aria-label="Días de la semana">
      ${plan.days
        .map((day) => {
          const order = day.day_order;
          const badge = dayBadge(day);
          const esHoy = order === plan.currentDay;
          const classes = [
            'day-tab',
            order === selected ? 'active' : '',
            day.day_type === 'free' ? 'is-rest' : '',
          ]
            .filter(Boolean)
            .join(' ');

          /* La línea de estado se oculta en móvil, así que "hoy" y el estado
             completo van también en `aria-label`. */
          return `
        <button
          type="button"
          class="${classes}"
          role="tab"
          aria-selected="${order === selected}"
          aria-label="Día ${order}${esHoy ? ', hoy' : ''}: ${escapeHtml(badge.text)}"
          data-plan="${plan.id}"
          data-day="${order}"
        >
          <span class="day-tab-icon">${icon(badge.icon)}</span>
          <strong
            ><span class="day-tab-short" aria-hidden="true">D</span
            ><span class="day-tab-word">Día </span>${order}</strong
          >
          <small>${esHoy ? 'Hoy' : escapeHtml(badge.text)}</small>
        </button>`;
        })
        .join('')}
    </div>`;
}

function renderPlanCard(plan) {
  const selected = seleccion.get(plan.id) ?? plan.currentDay;
  const day = plan.days.find((item) => item.day_order === selected) ?? plan.days[0];

  const semana =
    (plan.weeks || 1) > 1
      ? `<span class="badge neutral">Semana ${plan.currentWeek} de ${plan.weeks}</span>`
      : '';

  return `
    <article class="card" data-plan-card="${plan.id}">
      <div class="actions">
        <span class="badge">Plan activo</span>
        <span class="badge neutral">${durationLabel(plan.weeks)}</span>
        ${semana}
      </div>
      <h2>${escapeHtml(plan.name)}</h2>
      ${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ''}
      ${renderGoals(plan)}
      <h3 class="mt">Tu semana</h3>
      ${renderTabs(plan, selected)}
      ${day ? renderPlanDay(day) : '<div class="empty">Este plan no tiene días.</div>'}
    </article>`;
}

function render(plans) {
  container.innerHTML = plans.length
    ? plans.map(renderPlanCard).join('')
    : '<div class="empty">No tienes un plan de alimentación activo.</div>';

  /* Los manejadores se vuelven a enlazar tras cada dibujado, porque al
     reemplazar el HTML desaparecen los botones anteriores con los suyos. */
  container.querySelectorAll('[data-day]').forEach((button) => {
    button.onclick = () => {
      seleccion.set(button.dataset.plan, Number(button.dataset.day));
      render(plans);
      /* Se vuelve a la tarjeta que se estaba mirando: con dos planes abiertos,
         redibujar sin esto dejaría al atleta arriba del todo. */
      container
        .querySelector(`[data-plan-card="${button.dataset.plan}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  });
}

try {
  /* El listado no trae los días, así que se pide cada plan completo. Un atleta
     tiene uno o dos planes activos, no cien. */
  const { plans } = await api('/api/nutrition/plans');
  const completos = await Promise.all(
    plans.map(async (plan) => (await api(`/api/nutrition/plans/${plan.id}`)).plan),
  );
  render(completos);
} catch (error) {
  container.innerHTML = '';
  showMessage(message, error.message, 'error');
}
