/* Plan de alimentación del atleta, con registro comida por comida.

   La pantalla abre en la semana y el día que tocan hoy, que es para lo que se
   entra. Marcar una comida es la acción más frecuente de toda la aplicación
   —entre tres y seis veces al día, todos los días— así que el caso normal es
   **un solo toque** sobre "Hecho", sin escribir nada. Los otros dos estados
   están al lado para quien quiera ser honesto sin que le cueste más.

   La semana y el día de hoy los calcula el servidor y no este módulo, para
   que no dependan del reloj del teléfono. */

import { initNavigation } from '../comun/navigation.js';
import { api, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';
import { icon } from '../comun/icons.js';
import { renderPlanDay, renderGoals, durationLabel } from '../comun/plan-detalle.js';
import { dayMacros, formatMacro } from '../comun/nutricion-macros.js';

await initNavigation();

const container = document.querySelector('#plans');
const message = document.querySelector('#message');

/* Estado por plan: qué día y qué semana se está mirando, el registro abierto
   y lo que ya está marcado. Un atleta puede tener más de un plan activo. */
const estado = new Map();

const ESTADOS = [
  { value: 'done', label: 'Hecho', icon: 'chequeo' },
  { value: 'swapped', label: 'Cambié algo', icon: 'copiar' },
  { value: 'skipped', label: 'No la hice', icon: 'cerrar' },
];

const etiqueta = (status) => ESTADOS.find((item) => item.value === status)?.label ?? '';

function planState(plan) {
  if (!estado.has(plan.id))
    estado.set(plan.id, {
      week: plan.currentWeek,
      day: plan.currentDay,
      dayLogId: null,
      /* mealId -> { status, notes } */
      logs: new Map(),
      total: 0,
      hecho: 0,
      completado: false,
    });
  return estado.get(plan.id);
}

/* ---------- Tira de días ---------- */

function dayBadge(day) {
  if (day.day_type === 'free') return { icon: 'luna', text: 'Libre' };
  if (day.mirrors_day_order != null)
    return { icon: 'copiar', text: `Igual al Día ${day.mirrors_day_order}` };
  return { icon: 'nutricion', text: `${formatMacro(dayMacros(day).calories)} kcal` };
}

function renderTabs(plan, state) {
  return `
    <div class="day-tabs" role="tablist" aria-label="Días de la semana">
      ${plan.days
        .map((day) => {
          const order = day.day_order;
          const badge = dayBadge(day);
          const esHoy = order === plan.currentDay && state.week === plan.currentWeek;
          const classes = [
            'day-tab',
            order === state.day ? 'active' : '',
            day.day_type === 'free' ? 'is-rest' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return `
        <button
          type="button"
          class="${classes}"
          role="tab"
          aria-selected="${order === state.day}"
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

/* ---------- Selector de semana ---------- */

function renderWeekNav(plan, state) {
  const total = plan.weeks || 1;
  if (total === 1) return '';

  return `
    <div class="week-nav">
      <button type="button" class="icon-btn" data-plan="${plan.id}" data-week="${state.week - 1}"
        ${state.week <= 1 ? 'disabled' : ''} aria-label="Semana anterior">${icon('anterior')}</button>
      <span>Semana ${state.week} de ${total}${state.week === plan.currentWeek ? ' · en curso' : ''}</span>
      <button type="button" class="icon-btn" data-plan="${plan.id}" data-week="${state.week + 1}"
        ${state.week >= total ? 'disabled' : ''} aria-label="Semana siguiente">${icon('siguiente')}</button>
    </div>`;
}

/* ---------- Controles de cada comida ---------- */

/* Lo que se le cuelga a cada comida: su estado actual y los tres botones.
   El módulo compartido no sabe nada de registro; solo llama a esto. */
function decorateMeal(plan, state) {
  return (meal) => {
    const log = state.logs.get(meal.id);

    const badge = log
      ? `<div><span class="badge${log.status === 'done' ? '' : ' warn'}">${etiqueta(log.status)}</span></div>`
      : '';

    const nota =
      log?.status === 'swapped'
        ? `
        <div class="field mt">
          <label class="sr-only" for="nota-${meal.id}">¿Qué cambiaste?</label>
          <input id="nota-${meal.id}" data-note="${meal.id}" data-plan="${plan.id}"
            maxlength="500" placeholder="¿Qué comiste en su lugar?"
            value="${escapeHtml(log.notes || '')}">
        </div>`
        : '';

    const botones = ESTADOS.map(
      (item) => `
        <button type="button"
          class="btn ${log?.status === item.value ? '' : 'secondary'} small"
          data-mark="${meal.id}" data-plan="${plan.id}" data-status="${item.value}"
          aria-pressed="${log?.status === item.value}"
        >${icon(item.icon)}${item.label}</button>`,
    ).join('');

    const deshacer = log
      ? `<button type="button" class="btn ghost small" data-unmark="${meal.id}" data-plan="${plan.id}">
           ${icon('deshacer')}Quitar
         </button>`
      : '';

    return {
      badge,
      footer: `<div class="actions meal-actions">${botones}${deshacer}</div>${nota}`,
    };
  };
}

/* ---------- Tarjeta del plan ---------- */

function renderPlanCard(plan) {
  const state = planState(plan);
  const day = plan.days.find((item) => item.day_order === state.day) ?? plan.days[0];

  const avance = state.total ? `${state.hecho} de ${state.total} comidas` : 'Día libre';

  const cabecera = `
    <div class="day-progress${state.completado ? ' is-done' : ''}">
      <span>${state.completado ? '✓ Día completado' : avance}</span>
    </div>`;

  return `
    <article class="card" data-plan-card="${plan.id}">
      <div class="actions">
        <span class="badge">Plan activo</span>
        <span class="badge neutral">${durationLabel(plan.weeks)}</span>
      </div>
      <h2>${escapeHtml(plan.name)}</h2>
      ${plan.description ? `<p>${escapeHtml(plan.description)}</p>` : ''}
      ${renderGoals(plan)}
      <h3 class="mt">Tu semana</h3>
      ${renderWeekNav(plan, state)}
      ${renderTabs(plan, state)}
      ${
        day
          ? renderPlanDay(day, {
              dayHeader: cabecera,
              decorateMeal: decorateMeal(plan, state),
            })
          : '<div class="empty">Este plan no tiene días.</div>'
      }
    </article>`;
}

/* ---------- Sincronización con el servidor ---------- */

/* Guarda en el estado lo que acaba de responder el servidor. El recuento y el
   cierre del día los decide él, no esta pantalla: si los calculara por su
   cuenta, dos pestañas abiertas mostrarían cosas distintas. */
function applyResult(state, result) {
  state.dayLogId = result.dayLog.id;
  state.total = result.totalMeals;
  state.hecho = result.loggedMeals;
  state.completado = Boolean(result.dayLog.completed_at);
  if (result.logged) state.logs = new Map(result.logged.map((item) => [item.mealId, item]));
}

/* Abre el día seleccionado y trae lo que ya estuviera marcado. */
async function openDay(plan) {
  const state = planState(plan);
  const day = plan.days.find((item) => item.day_order === state.day);
  if (!day) return;

  try {
    const result = await api('/api/nutrition/logs', {
      method: 'POST',
      body: JSON.stringify({ nutritionDayId: day.id, weekNumber: state.week }),
    });
    applyResult(state, result);
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

async function markMeal(plan, mealId, status) {
  const state = planState(plan);
  if (!state.dayLogId) await openDay(plan);

  /* La nota escrita se conserva al cambiar de estado dentro de la misma
     comida: quien escribió qué comió no debería perderlo por tocar un botón. */
  const previa = state.logs.get(mealId);
  const notes = status === 'swapped' ? (previa?.notes ?? '') : '';

  try {
    const result = await api(`/api/nutrition/logs/${state.dayLogId}/meals/${mealId}`, {
      method: 'PUT',
      body: JSON.stringify({ status, notes }),
    });
    applyResult(state, result);
    state.logs.set(mealId, { mealId, status, notes });
    render();
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

async function unmarkMeal(plan, mealId) {
  const state = planState(plan);
  try {
    const result = await api(`/api/nutrition/logs/${state.dayLogId}/meals/${mealId}`, {
      method: 'DELETE',
    });
    applyResult(state, result);
    state.logs.delete(mealId);
    render();
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

/* La nota se guarda al salir del campo y no en cada tecla: son peticiones a
   la red y escribir "cambié el pollo por atún" dispararía treinta. */
async function saveNote(plan, mealId, notes) {
  const state = planState(plan);
  const log = state.logs.get(mealId);
  if (!log || log.notes === notes) return;

  try {
    await api(`/api/nutrition/logs/${state.dayLogId}/meals/${mealId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: log.status, notes }),
    });
    log.notes = notes;
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

/* ---------- Dibujado ---------- */

let planes = [];

function bind() {
  const buscar = (id) => planes.find((plan) => plan.id === id);

  container.querySelectorAll('[data-day]').forEach((button) => {
    button.onclick = async () => {
      const plan = buscar(button.dataset.plan);
      planState(plan).day = Number(button.dataset.day);
      await openDay(plan);
      render();
      volverALaTarjeta(plan.id);
    };
  });

  container.querySelectorAll('[data-week]').forEach((button) => {
    button.onclick = async () => {
      const plan = buscar(button.dataset.plan);
      planState(plan).week = Number(button.dataset.week);
      await openDay(plan);
      render();
      volverALaTarjeta(plan.id);
    };
  });

  container.querySelectorAll('[data-mark]').forEach((button) => {
    button.onclick = () =>
      markMeal(buscar(button.dataset.plan), button.dataset.mark, button.dataset.status);
  });

  container.querySelectorAll('[data-unmark]').forEach((button) => {
    button.onclick = () => unmarkMeal(buscar(button.dataset.plan), button.dataset.unmark);
  });

  container.querySelectorAll('[data-note]').forEach((input) => {
    input.onchange = () => saveNote(buscar(input.dataset.plan), input.dataset.note, input.value);
  });
}

/* Con dos planes abiertos, redibujar sin esto dejaría al atleta arriba del
   todo cada vez que marca una comida. */
function volverALaTarjeta(planId) {
  container
    .querySelector(`[data-plan-card="${planId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function render() {
  container.innerHTML = planes.length
    ? planes.map(renderPlanCard).join('')
    : '<div class="empty">No tienes un plan de alimentación activo.</div>';
  bind();
}

/* ---------- Carga inicial ---------- */

try {
  /* El listado no trae los días, así que se pide cada plan completo. Un atleta
     tiene uno o dos planes activos, no cien. */
  const { plans } = await api('/api/nutrition/plans');
  planes = await Promise.all(
    plans.map(async (plan) => (await api(`/api/nutrition/plans/${plan.id}`)).plan),
  );

  /* Se abre el día de hoy de cada plan antes del primer dibujado, para que la
     pantalla aparezca ya con lo que estuviera marcado y no en blanco. */
  await Promise.all(planes.map(openDay));
  render();
} catch (error) {
  container.innerHTML = '';
  showMessage(message, error.message, 'error');
}
