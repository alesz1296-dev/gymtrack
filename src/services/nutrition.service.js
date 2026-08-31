import * as repository from '../repositories/nutrition.repository.js';
import { activeLink } from '../repositories/links.repository.js';
import { HttpError } from '../utils/http-error.js';
import * as notifications from './notifications.service.js';

/* Lecturas que no necesitan ninguna regla añadida: el repositorio ya filtra
   por el usuario de la sesión. */
export const listFoods = repository.listFoods;
export const foodLibrary = repository.foodLibrary;
export const createFood = repository.createFood;
export const listPlans = repository.listPlans;

/* ---------- Biblioteca de alimentos ---------- */

/* Si no aparece, o no existe o es de otro entrenador (o es uno general, que
   no se administra desde ninguna cuenta). Se responde igual en los tres
   casos para no confirmar la existencia de alimentos ajenos. */
export async function updateFood(id, trainerId, input) {
  const food = await repository.updateFood(id, trainerId, input);
  if (!food) throw new HttpError(404, 'Alimento personalizado no encontrado');
  return food;
}

export async function setFoodStatus(id, trainerId, isActive) {
  const food = await repository.setFoodStatus(id, trainerId, isActive);
  if (!food) throw new HttpError(404, 'Alimento personalizado no encontrado');
  return food;
}

export async function deleteFood(id, trainerId) {
  const result = await repository.deleteFood(id, trainerId);
  if (result === 'used')
    throw new HttpError(409, 'Este alimento forma parte de un plan y solo puede desactivarse');
  if (result === 'missing') throw new HttpError(404, 'Alimento personalizado no encontrado');
}

/* ---------- Planes alimentarios ---------- */

/* Semana en la que va el plan hoy, contando desde su fecha de inicio. Sin
   fecha de inicio se asume la primera; nunca se pasa de la duración.

   Es la misma regla que en las rutinas y a propósito no se comparte código
   entre las dos: son planes independientes y podrían separarse. Si algún día
   divergieran, tenerlas juntas obligaría a un parámetro que las distinga. */
export function currentWeek(plan) {
  if (!plan.start_date) return 1;
  const elapsedDays = Math.floor((Date.now() - new Date(plan.start_date).getTime()) / 86_400_000);
  return Math.min(Math.max(Math.floor(elapsedDays / 7) + 1, 1), plan.weeks || 1);
}

/* Qué franja de la semana toca hoy, del 1 al 7.

   A diferencia de las rutinas, donde el atleta elige el día que va a entrenar,
   aquí abrir la pantalla y ver la comida de hoy es el uso normal. Se calcula
   en el servidor y no en el navegador para que no dependa del reloj del
   teléfono, que puede estar en otra zona horaria o directamente mal.

   Sin fecha de inicio se asume el Día 1: el plan todavía no está anclado a un
   calendario y cualquier otra suposición sería inventada. */
export function currentDay(plan) {
  if (!plan.start_date) return 1;
  const elapsedDays = Math.floor((Date.now() - new Date(plan.start_date).getTime()) / 86_400_000);
  if (elapsedDays < 0) return 1;
  return (elapsedDays % 7) + 1;
}

async function assertLinked(trainerId, athleteId) {
  if (!(await activeLink(trainerId, athleteId)))
    throw new HttpError(403, 'El atleta no está vinculado contigo');
}

export async function createPlan(trainerId, input) {
  await assertLinked(trainerId, input.athleteId);
  const plan = await repository.createPlan(trainerId, input);
  await notifyAthlete(plan, 'Nuevo plan de alimentación', `Ya tienes disponible “${plan.name}”.`);
  return plan;
}

export async function updatePlan(id, trainerId, input) {
  await assertLinked(trainerId, input.athleteId);
  const plan = await repository.replacePlan(id, trainerId, input);
  if (!plan) throw new HttpError(404, 'Plan no encontrado');
  await notifyAthlete(
    plan,
    'Plan de alimentación actualizado',
    `Tu entrenador actualizó “${plan.name}”.`,
  );
  return plan;
}

/* Al asignar una rutina el atleta recibe un aviso; al asignar un plan de
   alimentación no recibía ninguno y se enteraba solo si entraba a mirar.
   Un plan archivado o en borrador no avisa: todavía no está vigente. */
