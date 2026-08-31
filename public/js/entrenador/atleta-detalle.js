/* Ficha individual del atleta.

   Hasta ahora la información del entrenador estaba organizada por función
   —rutinas por un lado, check-ins por otro, nutrición por otro—, así que para
   responder «¿cómo va Andrés?» había que recorrer cuatro pantallas y filtrar
   mentalmente. Esta pantalla la reordena por persona.

   No necesita nada nuevo del servidor: reúne endpoints que ya existían. Los
   listados de check-ins y nutrición devuelven todo lo del entrenador, así que
   se filtran aquí por atleta. Es una vista de conjunto que enlaza a las
   pantallas completas para las acciones que ya viven allí; lo único que se
   hace desde aquí es registrar mediciones, que era justo lo que faltaba. */

import { initNavigation } from '../comun/navigation.js';
import { api, formData, showMessage } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';
import { icon } from '../comun/icons.js';
import { renderCompliance } from '../comun/cumplimiento.js';
import { renderMeasurementCharts, measurementSummary, METRICS } from '../comun/mediciones.js';
import { durationLabel } from '../comun/plan-detalle.js';

await initNavigation();

const athleteId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#message');
const content = document.querySelector('#content');

const formatDate = (value) => new Date(value).toLocaleDateString();
const toNumber = (value) => (value === '' ? null : Number(value));

/* ---------- Resumen superior ---------- */

function statCard(label, value, iconName) {
  return `
    <article class="card stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <span class="stat-icon">${icon(iconName)}</span>
    </article>`;
}

function renderSummary(compliance, measurements, checkins) {
  const semana = compliance?.routine
    ? `${compliance.routine.completedDays} de ${compliance.routine.trainingDays} días`
    : 'Sin rutina';

  const peso =
    measurements.length && measurements[0].weight_kg ? `${measurements[0].weight_kg} kg` : '—';

  const pendientes = checkins.filter((item) => !item.reviewed_at).length;

  document.querySelector('#summary').innerHTML =
    statCard('Esta semana', semana, 'rutinas') +
    statCard('Último peso', peso, 'progreso') +
    statCard('Check-ins sin responder', pendientes, 'checkins');
}

/* ---------- Rutina y cumplimiento ---------- */

