/* Contrato de las pantallas de nutrición. Sin servidor ni base de datos:
   comprueba que las piezas encajen entre sí, que es donde están los errores
   que no se ven hasta abrir la pantalla. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('los tipos de día coinciden entre la base, la validación y las pantallas', async () => {
  const [migracion, rutas, constructor, detalle] = await Promise.all([
    read('../database/migrations/007_nutricion_semanal.sql'),
    read('../src/routes/nutrition.routes.js'),
    read('../public/js/entrenador/nutricion-formulario.js'),
    read('../public/js/comun/plan-detalle.js'),
  ]);

  /* El tipo de día vive en cuatro sitios: el enum de PostgreSQL, el `z.enum`
     que valida, el selector del constructor y el dibujado. Añadir un valor en
     uno solo produce un error de tipo en la base en vez de un mensaje. */
  const enBase = migracion
    .match(/CREATE TYPE nutrition_day_type AS ENUM \(([^)]+)\)/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  const enValidacion = rutas
    .match(/dayType: z\.enum\(\[([^\]]+)\]\)/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  assert.deepEqual(enValidacion, enBase);

  for (const tipo of enBase) {
    assert.ok(constructor.includes(`'${tipo}'`), `el constructor debe conocer ${tipo}`);
  }
  assert.match(detalle, /day_type === 'free'/, 'el dibujado distingue el día libre');
});

test('el constructor y su página encajan', async () => {
  const [pagina, modulo] = await Promise.all([
    read('../public/entrenador/nutricion-formulario.html'),
    read('../public/js/entrenador/nutricion-formulario.js'),
  ]);

  for (const id of ['plan', 'message', 'day-tabs', 'day-editor', 'weeks', 'weeks-options'])
    assert.match(pagina, new RegExp(`id="${id}"`), `falta #${id}`);

  /* Los objetivos diarios se leen del formulario por nombre; si uno no
     existiera, `form.elements[campo]` sería undefined al cargar un borrador. */
  const objetivos = modulo
    .match(/const GOAL_FIELDS = \[([^\]]+)\]/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  for (const campo of objetivos)
    assert.match(pagina, new RegExp(`name="${campo}"`), `falta el campo ${campo}`);

  /* La misma lista tiene que existir en la validación del servidor. */
  const rutas = await read('../src/routes/nutrition.routes.js');
  for (const campo of objetivos)
    assert.match(rutas, new RegExp(`${campo}:`), `el servidor debe aceptar ${campo}`);

  assert.ok(!/\sstyle="/.test(pagina), 'no debe haber atributos style en el HTML');

  /* El aviso profesional no es decorativo: el propio documento del proyecto
     registró que los planes nutricionales debe prepararlos personal
     autorizado, y al estructurar macros eso pesa más, no menos. */
  assert.match(pagina, /personal autorizado/, 'debe llevar el aviso profesional');
});

test('la lista del entrenador ofrece modificar, duplicar y archivar', async () => {
  const [pagina, modulo] = await Promise.all([
    read('../public/entrenador/nutricion.html'),
    read('../public/js/entrenador/nutricion.js'),
  ]);

  for (const id of ['plans', 'detail', 'message', 'toggle-archived'])
    assert.match(pagina, new RegExp(`id="${id}"`), `falta #${id}`);

  assert.match(modulo, /nutricion-formulario\.html\?id=/, 'modificar');
  assert.match(modulo, /nutricion-formulario\.html\?duplicar=/, 'duplicar');
  assert.match(modulo, /plans\/\$\{id\}\/status/, 'archivar y restaurar');
  assert.match(modulo, /archived=\$\{viendoArchivados\}/, 'alterna entre activos y archivados');
});

test('la pantalla del atleta abre en el día de hoy que dice el servidor', async () => {
  const [modulo, servicio] = await Promise.all([
    read('../public/js/atleta/nutricion.js'),
    read('../src/services/nutrition.service.js'),
  ]);

  /* El día de hoy lo calcula el servidor para que no dependa del reloj del
     teléfono. Si la pantalla lo calculara por su cuenta, un móvil en otra
     zona horaria mostraría el menú de otro día. */
  assert.match(servicio, /export function currentDay/);
  assert.match(servicio, /plan\.currentDay = currentDay\(plan\)/);
  assert.match(modulo, /plan\.currentDay/, 'la pantalla usa el día del servidor');
  assert.ok(!/new Date\(\)/.test(modulo), 'la pantalla no calcula la fecha por su cuenta');
});

test('todo lo que escribe el entrenador se escapa antes de dibujarse', async () => {
  const detalle = await read('../public/js/comun/plan-detalle.js');

  /* Nombres de plan, de día, de comida, de alimento, notas y el texto libre
     los escribe una persona. Sin escapar, un `<script>` en cualquiera de
     ellos se ejecutaría en el navegador del atleta. */
  for (const campo of ['item.freeText', 'item.name', 'meal.name', 'meal.details', 'day.name'])
    assert.match(
      detalle,
      new RegExp(`escapeHtml\\(${campo.replace('.', '\\.')}`),
      `${campo} debe escaparse`,
    );
});

test('el módulo de dibujado se comparte y no está duplicado', async () => {
  const usuarios = await Promise.all([
    read('../public/js/entrenador/nutricion.js'),
    read('../public/js/atleta/nutricion.js'),
  ]);

  for (const source of usuarios)
    assert.match(source, /from '\.\.\/comun\/plan-detalle\.js'/, 'debe usar el módulo compartido');

  /* Y ninguna pantalla vuelve a escribir el dibujado por su cuenta. */
  for (const source of usuarios)
    assert.ok(!source.includes('plan-meal-head'), 'el dibujado vive solo en el módulo compartido');
});

test('la pantalla del atleta permite marcar cada comida', async () => {
  const [modulo, rutas, migracion] = await Promise.all([
    read('../public/js/atleta/nutricion.js'),
    read('../src/routes/nutrition.routes.js'),
    read('../database/migrations/008_registro_nutricion.sql'),
  ]);

  /* Los tres estados viven en el enum de PostgreSQL, en la validación y en los
     botones de la pantalla. Añadir uno en un solo sitio rompería el guardado
     con un error de tipo en vez de un mensaje legible. */
  const enBase = migracion
    .match(/CREATE TYPE nutrition_log_status AS ENUM \(([^)]+)\)/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  /* La expresión se ancla a la ruta del registro. Sin anclarla capturaba el
     `status` del PLAN —draft, active, archived—, que aparece antes en el
     archivo, y la prueba comparaba dos listas que no tienen nada que ver. */
  const enValidacion = rutas
    .match(/'\/logs\/:id\/meals\/:mealId',[\s\S]*?status: z\.enum\(\[([^\]]+)\]\)/)[1]
    .match(/'([^']+)'/g)
    .map((valor) => valor.slice(1, -1));

  assert.deepEqual(enValidacion, enBase);
  for (const estado of enBase)
    assert.match(modulo, new RegExp(`value: '${estado}'`), `la pantalla debe ofrecer ${estado}`);

  assert.match(modulo, /api\('\/api\/nutrition\/logs'/, 'abre el día');
  assert.match(modulo, /method: 'DELETE'/, 'y puede desmarcar');

  /* El recuento y el cierre del día los decide el servidor. Si la pantalla los
     calculara por su cuenta, dos pestañas abiertas dirían cosas distintas. */
  assert.match(modulo, /result\.dayLog\.completed_at/, 'el cierre viene del servidor');
  assert.match(modulo, /result\.loggedMeals/, 'y el recuento también');
});

