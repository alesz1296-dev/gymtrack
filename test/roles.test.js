/* Autorización por rol.

   Dos partes. La primera prueba el middleware directamente, sin servidor ni
   base de datos. La segunda comprueba que las rutas que solo debe usar un rol
   lo declaren de verdad: es la que protege del olvido más probable, que es
   añadir un endpoint nuevo y no ponerle la comprobación. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { requireAuth, requireRole } from '../src/middleware/auth.js';

/* Ejecuta un middleware con una sesión simulada y devuelve lo que pasó:
   o dejó continuar, o entregó un error con su código. */
function ejecutar(middleware, sessionUser) {
  let resultado = { continuo: false, status: null, mensaje: null };
  const req = { session: sessionUser ? { user: sessionUser } : {} };
  middleware(req, {}, (error) => {
    if (error) resultado = { continuo: false, status: error.status, mensaje: error.message };
    else resultado = { continuo: true, status: null, mensaje: null };
  });
  return resultado;
}

const entrenador = { id: 'x', role: 'trainer' };
const atleta = { id: 'y', role: 'athlete' };

test('requireAuth exige sesión', () => {
  assert.equal(ejecutar(requireAuth, null).status, 401);
  assert.equal(ejecutar(requireAuth, atleta).continuo, true);
});

test('requireRole distingue no haber entrado de no tener permiso', () => {
  /* Sin sesión debe responder 401 y no 403: son situaciones distintas y el
     navegador reacciona distinto, mandando a iniciar sesión en un caso y
     mostrando un aviso en el otro. */
  assert.equal(ejecutar(requireRole('trainer'), null).status, 401);
  assert.equal(ejecutar(requireRole('trainer'), atleta).status, 403);
  assert.equal(ejecutar(requireRole('trainer'), entrenador).continuo, true);
});

test('requireRole admite varios roles a la vez', () => {
  const ambos = requireRole('trainer', 'athlete');
  assert.equal(ejecutar(ambos, entrenador).continuo, true);
  assert.equal(ejecutar(ambos, atleta).continuo, true);
});

/* Divide un archivo de rutas en declaraciones. Cada bloque va desde el
   `router.metodo('/ruta'` hasta el comienzo del siguiente, de modo que se
   puede mirar qué middlewares lleva esa ruta y no otra. */
function declaraciones(source) {
  const patron = /\b(?:router|r)\.(get|post|put|delete)\(\s*'([^']+)'/g;
  const encontradas = [];
  let coincidencia;
  while ((coincidencia = patron.exec(source)))
    encontradas.push({
      metodo: coincidencia[1],
      ruta: coincidencia[2],
      inicio: coincidencia.index,
    });

  return encontradas.map((d, i) => ({
    ...d,
    bloque: source.slice(d.inicio, encontradas[i + 1]?.inicio ?? source.length),
  }));
}

test('las rutas reservadas a un rol lo declaran', async () => {
  const archivos = {
    routines: await readFile(new URL('../src/routes/routines.routes.js', import.meta.url), 'utf8'),
    links: await readFile(new URL('../src/routes/links.routes.js', import.meta.url), 'utf8'),
    tracking: await readFile(new URL('../src/routes/tracking.routes.js', import.meta.url), 'utf8'),
    nutrition: await readFile(
      new URL('../src/routes/nutrition.routes.js', import.meta.url),
      'utf8',
    ),
  };

  const esperado = [
    /* Solo el entrenador planifica. */
    ['routines', 'post', '/', 'trainer'],
    ['routines', 'put', '/:id', 'trainer'],
    ['routines', 'get', '/compliance', 'trainer'],
    ['routines', 'post', '/exercises', 'trainer'],
    ['routines', 'delete', '/exercises/:id', 'trainer'],
    ['links', 'post', '/invitations', 'trainer'],
    ['nutrition', 'post', '/plans', 'trainer'],
    ['nutrition', 'post', '/foods', 'trainer'],
    ['nutrition', 'put', '/foods/:id', 'trainer'],
    ['nutrition', 'delete', '/foods/:id', 'trainer'],
    ['nutrition', 'get', '/foods/library', 'trainer'],
    ['tracking', 'put', '/checkins/:id/review', 'trainer'],
    /* Solo el atleta ejecuta y registra. */
    ['routines', 'get', '/history', 'athlete'],
    ['links', 'post', '/accept', 'athlete'],
    ['tracking', 'post', '/checkins', 'athlete'],
  ];

  for (const [archivo, metodo, ruta, rol] of esperado) {
    const encontrada = declaraciones(archivos[archivo]).find(
      (d) => d.metodo === metodo && d.ruta === ruta,
    );
    assert.ok(encontrada, `no existe ${metodo.toUpperCase()} ${ruta} en ${archivo}`);
    assert.match(
      encontrada.bloque,
      new RegExp(`requireRole\\('${rol}'`),
      `${metodo.toUpperCase()} ${ruta} debe exigir el rol ${rol}`,
    );
  }
});

test('toda ruta de la API exige haber iniciado sesión', async () => {
  /* `requireAuth` se aplica una vez por router. Si un archivo de rutas se
     creara sin él, todos sus endpoints quedarían abiertos.

     `auth` queda fuera: entrar, registrarse y recuperar la contraseña son
     públicos por definición, y sus rutas privadas llevan `requireAuth` una a
     una. */
  for (const archivo of [
    'links',
    'routines',
    'tracking',
    'nutrition',
    'messages',
    'notifications',
  ]) {
    const source = await readFile(
      new URL(`../src/routes/${archivo}.routes.js`, import.meta.url),
      'utf8',
    );
    assert.match(
      source,
      /\.use\(requireAuth\)/,
      `${archivo}.routes.js debe aplicar requireAuth a todo el router`,
    );
  }
});
