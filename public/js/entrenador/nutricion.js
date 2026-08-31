/* Planes de nutrición del entrenador. La lista muestra un resumen de cada
   plan y, al pulsar "Ver plan", se despliega debajo la semana completa con
   sus comidas y totales sin abandonar la pantalla.

   Es la misma estructura que la pantalla de rutinas, a propósito: son la
   misma tarea del entrenador y no tienen por qué funcionar distinto. */

import { initNavigation } from '../comun/navigation.js';
import { api, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';
import { icon } from '../comun/icons.js';
import { renderPlanWeek, renderGoals, durationLabel } from '../comun/plan-detalle.js';
import { renderNutritionCompliance } from '../comun/cumplimiento.js';

await initNavigation();

const list = document.querySelector('#plans');
const detail = document.querySelector('#detail');
const message = document.querySelector('#message');

/* Alterna entre los planes vigentes y los guardados. Se declara aquí arriba
   porque el dibujado de cada tarjeta lo consulta para decidir si ofrece
   "Archivar" o "Restaurar". */
let viendoArchivados = false;

/* ---------- Resumen de la lista ---------- */

function renderPlanCard(plan) {
  const destinatario = plan.athlete_first_name
    ? `${escapeHtml(plan.athlete_first_name)} ${escapeHtml(plan.athlete_last_name)}`
    : 'Sin asignar';

  const dias = plan.planned_days ?? 0;

  return `
    <article class="card">
      <div class="actions">
        <span class="badge">${escapeHtml(plan.status)}</span>
        <span class="badge neutral">${durationLabel(plan.weeks)}</span>
      </div>
      <h2>${escapeHtml(plan.name)}</h2>
      <p>${escapeHtml(plan.description || 'Sin descripción')}</p>
      <p><small>${destinatario} · ${dias} día${dias === 1 ? '' : 's'} con plan</small></p>
      <div class="actions">
        <button class="btn secondary small" data-view="${plan.id}">Ver plan</button>
        <a class="btn small" href="nutricion-formulario.html?id=${plan.id}">Modificar</a>
        <a class="btn secondary small" href="nutricion-formulario.html?duplicar=${plan.id}">
          ${icon('copiar')}Duplicar
        </a>
        ${
          viendoArchivados
            ? `<button class="btn secondary small" data-status="${plan.id}" data-to="active">
                 Restaurar
               </button>`
            : `<button class="btn secondary small" data-status="${plan.id}" data-to="archived">
                 ${icon('basura')}Archivar
               </button>`
        }
      </div>
    </article>`;
}

/* ---------- Detalle desplegable ---------- */

function renderPlanDetail(plan, progress) {
  return `
    <article class="card">
      <header class="page-header">
        <div>
          <div class="actions">
            <span class="badge">${escapeHtml(plan.status)}</span>
            <span class="badge neutral">${durationLabel(plan.weeks)}</span>
            <span class="badge neutral">Semana ${plan.currentWeek} de ${plan.weeks || 1}</span>
          </div>
          <h2>${escapeHtml(plan.name)}</h2>
          <p>${escapeHtml(plan.description || 'Sin descripción')}</p>
        </div>
        <div class="actions">
          <a class="btn" href="nutricion-formulario.html?id=${plan.id}">Modificar plan</a>
          <a class="btn secondary" href="nutricion-formulario.html?duplicar=${plan.id}">
            ${icon('copiar')}Duplicar
          </a>
        </div>
      </header>
      ${renderGoals(plan)}
      ${renderNutritionCompliance(plan, progress)}
      <h3 class="mt">La semana</h3>
      ${renderPlanWeek(plan)}
    </article>`;
}

async function openPlan(id) {
  try {
    /* El endpoint de progreso ya devuelve el plan completo además de la
       cuadrícula, así que basta una petición para pintar todo el bloque. */
    const { plan, progress } = await api(`/api/nutrition/plans/${id}/progress`);
    detail.innerHTML = renderPlanDetail(plan, progress);
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

/* ---------- Archivar y restaurar ---------- */

/* Se archiva en vez de borrar: el atleta registrará su cumplimiento sobre
   estos planes, y eliminarlos destruiría ese historial. */
async function cambiarEstado(id, status) {
  try {
    await api(`/api/nutrition/plans/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    detail.innerHTML = ''; // El detalle abierto puede ser el del plan movido.
    await cargar();
    showMessage(message, status === 'archived' ? 'Plan archivado.' : 'Plan restaurado.', 'success');
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

/* ---------- Carga de la lista ---------- */

async function cargar() {
  try {
    const { plans } = await api(`/api/nutrition/plans?archived=${viendoArchivados}`);

    const vacio = viendoArchivados
      ? 'No tienes planes archivados.'
      : 'Aún no has creado planes de alimentación.';
    list.innerHTML = plans.length
      ? plans.map(renderPlanCard).join('')
      : `<div class="empty">${vacio}</div>`;

    /* Los manejadores se vuelven a enlazar tras cada dibujado. */
    list.querySelectorAll('[data-view]').forEach((button) => {
      button.onclick = () => openPlan(button.dataset.view);
    });
    list.querySelectorAll('[data-status]').forEach((button) => {
      button.onclick = () => cambiarEstado(button.dataset.status, button.dataset.to);
    });
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

const toggle = document.querySelector('#toggle-archived');
toggle.onclick = async () => {
  viendoArchivados = !viendoArchivados;
  toggle.textContent = viendoArchivados ? 'Ver planes activos' : 'Ver archivados';
  detail.innerHTML = '';
  await cargar();
};

await cargar();
