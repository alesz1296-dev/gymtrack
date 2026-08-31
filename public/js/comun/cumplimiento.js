/* Mapa de cumplimiento: una fila por semana y una columna por día. De un
   vistazo se ve en qué semana abandonó el atleta, que es lo que el entrenador
   necesita saber para ajustar el plan.

   Lo usan las rutinas y los planes de alimentación. La mecánica de la
   cuadrícula es idéntica en los dos —mismas celdas, mismos estados, misma
   leyenda— y lo único que cambia es el vocabulario: un día de rutina tiene
   ejercicios y uno de nutrición tiene comidas. Por eso el dibujado vive aquí
   una sola vez y cada dominio aporta sus palabras en `renderRoutineCompliance`
   y `renderNutritionCompliance`, en lugar de mantener dos cuadrículas que
   acabarían separándose. */

import { escapeHtml } from './dom.js';

function renderCell(day, weekNumber, progress, config) {
  const slot = progress.find(
    (item) => item.weekNumber === weekNumber && item.dayOrder === day.day_order,
  );
  const esDescanso = !config.isWorkDay(day);
  const total = config.unitsOf(day);
  const done = slot?.completedExercises ?? 0;

  let clase = 'pending';
  let texto = 'sin empezar';
  if (slot?.completedAt) {
    clase = 'done';
    texto = 'cumplido';
    /* Un día cumplido a base de sustituciones no es lo mismo que uno seguido
       al pie de la letra, y el entrenador necesita distinguirlo. */
    if (slot.offPlanMeals) texto += `, ${slot.offPlanMeals} fuera de plan`;
  } else if (slot) {
    clase = 'partial';
    texto = `${done} de ${total} ${config.unitLabel}`;
  }

  /* Un día libre sin registrar no es un incumplimiento, así que se apaga en
     vez de mostrarse como pendiente. */
  if (esDescanso && !slot) {
    clase = 'rest';
    texto = config.restLabel;
  }

  return `
            <td>
              <span
                class="heat ${clase}"
                title="Semana ${weekNumber} · Día ${day.day_order}: ${escapeHtml(texto)}"
              ><span class="sr-only">Semana ${weekNumber}, día ${day.day_order}: ${escapeHtml(texto)}</span></span>
            </td>`;
}

/* Cuenta los días de trabajo cumplidos en todo el plan. Los días libres se
   excluyen a propósito: no son deberes y contarlos inflaría la cifra. */
function countCompleted(plan, progress, config) {
  return progress.filter((item) => {
    const day = plan.days.find((d) => d.day_order === item.dayOrder);
    return item.completedAt && day && config.isWorkDay(day);
  }).length;
}

function renderGrid(plan, progress, config) {
  if (!plan.athlete_id) return `<div class="empty">${config.unassigned}</div>`;

  const semanas = Array.from({ length: plan.weeks || 1 }, (_, index) => index + 1);
  const diasDeTrabajo = plan.days.filter(config.isWorkDay).length;
  const cumplidos = countCompleted(plan, progress, config);

  return `
      <div class="compliance">
        <div class="compliance-head">
          <h3>Cumplimiento</h3>
          <span class="badge${cumplidos ? '' : ' neutral'}">
            ${cumplidos} de ${diasDeTrabajo * semanas.length} ${config.summaryLabel}
          </span>
        </div>
        <div class="table-wrap">
          <table class="heatmap">
            <thead>
              <tr>
                <th><span class="sr-only">Semana</span></th>
                ${plan.days.map((day) => `<th>D${day.day_order}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${semanas
                .map(
                  (week) => `
              <tr>
                <th scope="row">S${week}</th>
                ${plan.days.map((day) => renderCell(day, week, progress, config)).join('')}
              </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
        <p class="compliance-legend">
          <span class="heat done"></span> Cumplido
          <span class="heat partial"></span> A medias
          <span class="heat pending"></span> Sin empezar
          <span class="heat rest"></span> ${config.restLabel}
        </p>
      </div>`;
}

export function renderRoutineCompliance(routine, progress) {
  return renderGrid(routine, progress, {
    isWorkDay: (day) => day.day_type === 'training',
    unitsOf: (day) => day.exercises.length,
    unitLabel: 'ejercicios',
    restLabel: 'Día libre',
    summaryLabel: 'días de entrenamiento',
    unassigned: 'Esta rutina todavía no está asignada a ningún atleta.',
  });
}

export function renderNutritionCompliance(plan, progress) {
  return renderGrid(plan, progress, {
    isWorkDay: (day) => day.day_type === 'planned',
    unitsOf: (day) => day.meals.length,
    unitLabel: 'comidas',
    restLabel: 'Día libre',
    summaryLabel: 'días con plan',
    unassigned: 'Este plan todavía no está asignado a ningún atleta.',
  });
}
