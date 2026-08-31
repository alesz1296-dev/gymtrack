import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('las rutas, la bandeja y los eventos están conectados', async () => {
  const [app, routes, navigation, page, screen, routine, tracking, nutrition, links, messages] =
    await Promise.all([
      read('../src/app.js'),
      read('../src/routes/notifications.routes.js'),
      read('../public/js/comun/navigation.js'),
      read('../public/compartido/notificaciones.html'),
      read('../public/js/compartido/notificaciones.js'),
      read('../src/services/routines.service.js'),
      read('../src/services/tracking.service.js'),
      read('../src/services/nutrition.service.js'),
      read('../src/services/links.service.js'),
      read('../src/services/messages.service.js'),
    ]);

  assert.match(app, /app\.use\('\/api\/notifications'/);
  assert.ok(routes.indexOf("'/read-all'") < routes.indexOf("'/:id/read'"));
  assert.match(navigation, /notifications\/unread-count/);
  assert.match(navigation, /Notificaciones.*notificaciones/);
  assert.match(page, /id="notifications"/);
  assert.match(page, /id="read-all"/);
  assert.match(screen, /value\.startsWith\('\/'\)/, 'solo abre rutas internas');
  assert.match(screen, /api\('\/api\/notifications\/read-all'/);

  const events = [routine, tracking, nutrition, links, messages].join('\n');
  for (const type of [
    'routine_assigned',
    'routine_updated',
    'workout_completed',
    'measurement_added',
    'checkin_submitted',
    'checkin_reviewed',
    'invitation_accepted',
    'message_received',
    'nutrition_assigned',
    'nutrition_day_completed',
  ])
    assert.match(events, new RegExp(`type: '${type}'`), `falta conectar ${type}`);
});