test('las rutas de registro se declaran fuera de la rama de planes', async () => {
  const rutas = await read('../src/routes/nutrition.routes.js');

  /* `/logs` no cuelga de `/plans/:id`: un registro no es un plan y meterlo
     ahí lo habría capturado el parámetro. */
  assert.match(rutas, /router\.post\(\s*'\/logs'/);
  assert.match(rutas, /router\.put\(\s*'\/logs\/:id\/meals\/:mealId'/);
  assert.match(rutas, /router\.delete\(\s*'\/logs\/:id\/meals\/:mealId'/);
  assert.match(rutas, /router\.get\('\/plans\/:id\/progress'/);
});

test('la cuadrícula se comparte entre rutinas y nutrición sin duplicarse', async () => {
  const [modulo, rutinas, ficha, planes] = await Promise.all([
    read('../public/js/comun/cumplimiento.js'),
    read('../public/js/entrenador/rutinas.js'),
    read('../public/js/entrenador/atleta-detalle.js'),
    read('../public/js/entrenador/nutricion.js'),
  ]);

  /* La mecánica de la cuadrícula vive una sola vez; cada dominio solo aporta
     su vocabulario. Si alguien copiara la tabla en otro sitio, esto lo caza. */
  assert.equal(modulo.match(/class="heatmap"/g).length, 1, 'la tabla se dibuja en un solo sitio');
  assert.match(modulo, /export function renderRoutineCompliance/);
  assert.match(modulo, /export function renderNutritionCompliance/);

  for (const source of [rutinas, ficha])
    assert.match(source, /renderRoutineCompliance\(/, 'las rutinas usan su envoltorio');
  for (const source of [planes, ficha])
    assert.match(source, /renderNutritionCompliance\(/, 'la nutrición usa el suyo');

  /* Y ninguna pantalla vuelve a escribir la cuadrícula por su cuenta. */
  for (const source of [rutinas, ficha, planes])
    assert.ok(!source.includes('heatmap'), 'la tabla no se repite fuera del módulo');
});

test('/plans/compliance se declara antes de /plans/:id', async () => {
  const rutas = await read('../src/routes/nutrition.routes.js');

  /* "compliance" no es un identificador. Si `/plans/:id` fuera antes, Express
     se lo tragaría y la lista de atletas recibiría un 404 en vez del resumen.
     Es la misma precaución que en `/routines/compliance`. */
  assert.ok(
    rutas.indexOf("'/plans/compliance'") < rutas.indexOf("'/plans/:id'"),
    '/plans/compliance debe declararse antes que /plans/:id',
  );
});

test('la lista de atletas muestra las dos adherencias', async () => {
  const [pagina, modulo] = await Promise.all([
    read('../public/entrenador/atletas.html'),
    read('../public/js/entrenador/atletas.js'),
  ]);

  assert.match(pagina, /<th>Rutina<\/th>/);
  assert.match(pagina, /<th>Nutrición<\/th>/);

  /* El colspan de la fila vacía tiene que coincidir con el número de
     columnas, o la tabla se descuadra justo cuando no hay atletas. */
  const columnas = (pagina.match(/<th>/g) ?? []).length;
  const declarado = Number(modulo.match(/const COLUMNAS = (\d+)/)[1]);
  assert.equal(declarado, columnas, 'COLUMNAS debe coincidir con las cabeceras');

  /* Y cada fila tiene tantas celdas como cabeceras. */
  const celdas = (modulo.match(/<td>/g) ?? []).length;
  assert.equal(celdas, columnas, 'cada fila debe tener una celda por cabecera');
});