function notifyAthlete(plan, title, body) {
  if (!plan.athlete_id || plan.status !== 'active') return null;
  return notifications.create({
    userId: plan.athlete_id,
    type: 'nutrition_assigned',
    title,
    body,
    link: '/atleta/nutricion.html',
  });
}

export async function setPlanStatus(id, trainerId, status) {
  const plan = await repository.setPlanStatus(id, trainerId, status);
  /* Si no aparece, o no existe o es de otro entrenador. Se responde igual en
     ambos casos para no confirmar la existencia de planes ajenos. */
  if (!plan) throw new HttpError(404, 'Plan no encontrado');
  return plan;
}

export async function getPlan(id, user) {
  const plan = await repository.getPlan(id, user);
  if (!plan) throw new HttpError(404, 'Plan no encontrado');
  plan.currentWeek = currentWeek(plan);
  plan.currentDay = currentDay(plan);
  return plan;
}

/* ---------- Registro del atleta ---------- */

/* Traduce los errores del repositorio a respuestas HTTP. Se comparte entre
   las tres operaciones de registro para no repetir los mismos mensajes. */
function assertLog(result) {
  if (result.error === 'forbidden')
    throw new HttpError(403, 'Este día no pertenece a un plan activo tuyo');
  if (result.error === 'week') throw new HttpError(400, 'Esa semana está fuera del plan');
  if (result.error === 'log') throw new HttpError(404, 'Registro no encontrado');
  if (result.error === 'meal')
    throw new HttpError(403, 'La comida no pertenece al día de este registro');
  return result;
}

/* Avisa al entrenador cuando el atleta cierra un día completo.

   Se usa `createOnce` con el identificador del registro dentro del enlace,
   así que deshacer una comida y volver a marcarla no repite el aviso. Un día
   libre no genera ninguno: no haber tenido plan no es un logro. */
async function notifyDayCompleted(result) {
  if (!result.newlyCompleted) return result;

  const context = await repository.dayNotificationContext(result.dayLog.id);
  if (context?.day_type === 'planned')
    await notifications.createOnce({
      userId: context.trainer_id,
      type: 'nutrition_day_completed',
      title: 'Día de alimentación completado',
      body: `${context.athlete_first_name} ${context.athlete_last_name} completó ${context.day_name} de “${context.plan_name}”.`,
      link: `/entrenador/atleta-detalle.html?id=${context.athlete_id}&nutricion=${result.dayLog.id}`,
    });

  return result;
}

export async function openDay(athleteId, nutritionDayId, weekNumber) {
  return notifyDayCompleted(
    assertLog(await repository.openDay(athleteId, nutritionDayId, weekNumber)),
  );
}

export async function logMeal(athleteId, dayLogId, mealId, input) {
  return notifyDayCompleted(
    assertLog(await repository.logMeal(athleteId, dayLogId, mealId, input)),
  );
}

export async function unlogMeal(athleteId, dayLogId, mealId) {
  return assertLog(await repository.unlogMeal(athleteId, dayLogId, mealId));
}

/* Cuadrícula de cumplimiento: una entrada por semana y día registrado.

   `status` resume la franja para que la pantalla no repita la regla: cumplido
   si el día está cerrado, a medias si hay algo marcado y nada más. Un día que
   el atleta nunca abrió sencillamente no aparece, igual que en las rutinas. */
export async function planProgress(id, user) {
  const plan = await getPlan(id, user);
  if (!plan.athlete_id) return { plan, progress: [] };

  const rows = await repository.planProgress(plan.origin_plan_id || plan.id, plan.athlete_id);

  const progress = rows.map((row) => ({
    weekNumber: row.week_number,
    dayOrder: row.day_order,
    dayType: row.day_type,
    completedAt: row.completed_at,
    startedAt: row.started_at,
    /* El mapa de cumplimiento compartido con las rutinas lee estos dos
       nombres, así que se conservan aunque aquí sean comidas y no ejercicios. */
    completedExercises: row.logged_meals,
    totalExercises: row.total_meals,
    /* Cuántas comidas se cambiaron o se saltaron. Un día cumplido a base de
       sustituciones no es lo mismo que uno seguido al pie de la letra, y el
       entrenador necesita distinguirlo. */
    offPlanMeals: row.off_plan_meals,
    status: row.completed_at ? 'completed' : 'in_progress',
  }));

  return { plan, progress };
}