async function renderRoutine(routine) {
  const container = document.querySelector('#routine');

  if (!routine) {
    container.innerHTML = `
      <div class="empty">
        Este atleta todavía no tiene una rutina activa.
        <div class="actions mt"><a class="btn small" href="rutina-formulario.html">Crear una rutina</a></div>
      </div>`;
    return;
  }

  /* El endpoint de progreso ya devuelve la rutina completa además de la
     cuadrícula, así que basta una petición para pintar todo el bloque. */
  const { routine: full, progress } = await api(`/api/routines/${routine.id}/progress`);
  const semanas = (full.weeks || 1) === 1 ? '1 semana' : `${full.weeks} semanas`;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h3>${escapeHtml(full.name)}</h3>
        <p class="muted">${semanas} · va por la semana ${full.currentWeek}</p>
      </div>
      <a class="btn secondary small" href="rutina-formulario.html?id=${full.id}">Modificar</a>
    </div>
    ${renderCompliance(full, progress)}`;
}

/* ---------- Progreso ---------- */

function measurementItem(item) {
  const anotado = measurementSummary(item);
  /* Quién tomó la medida importa: el atleta y el entrenador escriben sobre
     la misma ficha y conviene saber de quién viene cada dato. */
  const autor = item.recorded_by === athleteId ? 'la registró el atleta' : 'la registraste tú';

  return `
    <div class="list-item">
      <div class="actions">
        <strong>${escapeHtml(formatDate(item.measured_at))}</strong>
        <small class="muted">${autor}</small>
      </div>
      ${anotado.length ? `<p>${escapeHtml(anotado.join(' · '))}</p>` : ''}
      ${item.notes ? `<small class="muted">${escapeHtml(item.notes)}</small>` : ''}
    </div>`;
}

function renderMeasurements(measurements) {
  renderMeasurementCharts(document.querySelector('#charts'), measurements);

  document.querySelector('#measurements').innerHTML = measurements.length
    ? measurements.map(measurementItem).join('')
    : '<div class="empty">Este atleta todavía no tiene mediciones.</div>';
}

async function loadMeasurements() {
  const { measurements } = await api(
    `/api/tracking/measurements?athleteId=${encodeURIComponent(athleteId)}`,
  );
  renderMeasurements(measurements);
  return measurements;
}

/* ---------- Check-ins ---------- */

function checkinItem(item) {
  const estado = item.reviewed_at
    ? '<span class="badge">Respondido</span>'
    : '<span class="badge warn">Sin responder</span>';

  return `
    <div class="list-item">
      <div class="actions">
        <strong>${escapeHtml(formatDate(item.checkin_date))}</strong>
        ${estado}
      </div>
      <p>
        Energía ${item.energy}/10 · Estrés ${item.stress}/10 ·
        Sueño ${item.sleep_hours} h · Adherencia ${item.adherence}%
      </p>
      ${item.difficulties ? `<small class="muted">Dificultades: ${escapeHtml(item.difficulties)}</small>` : ''}
    </div>`;
}

function renderCheckins(checkins) {
  /* Solo los cinco más recientes: para revisarlos y responder está la
     pantalla de check-ins, que es donde vive esa conversación. */
  document.querySelector('#checkins').innerHTML = checkins.length
    ? checkins.slice(0, 5).map(checkinItem).join('')
    : '<div class="empty">Este atleta todavía no ha enviado check-ins.</div>';
}

/* ---------- Nutrición ---------- */

/* Un resumen, no el plan entero: la semana completa vive en la pantalla de
   nutrición y duplicarla aquí crearía dos sitios que mantener. */
function nutritionItem(plan) {
  const macros = [
    plan.calories ? `${plan.calories} kcal` : '',
    plan.protein_g ? `${plan.protein_g} g proteína` : '',
    plan.carbs_g ? `${plan.carbs_g} g carbohidratos` : '',
    plan.fats_g ? `${plan.fats_g} g grasas` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const dias = plan.planned_days ?? 0;

  return `
    <div class="list-item">
      <strong>${escapeHtml(plan.name)}</strong>
      <p>${durationLabel(plan.weeks)} · ${dias} día${dias === 1 ? '' : 's'} con plan</p>
      ${macros ? `<p>${escapeHtml(macros)}</p>` : ''}
      ${plan.description ? `<small class="muted">${escapeHtml(plan.description)}</small>` : ''}
      <div class="actions mt">
        <a class="btn secondary small" href="nutricion-formulario.html?id=${plan.id}">Modificar plan</a>
      </div>
    </div>`;
}

function renderNutrition(plans) {
  document.querySelector('#nutrition').innerHTML = plans.length
    ? plans.map(nutritionItem).join('')
    : '<div class="empty">Este atleta todavía no tiene un plan de alimentación.</div>';
}

/* ---------- Carga ---------- */

async function load() {
  if (!athleteId) {
    showMessage(message, 'No se indicó de qué atleta es la ficha.', 'error');
    return;
  }

  const [{ people }, { routines }, { athletes }, { checkins }, { plans }] = await Promise.all([
    api('/api/links/people'),
    api('/api/routines'),
    api('/api/routines/compliance'),
    api('/api/tracking/checkins'),
    api('/api/nutrition/plans'),
  ]);

  /* La lista de vinculados es la que decide si esta ficha puede verse: el
     identificador viene de la dirección y no se da por bueno. */
  const athlete = people.find((person) => person.id === athleteId);
  if (!athlete) {
    showMessage(message, 'Este atleta no está vinculado contigo.', 'error');
    return;
  }

  document.querySelector('#athlete-name').textContent =
    `${athlete.first_name} ${athlete.last_name}`;
  document.querySelector('#athlete-meta').textContent =
    `${athlete.email} · vinculado desde ${formatDate(athlete.started_at)}`;
  document.title = `${athlete.first_name} ${athlete.last_name}`;

  const suyos = (lista) => lista.filter((item) => item.athlete_id === athleteId);
  const misCheckins = suyos(checkins);

  content.hidden = false;

  const measurements = await loadMeasurements();
  renderSummary(
    athletes.find((item) => item.athleteId === athleteId),
    measurements,
    misCheckins,
  );
  renderCheckins(misCheckins);
  renderNutrition(suyos(plans));

  await renderRoutine(
    routines.find((item) => item.athlete_id === athleteId && item.status === 'active'),
  );
}

/* ---------- Registro de mediciones ---------- */

document.querySelector('[name=measuredAt]').value = new Date().toISOString().slice(0, 10);

document.querySelector('#measurement').onsubmit = async (event) => {
  event.preventDefault();
  const values = formData(event.target);

  /* Los campos vacíos se envían como nulos y no como cero: no medir la cadera
     no significa que mida cero centímetros. El servidor conserva lo que ya
     hubiera guardado de ese día en los campos que lleguen vacíos, así que
     anotar solo la cintura no borra el peso que apuntó el atleta. */
  for (const metric of METRICS) values[metric.name] = toNumber(values[metric.name]);

  try {
    await api('/api/tracking/measurements', {
      method: 'POST',
      /* El servidor comprueba que este atleta siga vinculado antes de aceptar. */
      body: JSON.stringify({ ...values, athleteId }),
    });
    showMessage(message, 'Medición guardada correctamente.');
    event.target.reset();
    document.querySelector('[name=measuredAt]').value = new Date().toISOString().slice(0, 10);
    renderMeasurements(await loadMeasurements());
  } catch (error) {
    showMessage(message, error.message, 'error');
  }
};

try {
  await load();
} catch (error) {
  showMessage(message, error.message, 'error');
}
