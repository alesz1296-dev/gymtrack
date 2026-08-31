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
