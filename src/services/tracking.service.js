import * as repo from '../repositories/tracking.repository.js';
import { activeLink } from '../repositories/links.repository.js';
import { HttpError } from '../utils/http-error.js';
import * as notifications from './notifications.service.js';
export const measurements = repo.measurements;
export const checkins = repo.checkins;
async function authorizedAthlete(user, requested) {
  if (user.role === 'athlete') {
    if (requested && requested !== user.id) throw new HttpError(403, 'Sin permiso');
    return user.id;
  }
  if (!requested || !(await activeLink(user.id, requested)))
    throw new HttpError(403, 'El atleta no está vinculado contigo');
  return requested;
}
export async function addMeasurement(user, input) {
  const athleteId = await authorizedAthlete(user, input.athleteId);
  const measurement = await repo.addMeasurement(athleteId, user.id, input);
  if (user.role === 'trainer')
    await notifications.createOnce({
      userId: athleteId,
      type: 'measurement_added',
      title: 'Nueva medición registrada',
      body: 'Tu entrenador agregó datos a tu progreso físico.',
      link: `/atleta/progreso.html?measurement=${measurement.id}`,
    });
  return measurement;
}
export async function listMeasurements(user, athleteId) {
  return repo.measurements(await authorizedAthlete(user, athleteId));
}
export async function createCheckin(user, input) {
  if (!(await activeLink(input.trainerId, user.id)))
    throw new HttpError(403, 'El entrenador no está vinculado contigo');
  const checkin = await repo.createCheckin(user.id, input);
  await notifications.create({
    userId: input.trainerId,
    type: 'checkin_submitted',
    title: 'Nuevo check-in',
    /* El usuario viene de la sesión, donde `sessionUser` guarda los nombres en
       camelCase. Con `first_name` el aviso decía "undefined undefined". */
    body: `${user.firstName} ${user.lastName} envió su check-in.`,
    link: '/entrenador/checkins.html',
  });
  return checkin;
}
export async function reviewCheckin(user, id, feedback) {
  const result = await repo.reviewCheckin(user.id, id, feedback);
  if (!result) throw new HttpError(404, 'Check-in no encontrado');
  await notifications.createOnce({
    userId: result.athlete_id,
    type: 'checkin_reviewed',
    title: 'Tu check-in fue respondido',
    body: 'Tu entrenador dejó retroalimentación en tu check-in.',
    link: `/atleta/checkin.html?checkin=${result.id}`,
  });
  return result;
}
