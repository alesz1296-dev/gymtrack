/* Lista de atletas vinculados al entrenador, con cómo van esta semana en su
   rutina y en su plan de alimentación, su último peso registrado y la fecha
   de su medición más reciente.

   Los dos cumplimientos llegan de endpoints aparte del de vinculaciones,
   porque son tres módulos distintos del servidor; se piden a la vez y se
   cruzan aquí por el identificador del atleta. */

import { initNavigation } from '../comun/navigation.js';
import { api } from '../comun/api.js';
import { escapeHtml } from '../comun/dom.js';

await initNavigation();

const COLUMNAS = 6;

/* Verde solo al completar la semana; ámbar si no ha empezado y quedan días
   por hacer. El estado intermedio se deja neutro para no regañar a nadie por
   ir a mitad de semana. */
function claseAvance(hechos, total) {
  if (hechos >= total) return '';
  return hechos === 0 ? ' warn' : ' neutral';
}

const etiquetaSemana = (currentWeek, weeks) =>
  weeks > 1 ? `Semana ${currentWeek} de ${weeks}` : 'Semana 1';

/* Resumen de la rutina en la semana en curso. Se cuentan solo los días de
   entrenamiento: los días libres no son deberes y contarlos inflaría el
   cumplimiento. */
function routineSummary(entry) {
  if (!entry?.routine) return '<span class="badge neutral">Sin rutina</span>';

  const { currentWeek, weeks, completedDays, trainingDays } = entry.routine;
  const semana = etiquetaSemana(currentWeek, weeks);

  if (!trainingDays)
    return `<span class="badge neutral">${semana} · sin días de entrenamiento</span>`;

  return `
    <span class="badge${claseAvance(completedDays, trainingDays)}">${completedDays} de ${trainingDays} días</span>
    <small class="muted">${semana}</small>`;
}

/* Lo mismo para el plan de alimentación, contando solo los días con plan.

   Se añade el número de comidas fuera de plan porque un cumplimiento alto a
   base de sustituciones es una conversación distinta a uno seguido al pie de
   la letra, y sin ese dato los dos se ven idénticos. */
function nutritionSummary(entry) {
  if (!entry?.plan) return '<span class="badge neutral">Sin plan</span>';

  const { currentWeek, weeks, completedDays, plannedDays, offPlanMeals } = entry.plan;
  const semana = etiquetaSemana(currentWeek, weeks);

  if (!plannedDays) return `<span class="badge neutral">${semana} · sin días con plan</span>`;

  const fueraDePlan = offPlanMeals
    ? ` <small class="muted">${offPlanMeals} fuera de plan</small>`
    : '';

  return `
    <span class="badge${claseAvance(completedDays, plannedDays)}">${completedDays} de ${plannedDays} días</span>
    <small class="muted">${semana}</small>${fueraDePlan}`;
}

function renderAthlete(athlete, rutinas, nutricion) {
  /* Un atleta recién vinculado todavía no tiene mediciones. */
  const peso = athlete.latest_weight ? `${athlete.latest_weight} kg` : '—';
  const medicion = athlete.latest_measurement
    ? new Date(athlete.latest_measurement).toLocaleDateString()
    : '—';

  /* El nombre lleva a la ficha individual, que es donde se ve todo lo de esa
     persona junto en lugar de repartido por pantallas. */
  return `
    <tr>
      <td>
        <a href="atleta-detalle.html?id=${athlete.id}">
          <strong>${escapeHtml(athlete.first_name)} ${escapeHtml(athlete.last_name)}</strong>
        </a>
      </td>
      <td>${routineSummary(rutinas.get(athlete.id))}</td>
      <td>${nutritionSummary(nutricion.get(athlete.id))}</td>
      <td>${escapeHtml(athlete.email)}</td>
      <td>${peso}</td>
      <td>${medicion}</td>
    </tr>`;
}

const [{ people }, { athletes }, nutricionResumen] = await Promise.all([
  api('/api/links/people'),
  api('/api/routines/compliance'),
  api('/api/nutrition/plans/compliance'),
]);

const rutinas = new Map(athletes.map((item) => [item.athleteId, item]));
const nutricion = new Map(nutricionResumen.athletes.map((item) => [item.athleteId, item]));

document.querySelector('#athletes').innerHTML = people.length
  ? people.map((athlete) => renderAthlete(athlete, rutinas, nutricion)).join('')
  : `<tr><td colspan="${COLUMNAS}">No hay atletas vinculados.</td></tr>`;
