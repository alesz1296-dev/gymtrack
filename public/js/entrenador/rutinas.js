/* Rutinas del entrenador. La lista muestra un resumen de cada plan y, al
   pulsar "Ver rutina", se despliega debajo el detalle completo de sus días
   y ejercicios sin abandonar la pantalla. */

import { initNavigation } from '../comun/navigation.js';
import { api, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';
import { renderRoutineCompliance } from '../comun/cumplimiento.js';
import { icon } from '../comun/icons.js';

await initNavigation();

const list = document.querySelector('#routines');
const detail = document.querySelector('#detail');
const message = document.querySelector('#message');

/* Alterna entre las rutinas vigentes y las guardadas. Se declara aquí arriba
   porque el dibujado de cada tarjeta lo consulta para decidir si ofrece
   "Archivar" o "Restaurar". */
let viendoArchivadas = false;

/* Duración del plan en palabras. Cuatro semanas se leen mejor como un mes. */
function durationLabel(weeks) {
  const total = weeks || 1;
  if (total === 1) return '1 semana';
  if (total === 4) return '4 semanas (1 mes)';
  return `${total} semanas`;
}

/* ---------- Resumen de la lista ---------- */

function renderRoutineCard(routine) {
  /* Una rutina puede existir como plantilla, todavía sin atleta asignado. */
  const destinatario = routine.athlete_first_name
    ? `${escapeHtml(routine.athlete_first_name)} ${escapeHtml(routine.athlete_last_name)}`
    : 'Plantilla sin asignar';

  return `
    <article class="card">
      <div class="actions">
        <span class="badge">${escapeHtml(routine.status)}</span>
        <span class="badge neutral">${durationLabel(routine.weeks)}</span>
      </div>
      <h2>${escapeHtml(routine.name)}</h2>
      <p>${escapeHtml(routine.description || 'Sin descripción')}</p>
      <p><small>${destinatario}</small></p>
      <div class="actions">
        <button class="btn secondary small" data-view="${routine.id}">Ver rutina</button>
        <a class="btn small" href="rutina-formulario.html?id=${routine.id}">Modificar</a>
        <a class="btn secondary small" href="rutina-formulario.html?duplicar=${routine.id}">
          ${icon('copiar')}Duplicar
        </a>
        ${
          viendoArchivadas
            ? `<button class="btn secondary small" data-status="${routine.id}" data-to="active">
                 Restaurar
               </button>`
            : `<button class="btn secondary small" data-status="${routine.id}" data-to="archived">
                 ${icon('basura')}Archivar
               </button>`
        }
      </div>
    </article>`;
}

/* ---------- Detalle desplegable ---------- */

function renderExercise(exercise) {
  const descanso = exercise.restSeconds ?? '—';

  return `
          <div class="list-item">
            <strong>${escapeHtml(exercise.name)}</strong>
            <p>
              ${exercise.sets} series · ${escapeHtml(exercise.reps)} repeticiones ·
              descanso ${descanso} s
            </p>
          </div>`;
}

/* Etiqueta del día: libre, copia de otro día, o nada si es normal. */
function dayBadge(day) {
  if (day.day_type === 'rest') return '<span class="badge neutral">Día libre</span>';
  if (day.day_type === 'optional_rest')
    return '<span class="badge neutral">Día libre opcional</span>';
  if (day.mirrors_day_order != null)
    return `<span class="badge">Igual al Día ${day.mirrors_day_order}</span>`;
  return '';
}

function renderDay(day) {
  const notas = day.notes ? `<p>${escapeHtml(day.notes)}</p>` : '';
  const contenido = day.exercises.length
    ? `<div class="list">${day.exercises.map(renderExercise).join('')}</div>`
    : '';

  return `
      <section class="routine-day">
        <h3>Día ${day.day_order} · ${escapeHtml(day.name)} ${dayBadge(day)}</h3>
        ${notas}
        ${contenido}
      </section>`;
}

function renderRoutineDetail(routine, progress) {
  return `
    <article class="card">
      <header class="page-header">
        <div>
          <div class="actions">
            <span class="badge">${escapeHtml(routine.status)}</span>
            <span class="badge neutral">${durationLabel(routine.weeks)}</span>
          </div>
          <h2>${escapeHtml(routine.name)}</h2>
          <p>${escapeHtml(routine.description || 'Sin descripción')}</p>
        </div>
        <div class="actions">
          <a class="btn" href="rutina-formulario.html?id=${routine.id}">Modificar rutina</a>
          <a class="btn secondary" href="rutina-formulario.html?duplicar=${routine.id}">
            ${icon('copiar')}Duplicar
          </a>
        </div>
      </header>
      ${renderRoutineCompliance(routine, progress)}
      <h3 class="mt">La semana</h3>
      ${routine.days.map(renderDay).join('')}
    </article>`;
}

async function openRoutine(id) {
  try {
    /* El endpoint de progreso ya devuelve la rutina completa, así que con una
       sola petición se dibujan el detalle y el mapa de cumplimiento. */
    const { routine, progress } = await api(`/api/routines/${id}/progress`);
    detail.innerHTML = renderRoutineDetail(routine, progress);
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

/* ---------- Archivar y restaurar ---------- */

/* Se archiva en vez de borrar porque las sesiones de entrenamiento apuntan a
   los días de la rutina: eliminarla destruiría el historial del atleta. */
async function cambiarEstado(id, status) {
  try {
    await api(`/api/routines/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    detail.innerHTML = ''; // El detalle abierto puede ser el de la rutina movida.
    await cargar();
    showMessage(
      message,
      status === 'archived' ? 'Rutina archivada.' : 'Rutina restaurada.',
      'success',
    );
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
}

/* ---------- Carga de la lista ---------- */

async function cargar() {
  try {
    const { routines } = await api(`/api/routines?archived=${viendoArchivadas}`);

    const vacio = viendoArchivadas ? 'No tienes rutinas archivadas.' : 'Aún no has creado rutinas.';
    list.innerHTML = routines.length
      ? routines.map(renderRoutineCard).join('')
      : `<div class="empty">${vacio}</div>`;

    /* Los manejadores se vuelven a enlazar tras cada dibujado. */
    list.querySelectorAll('[data-view]').forEach((button) => {
      button.onclick = () => openRoutine(button.dataset.view);
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
  viendoArchivadas = !viendoArchivadas;
  toggle.textContent = viendoArchivadas ? 'Ver rutinas activas' : 'Ver archivadas';
  detail.innerHTML = '';
  await cargar();
};

await cargar();
